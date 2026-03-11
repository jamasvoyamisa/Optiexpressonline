@echo off
cd /d "%~dp0"

if not exist "venv\Scripts\activate.bat" (
    echo No se encontro el entorno virtual. Ejecutando install.bat...
    call install.bat
    if %ERRORLEVEL% neq 0 (
        echo ERROR: La instalacion fallo.
        pause
        exit /b 1
    )
)

call venv\Scripts\activate.bat
echo === Iniciando Agente Windows ZKTeco ===
echo Presiona Ctrl+C para detener
echo.
python main.py
pause
