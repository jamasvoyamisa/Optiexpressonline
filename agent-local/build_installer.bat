@echo off
:: Compila OptiexpressAgent.exe + instalador OptiexpressAgent-Setup-X.Y.Z.exe
:: Requisitos: Python + Inno Setup 6 (https://jrsoftware.org/isinfo.php)

cd /d "%~dp0"

echo ============================================
echo   Agente Optiexpress - Build INSTALADOR
echo ============================================
echo.

echo [1/2] Compilando OptiexpressAgent.exe ...
call build_exe.bat NOPAUSE
if %ERRORLEVEL% neq 0 (
    echo [!] Fallo build_exe.bat
    pause
    exit /b 1
)

if not exist "dist\OptiexpressAgent.exe" (
    echo [!] No se genero dist\OptiexpressAgent.exe
    pause
    exit /b 1
)

if not exist "icon.ico" (
    echo [!] Falta icon.ico — ejecuta build_exe.bat o create_icon.py
    pause
    exit /b 1
)

echo.
echo [2/2] Compilando instalador (Inno Setup) ...

set "ISCC="
if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" (
    set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
) else if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" (
    set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
)

if not defined ISCC (
    echo.
    echo [!] Inno Setup 6 no encontrado.
    echo     Descarga: https://jrsoftware.org/isdl.php
    echo     Instala y vuelve a ejecutar build_installer.bat
    echo.
    echo     Mientras tanto tienes dist\OptiexpressAgent.exe para pruebas manuales.
    pause
    exit /b 1
)

echo Usando: "%ISCC%"
"%ISCC%" "%~dp0installer\setup.iss"
if %ERRORLEVEL% neq 0 (
    echo [!] Error al compilar setup.iss
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Instalador listo
echo ============================================
echo.
echo   dist\OptiexpressAgent-Setup-*.exe
echo.
echo En sucursal:
echo   - Instalacion nueva: ejecutar el Setup, configurar config.yaml al final
echo   - Actualizacion: ejecutar el Setup (detecta version previa, conserva config.yaml)
echo.
dir /b dist\OptiexpressAgent-Setup-*.exe 2>nul
echo.
pause
