#!/bin/bash
# Deploy al VPS sin rsync (tar por SSH). Uso: bash scripts/deploy-vps-windows.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${SSH_KEY:-$HOME/.ssh/hostinger_opti}"
VPS="${VPS:-root@148.230.83.108}"
REMOTE="${REMOTE:-/opt/optiexpress}"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

if [[ ! -f "$KEY" ]]; then
  echo "No existe la clave: $KEY" >&2
  exit 1
fi

echo "=== Compilando frontend ==="
(cd "$ROOT/frontend" && npm run build)

echo "=== Subiendo backend/app ==="
tar -C "$ROOT/backend" -czf - app | "${SSH[@]}" "$VPS" "tar -C $REMOTE/backend -xzf -"

echo "=== Subiendo alembic ==="
tar -C "$ROOT/backend" -czf - alembic alembic.ini | "${SSH[@]}" "$VPS" "tar -C $REMOTE/backend -xzf -"

echo "=== Subiendo scripts ==="
tar -C "$ROOT" -czf - scripts | "${SSH[@]}" "$VPS" "tar -C $REMOTE -xzf -"

echo "=== Migraciones ==="
"${SSH[@]}" "$VPS" "cd $REMOTE/backend && ./venv/bin/alembic upgrade head"

echo "=== Subiendo frontend/dist ==="
"${SSH[@]}" "$VPS" "rm -rf $REMOTE/frontend/dist && mkdir -p $REMOTE/frontend/dist"
tar -C "$ROOT/frontend" -czf - dist | "${SSH[@]}" "$VPS" "tar -C $REMOTE/frontend -xzf -"

echo "=== Reiniciando backend ==="
"${SSH[@]}" "$VPS" "systemctl restart optiexpress-backend && sleep 5 && systemctl is-active optiexpress-backend"

echo "=== Deploy completado ==="
