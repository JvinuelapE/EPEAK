"""Analysis datasets: the processed table behind every plotting tab.

Each tab type (2D plot, calibration, time sync, append) turns its configuration into a
``Dataset``: a DataFrame with a stable row id (``_rid``), a numeric x axis and the list of
traces to draw. Datasets are cached by a hash of their configuration and the versions of
the logs they use, so re-opening a tab, zooming or changing styles never recomputes them.

Plots never receive the full data: ``series`` returns min/max-decimated points for the
visible x-range (a few thousand per trace), so logs of any size stay fluid.
"""
from __future__ import annotations

import hashlib
import json
import threading
from collections import OrderedDict
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .library import Library
from .parsing import format_axis_array

PALETTE = ["#d4a017", "#1a9bb5", "#c2399b", "#2e9e5b", "#6a5acd", "#e0662f", "#7a8b99", "#a0522d"]
CALIB_COLORS = ["#2e9e5b", "#1a9bb5", "#6a5acd", "#e0662f", "#c2399b"]
DASHES = ["solid", "dash", "dot", "dashdot", "longdash"]


class DatasetError(ValueError):
    pass


@dataclass
class Dataset:
    id: str
    kind: str
    df: pd.DataFrame                 # includes `_rid`
    x: np.ndarray                    # float64 axis values aligned with df rows
    x_kind: str                      # date | time | number | index | elapsed
    x_label: str
    columns: list[str]               # plottable columns
    traces: list[dict]               # default traces [{col, axis, color, dash, width, mode}]
    table_cols: list[str]
    own: dict[str, np.ndarray] = field(default_factory=dict)  # per-trace "row belongs to this log" masks
    warnings: list[str] = field(default_factory=list)
    sorted: bool = True
    meta: dict = field(default_factory=dict)  # axis titles etc.
    _num: dict[str, np.ndarray] = field(default_factory=dict)

    def numeric(self, col: str) -> np.ndarray:
        arr = self._num.get(col)
        if arr is None:
            if col not in self.df.columns:
                raise DatasetError(f"Column '{col}' is not in this dataset.")
            arr = pd.to_numeric(self.df[col], errors="coerce").to_numpy(dtype="float64")
            self._num[col] = arr
        return arr

    def describe(self) -> dict:
        return {
            "id": self.id, "kind": self.kind, "xKind": self.x_kind, "xLabel": self.x_label,
            "rows": int(len(self.df)), "columns": self.columns, "traces": self.traces,
            "tableColumns": self.table_cols, "warnings": self.warnings, "meta": self.meta,
            "xMin": _f(np.nanmin(self.x)) if len(self.x) and not np.isnan(self.x).all() else None,
            "xMax": _f(np.nanmax(self.x)) if len(self.x) and not np.isnan(self.x).all() else None,
        }


def _f(v) -> float | None:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(v) or np.isinf(v) else v


class DatasetStore:
    def __init__(self, lib: Library, capacity: int = 24):
        self.lib = lib
        self.capacity = capacity
        self.cache: OrderedDict[str, Dataset] = OrderedDict()
        self.lock = threading.RLock()

    def _key(self, kind: str, cfg: dict) -> str:
        log_ids = sorted(_log_ids(cfg))
        versions = []
        for lid in log_ids:
            e = self.lib.logs.get(lid)
            versions.append(f"{lid}:{e.version if e else 'missing'}")
        blob = json.dumps({"k": kind, "c": cfg, "v": versions}, sort_keys=True, default=str)
        return hashlib.sha1(blob.encode()).hexdigest()[:16]

    def build(self, kind: str, cfg: dict) -> Dataset:
        key = self._key(kind, cfg)
        with self.lock:
            if key in self.cache:
                self.cache.move_to_end(key)
                return self.cache[key]
        builder = BUILDERS.get(kind)
        if builder is None:
            raise DatasetError(f"Unknown analysis type '{kind}'.")
        ds = builder(self.lib, cfg)
        ds.id = key
        ds.kind = kind
        _apply_exclusions(ds, cfg)
        with self.lock:
            self.cache[key] = ds
            while len(self.cache) > self.capacity:
                self.cache.popitem(last=False)
        return ds

    def get(self, ds_id: str) -> Dataset:
        with self.lock:
            ds = self.cache.get(ds_id)
        if ds is None:
            raise KeyError("This dataset has expired. Re-run the analysis.")
        return ds


def _log_ids(cfg: dict) -> list[str]:
    ids = []
    if cfg.get("logId"):
        ids.append(cfg["logId"])
    for s in cfg.get("sources", []) or []:
        if s.get("logId"):
            ids.append(s["logId"])
    return ids


def _skip(cfg: dict) -> int:
    try:
        return max(1, int(cfg.get("skip") or 1))
    except (TypeError, ValueError):
        return 1


def _apply_exclusions(ds: Dataset, cfg: dict) -> None:
    keep = None
    valid = cfg.get("legacyValid")
    if valid:
        keep = ds.df["_rid"].isin(set(int(v) for v in valid)).to_numpy()
    excluded = cfg.get("excluded") or []
    if excluded:
        m = ~ds.df["_rid"].isin(set(int(v) for v in excluded)).to_numpy()
        keep = m if keep is None else (keep & m)
    if keep is None or keep.all():
        return
    ds.df = ds.df.loc[keep].reset_index(drop=True)
    ds.x = ds.x[keep]
    ds.own = {k: v[keep] for k, v in ds.own.items()}
    ds._num.clear()


def _is_sorted(x: np.ndarray) -> bool:
    v = x[~np.isnan(x)]
    return bool(len(v) < 2 or np.all(np.diff(v) >= 0))


def _elapsed_frame(lib: Library, log_id: str, x_col: str, skip: int = 1) -> tuple[pd.DataFrame, np.ndarray]:
    """Rows of a log sorted by x with x turned into elapsed seconds from the first sample."""
    entry = lib.get(log_id)
    ax, kind = lib.axis(log_id, x_col)
    df = entry.df
    pos = np.arange(0, len(df), skip)
    ax = ax[pos]
    ok = ~np.isnan(ax)
    pos, ax = pos[ok], ax[ok]
    if not len(pos):
        raise DatasetError(f"'{x_col}' in '{entry.name}' has no usable time values.")
    order = np.argsort(ax, kind="stable")
    pos, ax = pos[order], ax[order]
    scale = 1000.0 if kind in ("date", "time") else 1.0
    elapsed = (ax - ax[0]) / scale
    return df.iloc[pos].reset_index(drop=True), elapsed


# ------------------------------------------------------------------ builders

def build_generic(lib: Library, cfg: dict) -> Dataset:
    log_id, x_col = cfg.get("logId"), cfg.get("x")
    if not log_id:
        raise DatasetError("Pick a log file.")
    entry = lib.get(log_id)
    if not x_col or x_col not in entry.df.columns:
        raise DatasetError("Pick the X-axis column.")
    ax, kind = lib.axis(log_id, x_col)
    skip = _skip(cfg)
    pos = np.arange(0, len(entry.df), skip)
    df = entry.df.iloc[pos].copy()
    df.insert(0, "_rid", pos)
    df = df.reset_index(drop=True)
    x = ax[pos]
    cols = [str(c) for c in entry.df.columns if c != x_col]
    return Dataset(id="", kind="generic", df=df, x=x, x_kind=kind, x_label=x_col,
                   columns=cols, traces=[], table_cols=[x_col], sorted=_is_sorted(x))


def _error(ref: pd.Series, tgt: pd.Series, mode: str) -> pd.Series:
    if mode == "percentage":
        return ((tgt - ref) / ref.replace(0, np.nan)).abs() * 100
    if mode == "phase":
        diff = (tgt - ref).abs() % 360
        return np.minimum(diff, 360 - diff)
    return tgt - ref


def build_calibration(lib: Library, cfg: dict) -> Dataset:
    sources = cfg.get("sources") or []
    if not sources or not all(sources[0].get(k) for k in ("logId", "x", "y")):
        raise DatasetError("Set the reference log, its time column and the variable to compare.")
    targets = [(i, s) for i, s in enumerate(sources[1:], start=2) if s.get("logId") and s.get("x") and s.get("y")]
    if not targets:
        raise DatasetError("Add at least one complete target log.")
    mode = cfg.get("errMode") or "percentage"
    ref = sources[0]
    ref_df, el = _elapsed_frame(lib, ref["logId"], ref["x"], _skip(cfg))
    if ref["y"] not in ref_df.columns:
        raise DatasetError(f"'{ref['y']}' is not in the reference log.")
    ref_name = f"REF: {ref['y']}"
    master = pd.DataFrame({"Elapsed_s": el + float(ref.get("offset") or 0),
                           ref_name: pd.to_numeric(ref_df[ref["y"]], errors="coerce")})
    y_cols, err_cols, warnings = [ref_name], [], []
    for i, s in targets:
        try:
            tdf, tel = _elapsed_frame(lib, s["logId"], s["x"])
        except (DatasetError, KeyError) as exc:
            warnings.append(str(exc))
            continue
        if s["y"] not in tdf.columns:
            warnings.append(f"Target {i}: '{s['y']}' not found.")
            continue
        name = f"TGT {i}: {s['y']}"
        sub = pd.DataFrame({"Elapsed_s": tel + float(s.get("offset") or 0),
                            name: pd.to_numeric(tdf[s["y"]], errors="coerce")}).sort_values("Elapsed_s")
        master = pd.merge_asof(master.sort_values("Elapsed_s"), sub, on="Elapsed_s",
                               direction="nearest", tolerance=1.0)
        y_cols.append(name)
        err = f"Error {i}"
        master[err] = _error(master[ref_name], master[name], mode)
        err_cols.append(err)
    master = master.reset_index(drop=True)
    master.insert(0, "_rid", np.arange(len(master)))
    traces = [{"col": c, "axis": "y", "color": CALIB_COLORS[k % 5], "width": 2 if k == 0 else 1.2}
              for k, c in enumerate(y_cols)]
    traces += [{"col": c, "axis": "y2", "color": CALIB_COLORS[(k + 1) % 5], "dash": "dot"}
               for k, c in enumerate(err_cols)]
    unit = {"percentage": "%", "phase": "deg"}.get(mode, "abs")
    ds = Dataset(id="", kind="calibration", df=master, x=master["Elapsed_s"].to_numpy(dtype="float64"),
                 x_kind="elapsed", x_label="Elapsed_s", columns=y_cols + err_cols, traces=traces,
                 table_cols=["Elapsed_s"] + y_cols + err_cols, warnings=warnings)
    ds.meta = {"title": "Time-synchronised calibration", "xTitle": "Elapsed time (s)",
               "yTitle": "Measured value", "y2Title": f"Error ({unit})"}
    return ds


def build_compare(lib: Library, cfg: dict) -> Dataset:
    sources = [s for s in (cfg.get("sources") or []) if s.get("logId") and s.get("x")]
    if len(sources) < 2:
        raise DatasetError("Select at least 2 logs with a time column.")
    skip = _skip(cfg)
    subsets, traces, warnings = [], [], []
    for k, s in enumerate(sources):
        slot = s.get("slot") or (k + 1)
        try:
            df_i, el = _elapsed_frame(lib, s["logId"], s["x"], skip)
        except (DatasetError, KeyError) as exc:
            warnings.append(str(exc))
            continue
        el = el + float(s.get("offset") or 0)
        dash = DASHES[k % len(DASHES)]
        data = {"Elapsed_s": el}
        for axis, cols in (("y", s.get("yl") or []), ("y2", s.get("yr") or [])):
            for c in cols:
                if c not in df_i.columns:
                    warnings.append(f"Log{slot}: '{c}' not found.")
                    continue
                name = f"Log{slot}: {c}"
                data[name] = pd.to_numeric(df_i[c], errors="coerce").to_numpy()
                traces.append({"col": name, "axis": axis, "dash": dash, "mode": "lines+markers",
                               "marker": 4, "own": f"__own_{slot}"})
        sub = pd.DataFrame(data)
        sub = sub.drop_duplicates(subset=["Elapsed_s"], keep="last").sort_values("Elapsed_s")
        sub[f"__own_{slot}"] = sub["Elapsed_s"].round(3)
        subsets.append((slot, sub))
    if not traces:
        raise DatasetError("Choose at least one variable to plot (left or right axis).")
    timeline = np.unique(np.concatenate([np.round(s["Elapsed_s"].to_numpy(), 3) for _, s in subsets]))
    master = pd.DataFrame({"Elapsed Time (s)": timeline, "Elapsed_s": timeline})
    own = {}
    for slot, sub in subsets:
        master = pd.merge_asof(master, sub.drop(columns=[]), on="Elapsed_s", direction="nearest", tolerance=1.0)
        own_key = f"__own_{slot}"
        own_mask = np.isclose(master[own_key].to_numpy(dtype="float64"), master["Elapsed_s"].to_numpy(), atol=5e-4)
        own[own_key] = own_mask
        master = master.drop(columns=[own_key])
    master = master.drop(columns=["Elapsed_s"]).reset_index(drop=True)
    master.insert(0, "_rid", np.arange(len(master)))
    for c in master.columns:
        if c not in ("_rid", "Elapsed Time (s)") and pd.api.types.is_numeric_dtype(master[c]):
            master[c] = master[c].round(6)
    trace_cols = [t["col"] for t in traces]
    own_by_col = {t["col"]: own[t.pop("own")] for t in traces}
    return Dataset(id="", kind="compare", df=master, x=master["Elapsed Time (s)"].to_numpy(dtype="float64"),
                   x_kind="elapsed", x_label="Elapsed Time (s)", columns=trace_cols, traces=traces,
                   table_cols=["Elapsed Time (s)"] + trace_cols, own=own_by_col, warnings=warnings,
                   meta={"title": "Log comparison (relative time)", "xTitle": "Elapsed time (s)",
                         "yTitle": "Left axis", "y2Title": "Right axis"})


def _trim_mask(labels: pd.Series, needle: str | None) -> int | None:
    if not needle or not str(needle).strip():
        return None
    hits = np.flatnonzero(labels.str.contains(str(needle).strip(), regex=False).to_numpy())
    return int(hits[0]) if len(hits) else None


def build_append(lib: Library, cfg: dict) -> Dataset:
    sources = [s for s in (cfg.get("sources") or []) if s.get("logId") and s.get("x")]
    if not sources:
        raise DatasetError("Select at least one log segment with a time column.")
    skip = _skip(cfg)
    parts, offset, warnings = [], 0.0, []
    for k, s in enumerate(sources):
        part = s.get("slot") or (k + 1)
        entry = lib.get(s["logId"])
        ax, kind = lib.axis(s["logId"], s["x"])
        order = np.argsort(np.where(np.isnan(ax), np.inf, ax), kind="stable")
        ax_sorted = ax[order]
        labels = pd.Series(format_axis_array(ax_sorted, kind))
        a, b = 0, len(order)
        st = _trim_mask(labels, s.get("start"))
        if st is not None:
            a = st
        en = _trim_mask(labels, s.get("end"))
        if en is not None:
            b = en + 1
        if (s.get("start") and st is None) or (s.get("end") and en is None):
            warnings.append(f"Part {part}: trim time not found in '{entry.name}', segment kept whole.")
        sel = order[a:b][::skip]
        if not len(sel):
            continue
        axv = ax[sel]
        scale = 1000.0 if kind in ("date", "time") else 1.0
        el = (axv - axv[0]) / scale + offset
        df_i = entry.df.iloc[sel].reset_index(drop=True).copy()
        df_i.insert(0, "Elapsed_s", el)
        df_i.insert(0, "Source_Log", f"Part {part}")
        offset = float(np.nanmax(el)) + 1.0  # 1 s gap between segments
        parts.append(df_i)
    if not parts:
        raise DatasetError("No data left after trimming.")
    master = pd.concat(parts, ignore_index=True)
    master.insert(0, "_rid", np.arange(len(master)))
    yl, yr = cfg.get("yl") or [], cfg.get("yr") or []
    traces = [{"col": c, "axis": "y"} for c in yl if c in master.columns]
    traces += [{"col": c, "axis": "y2"} for c in yr if c in master.columns]
    cols = [c for c in master.columns if c not in ("_rid", "Source_Log", "Elapsed_s")]
    return Dataset(id="", kind="append", df=master, x=master["Elapsed_s"].to_numpy(dtype="float64"),
                   x_kind="elapsed", x_label="Elapsed_s", columns=cols, traces=traces,
                   table_cols=["Source_Log", "Elapsed_s"] + [t["col"] for t in traces], warnings=warnings,
                   meta={"title": "Appended timeline", "xTitle": "Cumulative elapsed time (s)",
                         "yTitle": "Left axis", "y2Title": "Right axis"})


BUILDERS = {
    "generic": build_generic,
    "calibration": build_calibration,
    "compare": build_compare,
    "append": build_append,
}


# ------------------------------------------------------------------ queries

def range_index(ds: Dataset, x0: float | None, x1: float | None) -> np.ndarray:
    n = len(ds.x)
    if x0 is None and x1 is None:
        return np.arange(n)
    lo = -np.inf if x0 is None else x0
    hi = np.inf if x1 is None else x1
    if ds.sorted:
        a = np.searchsorted(ds.x, lo, side="left")
        b = np.searchsorted(ds.x, hi, side="right")
        return np.arange(a, b)
    return np.flatnonzero((ds.x >= lo) & (ds.x <= hi))


def _trace_index(ds: Dataset, col: str, idx: np.ndarray) -> np.ndarray:
    own = ds.own.get(col)
    return idx[own[idx]] if own is not None else idx


def decimate(x: np.ndarray, y: np.ndarray, target: int) -> tuple[np.ndarray, np.ndarray, bool]:
    """Min/max decimation that keeps peaks and the line shape (like an oscilloscope)."""
    n = len(x)
    if n <= target:
        return x, y, False
    nb = max(1, target // 2)
    edges = np.linspace(0, n, nb + 1).astype(np.int64)
    keep = np.empty(nb * 2, dtype=np.int64)
    k = 0
    for i in range(nb):
        a, b = edges[i], edges[i + 1]
        if b <= a:
            continue
        seg = y[a:b]
        finite = ~np.isnan(seg)
        if not finite.any():
            keep[k] = a
            k += 1
            continue
        segf = np.where(finite, seg, np.inf)
        i1 = int(np.argmin(segf)) + a
        segf = np.where(finite, seg, -np.inf)
        i2 = int(np.argmax(segf)) + a
        if i1 == i2:
            keep[k] = i1
            k += 1
        else:
            keep[k], keep[k + 1] = (i1, i2) if i1 < i2 else (i2, i1)
            k += 2
    sel = keep[:k]
    return x[sel], y[sel], True


def series(ds: Dataset, cols: list[str], x0, x1, width: int = 1200) -> dict:
    idx = range_index(ds, x0, x1)
    target = int(min(max(width, 400), 4000) * 2)
    out, decimated, shown = {}, False, 0
    for col in cols:
        if col not in ds.df.columns:
            continue
        ti = _trace_index(ds, col, idx)
        x, y = ds.x[ti], ds.numeric(col)[ti]
        x, y, d = decimate(x, y, target)
        decimated |= d
        shown += len(x)
        out[col] = {"x": x, "y": y}
    return {"traces": out, "decimated": decimated, "points": int(len(idx))}


METRICS = ["Mean", "Median", "Min", "Max", "Std Dev", "Peak-to-Peak", "RMS"]


def stats(ds: Dataset, cols: list[str], x0, x1) -> dict:
    idx = range_index(ds, x0, x1)
    result = {}
    for col in cols:
        if col not in ds.df.columns:
            continue
        ti = _trace_index(ds, col, idx)
        y = ds.numeric(col)[ti]
        xs = ds.x[ti]
        ok = ~np.isnan(y)
        if not ok.any():
            result[col] = None
            continue
        yv, xv = y[ok], xs[ok]
        imin, imax = int(np.argmin(yv)), int(np.argmax(yv))
        result[col] = {
            "Mean": _f(yv.mean()), "Median": _f(np.median(yv)), "Min": _f(yv[imin]), "Max": _f(yv[imax]),
            "Std Dev": _f(yv.std(ddof=1)) if len(yv) > 1 else None,
            "Peak-to-Peak": _f(yv[imax] - yv[imin]), "RMS": _f(np.sqrt(np.mean(yv ** 2))),
            "count": int(len(yv)), "xAtMin": _f(xv[imin]), "xAtMax": _f(xv[imax]),
            "xFirst": _f(np.nanmin(xv)), "xLast": _f(np.nanmax(xv)),
        }
    return {"metrics": METRICS, "stats": result, "points": int(len(idx))}


def rows(ds: Dataset, cols: list[str], x0, x1, offset: int, limit: int) -> dict:
    idx = range_index(ds, x0, x1)
    total = len(idx)
    page = idx[offset: offset + limit]
    table_cols = [c for c in dict.fromkeys(cols) if c in ds.df.columns]
    xlab = ds.x_label
    use_axis_labels = ds.x_kind in ("date", "time")
    out_cols = ["_rid", xlab] + [c for c in table_cols if c != xlab]
    sub = ds.df.iloc[page]
    xvals = format_axis_array(ds.x[page], ds.x_kind) if use_axis_labels else None
    data = []
    for j, (_, r) in enumerate(sub.iterrows()):
        row = [int(r["_rid"])]
        if use_axis_labels:
            row.append(xvals[j])
        else:
            row.append(_cell(r[xlab]) if xlab in sub.columns else _cell(ds.x[page[j]]))
        for c in out_cols[2:]:
            row.append(_cell(r[c]))
        data.append(row)
    return {"columns": out_cols, "rows": data, "total": int(total), "offset": offset}


def _cell(v):
    if v is None:
        return None
    if isinstance(v, (float, np.floating)):
        return None if np.isnan(v) else round(float(v), 6)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    if isinstance(v, pd.Timestamp):
        return str(v)
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v if isinstance(v, (int, str)) else str(v)


def analytics(ds: Dataset, cols: list[str], x0, x1) -> dict:
    idx = range_index(ds, x0, x1)
    cols = [c for c in dict.fromkeys(cols) if c in ds.df.columns]
    frame = pd.DataFrame({c: ds.numeric(c)[idx] for c in cols})
    frame = frame.loc[:, frame.notna().any()]
    out = {"columns": list(frame.columns), "pearson": None, "spearman": None, "histograms": {}}
    if frame.shape[1] > 1:
        out["pearson"] = _matrix(frame.corr(method="pearson"))
        out["spearman"] = _matrix(frame.rank().corr(method="pearson"))
    for c in frame.columns:
        v = frame[c].dropna().to_numpy()
        if not len(v):
            continue
        counts, edges = np.histogram(v, bins=40)
        out["histograms"][c] = {"counts": counts.tolist(), "edges": [float(e) for e in edges]}
    return out


def _matrix(m: pd.DataFrame) -> list[list[float | None]]:
    return [[_f(round(v, 3)) if not pd.isna(v) else None for v in row] for row in m.to_numpy()]


# ------------------------------------------------------------------ cursors

def _valid_rows(ds: Dataset, y: np.ndarray, own: np.ndarray | None, a: int, b: int) -> np.ndarray:
    """Boolean mask of rows a:b that hold a real sample for this trace."""
    m = ~np.isnan(y[a:b]) & ~np.isnan(ds.x[a:b])
    return m & own[a:b] if own is not None else m


def _scan(ds: Dataset, y: np.ndarray, own: np.ndarray | None, start: int, step: int) -> int | None:
    """First valid row from `start` going forwards (step 1) or backwards (step -1), in growing chunks."""
    n, i, size = len(ds.x), start, 512
    while 0 <= i < n:
        if step > 0:
            j = min(n, i + size)
            hit = np.flatnonzero(_valid_rows(ds, y, own, i, j))
            if len(hit):
                return i + int(hit[0])
        else:
            j = max(-1, i - size)
            hit = np.flatnonzero(_valid_rows(ds, y, own, j + 1, i + 1))
            if len(hit):
                return j + 1 + int(hit[-1])
        i, size = j, size * 4
    return None


def values_at(ds: Dataset, cols: list[str], xs: list) -> dict:
    """Nearest real sample of each trace at each cursor position (oscilloscope-style cursors).

    Skips empty (NaN) samples and, for Time-sync datasets, rows that don't belong to the trace's log.
    On sorted datasets only the rows around the cursor are inspected, so it stays fast on huge logs.
    """
    targets = []
    for v in xs or []:
        try:
            v = float(v)
        except (TypeError, ValueError):
            v = None
        targets.append(v if v is not None and np.isfinite(v) else None)
    out = {}
    for col in dict.fromkeys(cols):
        if col not in ds.df.columns:
            continue
        y = ds.numeric(col)
        own = ds.own.get(col)
        res = []
        for v in targets:
            r = None
            if v is not None and len(ds.x):
                if ds.sorted:
                    k = int(np.searchsorted(ds.x, v))
                    cand = [c for c in (_scan(ds, y, own, k - 1, -1), _scan(ds, y, own, k, 1)) if c is not None]
                    r = min(cand, key=lambda c: abs(ds.x[c] - v)) if cand else None
                else:
                    ok = np.flatnonzero(_valid_rows(ds, y, own, 0, len(ds.x)))
                    r = int(ok[np.argmin(np.abs(ds.x[ok] - v))]) if len(ok) else None
            res.append(None if r is None else {"x": _f(ds.x[r]), "y": _f(y[r]), "rid": int(ds.df["_rid"].iat[r])})
        out[col] = res
    return {"values": out}
