@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo === Instalando Agente Optiexpress ===
echo.

set "PYTHON_CMD="
for %%P in (python py python3) do (
    if not defined PYTHON_CMD (
        where %%P >nul 2>&1
        if !ERRORLEVEL! equ 0 (
            if /I "%%P"=="py" (
                set "PYTHON_CMD=py -3"
            ) else (
                set "PYTHON_CMD=%%P"
            )
        )
    )
)

if not defined PYTHON_CMD (
    echo [ERROR] Python no encontrado.
    echo.
    echo Instala Python 3.11 desde:
    echo   https://www.python.org/downloads/
    echo.
    echo IMPORTANTE al instalar, marca estas casillas:
    echo   [x] Add python.exe to PATH
    echo   [x] Install py launcher
    echo.
    echo O desde PowerShell como administrador:
    echo   winget install Python.Python.3.11
    echo.
    echo Cierra esta ventana, abre CMD NUEVO y vuelve a ejecutar install.bat
    pause
    exit /b 1
)

echo Usando: %PYTHON_CMD%
%PYTHON_CMD% --version
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python no responde. Reinstala marcando "Add to PATH".
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
        echo [ERROR] No se pudo crear el entorno virtual.
        pause
        exit /b 1
    )
)

call venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
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
echo Siguiente paso para compilar el instalador: build_installer.bat
pause
