#!/bin/bash
# Backup del VPS de producción antes de desplegar los fixes de seguridad
# (ver plan "Impacto de los fixes de seguridad y estrategia de despliegue", paso 1).
#
# Hace, en este orden:
#   1) mysqldump completo de la BD (leyendo DATABASE_URL de backend/.env en el VPS).
#   2) Copia del backend/.env y alembic_version actual (para poder reconstruir el
#      estado exacto de config + esquema en el rollback).
#   3) Descarga todo a ./backups/<timestamp>/ en esta máquina, para no depender
#      solo de que el VPS siga vivo.
#
# NO hace nada destructivo: solo lee y copia. No detiene servicios ni borra nada.
#
# Uso: ./scripts/backup-pre-deploy-vps.sh
# Variables opcionales (mismos defaults que el resto de scripts/deploy-*.sh):
#   SSH_KEY, VPS, REMOTE
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${SSH_KEY:-$HOME/.ssh/hostinger_opti}"
VPS="${VPS:-root@148.230.83.108}"
REMOTE="${REMOTE:-/opt/optiexpress}"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
SCP=(scp -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

STAMP="$(date +%Y%m%d-%H%M%S)"
LOCAL_DIR="$ROOT/backups/$STAMP"
mkdir -p "$LOCAL_DIR"

echo "=== Backup pre-deploy — $STAMP ==="
echo "Destino local: $LOCAL_DIR"

echo "=== 1/4: Dump de MySQL en el VPS (a /tmp, sin tocar nada en producción) ==="
"${SSH[@]}" "$VPS" bash -s <<REMOTE_SCRIPT
set -euo pipefail
cd "$REMOTE/backend"
# Extrae host/usuario/password/bd de DATABASE_URL en .env sin imprimir el password en logs.
python3 - <<'PYEOF' > /tmp/optiexpress-backup-$STAMP.env
import re
with open(".env") as f:
    for line in f:
        line = line.strip()
        if line.startswith("DATABASE_URL="):
            url = line.split("=", 1)[1].strip()
            m = re.match(r"mysql\+pymysql://([^:]+):([^@]*)@([^:/]+):?(\d+)?/([^?]+)", url)
            if not m:
                raise SystemExit("No se pudo parsear DATABASE_URL")
            user, pwd, host, port, db = m.groups()
            print(f"DB_USER={user}")
            print(f"DB_PASS={pwd}")
            print(f"DB_HOST={host}")
            print(f"DB_PORT={port or 3306}")
            print(f"DB_NAME={db}")
            break
PYEOF
set -a
source /tmp/optiexpress-backup-$STAMP.env
set +a
rm -f /tmp/optiexpress-backup-$STAMP.env
mysqldump --single-transaction --quick --routines --triggers \
  -h "\$DB_HOST" -P "\${DB_PORT:-3306}" -u "\$DB_USER" -p"\$DB_PASS" "\$DB_NAME" \
  | gzip > /tmp/optiexpress-db-$STAMP.sql.gz
echo "Dump listo: \$(du -h /tmp/optiexpress-db-$STAMP.sql.gz | cut -f1)"
REMOTE_SCRIPT

echo "=== 2/4: Copiando .env y revisión de Alembic actual (metadatos, sin secretos extra) ==="
"${SSH[@]}" "$VPS" "cd $REMOTE/backend && cp .env /tmp/optiexpress-env-$STAMP.bak && ./venv/bin/alembic current > /tmp/optiexpress-alembic-$STAMP.txt 2>&1 || true"

echo "=== 3/4: Descargando backup a esta máquina ==="
"${SCP[@]}" "$VPS:/tmp/optiexpress-db-$STAMP.sql.gz" "$LOCAL_DIR/"
"${SCP[@]}" "$VPS:/tmp/optiexpress-env-$STAMP.bak" "$LOCAL_DIR/backend.env.bak"
"${SCP[@]}" "$VPS:/tmp/optiexpress-alembic-$STAMP.txt" "$LOCAL_DIR/alembic-current.txt" 2>/dev/null || true

echo "=== 4/4: Limpiando temporales en el VPS ==="
"${SSH[@]}" "$VPS" "rm -f /tmp/optiexpress-db-$STAMP.sql.gz /tmp/optiexpress-env-$STAMP.bak /tmp/optiexpress-alembic-$STAMP.txt"

echo ""
echo "=== Backup completado ==="
echo "Archivos en: $LOCAL_DIR"
ls -lh "$LOCAL_DIR"
echo ""
echo "Restaurar la BD (si algo sale mal):"
echo "  gunzip -c $LOCAL_DIR/optiexpress-db-$STAMP.sql.gz | ssh -i $KEY $VPS 'mysql -h <host> -u <user> -p<pass> <db>'"
echo ""
echo "Snapshot del VPS completo (opcional, adicional a este dump):"
echo "  Hostinger permite crear un snapshot de la VM desde hPanel o la API de VPS"
echo "  (VPS_createSnapshotV1) antes de desplegar. Recomendado antes del Lote 1"
echo "  si vas a tocar datos (migración de contraseñas)."
