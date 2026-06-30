@echo off
:: Restablece la contraseña de configuracion del agente.
:: Uso: reset_password.bat [nueva_contrasena]
:: Si no indicas contraseña, se elimina el bloqueo (acceso libre).

cd /d "%~dp0"

set "CFG=config.yaml"
if not exist "%CFG%" (
    echo [!] No existe config.yaml en esta carpeta.
    pause
    exit /b 1
)

echo ============================================
echo  Restablecer contraseña del agente
echo ============================================
echo.
echo Carpeta: %cd%
echo Archivo: %CFG%
echo.
echo Cierra OptiexpressAgent.exe antes de continuar.
pause

if "%~1"=="" goto :clear
set "NEW_PWD=%~1"
goto :setpwd

:clear
echo.
echo Se quitara la proteccion por contraseña (acceso libre a Configuracion).
echo Para poner una contraseña nueva despues, abre la GUI y usa "Cambiar contraseña".
echo.

if not exist "venv\Scripts\python.exe" (
    echo [!] No hay venv. Edita config.yaml a mano: borra la seccion "security:" completa.
    pause
    exit /b 1
)

call venv\Scripts\activate.bat
python -c "import yaml; p='config.yaml'; c=yaml.safe_load(open(p,encoding='utf-8')) or {}; c.pop('security',None); open(p,'w',encoding='utf-8').write(yaml.dump(c,default_flow_style=False,allow_unicode=True,sort_keys=False)); print('Listo: proteccion eliminada.')"
goto :done

:setpwd
if not exist "venv\Scripts\python.exe" (
    echo [!] No hay venv. Ejecuta install.bat primero.
    pause
    exit /b 1
)
call venv\Scripts\activate.bat
python -c "import hashlib,yaml; p='config.yaml'; pwd=r'''%NEW_PWD%'''; c=yaml.safe_load(open(p,encoding='utf-8')) or {}; c.setdefault('security',{})['gui_password_hash']=hashlib.sha256(pwd.encode()).hexdigest(); c['security'].pop('gui_password_required',None); open(p,'w',encoding='utf-8').write(yaml.dump(c,default_flow_style=False,allow_unicode=True,sort_keys=False)); print('Listo: nueva contraseña aplicada.')"
goto :done

:done
echo.
echo Abre de nuevo OptiexpressAgent.exe
pause
