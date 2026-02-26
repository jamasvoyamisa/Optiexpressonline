@echo off
cd /d "%~dp0"

echo ========================================
echo  Instalando Agente ZKTeco MB160
echo ========================================
echo.

if not exist "venv\Scripts\activate.bat" (
    if exist "venv" (
        echo Eliminando venv anterior (incompatible con Windows)...
        rmdir /s /q venv
    )
    echo Creando entorno virtual...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: No se encontro Python. Instala Python 3.8+ desde python.org
        pause
        exit /b 1
    )
) else (
    echo Entorno virtual ya existe.
)

echo.
echo Activando entorno e instalando dependencias...
call venv\Scripts\activate.bat
pip install -r requirements.txt -q

if errorlevel 1 (
    echo ERROR al instalar dependencias.
    pause
    exit /b 1
)

echo.
if not exist "config.yaml" (
    if exist "config.yaml.example" (
        copy config.yaml.example config.yaml
        echo Creado config.yaml desde plantilla.
        echo EDITA config.yaml con la IP del dispositivo, API Key y URL del backend.
    )
) else (
    echo config.yaml ya existe. No se sobrescribe.
)

echo.
echo ========================================
echo  Instalacion completada.
echo  Edita config.yaml y ejecuta run.bat
echo ========================================
pause
