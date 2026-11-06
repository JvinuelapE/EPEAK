"""Start E-PEAK:  python run.py  [--port 8050] [--no-browser] [--reload] [--no-build] [--tutorial]

Also the entry point of the packaged E-PEAK.exe. Opening the .exe a second time just opens
another browser tab on the copy that is already running.

When run from source, run.py keeps everything up to date by itself:
- if any file in frontend/src (or index.html, favicon.svg, build.mjs, package.json) has changed
  since the last build, it runs `npm run build` (and `npm install` first when needed);
- if an E-PEAK that is already running uses different backend code (or is the .exe), it is
  stopped and started again from the current source.
Change detection uses file contents, so files copied in with old timestamps are still noticed.

--tutorial starts the tutorial: demo logs and guided tours, in a data folder and on a port of
its own (8150), so it runs next to a normal E-PEAK without touching it.
"""
import argparse
import hashlib
import json
import os
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
DIST = FRONTEND / "dist"
BUILD_STAMP = DIST / ".build-hash"
FRONTEND_INPUTS = ["index.html", "favicon.svg", "build.mjs", "package.json", "package-lock.json"]

if not getattr(sys, "frozen", False):
    sys.path.insert(0, str(ROOT / "backend"))


# ------------------------------------------------------------------ running instance

def _health(host: str, port: int) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://{host}:{port}/api/health", timeout=0.8) as r:
            info = json.load(r)
            return info if info.get("ok") is True else None
    except Exception:
        return None


def _port_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if sys.platform != "win32":
            # like uvicorn: ignore closed connections still in TIME_WAIT (on Windows this
            # option would allow taking a port that is in use, so it is left off there)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False


def _stop_running(host: str, port: int) -> bool:
    """Ask the running E-PEAK to quit and wait until its port is free again."""
    try:
        req = urllib.request.Request(f"http://{host}:{port}/api/shutdown", data=b"", method="POST")
        urllib.request.urlopen(req, timeout=2).close()
    except Exception:
        pass
    for _ in range(40):  # up to ~10 s
        if _health(host, port) is None and _port_free(host, port):
            return True
        time.sleep(0.25)
    return False


def _open_when_ready(host: str, port: int) -> None:
    for _ in range(120):  # up to ~60 s on slow first starts
        if _health(host, port):
            webbrowser.open_new(f"http://{host}:{port}/")
            return
        time.sleep(0.5)


# ------------------------------------------------------------------ automatic frontend build

def _frontend_hash() -> str:
    """Hash of everything the frontend build reads (contents and relative paths)."""
    h = hashlib.sha1()
    files = sorted(p for p in (FRONTEND / "src").rglob("*") if p.is_file())
    files += [FRONTEND / n for n in FRONTEND_INPUTS if (FRONTEND / n).is_file()]
    for p in files:
        h.update(p.relative_to(FRONTEND).as_posix().encode())
        h.update(b"\0")
        h.update(p.read_bytes())
        h.update(b"\0")
    return h.hexdigest()


def _rmtree(path: Path) -> bool:
    """Delete a folder, clearing read-only flags and retrying briefly
    (OneDrive and antivirus scanners can hold files for a moment)."""
    def clear_and_retry(func, p, _exc):
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except OSError:
            pass
    kw = {"onexc": clear_and_retry} if sys.version_info >= (3, 12) else {"onerror": clear_and_retry}
    for _ in range(5):
        if not path.exists():
            return True
        try:
            shutil.rmtree(path, **kw)
        except OSError:
            pass
        if not path.exists():
            return True
        time.sleep(0.4)
    return not path.exists()


def _run_npm(npm: str, *args: str) -> bool:
    print(f"> npm {' '.join(args)}", flush=True)
    try:
        return subprocess.run([npm, *args], cwd=FRONTEND).returncode == 0
    except OSError as exc:
        print(f"Could not run npm: {exc}")
        return False


def ensure_frontend(force: bool = False) -> bool:
    """Rebuild frontend/dist when the sources changed. Returns True if a new build was made."""
    if not (FRONTEND / "src").is_dir():
        return False
    current = _frontend_hash()
    built = BUILD_STAMP.read_text().strip() if BUILD_STAMP.is_file() else ""
    if not force and built == current and (DIST / "index.html").is_file():
        return False

    npm = shutil.which("npm")
    if npm is None:
        if (DIST / "index.html").is_file():
            print("! The interface sources changed, but Node.js (npm) isn't installed or isn't on PATH,\n"
                  "  so the previous build is used. Install Node.js from https://nodejs.org to rebuild automatically.")
        else:
            print("! The interface has never been built and Node.js (npm) isn't installed or isn't on PATH.\n"
                  "  Install Node.js from https://nodejs.org, then run this again.")
        return False

    print("Interface files changed: rebuilding the interface (one moment)...", flush=True)
    t0 = time.perf_counter()
    lock = FRONTEND / "node_modules" / ".package-lock.json"
    pkg = FRONTEND / "package.json"
    if not lock.is_file() or pkg.stat().st_mtime > lock.stat().st_mtime:
        if not _run_npm(npm, "install"):
            print("! npm install failed (see above). Starting with the previous build.")
            return False

    # build.mjs empties dist/ before building, so keep a copy to put back if the build fails.
    # The copy goes to the local temp folder: never inside the project (which may be synced by OneDrive).
    _rmtree(FRONTEND / ".dist-backup")  # left behind by an earlier version of run.py
    tmp = Path(tempfile.mkdtemp(prefix="epeak-dist-"))
    backup = tmp / "dist"
    try:
        if DIST.is_dir():
            shutil.copytree(DIST, backup)
        ok = _run_npm(npm, "run", "build") and (DIST / "assets" / "app.js").is_file()
        if not ok:
            if backup.is_dir():
                _rmtree(DIST)
                shutil.copytree(backup, DIST, dirs_exist_ok=True)
            print("! The interface build failed (errors above). E-PEAK starts with the previous interface;\n"
                  "  fix the error (or send it over) and run this again.")
            return False
    finally:
        _rmtree(tmp)
    BUILD_STAMP.write_text(current)
    print(f"Interface rebuilt in {time.perf_counter() - t0:.1f} s.", flush=True)
    return True


# ------------------------------------------------------------------ main

def main() -> None:
    parser = argparse.ArgumentParser(description="E-PEAK log analysis")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=None, help="default 8050, or 8150 for the tutorial")
    parser.add_argument("--no-browser", action="store_true", help="don't open a browser tab")
    parser.add_argument("--reload", action="store_true", help="auto-reload the backend on code changes (source only)")
    parser.add_argument("--no-build", action="store_true", help="don't rebuild the interface automatically (source only)")
    parser.add_argument("--rebuild", action="store_true", help="rebuild the interface even if nothing changed (source only)")
    parser.add_argument("--tutorial", action="store_true", help="start the tutorial: demo logs and guided tours")
    args = parser.parse_args()
    frozen = getattr(sys, "frozen", False)
    if args.tutorial:
        os.environ["EPEAK_TUTORIAL"] = "1"  # read by epeak.config: separate data folder
    if args.port is None:
        args.port = 8150 if args.tutorial else 8050

    if not frozen and not args.no_build:
        try:
            ensure_frontend(force=args.rebuild)
        except Exception as exc:  # the automatic build must never stop E-PEAK from starting
            print(f"! Couldn't rebuild the interface automatically ({type(exc).__name__}: {exc}).\n"
                  "  Starting with the previous interface. Send this message over if it keeps happening.")

    # Already running? Reuse it if it runs this code; otherwise restart it from the current source.
    running = _health(args.host, args.port)
    if running and bool(running.get("tutorial")) != args.tutorial:
        running = None  # the other kind of E-PEAK is on this port: leave it alone, use the next free one
    if running:
        if frozen:
            if not args.no_browser:
                webbrowser.open_new(f"http://{args.host}:{args.port}/")
            return
        from epeak.config import backend_code_hash
        if running.get("code") == backend_code_hash():
            print(f"E-PEAK is already running at http://{args.host}:{args.port}/ with this code. "
                  "If the page looks out of date, press Ctrl+F5 in the browser.")
            if not args.no_browser:
                webbrowser.open_new(f"http://{args.host}:{args.port}/")
            return
        print("An E-PEAK started from older code (or the .exe) is running: restarting it with the current code...", flush=True)
        if not _stop_running(args.host, args.port):
            print("! It didn't stop in time; starting on another port instead.")
        else:
            print("Old instance stopped. A tab that was already open works again after a refresh (Ctrl+F5).")

    port = args.port
    while not _port_free(args.host, port) and port < args.port + 50:
        port += 1

    from epeak import config  # creates the data folders

    if frozen and (sys.stdout is None or sys.stderr is None):
        # windowed .exe: no console, so send output to a log file
        log = open(config.DATA_DIR / "epeak.log", "a", buffering=1, encoding="utf-8")
        sys.stdout = sys.stderr = log

    import uvicorn

    print(f"E-PEAK running at http://{args.host}:{port}/  (data in {config.DATA_DIR})")
    if not args.no_browser:
        threading.Thread(target=_open_when_ready, args=(args.host, port), daemon=True).start()
    if args.reload and not frozen:
        uvicorn.run("epeak.app:app", host=args.host, port=port, log_level="warning",
                    reload=True, reload_dirs=[str(ROOT / "backend")])
    else:
        from epeak.app import app
        uvicorn.run(app, host=args.host, port=port, log_level="warning", log_config=None if frozen else uvicorn.config.LOGGING_CONFIG)


if __name__ == "__main__":
    main()
