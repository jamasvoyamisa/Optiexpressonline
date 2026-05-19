#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${SSH_KEY:-$HOME/.ssh/hostinger_opti}"
VPS="${VPS:-root@148.230.83.108}"
REMOTE="${REMOTE:-/opt/optiexpress}"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

echo "=== Subiendo alembic ==="
tar -C "$ROOT/backend" -czf - alembic alembic.ini | "${SSH[@]}" "$VPS" "tar -C $REMOTE/backend -xzf -"
echo "=== Migraciones ==="
"${SSH[@]}" "$VPS" "cd $REMOTE/backend && ./venv/bin/alembic upgrade head && ./venv/bin/alembic current"
echo "=== OK ==="
