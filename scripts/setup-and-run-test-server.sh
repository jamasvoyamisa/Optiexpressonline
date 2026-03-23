#!/bin/bash
# Se ejecuta EN EL SERVIDOR de pruebas (marco@10.10.20.9) para instalar deps e iniciar backend y frontend.
# Uso en el servidor: bash ~/optiexpress/setup-and-run-test-server.sh
# Opcional: SUDO_PASS="tu_password" para instalar paquetes del sistema.
set -e
REMOTE="/home/marco/optiexpress"
cd "$REMOTE"

# Instalar python3-venv si hace falta (requiere sudo)
PYVER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "3")
if [ ! -d "backend/venv" ] || [ ! -f "backend/venv/bin/pip" ]; then
  echo "Asegurando python3-venv (necesario para crear el entorno virtual)..."
  if [ -n "$SUDO_PASS" ]; then
    echo "$SUDO_PASS" | sudo -S apt-get update -qq
    echo "$SUDO_PASS" | sudo -S apt-get install -y python3-venv python3-pip || \
      echo "$SUDO_PASS" | sudo -S apt-get install -y "python${PYVER}-venv" python3-pip
  else
    sudo apt-get update -qq && sudo apt-get install -y python3-venv python3-pip || sudo apt-get install -y "python${PYVER}-venv" python3-pip
  fi
  rm -rf backend/venv 2>/dev/null || true
  echo "Creando venv en backend..."
  python3 -m venv backend/venv
fi
echo "Instalando dependencias Python..."
backend/venv/bin/pip install -q --upgrade pip
backend/venv/bin/pip install -q -r backend/requirements.txt

# .env: si no existe, copiar desde ejemplo
if [ ! -f "backend/.env" ]; then
  if [ -f "backend/.env.example" ]; then
    cp backend/.env.example backend/.env
    echo "Creado backend/.env desde .env.example. Revisa DATABASE_URL y SECRET_KEY."
  else
    echo "Crea backend/.env con DATABASE_URL y SECRET_KEY."
    exit 1
  fi
fi

# --- Base de datos MySQL/MariaDB: instalar, crear BD y usuario, migrar ---
DB_NAME="optiexpress_online"
DB_USER="optiexpress_user"
DB_PASS="optiexpress_password"
if ! command -v mysql &>/dev/null; then
  echo "Instalando MariaDB..."
  if [ -n "$SUDO_PASS" ]; then
    echo "$SUDO_PASS" | sudo -S apt-get update -qq
    echo "$SUDO_PASS" | sudo -S DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server mariadb-client
  else
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server mariadb-client
  fi
  sleep 2
fi
# Asegurar que MariaDB esté en marcha y arranque con el sistema (antes del backend)
if command -v mysql &>/dev/null; then
  echo "Iniciando y habilitando MariaDB..."
  if [ -n "$SUDO_PASS" ]; then
    echo "$SUDO_PASS" | sudo -S systemctl start mariadb 2>/dev/null || true
    echo "$SUDO_PASS" | sudo -S systemctl enable mariadb 2>/dev/null || true
  else
    sudo systemctl start mariadb 2>/dev/null || true
    sudo systemctl enable mariadb 2>/dev/null || true
  fi
  sleep 1
fi
if command -v mysql &>/dev/null; then
  echo "Creando base de datos y usuario si no existen..."
  sudo mysql -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || \
    mysql -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || true
  sudo mysql -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS'; GRANT ALL ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost'; FLUSH PRIVILEGES;" 2>/dev/null || \
    mysql -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS'; GRANT ALL ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost'; FLUSH PRIVILEGES;" 2>/dev/null || true
  echo "Ejecutando migraciones Alembic..."
  cd "$REMOTE/backend"
  venv/bin/alembic upgrade head
  cd "$REMOTE"
fi

# --- Servicios systemd: backend, frontend y landing arrancan con el sistema ---
SYSTEMD_SRC="$REMOTE/scripts/systemd"
if [ -d "$SYSTEMD_SRC" ]; then
  echo "Instalando servicios systemd (arranque con el sistema)..."
  run_sudo() { if [ -n "$SUDO_PASS" ]; then echo "$SUDO_PASS" | sudo -S "$@"; else sudo "$@"; fi; }
  for svc in optiexpress-backend optiexpress-frontend optiexpress-landing; do
    if [ -f "$SYSTEMD_SRC/${svc}.service" ]; then
      run_sudo cp "$SYSTEMD_SRC/${svc}.service" /etc/systemd/system/
    fi
  done
  run_sudo systemctl daemon-reload
  for svc in optiexpress-backend optiexpress-frontend; do
    run_sudo systemctl enable "$svc" 2>/dev/null || true
    run_sudo systemctl restart "$svc" 2>/dev/null || true
  done
  if [ -d "$REMOTE/web" ] && [ -f "$REMOTE/web/index.html" ]; then
    run_sudo systemctl enable optiexpress-landing 2>/dev/null || true
    run_sudo systemctl restart optiexpress-landing 2>/dev/null || true
  fi
  echo "Servicios systemd instalados y reiniciados (backend, frontend, landing)."
else
  # Fallback sin systemd: matar puertos e iniciar con nohup
  for port in 9081 3000 8080; do
    pid=$( (lsof -ti :$port 2>/dev/null || fuser $port/tcp 2>/dev/null) | head -1)
    [ -n "$pid" ] && { echo "Deteniendo puerto $port (PID $pid)..."; kill $pid 2>/dev/null || true; sleep 1; }
  done
  cd "$REMOTE/backend"
  [ -f venv/bin/uvicorn ] && nohup venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 9081 >> ../backend.log 2>&1 & || nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 9081 >> ../backend.log 2>&1 &
  sleep 2
  cd "$REMOTE/frontend/dist" && nohup python3 -m http.server 3000 --bind 0.0.0.0 >> ../frontend.log 2>&1 &
  [ -d "$REMOTE/web" ] && [ -f "$REMOTE/web/index.html" ] && { cd "$REMOTE/web" && nohup python3 -m http.server 8080 --bind 0.0.0.0 >> ../landing.log 2>&1 & }
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "10.10.20.9")
echo "Listo. Backend: http://$IP:9081   Frontend (intranet): http://$IP:3000   Landing: http://$IP:8080"
echo "Logs: tail -f $REMOTE/backend.log  y  tail -f $REMOTE/frontend/frontend.log  y  tail -f $REMOTE/landing.log"
echo "Servicios: sudo systemctl status optiexpress-backend optiexpress-frontend optiexpress-landing"
