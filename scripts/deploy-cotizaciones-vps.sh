#!/bin/bash
# Despliega la app Cotizaciones (Node) al VPS y reinicia el servicio.
# Requisitos en el servidor (una vez):
#   - Crear /opt/optiexpress/cotizaciones-web/.env (ver deploy/env.vps.optiexpress.example)
#   - sudo cp scripts/optiexpress-cotizaciones.service /etc/systemd/system/
#   - sudo systemctl daemon-reload && sudo systemctl enable --now optiexpress-cotizaciones
#   - Nginx: incluir location /cotizaciones/ (ver scripts/nginx-optiexpress.conf)
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="$HOME/.ssh/hostinger_opti"
VPS="root@148.230.83.108"
REMOTE="/opt/optiexpress"
SRC="$ROOT/cotizaciones/cotizaciones-web-1.1.0"

if [ ! -d "$SRC/server" ]; then
  echo "No existe $SRC — descomprime o coloca cotizaciones-web-1.1.0 en cotizaciones/"
  exit 1
fi

echo "=== Subiendo cotizaciones-web ==="
rsync -az --delete --exclude node_modules --exclude .env \
  -e "ssh -i $SSH_KEY" \
  "$SRC/" "$VPS:$REMOTE/cotizaciones-web/"

echo "=== Subiendo scripts de utilidades ==="
rsync -az -e "ssh -i $SSH_KEY" \
  "$ROOT/scripts/gen_cotizaciones_env_from_backend.py" \
  "$ROOT/scripts/optiexpress-cotizaciones.service" \
  "$VPS:$REMOTE/scripts/"

echo "=== npm ci (producción) ==="
ssh -i "$SSH_KEY" "$VPS" "cd $REMOTE/cotizaciones-web && npm ci --omit=dev"

echo "=== .env de cotizaciones (desde DATABASE_URL del backend si falta) ==="
ssh -i "$SSH_KEY" "$VPS" bash -s <<REMOTE
set -e
COT="${REMOTE}/cotizaciones-web/.env"
BACKEND_ENV="${REMOTE}/backend/.env"
PY="${REMOTE}/scripts/gen_cotizaciones_env_from_backend.py"
VENV_PY="${REMOTE}/backend/venv/bin/python3"
if [ ! -f "\$COT" ]; then
  if [ ! -f "\$BACKEND_ENV" ]; then
    echo "No existe \$BACKEND_ENV; crea \$COT a mano (ver deploy/env.vps.optiexpress.example)."
    exit 1
  fi
  if [ ! -x "\$VENV_PY" ]; then
    echo "No hay \$VENV_PY; crea \$COT a mano."
    exit 1
  fi
  "\$VENV_PY" "\$PY" "\$BACKEND_ENV" > "\$COT"
  chmod 600 "\$COT" || true
  echo "Creado \$COT desde DATABASE_URL del backend."
fi
REMOTE

echo "=== Servicio systemd optiexpress-cotizaciones ==="
ssh -i "$SSH_KEY" "$VPS" bash -s <<REMOTE
set -e
# Si existía despliegue con PM2 en el mismo puerto, liberarlo
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete cotizaciones-web 2>/dev/null || true
  pm2 save 2>/dev/null || true
fi
install -m 644 "${REMOTE}/scripts/optiexpress-cotizaciones.service" /etc/systemd/system/optiexpress-cotizaciones.service
systemctl daemon-reload
systemctl enable optiexpress-cotizaciones
systemctl restart optiexpress-cotizaciones
sleep 3
systemctl is-active optiexpress-cotizaciones
REMOTE

echo "=== Nginx: location /cotizaciones/ ==="
rsync -az -e "ssh -i $SSH_KEY" "$ROOT/scripts/nginx-optiexpress.conf" "$VPS:$REMOTE/scripts/nginx-optiexpress.conf"
ssh -i "$SSH_KEY" "$VPS" bash -s <<'REMOTE'
set -e
if [ -f /etc/nginx/sites-available/optiexpress ]; then
  cp /opt/optiexpress/scripts/nginx-optiexpress.conf /etc/nginx/sites-available/optiexpress
  nginx -t
  systemctl reload nginx
  echo "Nginx recargado."
else
  echo "AVISO: no existe /etc/nginx/sites-available/optiexpress — copia manualmente scripts/nginx-optiexpress.conf y: nginx -t && systemctl reload nginx"
fi
REMOTE

echo "=== Cotizaciones: https://intranetoptiexpress.net/cotizaciones/ ==="
