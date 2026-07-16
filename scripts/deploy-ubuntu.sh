#!/bin/bash
# Script de despliegue para Ubuntu Server
# Uso: ./deploy-ubuntu.sh [ruta_base]
# Ejemplo: ./deploy-ubuntu.sh /opt/optiexpress
#
# Ejecutar desde la raíz del proyecto (Optiexpressonline)

set -e

BASE_DIR="${1:-/opt/optiexpress}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Despliegue Optiexpress en Ubuntu ==="
echo "Proyecto: $PROJECT_ROOT"
echo "Destino:  $BASE_DIR"
echo ""

# Verificar que estamos en el proyecto
if [ ! -f "$PROJECT_ROOT/backend/requirements.txt" ] || [ ! -f "$PROJECT_ROOT/frontend/package.json" ]; then
    echo "ERROR: Ejecuta desde la raíz del proyecto Optiexpressonline"
    exit 1
fi

# Crear directorio
sudo mkdir -p "$BASE_DIR"
sudo chown "$USER:$USER" "$BASE_DIR"

# Copiar backend
echo "Copiando backend..."
rsync -a --exclude='venv' --exclude='__pycache__' --exclude='*.pyc' --exclude='.env' \
    "$PROJECT_ROOT/backend/" "$BASE_DIR/backend/"

# Copiar frontend (solo fuentes si no hay dist)
echo "Copiando frontend..."
rsync -a --exclude='node_modules' \
    "$PROJECT_ROOT/frontend/" "$BASE_DIR/frontend/"

# Backend: venv y dependencias
echo "Configurando backend..."
cd "$BASE_DIR/backend"
if [ ! -f "venv/bin/activate" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

# Verificar .env
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo ""
    echo ">>> IMPORTANTE: Edita $BASE_DIR/backend/.env con DATABASE_URL, SECRET_KEY y CORS_ORIGINS"
    echo "    nano $BASE_DIR/backend/.env"
fi

# Migraciones
if [ -f ".env" ]; then
    echo "Ejecutando migraciones..."
    alembic upgrade head 2>/dev/null || echo "  (Si falla, verifica DATABASE_URL en .env)"
fi

# Frontend: build
echo "Compilando frontend..."
cd "$BASE_DIR/frontend"
if command -v npm &>/dev/null; then
    npm install --silent
    npm run build
else
    echo "  npm no encontrado. Compila manualmente: cd $BASE_DIR/frontend && npm run build"
fi

echo ""
echo "=== Despliegue completado ==="
echo ""
echo "Pasos siguientes:"
echo "  1. Editar .env: nano $BASE_DIR/backend/.env"
echo "  2. Configurar Nginx (ver docs/DEPLOYMENT_UBUNTU.md)"
echo "  3. Instalar servicio systemd (ver docs/DEPLOYMENT_UBUNTU.md)"
echo ""
echo "Probar backend: cd $BASE_DIR/backend && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 9081"
echo ""
