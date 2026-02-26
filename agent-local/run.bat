@echo off
cd /d "%~dp0"

if not exist "venv\Scripts\activate.bat" (
    echo No se encontro el entorno virtual. Ejecutando install.bat...
    echo.
    call "%~dp0install.bat"
    if not exist "venv\Scripts\activate.bat" (
        echo ERROR: La instalacion fallo.
        pause
        exit /b 1
    )
    echo.
)

if not exist "config.yaml" (
    echo ERROR: No existe config.yaml. Copia config.yaml.example a config.yaml y configuralo.
    pause
    exit /b 1
)

echo Iniciando Agente ZKTeco MB160...
echo Presiona Ctrl+C para detener.
echo.

call venv\Scripts\activate.bat
python main.py

pause
