"""Filesystem locations used by the backend.

Running from source: everything lives in ``epeak_data`` next to ``run.py``.
Running as the packaged E-PEAK.exe: data lives in ``%LOCALAPPDATA%\\E-PEAK`` so it stays put
wherever the .exe is copied to (and works when the .exe sits in a read-only folder).
Either location can be overridden with the ``EPEAK_DATA`` environment variable.
"""
from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path

FROZEN = bool(getattr(sys, "frozen", False))
# Tutorial mode (run.py --tutorial): demo logs and guided tours in a data folder of its own
TUTORIAL = os.environ.get("EPEAK_TUTORIAL") == "1"
TUTORIAL_PORT = 8150
ROOT = Path(__file__).resolve().parents[2]
# PyInstaller unpacks bundled files (the built frontend) into sys._MEIPASS
BUNDLE = Path(getattr(sys, "_MEIPASS", ROOT))


def _default_data_dir() -> Path:
    if os.environ.get("EPEAK_DATA"):
        base = Path(os.environ["EPEAK_DATA"])
    elif FROZEN:
        base = Path(os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")) / "E-PEAK"
    else:
        base = ROOT / "epeak_data"
    return base / "tutorial" if TUTORIAL else base


DATA_DIR = _default_data_dir().resolve()

SESSION_DIR = DATA_DIR / "session"          # the live, always-persisted working session
SESSION_LOGS = SESSION_DIR / "logs"
SESSION_EVIDENCE = SESSION_DIR / "evidence"
WORKSPACE_DIR = DATA_DIR / "workspaces"     # named saves (*.epeak) and legacy *.pkl files
AUTOSAVE_DIR = DATA_DIR / "autosaves"       # rolling snapshots
AUTOSAVE_BLOBS = AUTOSAVE_DIR / "_blobs"    # content-addressed logs/images shared by snapshots

FRONTEND_DIST = BUNDLE / "frontend" / "dist"

AUTOSAVE_KEEP = 10

for _d in (SESSION_LOGS, SESSION_EVIDENCE, WORKSPACE_DIR, AUTOSAVE_BLOBS):
    _d.mkdir(parents=True, exist_ok=True)


def backend_code_hash() -> str | None:
    """Fingerprint of the backend source files (None for the .exe, which has no .py files).

    run.py compares it with the value a running E-PEAK reports, so an instance started from
    older code is restarted instead of silently reused.
    """
    if FROZEN:
        return None
    h = hashlib.sha1()
    for p in sorted(Path(__file__).resolve().parent.rglob("*.py")):
        h.update(p.name.encode())
        h.update(b"\0")
        h.update(p.read_bytes())
    return h.hexdigest()
