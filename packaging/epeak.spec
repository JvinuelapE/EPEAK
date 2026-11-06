# PyInstaller spec for E-PEAK.exe — run build_exe.bat (or build_exe.ps1) instead of calling this directly.
# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

ROOT = Path(SPECPATH).parent

hidden = (collect_submodules("uvicorn") + collect_submodules("anyio") + collect_submodules("starlette")
          + collect_submodules("fastapi") + collect_submodules("epeak")) + ["multipart", "python_multipart"]

a = Analysis(
    [str(ROOT / "run.py")],
    pathex=[str(ROOT / "backend")],
    datas=[(str(ROOT / "frontend" / "dist"), "frontend/dist")],
    hiddenimports=hidden,
    excludes=["tkinter", "matplotlib", "scipy", "IPython", "jupyter", "notebook", "pytest",
              "PyQt5", "PyQt6", "PySide2", "PySide6", "dash", "plotly"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="E-PEAK",
    icon=str(ROOT / "packaging" / "epeak.ico"),
    version=str(ROOT / "packaging" / "version_info.txt"),
    console=False,          # no black console window; output goes to %LOCALAPPDATA%\E-PEAK\epeak.log
    upx=False,              # UPX-packed exes trigger more antivirus false positives
    runtime_tmpdir=None,
)
