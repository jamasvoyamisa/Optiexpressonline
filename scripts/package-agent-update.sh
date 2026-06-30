#!/bin/bash
# Empaqueta el agente para actualización en sucursales (v1.2.1+)
#
# Todo sale de agent-local/ (única carpeta del agente).
#
# Uso: ./scripts/package-agent-update.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT="$ROOT/agent-local"
OUT="$ROOT/dist/agents"
VERSION="1.2.1"

mkdir -p "$OUT"

echo "=== Linux / Mac (fuentes .py) ==="
LINUX_ZIP="$OUT/optiexpress-agent-linux-v${VERSION}.zip"
rm -f "$LINUX_ZIP"
(cd "$AGENT" && zip -rq "$LINUX_ZIP" \
  main.py cloud_sync.py zkteco_client.py local_buffer.py single_instance.py \
  config_guard.py agent_gui.py \
  requirements.txt config.yaml.example \
  install.sh run.sh run_gui.sh install-ubuntu.sh optiexpress-agent.service UBUNTU_SERVER.md \
  -x "*.pyc" -x "__pycache__/*" -x "*.db" -x "agent.log" -x "synced_*.txt" -x "buffer_*.db" -x "venv/*")
echo "  -> $LINUX_ZIP"

echo ""
echo "=== Windows (fuentes para compilar Setup) ==="
WIN_SRC_ZIP="$OUT/optiexpress-agent-windows-src-v${VERSION}.zip"
rm -f "$WIN_SRC_ZIP"
(cd "$AGENT" && zip -rq "$WIN_SRC_ZIP" \
  main.py cloud_sync.py zkteco_client.py local_buffer.py single_instance.py \
  agent_tray.py agent_gui.py config_guard.py create_icon.py \
  requirements.txt config.yaml.example \
  build_exe.bat build_installer.bat install.bat run_tray.bat \
  installer/setup.iss BUILD_TRAY.md README.md \
  -x "*.pyc" -x "__pycache__/*" -x "venv/*" -x "dist/*" -x "build/*" -x "*.db" -x "agent.log")
echo "  -> $WIN_SRC_ZIP"

cat <<EOF

================================================================================
  WINDOWS (sucursales): OptiexpressAgent-Setup-${VERSION}.exe
================================================================================

Compilar en PC Windows (carpeta agent-local):

  install.bat
  build_installer.bat

Salida: dist\\OptiexpressAgent-Setup-${VERSION}.exe

Actualizar sucursal:
  1. Ejecutar el Setup (detecta instalación previa, conserva config.yaml)
  2. Verificar agent.log: "Optiexpress Agent v${VERSION}"

EOF
