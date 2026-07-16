#!/bin/bash
# Instalacion del Agente Optiexpress en Ubuntu Server
# Uso: ./install-ubuntu.sh [--service]
#   --service  Instala y habilita el servicio systemd para inicio automatico

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Instalacion Agente Optiexpress - Ubuntu Server ==="
echo "Directorio: $SCRIPT_DIR"
echo ""

# Verificar que estamos en Ubuntu/Debian
if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
        echo "ADVERTENCIA: Este script esta pensado para Ubuntu/Debian. Continuando de todos modos..."
    fi
fi

# Verificar Python 3
PYTHON_CMD=""
if command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
else
    echo "ERROR: Python no encontrado."
    echo "Instala con: sudo apt update && sudo apt install -y python3 python3-venv python3-pip"
    exit 1
fi

# Verificar modulo venv
if ! $PYTHON_CMD -m venv --help &>/dev/null; then
    echo "ERROR: python3-venv no instalado."
    echo "Ejecuta: sudo apt install -y python3-venv"
    exit 1
fi

# Verificar version de Python
PYVER=$($PYTHON_CMD -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "0")
if [[ "$PYVER" < "3.8" ]]; then
    echo "ERROR: Se requiere Python 3.8 o superior. Actual: $PYVER"
    exit 1
fi

# Crear entorno virtual
if [ ! -f "venv/bin/activate" ]; then
    [ -d "venv" ] && rm -rf venv
    echo "Creando entorno virtual Python..."
    $PYTHON_CMD -m venv venv
fi

source venv/bin/activate
echo "Instalando dependencias..."
pip install --upgrade pip -q
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "ERROR: Fallo al instalar dependencias."
    exit 1
fi

# Config
if [ ! -f "config.yaml" ]; then
    cp config.yaml.example config.yaml
    echo ""
    echo ">>> config.yaml creado. EDITALO con la IP del dispositivo y la API Key."
    echo "    nano config.yaml"
fi

echo ""
echo "=== Instalacion completada ==="
echo ""
echo "Pasos siguientes:"
echo "  1. Edita config.yaml: nano config.yaml"
echo "     - api_url: URL del backend (ej: https://tu-servidor.com/api/v1/asistencia/device-sync)"
echo "     - devices: IP, puerto y api_key de cada checador"
echo ""
echo "  2. Prueba manual: ./run.sh"
echo ""

# Instalar servicio systemd si se solicita
if [[ "$1" == "--service" ]]; then
    echo "Instalando servicio systemd..."
    SVC_FILE="/etc/systemd/system/optiexpress-agent.service"
    TMP_SVC="/tmp/optiexpress-agent.service.$$"
    
    sed "s|AGENT_DIR|$SCRIPT_DIR|g" "$SCRIPT_DIR/optiexpress-agent.service" > "$TMP_SVC"
    
    if [ -w /etc/systemd/system ] 2>/dev/null; then
        cp "$TMP_SVC" "$SVC_FILE"
        rm -f "$TMP_SVC"
    else
        echo "Se requiere sudo para instalar el servicio."
        sudo cp "$TMP_SVC" "$SVC_FILE"
        rm -f "$TMP_SVC"
    fi
    
    sudo systemctl daemon-reload
    sudo systemctl enable optiexpress-agent
    echo ""
    echo "Servicio instalado y habilitado."
    echo ""
    echo "Comandos utiles:"
    echo "  sudo systemctl start optiexpress-agent   # Iniciar"
    echo "  sudo systemctl stop optiexpress-agent    # Detener"
    echo "  sudo systemctl status optiexpress-agent  # Estado"
    echo "  sudo journalctl -u optiexpress-agent -f   # Ver logs en tiempo real"
    echo ""
    echo "IMPORTANTE: Edita config.yaml antes de iniciar el servicio."
fi
