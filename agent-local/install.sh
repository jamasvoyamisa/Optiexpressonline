#!/bin/bash
cd "$(dirname "$0")"
echo "=== Instalando Agente Local ZKTeco ==="

PYTHON_CMD=""
if command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
else
    echo "ERROR: Python no encontrado. Instala Python 3.8+"
    exit 1
fi

if [ ! -f "venv/bin/activate" ]; then
    [ -d "venv" ] && rm -rf venv
    echo "Creando entorno virtual..."
    $PYTHON_CMD -m venv venv
    if [ $? -ne 0 ]; then
        echo "ERROR: No se pudo crear el entorno virtual."
        exit 1
    fi
fi

source venv/bin/activate
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "ERROR al instalar dependencias."
    exit 1
fi

if [ ! -f "config.yaml" ]; then
    cp config.yaml.example config.yaml
    echo "Archivo config.yaml creado. Editalo con los datos de tu dispositivo."
fi

echo ""
echo "=== Instalacion completada ==="
echo "Edita config.yaml con la IP del dispositivo y la API Key del backend."
echo "Luego ejecuta: ./run.sh"
