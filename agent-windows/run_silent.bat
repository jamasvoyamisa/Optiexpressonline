@echo off
cd /d "%~dp0"

if not exist "venv\Scripts\activate.bat" (
    if exist "install.bat" (
        call install.bat
        if %ERRORLEVEL% neq 0 exit /b 1
    ) else (
        exit /b 1
    )
)

call venv\Scripts\activate.bat
pythonw main.py
