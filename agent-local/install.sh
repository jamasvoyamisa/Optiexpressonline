#!/bin/bash
set -e

echo "========================================"
echo " Instalando Agente ZKTeco MB160"
echo "========================================"
echo

if [ ! -d "venv" ]; then
    echo "Creando entorno virtual..."
    python3 -m venv venv
else
    echo "Entorno virtual ya existe."
fi

echo
echo "Instalando dependencias..."
source venv/bin/activate
pip install -r requirements.txt -q

if [ ! -f "config.yaml" ]; then
    if [ -f "config.yaml.example" ]; then
        cp config.yaml.example config.yaml
        echo "Creado config.yaml desde plantilla."
        echo "EDITA config.yaml con la IP del dispositivo, API Key y URL del backend."
    fi
else
    echo "config.yaml ya existe. No se sobrescribe."
fi

echo
echo "========================================"
echo " Instalación completada."
echo " Edita config.yaml y ejecuta ./run.sh"
echo "========================================"
