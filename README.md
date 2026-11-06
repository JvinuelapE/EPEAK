# E-PEAK 2.0

A desktop tool for analysing engineering test logs: CSV exports from DIVA boards, PPA power analysers, PicoLog and similar instruments. E-PEAK plots, calibrates, synchronises and appends logs, finds events and steady states, and exports Excel reports.

It runs locally. A small FastAPI server starts on your computer and the interface opens in your browser. Nothing is sent anywhere. Colleagues get it as a single Windows `E-PEAK.exe`.

## Features

- **Analysis tools**, each in its own tab:
  - **2D plot:** stacked plots with left and right axes
  - **Calibration:** reference vs. targets, with % / absolute / phase error
  - **Time sync:** overlay runs from different days
  - **Append logs:** stitch segments into one timeline
  - **Waveform generator**
  - **3D mapping**
  - **Global statistics**
- **Large logs stay fast.** Logs are parsed once. Plots fetch only the visible range, drawn with peak-preserving decimation.
- **Plot tools:**
  - **Measurements:** mean, min, max, RMS, σ and median for the points in view
  - **Cursors:** A/B cursors for Δt, ΔY and slope
  - **Limits:** PASS/FAIL against limits set per variable for the whole workspace, or per plot
  - **Events:** thresholds, steps, spikes and dropouts
  - **Steady states:** detects stable plateaus, such as each load step
  - **Oscillation finder:** spectrum of a trace for slow repeating patterns
- **Log editor:** fix headers, filter and delete rows, combine logs, and add derived variables with a safe formula engine (no `eval`).
- **Research hub:** an investigation ledger, plus an evidence board for photos and schematics with named measurement nodes.
- **Report studio:** one Excel workbook, or a zip with CSV files.
- **Workspaces:** saved as portable `.epeak` files, with continuous session saving and autosave snapshots. Version 1 `.pkl` workspaces are converted when you open them.
- **Tutorial mode:** demo logs and guided tours. It runs separately and never touches your own data.
- **Built-in user guide (F1):** pictures, short animated clips, search, and "Show me" tours.

## Requirements

- Windows 10/11 (the source also runs on macOS and Linux)
- Python 3.11 or newer
- Node.js 18 or newer, to build the interface

## Running from source

In PowerShell, from the project folder:

```powershell
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
cd frontend
npm install
npm run build
cd ..
.venv\Scripts\python run.py
```

The browser opens at `http://127.0.0.1:8050` (or the next free port).

`run.py` rebuilds the interface by itself when anything in `frontend/src` changes, as long as Node.js is on PATH. It also restarts an already-running copy whose backend code is out of date.

Useful options:

| Command | What it does |
|---|---|
| `run.py --tutorial` | Start the tutorial (port 8150, separate data folder) |
| `run.py --reload` | Reload the backend automatically on code changes |
| `run.py --no-build` | Skip the automatic interface rebuild |
| `run.py --rebuild` | Force an interface rebuild |
| `run.py --no-browser` | Don't open a browser tab |
| `npm run dev` (in `frontend/`) | Watch build of the interface |

> Use `.venv\Scripts\python -m pip`, not a bare `pip`. Installing into the system Python instead of the venv leads to "No module named uvicorn".

## Building the .exe

```powershell
cd frontend
npm run build
cd ..
.\build_exe.bat
```

The result is `dist\E-PEAK.exe`, a single windowed executable. Always rebuild the interface first, because PyInstaller bundles `frontend/dist`. The build uses its own `.build-venv`.

## Where data is kept

| Running as | Data folder |
|---|---|
| `E-PEAK.exe` | `%LOCALAPPDATA%\E-PEAK` |
| `python run.py` | `epeak_data\` next to `run.py` (not committed) |
| Tutorial | `%LOCALAPPDATA%\E-PEAK\tutorial` |
| Any (override) | the `EPEAK_DATA` environment variable |

The data folder holds:

- `session/`: the current logs and evidence images
- `workspaces/`: saved `*.epeak` files
- `autosaves/`: autosave snapshots
- `epeak.log`: the log file

## Project layout

```
run.py                  launcher and .exe entry point (auto-build, single instance, tutorial)
backend/epeak/          FastAPI app
  app.py                HTTP routes; serves the interface
  parsing.py            CSV sniffing (delimiters, # metadata, PicoLog quirks, midnight roll-over)
  library.py            log library: parse once, cache, ids, categories, derived variables
  datasets.py           dataset builders, decimation, viewport stats, paged rows
  detect.py             limits, events, steady states, oscillation finder (numpy only)
  mathexpr.py           safe formula evaluator
  editor.py             Log editor drafts with undo
  workspace.py          .epeak format, autosaves, legacy .pkl conversion
  export.py             Report studio → Excel / CSV
  demo.py, tutorial.py  tutorial demo kit and launcher
frontend/               React + TypeScript interface (esbuild, Plotly)
  src/views/            Research hub, Analysis, Log editor, Report studio
  src/components/       shared UI, plots, analysis panels
  src/shell/            menus, dialogs, guided tours, user guide (shell/docs/)
packaging/              PyInstaller spec, icon, version info
build_exe.bat / .ps1    .exe build
```

## Notes for contributors

- **No CDN assets.** Everything must work offline, because the interface is bundled into the .exe.
- **Formulas go through `mathexpr.py`.** Never use `eval`. Unpickle only through the restricted unpickler in `workspace.py`.
- **Plotly date axes need tz-free date strings.** Raw milliseconds are read as local time, which shifts traces by an hour in the UK.
- **Keep scipy, matplotlib, tkinter and Qt out of the .exe.** The analysis uses numpy only.
- **Bump the version in three places:** `backend/epeak/__init__.py`, `frontend/package.json` and `packaging/version_info.txt`.
- **Update the guide and tours with UI changes:** the user guide (`frontend/src/shell/docs/`) and, where relevant, the guided tours (`frontend/src/shell/Tour.tsx`).

## License

No license has been chosen yet. Until one is added, all rights are reserved by the author.
