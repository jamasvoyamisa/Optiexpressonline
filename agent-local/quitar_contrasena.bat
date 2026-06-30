@echo off
:: Quita contraseña bloqueada del agente (config.yaml en carpeta del exe).
cd /d "%~dp0"

set "CFG=config.yaml"
if not exist "%CFG%" (
    echo No hay config.yaml aqui: %cd%
    pause
    exit /b 1
)

echo Quitando bloqueo de contraseña en %CFG% ...
powershell -NoProfile -Command ^
  "$c = Get-Content -Raw '%CFG%' -Encoding UTF8; $c = $c -replace '(?ms)^security:.*?(\r?\n(?=[a-zA-Z#])|\r?\n$)', ''; Set-Content -Path '%CFG%' -Value $c.TrimEnd() -Encoding UTF8"
echo.
echo Listo. Reinicia OptiexpressAgent.exe y abre Configuracion sin clave.
pause
