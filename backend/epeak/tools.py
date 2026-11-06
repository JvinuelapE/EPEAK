"""Single-log tools: 3D mapping, global statistics and waveform log extraction."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .datasets import METRICS, DatasetError, _f
from .library import Library
from .parsing import format_axis_array


def stats_table(df: pd.DataFrame, cols: list[str]) -> dict:
    """Mean/median/min/max/std/p2p/RMS for each column (same metrics as the viewport tables)."""
    out = {}
    for c in cols:
        if c not in df.columns:
            continue
        v = pd.to_numeric(df[c], errors="coerce").dropna().to_numpy(dtype="float64")
        if not len(v):
            out[c] = None
            continue
        out[c] = {"Mean": _f(v.mean()), "Median": _f(np.median(v)), "Min": _f(v.min()), "Max": _f(v.max()),
                  "Std Dev": _f(v.std(ddof=1)) if len(v) > 1 else None,
                  "Peak-to-Peak": _f(v.max() - v.min()), "RMS": _f(np.sqrt(np.mean(v ** 2))), "count": int(len(v))}
    return {"metrics": METRICS, "stats": out}


def _clean(a: np.ndarray) -> list:
    return [None if (isinstance(v, float) and (np.isnan(v) or np.isinf(v))) else v for v in a.tolist()]


def three_d(lib: Library, cfg: dict, max_points: int = 15000) -> dict:
    log_id, x, y, z = cfg.get("logId"), cfg.get("x"), cfg.get("y"), cfg.get("z")
    if not (log_id and x and y and z):
        raise DatasetError("Pick a log and the X, Y and Z variables.")
    entry = lib.get(log_id)
    df = entry.df
    for c in (x, y, z):
        if c not in df.columns:
            raise DatasetError(f"'{c}' is not in '{entry.name}'.")
    axes = {}
    for key, c in (("x", x), ("y", y), ("z", z)):
        vals, kind = lib.axis(log_id, c)
        axes[key] = (vals, kind)
    ok = ~(np.isnan(axes["x"][0]) | np.isnan(axes["y"][0]) | np.isnan(axes["z"][0]))
    idx = np.flatnonzero(ok)
    if len(idx) > max_points:
        idx = idx[:: len(idx) // max_points + 1]
    out = {"n": int(ok.sum()), "shown": int(len(idx)), "kinds": {}}
    for key in ("x", "y", "z"):
        vals, kind = axes[key]
        out[key] = _clean(vals[idx])
        out["kinds"][key] = kind
    out["stats"] = stats_table(df, [x, y, z])
    return out


def global_stats(lib: Library, cfg: dict, max_points: int = 4000) -> dict:
    log_id, cols = cfg.get("logId"), cfg.get("vars") or []
    if not log_id or not cols:
        raise DatasetError("Pick a log and at least one variable.")
    entry = lib.get(log_id)
    df = entry.df
    cols = [c for c in cols if c in df.columns]
    if not cols:
        raise DatasetError("The selected variables are not in this log.")
    boxes = {}
    for c in cols:
        v = pd.to_numeric(df[c], errors="coerce").dropna().to_numpy(dtype="float64")
        if not len(v):
            continue
        q1, med, q3 = np.percentile(v, [25, 50, 75])
        iqr = q3 - q1
        lo_f, hi_f = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        inside = v[(v >= lo_f) & (v <= hi_f)]
        outliers = v[(v < lo_f) | (v > hi_f)]
        if len(outliers) > 1500:
            outliers = np.random.default_rng(0).choice(outliers, 1500, replace=False)
        boxes[c] = {"q1": _f(q1), "median": _f(med), "q3": _f(q3), "mean": _f(v.mean()),
                    "lower": _f(inside.min() if len(inside) else v.min()),
                    "upper": _f(inside.max() if len(inside) else v.max()),
                    "outliers": [float(o) for o in outliers], "n": int(len(v))}
    sample = df[cols].apply(pd.to_numeric, errors="coerce").dropna()
    if len(sample) > max_points:
        sample = sample.iloc[:: len(sample) // max_points + 1]
    return {
        "columns": cols,
        "table": stats_table(df, cols),
        "boxes": boxes,
        "sample": {c: _clean(sample[c].to_numpy(dtype="float64")) for c in cols},
        "sampleSize": int(len(sample)),
    }


def log_row(lib: Library, log_id: str, index: int, cols: list[str], time_col: str | None) -> dict:
    entry = lib.get(log_id)
    df = entry.df
    if not len(df):
        raise DatasetError("This log is empty.")
    index = int(min(max(index, 0), len(df) - 1))
    values = {}
    for c in cols:
        if c and c in df.columns:
            v = pd.to_numeric(pd.Series([df[c].iloc[index]]), errors="coerce").iloc[0]
            values[c] = _f(v)
    label = None
    if time_col and time_col in df.columns:
        ax, kind = lib.axis(log_id, time_col)
        label = format_axis_array(ax[index:index + 1], kind)[0] if kind in ("date", "time") else str(df[time_col].iloc[index])
    return {"index": index, "rows": int(len(df)), "values": values, "label": label}


def log_time_marks(lib: Library, log_id: str, time_col: str) -> dict:
    entry = lib.get(log_id)
    n = len(entry.df)
    if not n or time_col not in entry.df.columns:
        return {"rows": n, "marks": []}
    ax, kind = lib.axis(log_id, time_col)
    picks = sorted({0, n // 4, n // 2, (3 * n) // 4, n - 1})
    labels = format_axis_array(ax[picks], kind) if kind in ("date", "time") else [str(entry.df[time_col].iloc[p]) for p in picks]
    if kind == "date":
        labels = [lbl.split(" ")[-1][:8] for lbl in labels]
    return {"rows": n, "marks": [{"index": p, "label": lbl} for p, lbl in zip(picks, labels)]}


def find_time(lib: Library, log_id: str, time_col: str, query: str) -> int | None:
    entry = lib.get(log_id)
    if time_col not in entry.df.columns or not query.strip():
        return None
    ax, kind = lib.axis(log_id, time_col)
    labels = pd.Series(format_axis_array(ax, kind)) if kind in ("date", "time") else entry.df[time_col].astype(str)
    hits = np.flatnonzero(labels.str.contains(query.strip(), regex=False).to_numpy())
    return int(hits[0]) if len(hits) else None
