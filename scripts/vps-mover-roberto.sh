#!/bin/bash
# Mueve empleado 220 (OPTIVISION) -> 221 (Distribuidora) en producción.
# Usa las mismas variables que scripts/deploy-vps.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/hostinger_opti}"
VPS="${VPS:-root@148.230.83.108}"
REMOTE="${REMOTE:-/opt/optiexpress}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "No existe la clave SSH: $SSH_KEY" >&2
  echo "Colócala como en deploy-vps.sh (~/.ssh/hostinger_opti) o exporta SSH_KEY=/ruta/a/la/clave" >&2
  exit 1
fi

echo "=== Subiendo script mover_empleado_empresa.py ==="
rsync -az -e "ssh -i $SSH_KEY" \
  "$ROOT/scripts/mover_empleado_empresa.py" \
  "$VPS:$REMOTE/scripts/"

echo "=== Preview ==="
ssh -i "$SSH_KEY" "$VPS" "cd $REMOTE/backend && ./venv/bin/python3 $REMOTE/scripts/mover_empleado_empresa.py \
  --numero-origen 220 --empresa-origen OPTIVISION \
  --numero-destino 221 --empresa-destino distribuidora \
  --nombre-contiene 'DE LA TORRE'"

if [[ "${1:-}" == "--apply" ]]; then
  echo "=== Aplicando ==="
  ssh -i "$SSH_KEY" "$VPS" "cd $REMOTE/backend && ./venv/bin/python3 $REMOTE/scripts/mover_empleado_empresa.py \
    --numero-origen 220 --empresa-origen OPTIVISION \
    --numero-destino 221 --empresa-destino distribuidora \
    --nombre-contiene 'DE LA TORRE' --apply"
  echo "=== Listo ==="
else
  echo "Para aplicar: bash scripts/vps-mover-roberto.sh --apply"
fi
