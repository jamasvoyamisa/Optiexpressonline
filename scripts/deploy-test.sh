#!/bin/bash
# Deploy al servidor de pruebas (usuario/contraseña) e instala/inicia backend y frontend.
# Uso: ./scripts/deploy-test.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_HOST="marco@10.10.20.9"
TEST_PASS="marco"
REMOTE="/home/marco/optiexpress"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
# API en el servidor de pruebas para que el frontend la use
VITE_API_URL="http://10.10.20.9:9081"

export SSHPASS="$TEST_PASS"

echo "=== Compilando frontend (API → $VITE_API_URL) ==="
cd "$ROOT/frontend" && VITE_API_URL="$VITE_API_URL" npm run build

echo "=== Creando directorios en el servidor de pruebas ==="
sshpass -e ssh $SSH_OPTS "$TEST_HOST" "mkdir -p $REMOTE/backend/app $REMOTE/frontend/dist $REMOTE/web $REMOTE/scripts/systemd"

echo "=== Subiendo landing (intranet optiexpress → web) ==="
if [ -d "$ROOT/intranet optiexpress" ]; then
  sshpass -e rsync -az --delete -e "ssh $SSH_OPTS" \
    --exclude 'node_modules' --exclude '.git' --exclude '.DS_Store' \
    "$ROOT/intranet optiexpress/" "$TEST_HOST:$REMOTE/web/"
else
  echo "(No existe carpeta 'intranet optiexpress', se omite landing)"
fi

echo "=== Subiendo backend (app, alembic, requirements, .env.example) ==="
sshpass -e rsync -az -e "ssh $SSH_OPTS" "$ROOT/backend/app/" "$TEST_HOST:$REMOTE/backend/app/"
sshpass -e rsync -az -e "ssh $SSH_OPTS" "$ROOT/backend/alembic/" "$TEST_HOST:$REMOTE/backend/alembic/"
sshpass -e scp $SSH_OPTS "$ROOT/backend/requirements.txt" "$ROOT/backend/alembic.ini" "$TEST_HOST:$REMOTE/backend/"
sshpass -e scp $SSH_OPTS "$ROOT/backend/.env.example" "$TEST_HOST:$REMOTE/backend/" 2>/dev/null || true

echo "=== Subiendo frontend dist ==="
sshpass -e rsync -az --delete -e "ssh $SSH_OPTS" "$ROOT/frontend/dist/" "$TEST_HOST:$REMOTE/frontend/dist/"

echo "=== Subiendo script de setup e inicio y units systemd ==="
sshpass -e scp $SSH_OPTS "$ROOT/scripts/setup-and-run-test-server.sh" "$TEST_HOST:$REMOTE/"
if [ -d "$ROOT/scripts/systemd" ] && ls "$ROOT/scripts/systemd/"*.service 1>/dev/null 2>&1; then
  sshpass -e scp $SSH_OPTS "$ROOT/scripts/systemd/"*.service "$TEST_HOST:$REMOTE/scripts/systemd/"
fi

echo "=== Ejecutando setup e inicio en el servidor (instalar deps, iniciar backend y frontend) ==="
sshpass -e ssh $SSH_OPTS "$TEST_HOST" "chmod +x $REMOTE/setup-and-run-test-server.sh && export SUDO_PASS='$TEST_PASS'; bash $REMOTE/setup-and-run-test-server.sh"

echo "=== Deploy al servidor de pruebas completado ==="
echo "Frontend (intranet): http://10.10.20.9:3000   Backend API: http://10.10.20.9:9081   Landing: http://10.10.20.9:8080"
