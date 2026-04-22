@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo === Instalando Agente Windows ZKTeco ===

set "PYTHON_CMD="
where py >nul 2>&1
if %ERRORLEVEL% equ 0 (
    py -3 -c "import sys; print(sys.version)" >nul 2>&1
    if !ERRORLEVEL! equ 0 set "PYTHON_CMD=py -3"
)

if not defined PYTHON_CMD (
    where python >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        python -c "import sys; print(sys.version)" >nul 2>&1
        if !ERRORLEVEL! equ 0 set "PYTHON_CMD=python"
    )
)

if not defined PYTHON_CMD (
    echo ERROR: Python 3 no encontrado o no ejecutable.
    echo.
    echo Instala Python 3.10+ desde https://www.python.org/downloads/windows/
    echo IMPORTANTE: activa la casilla "Add python.exe to PATH".
    echo.
    echo Si Windows abre Microsoft Store al ejecutar python:
    echo Configuracion ^> Aplicaciones ^> Configuracion avanzada de aplicaciones ^> Alias de ejecucion
    echo y desactiva python.exe y python3.exe.
    pause
    exit /b 1
)

if not exist "venv\Scripts\activate.bat" (
    if exist "venv" (
        echo Eliminando venv incompatible...
        rmdir /s /q venv
    )
    echo Creando entorno virtual...
    %PYTHON_CMD% -m venv venv
    if %ERRORLEVEL% neq 0 (
        echo ERROR: No se pudo crear el entorno virtual.
        pause
        exit /b 1
    )
)

call venv\Scripts\activate.bat
python -m pip install --upgrade pip
if %ERRORLEVEL% neq 0 (
    echo ERROR al actualizar pip.
    pause
    exit /b 1
)
python -m pip install -r requirements.txt
if %ERRORLEVEL% neq 0 (
    echo ERROR al instalar dependencias.
    pause
    exit /b 1
)

if not exist "config.yaml" (
    copy config.yaml.example config.yaml
    echo Archivo config.yaml creado. Editalo con los datos de tu dispositivo.
)

echo.
echo === Instalacion completada ===
echo Edita config.yaml con la IP del dispositivo y la API Key del backend.
echo Luego ejecuta: run.bat
pause
endlocal
