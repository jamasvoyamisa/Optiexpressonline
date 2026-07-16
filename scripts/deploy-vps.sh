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
echo "=== Subiendo scripts (utilidades) ==="
rsync -az -e "ssh -i $SSH_KEY" "$ROOT/scripts/" "$VPS:$REMOTE/scripts/"

echo "=== Migraciones DB (alembic upgrade head) ==="
# Ejecuta con el venv del servidor (usuario del servicio puede ser root u otro; ver systemd en el VPS)
ssh -i "$SSH_KEY" "$VPS" "cd $REMOTE/backend && ./venv/bin/alembic upgrade head"

echo "=== Subiendo frontend dist ==="
rsync -az --delete -e "ssh -i $SSH_KEY" "$ROOT/frontend/dist/" "$VPS:$REMOTE/frontend/dist/"

echo "=== Subiendo landing web ==="
rsync -az --delete -e "ssh -i $SSH_KEY" "$ROOT/intranet optiexpress/" "$VPS:$REMOTE/web/"

echo "=== Subiendo fondos TI para portal soporte ==="
ssh -i "$SSH_KEY" "$VPS" "mkdir -p $REMOTE/storage/soporte/backgrounds"
rsync -az --delete -e "ssh -i $SSH_KEY" "$ROOT/frontend/src/assets/ti/" "$VPS:$REMOTE/storage/soporte/backgrounds/"

echo "=== Subiendo fondos checador para portal checadas ==="
ssh -i "$SSH_KEY" "$VPS" "mkdir -p $REMOTE/storage/portal/checador-backgrounds"
rsync -az --delete -e "ssh -i $SSH_KEY" "$ROOT/frontend/src/assets/checador/" "$VPS:$REMOTE/storage/portal/checador-backgrounds/"

echo "=== Actualizando config Nginx ==="
ssh -i "$SSH_KEY" "$VPS" bash -s <<'REMOTE'
set -e
if [ -f /etc/nginx/sites-available/optiexpress ]; then
  cp /opt/optiexpress/scripts/nginx-optiexpress.conf /etc/nginx/sites-available/optiexpress
  nginx -t && systemctl reload nginx && echo "Nginx recargado."
else
  echo "AVISO: /etc/nginx/sites-available/optiexpress no existe — aplica nginx manualmente."
fi
REMOTE

echo "=== Reiniciando backend ==="
ssh -i "$SSH_KEY" "$VPS" "systemctl restart optiexpress-backend && sleep 5 && systemctl is-active optiexpress-backend"

echo "=== Deploy completado ==="
echo "Cotizaciones (Node): con .env en $REMOTE/cotizaciones-web/ ejecuta: ./scripts/deploy-cotizaciones-vps.sh"
