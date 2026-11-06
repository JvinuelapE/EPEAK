"""Tutorial mode helpers: start the tutorial copy of E-PEAK, and make a desktop shortcut to it.

The tutorial is the same program started with --tutorial: it uses its own data folder
(…\\E-PEAK\\tutorial) and port, so it runs next to a normal E-PEAK and never touches its logs.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from . import config

SHORTCUT_NAME = "E-PEAK Tutorial.lnk"


def _command() -> tuple[list[str], Path]:
    """How to start E-PEAK in tutorial mode: the .exe itself, or python run.py from source."""
    if config.FROZEN:
        exe = Path(sys.executable)
        return [str(exe), "--tutorial"], exe.parent
    return [sys.executable, str(config.ROOT / "run.py"), "--tutorial", "--no-build"], config.ROOT


def launch() -> dict:
    """Start the tutorial in the background. It opens its own browser tab, or just shows the
    tutorial again if it is already running."""
    cmd, cwd = _command()
    kwargs: dict = {"cwd": str(cwd), "stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
    if sys.platform.startswith("win"):
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    env = {k: v for k, v in os.environ.items() if k != "EPEAK_TUTORIAL"}
    subprocess.Popen(cmd, env=env, **kwargs)
    return {"url": f"http://127.0.0.1:{config.TUTORIAL_PORT}/"}


_PS_SHORTCUT = r"""
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$desktop = [Environment]::GetFolderPath('Desktop')
$path = Join-Path $desktop $env:EPEAK_LNK_NAME
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($path)
$s.TargetPath = $env:EPEAK_LNK_TARGET
$s.Arguments = $env:EPEAK_LNK_ARGS
$s.WorkingDirectory = $env:EPEAK_LNK_DIR
if ($env:EPEAK_LNK_ICON) { $s.IconLocation = $env:EPEAK_LNK_ICON }
$s.Description = 'E-PEAK with built-in demo logs and guided tours'
$s.Save()
Write-Output $path
"""


def create_shortcut() -> str:
    """Put an 'E-PEAK Tutorial' shortcut on the Windows desktop (OneDrive desktops included)."""
    if not sys.platform.startswith("win"):
        raise ValueError("Desktop shortcuts can only be created on Windows.")
    cmd, cwd = _command()
    icon = cmd[0] if config.FROZEN else str(config.ROOT / "packaging" / "epeak.ico")
    args = " ".join(f'"{a}"' if " " in a else a for a in cmd[1:])
    # paths go through environment variables, so spaces and accents (é, ñ…) need no quoting
    env = {**os.environ, "EPEAK_LNK_NAME": SHORTCUT_NAME, "EPEAK_LNK_TARGET": cmd[0], "EPEAK_LNK_ARGS": args,
           "EPEAK_LNK_DIR": str(cwd), "EPEAK_LNK_ICON": icon if Path(icon).exists() else ""}
    res = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", _PS_SHORTCUT],
                         env=env, capture_output=True, text=True, encoding="utf-8", errors="replace",
                         creationflags=subprocess.CREATE_NO_WINDOW, timeout=30)
    if res.returncode != 0:
        raise ValueError(f"Couldn't create the shortcut: {res.stderr.strip() or res.stdout.strip()}")
    return res.stdout.strip().splitlines()[-1] if res.stdout.strip() else SHORTCUT_NAME
