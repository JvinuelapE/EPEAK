"""Tutorial mode: built-in demo logs and a ready-made workspace that shows every feature.

The logs are synthetic and generated from a fixed seed, so they are identical on every PC and
contain known features for the guided tours: two over-voltages, a 40 s dropout, sensor spikes,
five load steps with a known CT error, a 4-minute thermostat cycle, two runs 12 s apart...
They are written in the formats of the real instruments (DIVA timestamps, the PPA's '#' line
and clock times, PicoLog's blank time header crossing midnight) and go through the normal
parser like any uploaded file.
"""
from __future__ import annotations

import io
import json

import numpy as np
import pandas as pd

from . import config
from . import workspace as wsmod
from .library import Library

DEMO_VERSION = 1
WS_NAME = "E-PEAK_tutorial"
INFO_FILE = "demo.json"

# UK supply: 230 V +10 % / -6 %
V_LIMIT = {"lo": 216.2, "hi": 253.0}
CAL_LIMIT = 0.5          # % error allowed for the CTs
LOAD_STEPS = [5.0, 10.0, 20.0, 40.0, 60.0]
HOLD_S, RAMP_S = 240, 30
THERMO_PERIOD = 240      # s
SYNC_DELAY = 12          # s: Day 2 starts its test 12 s later


def _rng(k: int) -> np.random.Generator:
    return np.random.default_rng(20261005 + k)


def _stamps(start: str, secs: np.ndarray) -> list[str]:
    t = pd.Timestamp(start) + pd.to_timedelta(secs, unit="s")
    return [s[:-3] for s in t.strftime("%Y-%m-%d %H:%M:%S.%f")]


def _ms(start: str, secs) -> np.ndarray:
    """Axis values E-PEAK uses for these timestamps (ms since epoch, timezone-free)."""
    return pd.Timestamp(start).value / 1e6 + np.asarray(secs, dtype="float64") * 1000.0


def _clock(start_s: float, secs: np.ndarray, ms: bool = True) -> list[str]:
    out = []
    for v in (start_s + secs) % 86400:
        h, rem = divmod(v, 3600)
        m, s = divmod(rem, 60)
        out.append(f"{int(h):02d}:{int(m):02d}:{s:06.3f}" if ms else f"{int(h):02d}:{int(m):02d}:{int(s):02d}")
    return out


def _csv(df: pd.DataFrame, fmt: str = "%.4f") -> bytes:
    return df.to_csv(index=False, float_format=fmt, na_rep="nan", lineterminator="\n").encode()


def _first_order(drive: np.ndarray, start: float, tau: float, dt: float = 1.0) -> np.ndarray:
    """Temperature that follows `drive` with time constant tau (seconds)."""
    out = np.empty(len(drive))
    t = start
    a = dt / tau
    for i, d in enumerate(drive):
        t += (d - t) * a
        out[i] = t
    return out


# ------------------------------------------------------------------ the demo logs

def bench_run() -> tuple[bytes, dict]:
    """1 h DIVA bench run: load ramp and steps, two over-voltages, a 40 s dropout, TC2 spikes."""
    r = _rng(1)
    start = f"{'2026-10-05'} 10:00:00"
    t = np.arange(3600, dtype="float64")
    cur = np.select([t < 120, t < 420, t < 900, t < 1800, t < 3000], [0.0, (t - 120) / 300 * 10, 10.0, 20.0, 30.0], 0.0)
    i_rms = np.clip(cur + r.normal(0, 0.02, len(t)), 0, None)
    v = 230 + 0.6 * np.sin(2 * np.pi * t / 1800) - 0.02 * cur + r.normal(0, 0.25, len(t))
    ov = [(1210, 1213, 256.0), (2405, 2412, 255.4)]
    for a, b, lvl in ov:
        k = (t >= a) & (t <= b)
        v[k] = lvl + r.normal(0, 0.3, k.sum())
    pf = np.where(cur > 0.5, 0.975 + r.normal(0, 0.002, len(t)), np.nan)
    amb = 21.5 + 0.4 * np.sin(2 * np.pi * t / 7200) + r.normal(0, 0.05, len(t))
    tc1 = _first_order(21.5 + 0.05 * cur ** 2, 21.5, 600) + r.normal(0, 0.08, len(t))
    tc2 = _first_order(21.5 + 0.042 * cur ** 2, 21.5, 700) + r.normal(0, 0.08, len(t))
    tc3 = _first_order(21.5 + 0.038 * cur ** 2, 21.5, 650) + r.normal(0, 0.08, len(t))
    spikes = [700, 1530, 2950]
    tc2[spikes] += 40.0
    df = pd.DataFrame({
        "Timestamp": _stamps(start, t + r.uniform(0, 0.012, len(t))), "Board_ID": 2, "Connection_Status": "ONLINE",
        "V_RMS(V)": v, "I_RMS(A)": i_rms, "V_Freq(Hz)": 50 + r.normal(0, 0.02, len(t)),
        "Comp_Phase(deg)": np.degrees(np.arccos(np.clip(pf, -1, 1))), "Main_PF": pf,
        "Ambient(C)": amb, "TC1(C)": tc1, "TC2(C)": tc2, "TC3(C)": tc3,
    })
    drop = (t >= 2500) & (t < 2540)       # the board stopped logging for 40 s
    df = df.loc[~drop]
    info = {"overvoltage": [[float(_ms(start, a)[()]), float(_ms(start, b)[()])] for a, b, _ in ov],
            "dropout": [float(_ms(start, 2499)[()]), float(_ms(start, 2540)[()])],
            "ramp": [float(_ms(start, 150)[()]), float(_ms(start, 400)[()])],
            "spikes": [float(_ms(start, s)[()]) for s in spikes]}
    return _csv(df, "%.3f"), info


def _load_profile() -> tuple[np.ndarray, np.ndarray, list[list[float]]]:
    """Current for the calibration run: five held load steps joined by 30 s ramps."""
    parts, plateaus, t0 = [], [], 0
    for k, lvl in enumerate(LOAD_STEPS):
        if k:
            prev = LOAD_STEPS[k - 1]
            parts.append(prev + (lvl - prev) * (np.arange(RAMP_S) + 1) / RAMP_S)
            t0 += RAMP_S
        parts.append(np.full(HOLD_S, lvl))
        plateaus.append([float(t0), float(t0 + HOLD_S - 1)])
        t0 += HOLD_S
    cur = np.concatenate(parts)
    return np.arange(len(cur), dtype="float64"), cur, plateaus


def _ppa_num(v: float) -> str:
    m, e = f"{v:.5E}".split("E")
    return f"{m}E{int(e)}"


def calibration_logs() -> tuple[dict[str, bytes], dict]:
    """Reference analyser (PPA format) and two DIVA CT targets logging the same load steps.
    CT A reads 0.25 % high everywhere; CT B's error grows with current to 0.8 % at 60 A."""
    t, cur, plateaus = _load_profile()
    r = _rng(2)
    jit = lambda: r.uniform(0, 0.005, len(t))  # noqa: E731
    v = 230 + r.normal(0, 0.2, len(t))
    ref = cur * (1 + r.normal(0, 0.0002, len(t)))
    pf = 0.99 + r.normal(0, 0.001, len(t))
    ppa = io.StringIO()
    ppa.write("#8193685\n")
    ppa.write("Time,RMS Voltage PH1 PPA1,RMS Current PH1 PPA1,Frequency PH1 PPA1,Power Factor PH1 PPA1,Watts PH1 PPA1\n")
    for c, vi, ii, fi, pi in zip(_clock(14 * 3600, t + jit()), v, ref, 50 + r.normal(0, 0.01, len(t)), pf):
        ppa.write(",".join([c, _ppa_num(vi), _ppa_num(ii), _ppa_num(fi), _ppa_num(pi), _ppa_num(vi * ii * pi)]) + "\n")
    out = {"ref_analyser_PPA.csv": ppa.getvalue().encode()}
    gains = {"CT_A_DIVA.csv": np.full(len(t), 0.0025), "CT_B_DIVA.csv": 0.001 + 0.007 * (cur / 60.0) ** 2}
    for name, g in gains.items():
        df = pd.DataFrame({
            "Timestamp": _stamps("2026-10-05 14:00:00", t + jit()), "Board_ID": 3 if "A" in name else 4,
            "Connection_Status": "ONLINE", "V_RMS(V)": v + r.normal(0, 0.1, len(t)),
            "I_RMS(A)": cur * (1 + g + r.normal(0, 0.0002, len(t))),
            "TC1(C)": _first_order(22 + 0.004 * cur ** 2, 22, 500) + r.normal(0, 0.05, len(t)),
        })
        out[name] = _csv(df, "%.5f")
    return out, {"plateaus": plateaus, "steps": LOAD_STEPS}


def thermal_soak() -> bytes:
    """PicoLog export: blank time header, clock times from 23:40 crossing midnight, a thermostat
    cycling every 4 minutes on top of a slow rise."""
    r = _rng(3)
    t = np.arange(7200, dtype="float64")
    phase = (t % THERMO_PERIOD) / THERMO_PERIOD
    tri = np.where(phase < 0.5, 4 * phase - 1, 3 - 4 * phase)
    ch1 = 65 + 1.5 * tri + 0.0003 * t + r.normal(0, 0.05, len(t))
    ch2 = 21.8 + 0.3 * np.sin(2 * np.pi * t / 3600) + r.normal(0, 0.03, len(t))
    buf = io.StringIO()
    buf.write('"","Channel 1 Last (C)","Channel 2 Last (C)"\n')
    for c, a, b in zip(_clock(23 * 3600 + 40 * 60, t, ms=False), ch1, ch2):
        buf.write(f'"{c}","{a:.3f}","{b:.3f}"\n')
    return buf.getvalue().encode()


def _heat_run(start: str, step_at: float, n: int, seed: int, t_offset: float = 0.0, start_temp: float = 22.0):
    r = _rng(seed)
    t = np.arange(n, dtype="float64")
    cur = np.where(t + t_offset >= step_at, 25.0, 0.0)
    tc1 = _first_order(22 + 0.06 * cur ** 2, start_temp, 400) + r.normal(0, 0.06, n)
    return pd.DataFrame({
        "Timestamp": _stamps(start, t + r.uniform(0, 0.01, n)), "Board_ID": 2, "Connection_Status": "ONLINE",
        "V_RMS(V)": 230 + r.normal(0, 0.25, n), "I_RMS(A)": np.clip(cur + r.normal(0, 0.02, n), 0, None), "TC1(C)": tc1,
    })


def day_runs() -> dict[str, bytes]:
    """The same heat run on two days; on Day 2 the load starts 12 s later."""
    return {"day1_run_DIVA.csv": _csv(_heat_run("2026-10-06 09:12:00", 60, 900, 4), "%.3f"),
            "day2_run_DIVA.csv": _csv(_heat_run("2026-10-07 14:03:00", 60 + SYNC_DELAY, 900, 5), "%.3f")}


def split_run() -> dict[str, bytes]:
    """One heat run logged in three files, each starting with a minute of idle set-up time."""
    out, temp = {}, 22.0
    for k in range(3):
        r = _rng(10 + k)
        t = np.arange(600, dtype="float64")
        cur = np.where(t >= 60, 15.0 + 5 * k, 0.0)
        tc1 = _first_order(22 + 0.06 * cur ** 2, temp, 500) + r.normal(0, 0.06, 600)
        temp = float(tc1[-1])
        df = pd.DataFrame({
            "Timestamp": _stamps(f"2026-10-08 10:{20 * k:02d}:00", t + r.uniform(0, 0.01, 600)), "Board_ID": 2,
            "Connection_Status": "ONLINE", "V_RMS(V)": 230 + r.normal(0, 0.25, 600),
            "I_RMS(A)": np.clip(cur + r.normal(0, 0.02, 600), 0, None), "TC1(C)": tc1,
        })
        out[f"split_part{k + 1}_DIVA.csv"] = _csv(df, "%.3f")
    return out


def messy_export() -> bytes:
    """A badly exported file for the Log editor: a title line, a units row under the header,
    error codes in a number column and vague column names."""
    r = _rng(20)
    n = 480
    t = np.arange(n, dtype="float64")
    v = 230 + r.normal(0, 0.3, n)
    i = 12 + 2 * np.sin(2 * np.pi * t / 240) + r.normal(0, 0.05, n)
    tc = 30 + 0.01 * t + r.normal(0, 0.1, n)
    bad = set(r.choice(n, 30, replace=False).tolist())
    notes = {60: "relay click", 300: "fan on"}
    rows = ["Bench export - unit 7 - DIVA tool v0.9", "Time,Ch1,Ch2,Ch3,Notes", "s,V,A,C,"]
    for k, (c, a, b, d) in enumerate(zip(_clock(9 * 3600, t, ms=False), v, i, tc)):
        rows.append(f"{c},{a:.2f},{'ERR' if k in bad else f'{b:.3f}'},{d:.2f},{notes.get(k, '')}")
    return ("\n".join(rows) + "\n").encode()


def schematic_png() -> tuple[bytes, list[dict]]:
    """A simple test-bench schematic for the evidence board, with its measurement nodes."""
    from PIL import Image, ImageDraw, ImageFont
    w, h = 1200, 640
    im = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.load_default(size=22)
        small = ImageFont.load_default(size=17)
    except TypeError:  # Pillow < 10.1
        font = small = ImageFont.load_default()
    ink, green, amber = (31, 61, 46), (46, 158, 91), (201, 151, 12)

    def centred(x, y, text, f, colour):
        # measured by hand: text anchors need FreeType fonts, which older Pillow versions lack
        l, t, r, b = d.textbbox((0, 0), text, font=f)
        d.text((x - (r - l) / 2 - l, y - (b - t) / 2 - t), text, fill=colour, font=f)

    def box(x, y, bw, bh, label, colour=ink):
        d.rounded_rectangle([x, y, x + bw, y + bh], radius=12, outline=colour, width=4)
        centred(x + bw / 2, y + bh / 2, label, font, colour)

    d.text((40, 30), "Demo test bench: CT calibration and heat run", fill=ink, font=font)
    box(60, 250, 170, 110, "Supply")
    box(970, 250, 170, 110, "Load bank")
    d.line([(230, 305), (970, 305)], fill=ink, width=6)
    for x, label in ((380, "Ref CT"), (560, "CT A"), (740, "CT B")):
        d.ellipse([x - 40, 265, x + 40, 345], outline=amber, width=5)
        centred(x, 242, label, small, ink)
    box(300, 470, 170, 90, "PPA", green)
    box(560, 470, 270, 90, "DIVA boards", green)
    for x0, x1 in ((380, 385), (560, 640), (740, 750)):
        d.line([(x0, 345), (x1, 470)], fill=green, width=3)
    d.line([(150, 250), (150, 160), (640, 160), (640, 470)], fill=green, width=3)
    d.text((395, 135), "voltage sense", fill=green, font=small)
    nodes = [("V sense", 150, 200), ("Ref CT", 380, 270), ("CT A", 560, 270), ("CT B", 740, 270),
             ("TC1 busbar", 860, 305), ("TC2 CT A body", 600, 330), ("TC3 CT B body", 780, 330)]
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue(), [{"id": f"n{k}", "name": n, "x": float(x), "y": float(y)} for k, (n, x, y) in enumerate(nodes)]


# ------------------------------------------------------------------ the demo workspace

def _generic(tid, name, log, x, plots, comment="", link=True):
    return {"id": tid, "name": name, "type": "generic", "comment": comment, "logId": log, "x": x, "skip": 1,
            "linkX": link, "excluded": [], "plots": plots}


def _plot(pid, yl, yr=(), comment="", **extra):
    return {"id": pid, "yl": list(yl), "yr": list(yr), "comment": comment, "range": None, "markers": {}, **extra}


def build_state(ids: dict[str, str], bench: dict, evidence: dict) -> dict:
    series = {"skip": 1, "excluded": [], "range": None, "markers": {}}
    ref_col = "REF: RMS Current PH1 PPA1"
    tabs = [
        _generic("demo-first", "1 · First look", ids["bench"], "Timestamp", [
            _plot("plot_first_vi", ["V_RMS(V)"], ["I_RMS(A)"],
                  "Cursors A and B measure the load ramp: ΔY / Δt in the bar below is the ramp rate in A per second.",
                  markers={"V_RMS(V)": ["max"]}, cursors=bench["ramp"]),
            _plot("plot_first_temp", ["TC1(C)", "TC2(C)", "TC3(C)"], ["Ambient(C)"],
                  "Three thermocouples heating with the load; the mean and maximum of TC1 are marked.",
                  markers={"TC1(C)": ["max", "mean"]}),
        ], "A one-hour DIVA bench run: the load ramps to 10 A, then steps to 20 A and 30 A. "
           "Zoom by dragging a box, double-click to reset; the measurement bar shows the points in view. "
           "Link X axes is on, so both plots zoom together."),
        {"id": "demo-calib", "name": "2 · Calibration", "type": "calibration", **series,
         "comment": "The PPA analyser is the reference; CT A and CT B are checked against it at five load steps. "
                    "Steady states (the = panel) give the error at each step; the error limit of 0.5 % is set on this plot. "
                    "CT A passes everywhere; CT B fails at 60 A.",
         "sources": [{"logId": ids["ref"], "x": "Time", "y": "RMS Current PH1 PPA1", "offset": 0},
                     {"logId": ids["ct_a"], "x": "Timestamp", "y": "I_RMS(A)", "offset": 0},
                     {"logId": ids["ct_b"], "x": "Timestamp", "y": "I_RMS(A)", "offset": 0}],
         "errMode": "percentage",
         "steady": {"col": ref_col, "window": 20, "tol": 0.5, "tolMode": "pct", "minDur": 60},
         "limits": {"Error 2": {"lo": None, "hi": CAL_LIMIT}, "Error 3": {"lo": None, "hi": CAL_LIMIT}}},
        _generic("demo-problems", "3 · Finding problems", ids["bench"], "Timestamp", [
            _plot("plot_prob_v", ["V_RMS(V)"], [], "The supply limits (216.2 V to 253 V, UK 230 V +10 % / −6 %) are set for the whole "
                  "workspace. An event rule finds every excursion outside them.",
                  events=[{"id": "ev_v", "col": "V_RMS(V)", "kind": "outside", "value": None, "minDur": 0, "enabled": True}]),
            _plot("plot_prob_i", ["I_RMS(A)"], [], "A dropout rule finds where the board stopped logging (no sample for more than 5 s).",
                  events=[{"id": "ev_drop", "col": "I_RMS(A)", "kind": "dropout", "value": 5, "minDur": 0, "enabled": True}]),
            _plot("plot_prob_tc", ["TC2(C)"], [], "A spike rule finds single bad readings that jump 10 °C away from their neighbours. "
                  "Remove them from the data table (Show data) if they are sensor glitches.",
                  events=[{"id": "ev_spike", "col": "TC2(C)", "kind": "spike", "value": 10, "minDur": 0, "enabled": True}]),
        ], "Limits, events and removed points on the same bench run as tab 1.", link=True),
        {"id": "demo-sync", "name": "4 · Comparing runs", "type": "compare", **series,
         "comment": "The same heat run on two days. Each log starts at 0 s; Day 2's load started 12 s later, so it is shifted "
                    "by −12 s and the two runs line up exactly.",
         "sources": [{"slot": 1, "logId": ids["day1"], "x": "Timestamp", "yl": ["TC1(C)"], "yr": ["I_RMS(A)"], "offset": 0},
                     {"slot": 2, "logId": ids["day2"], "x": "Timestamp", "yl": ["TC1(C)"], "yr": ["I_RMS(A)"], "offset": -SYNC_DELAY}]},
        {"id": "demo-append", "name": "5 · Stitching logs", "type": "append", **series,
         "comment": "One run saved in three files. Each segment's first minute of set-up is trimmed off (Trim start), "
                    "and the segments are joined into one timeline.",
         "sources": [{"slot": k + 1, "logId": ids[f"part{k + 1}"], "x": "Timestamp", "start": f"10:{20 * k + 1:02d}:00", "end": ""}
                     for k in range(3)],
         "yl": ["TC1(C)"], "yr": ["I_RMS(A)"]},
        _generic("demo-osc", "6 · Oscillations", ids["thermal"], "Time", [
            _plot("plot_osc", ["Channel 1 Last (C)"], ["Channel 2 Last (C)"],
                  "A thermostat cycling on a slow rise. The oscillation finder (waves button) picks out its period."),
        ], "A PicoLog thermal soak. Its clock passes midnight; E-PEAK carries on into the next day.", link=False),
        {"id": "demo-stats", "name": "7 · Statistics", "type": "global_stats", "comment": "Summary statistics, box plots and a "
         "scatter matrix for a whole log.", "logId": ids["bench"], "vars": ["V_RMS(V)", "I_RMS(A)", "Main_PF", "TC1(C)"]},
        {"id": "demo-3d", "name": "8 · 3D map", "type": "three_d", "comment": "Load current and temperature over time.",
         "logId": ids["bench"], "x": "Timestamp", "y": "I_RMS(A)", "z": "TC1(C)", "mode": "lines"},
        {"id": "demo-wave", "name": "9 · Waveform", "type": "waveform", "comment": "Two cycles rebuilt from the bench run's RMS, "
         "frequency and phase. Drag the slider to move through the log.", "shape": "sine", "v": 230, "i": 10, "f": 50, "p": 13,
         "thdV": 0, "thdI": 0, "linkTabId": "demo-first", "logId": ids["bench"], "timeCol": "Timestamp", "row": 600, "live": True,
         "cols": {"v": "V_RMS(V)", "i": "I_RMS(A)", "f": "V_Freq(Hz)", "p": "Comp_Phase(deg)", "thdV": None, "thdI": None}},
    ]
    ledger = [
        {"id": "led1", "date": "2026-10-05", "logRef": "CT calibration (tab 2)", "status": "validated",
         "hypothesis": "CT B reads high at large currents (core saturation).",
         "conclusion": "Error grows with current: about 0.1 % at 5 A and 0.8 % at 60 A. Fails the 0.5 % limit at the top step."},
        {"id": "led2", "date": "2026-10-05", "logRef": "Bench run (tab 3)", "status": "testing",
         "hypothesis": "The supply regulator overshoots after load changes.",
         "conclusion": "Two excursions above 253 V (about 3 s and 7 s). Check the regulator logs for the same times."},
        {"id": "led3", "date": "2026-10-07", "logRef": "Day 1 vs Day 2 (tab 4)", "status": "rejected",
         "hypothesis": "Day 2 runs hotter because of a blocked fan filter.",
         "conclusion": "Once aligned, both days heat identically. Day 2 simply started its load 12 s later."},
    ]
    staging = [
        {"id": "graph:demo-calib", "part": "graph", "tabId": "demo-calib", "format": "excel", "sheet": "Calibration"},
        {"id": "steady:demo-calib", "part": "steady", "tabId": "demo-calib", "format": "excel", "sheet": "Calibration"},
        {"id": "limits:demo-calib", "part": "limits", "tabId": "demo-calib", "format": "excel", "sheet": "Calibration"},
        {"id": "graph:demo-problems", "part": "graph", "tabId": "demo-problems", "format": "excel", "sheet": "Problems"},
        {"id": "events:demo-problems", "part": "events", "tabId": "demo-problems", "format": "excel", "sheet": "Problems"},
        {"id": "ledger:hub", "part": "ledger", "format": "excel", "sheet": "Research hub"},
        {"id": "evidence:hub", "part": "evidence", "format": "excel", "sheet": "Research hub"},
    ]
    return {"version": 2, "tabs": tabs, "activeTabId": "demo-first", "ledger": ledger, "evidence": [evidence],
            "styles": {"demo-calib": {"default": {"title": "CT calibration against the PPA reference"}}},
            "staging": staging, "limits": {"V_RMS(V)": dict(V_LIMIT)}}


def install(lib: Library) -> dict:
    """Replace the tutorial session with a fresh demo workspace. Returns {"state", "info"}."""
    lib.clear()
    for f in config.SESSION_EVIDENCE.glob("*"):
        f.unlink(missing_ok=True)
    bench_csv, bench = bench_run()
    calib, cal_info = calibration_logs()
    files: list[tuple[str, str, bytes, str]] = [
        ("bench", "bench_run_DIVA.csv", bench_csv, "DIVA"),
        ("ref", "ref_analyser_PPA.csv", calib["ref_analyser_PPA.csv"], "PPA"),
        ("ct_a", "CT_A_DIVA.csv", calib["CT_A_DIVA.csv"], "DIVA"),
        ("ct_b", "CT_B_DIVA.csv", calib["CT_B_DIVA.csv"], "DIVA"),
        ("thermal", "thermal_soak_PicoLog.csv", thermal_soak(), "PicoLog"),
    ]
    files += [(f"day{k + 1}", n, raw, "DIVA") for k, (n, raw) in enumerate(day_runs().items())]
    files += [(f"part{k + 1}", n, raw, "DIVA") for k, (n, raw) in enumerate(split_run().items())]
    files.append(("messy", "messy_export.csv", messy_export(), "Needs cleaning"))
    ids = {}
    for key, name, raw, cat in files:
        e = lib.add_upload(name, raw)
        lib.set_category(e.id, cat)
        ids[key] = e.id
    png, nodes = schematic_png()
    ev = wsmod.store_evidence("demo_test_bench.png", png)
    ev.update(name="Demo test bench", type="schematic", nodes=nodes)
    state = build_state(ids, bench, ev)
    info = {"version": DEMO_VERSION, "logs": ids, "bench": bench, "calib": cal_info,
            "thermal": {"period": THERMO_PERIOD}, "sync": {"offset": -SYNC_DELAY}}
    (config.DATA_DIR / INFO_FILE).write_text(json.dumps(info))
    wsmod.save_session(state, WS_NAME, "")
    return {"state": state, "info": info}


def load_info() -> dict | None:
    p = config.DATA_DIR / INFO_FILE
    try:
        return json.loads(p.read_text()) if p.exists() else None
    except (OSError, ValueError):
        return None


def ensure_installed(lib: Library) -> None:
    """Called at start-up in tutorial mode: install the demo the first time, or after an update."""
    info = load_info()
    if not lib.logs or not info or info.get("version") != DEMO_VERSION or any(i not in lib.logs for i in info["logs"].values()):
        install(lib)
