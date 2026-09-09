@echo off
setlocal

echo.
echo ComputeShare Agent - Installer
echo ==============================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not on PATH.
    echo   Fix: https://www.python.org/downloads/
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Start Docker Desktop first.
    pause
    exit /b 1
)

set "VENV=%USERPROFILE%\.computeshare\venv"

echo   Creating virtual environment...
python -m venv "%VENV%"
if errorlevel 1 (
    echo [ERROR] Could not create the virtual environment.
    pause
    exit /b 1
)

echo   Installing agent...
"%VENV%\Scripts\python" -m pip install -q --upgrade pip
REM Installed from this checkout. %~dp0 is the directory holding this script,
REM which is the package root containing pyproject.toml.
"%VENV%\Scripts\pip" install -q "%~dp0."
if errorlevel 1 (
    echo [ERROR] Installation failed.
    pause
    exit /b 1
)

echo.
echo ==============================
echo   Installation complete.
echo.
echo   Register this machine with the key from the dashboard's Machines page:
echo.
echo     "%VENV%\Scripts\computeshare-agent" start --token YOUR_TOKEN_HERE
echo.
echo   The backend defaults to http://localhost:3005. Override it with
echo   --backend, or by setting COMPUTESHARE_BACKEND_URL.
echo.
echo   NOTE: gVisor is not available on Windows, so jobs run under Docker's
echo   standard runc runtime, which shares the host kernel. The agent prints a
echo   warning at startup to make this explicit.
echo.
pause
