@echo off
:: Compila el agente como ejecutable Windows (.exe) con icono en bandeja del sistema.
:: Ejecutar desde la carpeta agent-local en una maquina Windows con Python instalado.

cd /d "%~dp0"

echo ============================================
echo   Optiexpress Agent - Build Ejecutable
echo ============================================
echo.

:: Verificar entorno virtual
if not exist "venv\Scripts\activate.bat" (
    echo [!] No se encontro el entorno virtual.
    echo     Ejecuta install.bat primero.
    pause
    exit /b 1
)

call venv\Scripts\activate.bat

echo [*] Instalando dependencias de build...
pip install -q pyinstaller pystray Pillow

echo [*] Generando icono (icon.ico)...
python create_icon.py
if not exist "icon.ico" (
    echo [!] No se pudo generar icon.ico
    pause
    exit /b 1
)

echo [*] Compilando OptiexpressAgent.exe ...
pyinstaller --onefile --windowed ^
    --runtime-hook runtime_hook.py ^
    --name "OptiexpressAgent" ^
    --icon "icon.ico" ^
    --hidden-import main ^
    --hidden-import cloud_sync ^
    --hidden-import zkteco_client ^
    --hidden-import local_buffer ^
    --hidden-import single_instance ^
    --hidden-import config_guard ^
    --hidden-import agent_gui ^
    --hidden-import log_setup ^
    --hidden-import win_utils ^
    --hidden-import zk ^
    --hidden-import zk.base ^
    --hidden-import zk.finger ^
    --hidden-import zk.user ^
    --hidden-import zk.attendance ^
    --hidden-import yaml ^
    --hidden-import requests ^
    --hidden-import pystray ^
    --hidden-import pystray._win32 ^
    --hidden-import PIL ^
    --hidden-import PIL.Image ^
    --hidden-import PIL.ImageDraw ^
    --hidden-import PIL.ImageFont ^
    agent_tray.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo [!] Error al compilar. Revisa los mensajes de arriba.
    pause
    exit /b 1
)

:: Copiar archivos necesarios junto al exe
echo [*] Preparando carpeta de distribucion...
if not exist "dist" mkdir dist
copy /y config.yaml.example "dist\config.yaml.example" >nul 2>&1
copy /y agent_gui.py "dist\agent_gui.py" >nul 2>&1
copy /y config_guard.py "dist\config_guard.py" >nul 2>&1
copy /y log_setup.py "dist\log_setup.py" >nul 2>&1
copy /y win_utils.py "dist\win_utils.py" >nul 2>&1

:: Limpiar archivos temporales de build
echo [*] Limpiando archivos temporales...
rmdir /s /q build 2>nul
del /f OptiexpressAgent.spec 2>nul

echo.
echo ============================================
echo   Build completado exitosamente!
echo ============================================
echo.
echo Archivos en la carpeta dist\:
echo   - OptiexpressAgent.exe  (ejecutable principal)
echo   - config.yaml.example   (ejemplo de configuracion)
echo   - agent_gui.py          (ventana de configuracion)
echo.
echo Para instalar en una PC:
echo   1. Copia la carpeta dist\ a la PC destino
echo   2. Renombra config.yaml.example a config.yaml
echo   3. Edita config.yaml con los datos del dispositivo
echo   4. Ejecuta OptiexpressAgent.exe
echo   5. Clic derecho en el icono de la bandeja ^> "Iniciar con Windows"
echo.
echo Para generar el INSTALADOR (.exe Setup): build_installer.bat
echo.
if /I not "%~1"=="NOPAUSE" pause
