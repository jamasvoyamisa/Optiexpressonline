#!/bin/bash
# Deploy rápido al VPS: backend + frontend + reinicio
# Uso: ./scripts/deploy-vps.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="$HOME/.ssh/hostinger_opti"
VPS="root@148.230.83.108"
REMOTE="/opt/optiexpress"

echo "=== Compilando frontend ==="
cd "$ROOT/frontend" && npm run build

echo "=== Subiendo backend ==="
rsync -az -e "ssh -i $SSH_KEY" "$ROOT/backend/app/" "$VPS:$REMOTE/backend/app/"
rsync -az -e "ssh -i $SSH_KEY" "$ROOT/backend/alembic/" "$VPS:$REMOTE/backend/alembic/"
rsync -az -e "ssh -i $SSH_KEY" "$ROOT/backend/alembic.ini" "$VPS:$REMOTE/backend/alembic.ini"

echo "=== Migraciones DB (alembic upgrade head) ==="
# Ejecuta con el venv del servidor (usuario del servicio puede ser root u otro; ver systemd en el VPS)
ssh -i "$SSH_KEY" "$VPS" "cd $REMOTE/backend && ./venv/bin/alembic upgrade head"

echo "=== Subiendo frontend dist ==="
rsync -az --delete -e "ssh -i $SSH_KEY" "$ROOT/frontend/dist/" "$VPS:$REMOTE/frontend/dist/"

echo "=== Subiendo landing web ==="
rsync -az --delete -e "ssh -i $SSH_KEY" "$ROOT/intranet optiexpress/" "$VPS:$REMOTE/web/"

echo "=== Actualizando app.html ==="
ssh -i "$SSH_KEY" "$VPS" "cp $REMOTE/frontend/dist/index.html $REMOTE/web/app.html"

echo "=== Reiniciando backend ==="
ssh -i "$SSH_KEY" "$VPS" "systemctl restart optiexpress-backend && sleep 2 && systemctl is-active optiexpress-backend"

echo "=== Deploy completado ==="
