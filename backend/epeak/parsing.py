"""CSV log parsing and time-axis conversion.

Logs are parsed exactly once (on upload or workspace load). The resulting DataFrame is
kept in memory and pickled to the session folder, so no interaction ever re-reads CSV.
"""
from __future__ import annotations

import csv
import io
import re
import warnings
from collections import Counter

import numpy as np
import pandas as pd

TIME_ONLY_RE = re.compile(r"^\s*-?\d{1,3}:\d{2}(:\d{2}(\.\d+)?)?\s*$")
NUMBER_RE = re.compile(r"^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$")

# x-axis kinds:
#   date    -> absolute timestamps, values are ms since epoch (rendered on a date axis)
#   time    -> time-of-day / clock strings without a date, ms since 00:00 (date axis, time ticks)
#   number  -> plain numeric column
#   index   -> fallback: row number
AXIS_KINDS = ("date", "time", "number", "index")


def _looks_numeric(tok: str) -> bool:
    tok = tok.strip().strip('"').strip("'")
    return tok == "" or bool(NUMBER_RE.match(tok)) or tok.lower() in ("nan", "inf", "-inf")


def _looks_timeish(tok: str) -> bool:
    tok = tok.strip().strip('"')
    if TIME_ONLY_RE.match(tok):
        return True
    return bool(re.match(r"^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}", tok))


def _split(line: str, delim: str) -> list[str]:
    try:
        return next(csv.reader([line], delimiter=delim))
    except Exception:
        return line.split(delim)


def parse_log_bytes(raw: bytes, filename: str = "") -> pd.DataFrame:
    """Parse a log file into a DataFrame using robust header detection.

    Handles: leading ``#`` metadata lines (PPA exports), title lines above the header,
    blank header cells (PicoLog exports, named ``Time`` when the column holds times),
    duplicate column names and ``;``/tab separated files.
    """
    # only the head of the file is inspected as text; the body goes straight to the C parser
    head = raw[:262144].decode("utf-8-sig", errors="replace")
    head_lines = head.splitlines()
    if len(raw) > 262144 and head_lines:
        head_lines = head_lines[:-1]  # last line may be cut
    i = 0
    while i < len(head_lines) and (not head_lines[i].strip() or head_lines[i].lstrip().startswith("#")):
        i += 1
    lines = head_lines[i:]
    if not lines:
        raise ValueError("The file is empty.")

    sample = "\n".join(lines[:50])
    delim = ","
    try:
        delim = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        if sample.count(";") > sample.count(","):
            delim = ";"
        elif sample.count("\t") > sample.count(","):
            delim = "\t"

    counts = [len(_split(ln, delim)) for ln in lines[:60] if ln.strip()]
    data_counts = counts[min(5, len(counts) - 1):] or counts
    modal = Counter(data_counts).most_common(1)[0][0]

    # header = first line whose field count matches the data; anything above it is a title line
    header_idx = 0
    for j, ln in enumerate(lines[:20]):
        if ln.strip() and len(_split(ln, delim)) == modal:
            header_idx = j
            break
    candidate = _split(lines[header_idx], delim)
    has_header = not all(_looks_numeric(t) or _looks_timeish(t) for t in candidate)

    skip = i + header_idx + (1 if has_header else 0)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        df = pd.read_csv(io.BytesIO(raw), sep=delim, header=None, skiprows=skip, skipinitialspace=True,
                         low_memory=False, on_bad_lines="skip", encoding="utf-8-sig",
                         encoding_errors="replace", skip_blank_lines=True)

    ncol = df.shape[1]
    names: list[str] = []
    for k in range(ncol):
        raw_name = candidate[k].strip().strip('"') if has_header and k < len(candidate) else ""
        if not raw_name:
            col = df.iloc[:, k].dropna().astype(str).head(20)
            if len(col) and all(_looks_timeish(v) for v in col):
                raw_name = "Time" if "Time" not in names else f"Time_{k}"
            else:
                raw_name = f"Column_{k}"
        base, n = raw_name, 1
        while raw_name in names:
            n += 1
            raw_name = f"{base}_{n}"
        names.append(raw_name)
    df.columns = names

    # drop fully empty trailing rows/columns produced by exporters
    df = df.dropna(how="all")
    df = df.loc[:, [c for c in df.columns if not (c.startswith("Column_") and df[c].isna().all())]]
    df = coerce_numeric(df)
    return df.reset_index(drop=True)


def coerce_numeric(df: pd.DataFrame) -> pd.DataFrame:
    """Convert text columns that are really numbers (e.g. '0.970', 'nan') to floats."""
    for c in df.columns:
        s = df[c]
        if pd.api.types.is_numeric_dtype(s) or pd.api.types.is_bool_dtype(s):
            continue
        probe = s.dropna().head(200).astype(str).str.strip()
        probe = probe[probe != ""]
        if len(probe) and pd.to_numeric(probe, errors="coerce").notna().mean() < 0.9:
            continue  # clearly text (timestamps, status strings): skip the expensive full conversion
        conv = pd.to_numeric(s, errors="coerce")
        nonnull = s.notna() & (s.astype(str).str.strip() != "")
        if nonnull.sum() and conv[nonnull].notna().mean() > 0.98:
            df[c] = conv
    return df


def is_time_only(series: pd.Series) -> bool:
    sample = series.dropna().astype(str).head(50)
    return len(sample) > 0 and all(TIME_ONLY_RE.match(v) for v in sample)


def axis_values(series: pd.Series) -> tuple[np.ndarray, str]:
    """Convert a column into a float64 axis (ms for date/time kinds) and report its kind."""
    if pd.api.types.is_bool_dtype(series):
        return series.astype(float).to_numpy(), "number"
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors="coerce").to_numpy(dtype="float64"), "number"
    if pd.api.types.is_datetime64_any_dtype(series):
        s = series.dt.tz_localize(None) if getattr(series.dt, "tz", None) is not None else series
        return _dt_to_ms(s), "date"

    if is_time_only(series):
        td = pd.to_timedelta(series.astype(str).str.strip(), errors="coerce")
        ms = td.to_numpy(dtype="timedelta64[ns]").astype("int64").astype("float64") / 1e6
        ms[td.isna().to_numpy()] = np.nan
        # clocks that run past midnight: add a day each time the clock jumps back > 12 h
        valid = np.where(~np.isnan(ms))[0]
        if len(valid) > 1:
            jumps = np.diff(ms[valid]) < -12 * 3600e3
            if jumps.any():
                day = np.concatenate([[0], np.cumsum(jumps)]) * 86400e3
                ms[valid] = ms[valid] + day
        return ms, "time"

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        parsed = pd.to_datetime(series, errors="coerce")
        if parsed.notna().mean() < 0.9:
            try:
                parsed = pd.to_datetime(series, errors="coerce", format="mixed")
            except (TypeError, ValueError):
                pass
    if parsed.notna().mean() >= 0.9:
        return _dt_to_ms(parsed), "date"

    num = pd.to_numeric(series, errors="coerce")
    if num.notna().mean() >= 0.9:
        return num.to_numpy(dtype="float64"), "number"
    return np.arange(len(series), dtype="float64"), "index"


def _dt_to_ms(s: pd.Series) -> np.ndarray:
    vals = s.to_numpy(dtype="datetime64[ns]")
    out = vals.astype("int64").astype("float64") / 1e6
    out[np.isnat(vals)] = np.nan
    return out


def format_axis_value(v: float, kind: str) -> str:
    """Human-readable label for one axis value."""
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return ""
    if kind == "date":
        ts = pd.Timestamp(int(v * 1e6))
        s = ts.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        return s[:-4] if s.endswith(".000") else s
    if kind == "time":
        total = v / 1000.0
        sign = "-" if total < 0 else ""
        total = abs(total)
        h, rem = divmod(total, 3600)
        m, s = divmod(rem, 60)
        out = f"{sign}{int(h):02d}:{int(m):02d}:{s:06.3f}"
        return out[:-4] if out.endswith(".000") else out
    if kind in ("number", "elapsed", "index"):
        return f"{v:.6g}" if abs(v) >= 1e6 or (v != 0 and abs(v) < 1e-3) else f"{round(v, 4)}"
    return str(v)


def format_axis_array(values: np.ndarray, kind: str) -> list[str]:
    if kind == "date":
        ser = pd.to_datetime(pd.Series(values), unit="ms", errors="coerce")
        out = ser.dt.strftime("%Y-%m-%d %H:%M:%S.%f").str.slice(0, -3).str.replace(r"\.000$", "", regex=True)
        return out.fillna("").tolist()
    return [format_axis_value(float(v), kind) for v in values]
