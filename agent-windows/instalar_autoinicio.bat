@echo off
:: Instala el agente ZKTeco como tarea programada de Windows
:: Ejecutar como Administrador

cd /d "%~dp0"

echo ============================================
echo  Instalador de Inicio Automatico
echo  Agente Windows ZKTeco
echo ============================================
echo.

:: Verificar que existe el venv
if not exist "venv\Scripts\pythonw.exe" (
    echo [!] No se encontro el entorno virtual.
    echo     Ejecuta install.bat primero.
    pause
    exit /b 1
)

:: Verificar que existe config.yaml
if not exist "config.yaml" (
    echo [!] No se encontro config.yaml
    echo     Copia config.yaml.example a config.yaml y configuralo.
    pause
    exit /b 1
)

:: Verificar que existe main.py
if not exist "main.py" (
    echo [!] No se encontro main.py
    pause
    exit /b 1
)

:: Obtener ruta completa
set "AGENT_DIR=%cd%"
set "PYTHON=%AGENT_DIR%\venv\Scripts\pythonw.exe"
set "TASK_NAME=AgenteZKTeco"

echo Carpeta del agente: %AGENT_DIR%
echo Python: %PYTHON%
echo.

:: Eliminar tarea anterior si existe
schtasks /Query /TN "%TASK_NAME%" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [*] Eliminando tarea anterior...
    schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1
)

:: Crear XML de la tarea programada con WorkingDirectory
echo [*] Generando configuracion de tarea...

(
echo ^<?xml version="1.0" encoding="UTF-16"?^>
echo ^<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"^>
echo   ^<Triggers^>
echo     ^<LogonTrigger^>
echo       ^<Enabled^>true^</Enabled^>
echo       ^<Delay^>PT30S^</Delay^>
echo     ^</LogonTrigger^>
echo   ^</Triggers^>
echo   ^<Principals^>
echo     ^<Principal id="Author"^>
echo       ^<LogonType^>InteractiveToken^</LogonType^>
echo       ^<RunLevel^>HighestAvailable^</RunLevel^>
echo     ^</Principal^>
echo   ^</Principals^>
echo   ^<Settings^>
echo     ^<MultipleInstancesPolicy^>IgnoreNew^</MultipleInstancesPolicy^>
echo     ^<DisallowStartIfOnBatteries^>false^</DisallowStartIfOnBatteries^>
echo     ^<StopIfGoingOnBatteries^>false^</StopIfGoingOnBatteries^>
echo     ^<AllowHardTerminate^>true^</AllowHardTerminate^>
echo     ^<StartWhenAvailable^>true^</StartWhenAvailable^>
echo     ^<RunOnlyIfNetworkAvailable^>false^</RunOnlyIfNetworkAvailable^>
echo     ^<AllowStartOnDemand^>true^</AllowStartOnDemand^>
echo     ^<Enabled^>true^</Enabled^>
echo     ^<Hidden^>false^</Hidden^>
echo     ^<RestartOnFailure^>
echo       ^<Interval^>PT1M^</Interval^>
echo       ^<Count^>5^</Count^>
echo     ^</RestartOnFailure^>
echo     ^<ExecutionTimeLimit^>PT0S^</ExecutionTimeLimit^>
echo   ^</Settings^>
echo   ^<Actions Context="Author"^>
echo     ^<Exec^>
echo       ^<Command^>%PYTHON%^</Command^>
echo       ^<Arguments^>main.py^</Arguments^>
echo       ^<WorkingDirectory^>%AGENT_DIR%^</WorkingDirectory^>
echo     ^</Exec^>
echo   ^</Actions^>
echo ^</Task^>
) > "%AGENT_DIR%\task_agente.xml"

:: Crear la tarea con el XML
echo [*] Creando tarea programada "%TASK_NAME%"...
schtasks /Create /TN "%TASK_NAME%" /XML "%AGENT_DIR%\task_agente.xml" /F

if %ERRORLEVEL% neq 0 (
    echo.
    echo [!] Error al crear la tarea. Asegurate de ejecutar como Administrador.
    echo     Clic derecho sobre este archivo ^> "Ejecutar como administrador"
    del /f "%AGENT_DIR%\task_agente.xml" >nul 2>&1
    pause
    exit /b 1
)

:: Limpiar XML temporal
del /f "%AGENT_DIR%\task_agente.xml" >nul 2>&1

:: Iniciar la tarea ahora mismo para probar
echo [*] Iniciando el agente ahora...
schtasks /Run /TN "%TASK_NAME%"

echo.
echo ============================================
echo  Instalacion completada
echo ============================================
echo.
echo El agente se iniciara automaticamente al iniciar sesion.
echo Tambien se acaba de iniciar ahora para probar.
echo.
echo Para verificar que esta corriendo:
echo   1. Abre el Administrador de tareas (Ctrl+Shift+Esc)
echo   2. Pestana "Detalles", busca "pythonw.exe"
echo   3. O revisa agent.log en esta carpeta
echo.
echo Para desinstalar:
echo   schtasks /Delete /TN "%TASK_NAME%" /F
echo.
pause
