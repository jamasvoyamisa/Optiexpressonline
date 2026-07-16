#!/usr/bin/env bash
# =============================================================================
# install_db.sh - Instalación completa de la base de datos Optiexpress
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
ENV_FILE="$BACKEND_DIR/.env"
VENV="$BACKEND_DIR/.venv"
PYTHON="$VENV/bin/python"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
err()  { echo -e "${RED}✗ $1${NC}"; exit 1; }
step() { echo -e "\n${YELLOW}▶ $1${NC}"; }

echo "============================================="
echo "   Optiexpress - Instalación de base datos   "
echo "============================================="

# ─── 1. Verificar entorno virtual ─────────────────────────────────────────────
step "Verificando entorno Python..."
[[ -f "$PYTHON" ]] || err "No se encontró el entorno virtual en $VENV.\nEjecuta primero: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
ok "Entorno virtual encontrado"

# ─── 2. Verificar .env ────────────────────────────────────────────────────────
step "Leyendo configuración (.env)..."
[[ -f "$ENV_FILE" ]] || err "No existe $ENV_FILE. Revisa el README."

# Extraer datos de DATABASE_URL=mysql+pymysql://USER:PASS@HOST:PORT/DBNAME
DB_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
[[ -z "$DB_URL" ]] && err "DATABASE_URL no encontrada en $ENV_FILE"

# Parsear URL: mysql+pymysql://user:pass@host:port/dbname
CREDENTIALS=$(echo "$DB_URL" | sed 's|mysql+pymysql://||')
DB_USER=$(echo "$CREDENTIALS" | cut -d':' -f1)
DB_PASS=$(echo "$CREDENTIALS" | cut -d':' -f2 | cut -d'@' -f1)
DB_HOST=$(echo "$CREDENTIALS" | cut -d'@' -f2 | cut -d':' -f1)
DB_PORT=$(echo "$CREDENTIALS" | cut -d':' -f3 | cut -d'/' -f1)
DB_NAME=$(echo "$CREDENTIALS" | cut -d'/' -f2)
[[ -z "$DB_PORT" ]] && DB_PORT="3306"

echo "  Host     : $DB_HOST:$DB_PORT"
echo "  Usuario  : $DB_USER"
echo "  BD       : $DB_NAME"
ok "Configuración leída"

# ─── 3. Verificar MySQL instalado ─────────────────────────────────────────────
step "Verificando MySQL..."
if ! command -v mysql &>/dev/null; then
    warn "MySQL no está instalado. Instalando..."
    if command -v apt-get &>/dev/null; then
        sudo apt-get update -q
        sudo apt-get install -y mysql-server
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y mysql-server
    elif command -v yum &>/dev/null; then
        sudo yum install -y mysql-server
    else
        err "No se pudo instalar MySQL automáticamente. Instálalo manualmente y vuelve a ejecutar este script."
    fi
fi
ok "MySQL instalado"

# ─── 4. Verificar/iniciar servicio MySQL ──────────────────────────────────────
step "Verificando servicio MySQL..."
# Usar 127.0.0.1 para forzar TCP (evita socket Unix)
MYSQL_HOST="${DB_HOST/localhost/127.0.0.1}"
if ! mysqladmin -h "$MYSQL_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" ping --connect-timeout=3 &>/dev/null; then
    warn "Servicio MySQL/MariaDB no responde. Intentando iniciar..."
    if command -v systemctl &>/dev/null; then
        sudo systemctl start mariadb 2>/dev/null || sudo systemctl start mysql 2>/dev/null || sudo systemctl start mysqld 2>/dev/null || true
    else
        sudo service mariadb start 2>/dev/null || sudo service mysql start 2>/dev/null || true
    fi
    sleep 2
    mysqladmin -h "$MYSQL_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" ping --connect-timeout=5 &>/dev/null \
        || err "No se puede conectar a MySQL/MariaDB en $MYSQL_HOST:$DB_PORT con usuario '$DB_USER'.\nVerifica que el servicio esté corriendo y que la contraseña en .env sea correcta."
fi
ok "MySQL activo y accesible"

# ─── 5. Crear base de datos ───────────────────────────────────────────────────
step "Creando base de datos '$DB_NAME'..."
mysql -h "$MYSQL_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" \
    -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" \
    2>/dev/null || err "No se pudo crear la base de datos. Verifica permisos del usuario '$DB_USER'."
ok "Base de datos '$DB_NAME' lista"

# ─── 6. Ejecutar migraciones Alembic ─────────────────────────────────────────
step "Ejecutando migraciones (alembic upgrade head)..."
cd "$BACKEND_DIR"
"$PYTHON" -m alembic upgrade head
ok "Migraciones aplicadas"

# ─── 7. Crear usuario administrador inicial ───────────────────────────────────
step "Creando usuario administrador..."
"$PYTHON" - <<'PYEOF'
import sys, os
sys.path.insert(0, os.getcwd())
from dotenv import load_dotenv
load_dotenv(".env")

from app.core.database import SessionLocal, engine
from app.core.security import get_password_hash
from sqlalchemy import text

db = SessionLocal()
try:
    # Verificar si ya existe un empleado con username 'admin'
    result = db.execute(text("SELECT id FROM empleados WHERE username = 'admin' LIMIT 1")).fetchone()
    if result:
        print("  Usuario 'admin' ya existe, omitiendo.")
        sys.exit(0)

    # Obtener o crear rol Administrador
    rol = db.execute(text("SELECT id FROM roles WHERE nombre = 'Administrador' LIMIT 1")).fetchone()
    if not rol:
        db.execute(text("INSERT INTO roles (nombre, descripcion, activo) VALUES ('Administrador', 'Acceso total al sistema', 1)"))
        db.commit()
        rol = db.execute(text("SELECT id FROM roles WHERE nombre = 'Administrador' LIMIT 1")).fetchone()

    password_hash = get_password_hash("admin123")
    db.execute(text("""
        INSERT INTO empleados
            (numero_empleado, nombre, apellido_paterno, username, password_hash, rol_id, estado)
        VALUES
            ('0001', 'Administrador', 'Sistema', 'admin', :ph, :rol, 'ACTIVO')
    """), {"ph": password_hash, "rol": rol[0]})
    db.commit()
    print("  Usuario admin creado.")
    print("  → Usuario  : admin")
    print("  → Contraseña: admin123")
    print("  ⚠ Cambia la contraseña al primer inicio de sesión.")
except Exception as e:
    print(f"  Advertencia al crear admin: {e}")
    print("  Puedes crearlo manualmente después.")
finally:
    db.close()
PYEOF

# ─── 8. Resumen ───────────────────────────────────────────────────────────────
echo ""
echo "============================================="
ok "Instalación completada exitosamente"
echo "============================================="
echo ""
echo "  Base de datos : $DB_NAME"
echo "  Host          : $DB_HOST:$DB_PORT"
echo ""
echo "  Para iniciar el sistema:"
echo ""
echo "  Backend:"
echo "    cd backend && source .venv/bin/activate"
echo "    uvicorn app.main:app --reload"
echo ""
echo "  Frontend (en otra terminal):"
echo "    cd frontend && npm run dev"
echo ""
