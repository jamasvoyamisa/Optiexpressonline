@echo off
cd /d "%~dp0"
echo === Instalando Agente Local ZKTeco ===

where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set PYTHON_CMD=python
) else (
    where py >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        set PYTHON_CMD=py -3
    ) else (
        echo ERROR: Python no encontrado. Instala Python 3.8+ desde https://python.org
        pause
        exit /b 1
    )
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
echo Edita config.yaml con la IP del dispositivo y la API Key del backend.
echo Luego ejecuta: run.bat
pause
