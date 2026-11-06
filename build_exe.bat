@echo off
rem Double-click to build dist\E-PEAK.exe
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_exe.ps1"
echo.
pause
