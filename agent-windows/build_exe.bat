@echo off
setlocal enabledelayedexpansion

REM Build de ejecutables Windows para el agente ZKTeco
REM Genera:
REM   - dist\AgenteZKTeco.exe      (consola, main.py)
REM   - dist\AgenteZKTecoGUI.exe   (interfaz, agent_gui.py)

cd /d "%~dp0"

if not exist "venv\Scripts\python.exe" (
  echo [ERROR] No existe venv. Ejecuta install.bat primero.
  exit /b 1
)

echo [1/5] Activando entorno...
call venv\Scripts\activate.bat
if errorlevel 1 exit /b 1

echo [2/5] Actualizando pip...
python -m pip install --upgrade pip
if errorlevel 1 exit /b 1

echo [3/5] Instalando dependencias de build...
python -m pip install pyinstaller==6.10.0
if errorlevel 1 exit /b 1

echo [4/5] Limpiando builds previos...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

echo [5/5] Empaquetando ejecutables...
pyinstaller --clean --noconfirm --onefile --name AgenteZKTeco main.py
if errorlevel 1 exit /b 1

pyinstaller --clean --noconfirm --onefile --windowed --name AgenteZKTecoGUI agent_gui.py
if errorlevel 1 exit /b 1

echo.
echo Build completado.
echo EXE consola: dist\AgenteZKTeco.exe
echo EXE GUI:     dist\AgenteZKTecoGUI.exe
echo.
echo IMPORTANTE:
echo - Copia config.yaml junto al .exe antes de ejecutar.
echo - Si Windows SmartScreen bloquea, usa "Mas informacion" - "Ejecutar de todas formas".

endlocal
