"""Limit checks, event detection, steady-state detection and the oscillation finder.

Every function works on a Dataset at full resolution (never on decimated display points), on
the visible x-range, and honours excluded points and Time-sync row ownership exactly like the
other viewport queries in datasets.py. Durations are in seconds on time axes (date, time and
elapsed) and in x units otherwise. numpy and pandas only: scipy is not bundled into the .exe.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .datasets import Dataset, DatasetError, _f, _trace_index, range_index

MAX_EVENTS = 2000      # events returned per rule (the count is always exact)
MAX_PLATEAUS = 500     # steady states returned
EVENT_KINDS = ("above", "below", "outside", "step", "spike", "dropout")
SPIKE_WINDOW = 5       # samples in the rolling median a spike is measured against


def _scale(ds: Dataset) -> float:
    """Divide x by this to get seconds (date/time axes are in ms, elapsed axes in s)."""
    return 1000.0 if ds.x_kind in ("date", "time") else 1.0


def _num(v) -> float | None:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if np.isfinite(v) else None


def _samples(ds: Dataset, col: str, x0=None, x1=None) -> tuple[np.ndarray, np.ndarray]:
    """Real samples of one trace inside the x-range, sorted by x: (x, y)."""
    if not col or col not in ds.df.columns:
        raise DatasetError(f"'{col}' is not in this plot.")
    idx = _trace_index(ds, col, range_index(ds, x0, x1))
    x, y = ds.x[idx], ds.numeric(col)[idx]
    ok = np.isfinite(x) & np.isfinite(y)
    x, y = x[ok], y[ok]
    if not ds.sorted and len(x) > 1:
        order = np.argsort(x, kind="stable")
        x, y = x[order], y[order]
    return x, y


def _first_true(test, start: int, stop: int) -> int:
    """First index in [start, stop) where test(i, j) (a boolean array for rows i:j) is True,
    or `stop`. Looks ahead in growing chunks, so a hit near `start` costs very little."""
    i, size = start, 256
    while i < stop:
        j = min(stop, i + size)
        hit = np.flatnonzero(test(i, j))
        if len(hit):
            return i + int(hit[0])
        i, size = j, size * 4
    return stop


def _runs(mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Inclusive (start, end) indices of each run of consecutive True values."""
    if not len(mask):
        return np.empty(0, dtype=np.int64), np.empty(0, dtype=np.int64)
    d = np.diff(np.concatenate([[0], mask.astype(np.int8), [0]]))
    return np.flatnonzero(d == 1), np.flatnonzero(d == -1) - 1


# ------------------------------------------------------------------ limits

def limit_check(ds: Dataset, checks: list[dict], x0=None, x1=None) -> dict:
    """Pass/fail of each trace against its lower/upper limit, over the points in view."""
    out = {}
    for c in checks or []:
        col = c.get("col")
        if not col or col not in ds.df.columns:
            continue
        lo, hi = _num(c.get("lo")), _num(c.get("hi"))
        x, y = _samples(ds, col, x0, x1)
        n = len(y)
        above = (y > hi) if hi is not None else np.zeros(n, dtype=bool)
        below = (y < lo) if lo is not None else np.zeros(n, dtype=bool)
        bad = above | below
        n_out = int(bad.sum())
        worst = None
        if n_out:
            excess = []
            if above.any():
                excess.append(float(y[above].max() - hi))
            if below.any():
                excess.append(float(lo - y[below].min()))
            worst = max(excess)
        out[col] = {
            "lo": lo, "hi": hi, "n": int(n), "out": n_out, "above": int(above.sum()), "below": int(below.sum()),
            "pct": (100.0 * n_out / n) if n else None,
            "min": _f(y.min()) if n else None, "max": _f(y.max()) if n else None,
            "worst": worst, "firstX": _f(x[bad][0]) if n_out else None,
            "pass": None if not n else n_out == 0,
        }
    return {"results": out}


# ------------------------------------------------------------------ events

def find_events(ds: Dataset, rules: list[dict], x0=None, x1=None) -> dict:
    """Run each event rule over the points in view. Errors are reported per rule."""
    res = {}
    for k, r in enumerate(rules or []):
        rid = str(r.get("id") or k)
        try:
            res[rid] = _rule_events(ds, r, x0, x1)
        except DatasetError as exc:
            res[rid] = {"count": 0, "totalDur": 0.0, "events": [], "truncated": False, "error": str(exc.args[0])}
    return {"rules": res}


def _rule_events(ds: Dataset, r: dict, x0, x1) -> dict:
    kind, col = r.get("kind"), r.get("col")
    if kind not in EVENT_KINDS:
        raise DatasetError(f"Unknown event type '{kind}'.")
    if not col:
        raise DatasetError("Pick a variable.")
    sc = _scale(ds)
    val = _num(r.get("value"))
    min_dur = max(0.0, _num(r.get("minDur")) or 0.0)
    x, y = _samples(ds, col, x0, x1)
    empty = {"count": 0, "totalDur": 0.0, "events": [], "truncated": False}

    if kind in ("above", "below", "outside", "spike"):
        if kind in ("above", "below") and val is None:
            raise DatasetError("Enter the threshold.")
        if kind == "above":
            dev = y - val
        elif kind == "below":
            dev = val - y
        elif kind == "outside":
            lo, hi = _num(r.get("lo")), _num(r.get("hi"))
            if lo is None and hi is None:
                raise DatasetError("No limits are set for this variable. Set them in the Limits panel.")
            dev = np.maximum(y - hi if hi is not None else np.full(len(y), -np.inf),
                             lo - y if lo is not None else np.full(len(y), -np.inf))
        else:
            if val is None or val <= 0:
                raise DatasetError("Enter the spike size (how far a sample must jump from its neighbours).")
            med = pd.Series(y).rolling(SPIKE_WINDOW, center=True, min_periods=1).median().to_numpy()
            dev = np.abs(y - med) - val
        if not len(y):
            return empty
        s, e = _runs(dev > 0)
        dur = (x[e] - x[s]) / sc        # first to last sample beyond the threshold
        keep = dur >= min_dur
        s, e, dur = s[keep], e[keep], dur[keep]
        events = []
        for a, b, d in zip(s[:MAX_EVENTS], e[:MAX_EVENTS], dur[:MAX_EVENTS]):
            k = int(a + np.argmax(dev[a:b + 1]))
            events.append({"start": _f(x[a]), "end": _f(x[b]), "dur": float(d), "peak": _f(y[k]),
                           "peakX": _f(x[k]), "n": int(b - a + 1)})
        return {"count": int(len(s)), "totalDur": float(dur.sum()), "events": events, "truncated": bool(len(s) > MAX_EVENTS)}

    if len(x) < 2:
        return empty
    gap = np.diff(x) / sc
    if kind == "step":
        if val is None or val <= 0:
            raise DatasetError("Enter the step size (change between two consecutive samples).")
        dy = np.diff(y)
        hit = np.flatnonzero(np.abs(dy) >= val)
        peaks = dy[hit]
    else:  # dropout: no real sample for longer than `value` seconds
        if val is None or val <= 0:
            raise DatasetError("Enter the gap length that counts as a dropout.")
        hit = np.flatnonzero(gap > val)
        peaks = np.full(len(hit), np.nan)
    events = [{"start": _f(x[i]), "end": _f(x[i + 1]), "dur": float(gap[i]), "peak": _f(p),
               "peakX": _f(x[i + 1]), "n": 2} for i, p in zip(hit[:MAX_EVENTS], peaks[:MAX_EVENTS])]
    return {"count": int(len(hit)), "totalDur": float(gap[hit].sum()), "events": events, "truncated": bool(len(hit) > MAX_EVENTS)}


# ------------------------------------------------------------------ steady states

def _col_stats(ds: Dataset, col: str, xa: float, xb: float) -> dict | None:
    if col not in ds.df.columns:
        return None
    _, y = _samples(ds, col, xa, xb)
    if not len(y):
        return None
    return {"mean": _f(y.mean()), "std": _f(y.std(ddof=1)) if len(y) > 1 else 0.0,
            "min": _f(y.min()), "max": _f(y.max()), "n": int(len(y))}


def find_steady(ds: Dataset, cfg: dict, cols: list[str], x0=None, x1=None) -> dict:
    """Plateaus of one variable: stretches where its rolling standard deviation over `window`
    seconds stays within `tol` (absolute, or % of the rolling mean) for at least `minDur` seconds.
    For each plateau, the mean/σ/min/max of every trace in the plot is returned."""
    col = cfg.get("col")
    if not col:
        raise DatasetError("Pick the variable to find steady states on.")
    window = _num(cfg.get("window"))
    tol = _num(cfg.get("tol"))
    min_dur = max(0.0, _num(cfg.get("minDur")) or 0.0)
    if window is None or window <= 0:
        raise DatasetError("Enter the window length.")
    if tol is None or tol < 0:
        raise DatasetError("Enter the stability tolerance.")
    sc = _scale(ds)
    x, y = _samples(ds, col, x0, x1)
    result = {"driver": col, "plateaus": [], "count": 0, "truncated": False}
    if len(y) < 3:
        return result
    t = (x - x[0]) / sc
    roll = pd.Series(y, index=pd.to_timedelta(t, unit="s")).rolling(pd.Timedelta(seconds=window), min_periods=3)
    std = roll.std().to_numpy()
    mean = roll.mean().to_numpy()
    thr = np.abs(mean) * tol / 100.0 if cfg.get("tolMode") == "pct" else np.full(len(t), tol)
    # trailing window (t - window, t]: only trust windows that really span the whole length
    first = np.searchsorted(t, t - window, side="right")
    dt = float(np.median(np.diff(t))) if len(t) > 1 else 0.0
    full = (t - t[first]) + dt >= window * 0.999
    steady = full & np.isfinite(std) & (std <= thr)

    # A calm window is not enough: a slow ramp is calm in every window but never settles.
    # So a plateau also has to keep its level: when the rolling mean moves more than 2x the
    # tolerance from where the plateau started, it ends there and a new one may begin.
    spans: list[list[int]] = []   # [first row, last row]
    refs: list[float] = []        # level each plateau started at
    for a, b in zip(*_runs(steady)):
        p, a, b = int(a), int(a), int(b)
        while p <= b:
            ref = mean[p]
            q = _first_true(lambda i, j: np.abs(mean[i:j] - ref) > 2.0 * thr[i:j], p, b + 1)
            # the first segment of a run includes the samples of its first window
            i0 = int(first[p]) if p == a else p
            if spans and i0 <= spans[-1][1] + 1 and abs(ref - refs[-1]) <= 2.0 * thr[p]:
                spans[-1][1] = q - 1
            else:
                if spans and i0 <= spans[-1][1]:
                    i0 = spans[-1][1] + 1
                spans.append([i0, q - 1])
                refs.append(float(ref))
            p = q
    spans = [s for s in spans if s[1] > s[0] and t[s[1]] - t[s[0]] >= min_dur]
    result["count"] = len(spans)
    result["truncated"] = len(spans) > MAX_PLATEAUS
    use = list(dict.fromkeys([col, *(cols or [])]))
    for i0, i1 in spans[:MAX_PLATEAUS]:
        xa, xb = float(x[i0]), float(x[i1])
        stats = {c: s for c in use if (s := _col_stats(ds, c, xa, xb)) is not None}
        result["plateaus"].append({"start": _f(xa), "end": _f(xb), "dur": float(t[i1] - t[i0]),
                                   "n": int(i1 - i0 + 1), "stats": stats})
    return result


# ------------------------------------------------------------------ oscillation finder

def spectrum(ds: Dataset, col: str, x0=None, x1=None, max_points: int = 1 << 21, plot_points: int = 3000) -> dict:
    """Amplitude spectrum of one trace over the points in view, and its strongest periods.

    The samples are put on an even time grid (gaps are bridged by straight lines), the linear
    trend is removed and a Hann window applied, so a sine of amplitude A shows a peak of about A.
    Logged RMS/frequency values show slow oscillations and drift; they cannot show harmonics of
    the waveform itself.
    """
    x, y = _samples(ds, col, x0, x1)
    if len(y) < 16:
        raise DatasetError("At least 16 samples are needed in view for a spectrum. Zoom out or pick another variable.")
    sc = _scale(ds)
    t, first = np.unique((x - x[0]) / sc, return_index=True)
    y = y[first]
    if len(t) < 16 or t[-1] <= 0:
        raise DatasetError("The samples in view don't span any time.")
    gaps = np.diff(t)
    dt = float(np.median(gaps))
    n = int(t[-1] / dt) + 1
    if n > max_points:
        n = max_points
        dt = float(t[-1] / (n - 1))
    grid = np.arange(n) * dt
    yi = np.interp(grid, t, y)
    bridged = float(gaps[gaps > 2.5 * np.median(gaps)].sum() / t[-1] * 100.0)
    slope, icept = np.polyfit(grid, yi, 1)
    w = np.hanning(n)
    amp = np.abs(np.fft.rfft((yi - (slope * grid + icept)) * w)) * 2.0 / w.sum()
    freq = np.fft.rfftfreq(n, dt)
    amp[0] = 0.0  # the mean and the trend are not oscillations

    peaks = []
    if len(amp) > 3:
        k = np.flatnonzero((amp[1:-1] > amp[:-2]) & (amp[1:-1] >= amp[2:])) + 1
        k = k[np.argsort(amp[k])[::-1][:8]]
        floor = float(np.median(amp[1:])) or 1e-300
        peaks = [{"freq": float(freq[i]), "period": float(1.0 / freq[i]), "amp": float(amp[i]),
                  "snr": float(amp[i] / floor)} for i in k if freq[i] > 0]

    # keep the display light: the largest value in each frequency bin, so no peak is lost
    f_out, a_out = freq[1:], amp[1:]
    if len(f_out) > plot_points:
        edges = np.linspace(0, len(f_out), plot_points + 1).astype(np.int64)
        sel = np.array([a + int(np.argmax(a_out[a:b])) for a, b in zip(edges[:-1], edges[1:]) if b > a])
        f_out, a_out = f_out[sel], a_out[sel]
    return {
        "col": col, "freq": [float(v) for v in f_out], "amp": [float(v) for v in a_out], "peaks": peaks,
        "dt": dt, "n": int(n), "samples": int(len(y)), "bridgedPct": bridged,
        "nyquist": 0.5 / dt, "resolution": 1.0 / (n * dt), "timeAxis": ds.x_kind in ("date", "time", "elapsed"),
    }
