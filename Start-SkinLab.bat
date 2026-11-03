@echo off
setlocal
cd /d "%~dp0"

title SkinLab Launcher

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-SkinLab.ps1"
if errorlevel 1 (
    echo.
    echo SkinLab failed to start. Review the error message above.
    pause
)

endlocal
