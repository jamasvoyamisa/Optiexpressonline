#!/bin/bash
cd "$(dirname "$0")"

if [ ! -f "venv/bin/activate" ]; then
    echo "No se encontro el entorno virtual. Ejecutando install.sh..."
    bash install.sh
    if [ $? -ne 0 ]; then
        echo "ERROR: La instalacion fallo."
        exit 1
    fi
fi

source venv/bin/activate
echo "=== Iniciando Agente Local ZKTeco ==="
echo "Presiona Ctrl+C para detener"
echo ""
python main.py
