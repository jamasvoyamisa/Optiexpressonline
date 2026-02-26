#!/bin/bash
cd "$(dirname "$0")"

if [ ! -f "venv/bin/activate" ]; then
    echo "ERROR: Ejecuta ./install.sh primero."
    exit 1
fi

if [ ! -f "config.yaml" ]; then
    echo "ERROR: No existe config.yaml. Copia config.yaml.example a config.yaml y configúralo."
    exit 1
fi

echo "Iniciando Agente ZKTeco MB160..."
echo "Presiona Ctrl+C para detener."
echo

source venv/bin/activate
python main.py
