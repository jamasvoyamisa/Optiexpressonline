# Despliegue en Ubuntu Server (servidor de pruebas local)

Guía para desplegar la aplicación Optiexpress (backend + frontend) en un servidor Ubuntu sin Docker.

## Requisitos

- Ubuntu Server 20.04 LTS o 22.04 LTS
- Acceso sudo
- Conexión de red (para acceder desde otros equipos de la red local)

## Resumen de pasos

1. Instalar dependencias (MySQL, Python, Node.js, Nginx)
2. Crear base de datos MySQL
3. Ejecutar script de despliegue (opcional) o copiar manualmente
4. Configurar backend (.env)
5. Compilar frontend
6. Configurar Nginx y servicio systemd

### Script rápido (después de instalar dependencias)

```bash
# Desde la raíz del proyecto
./scripts/deploy-ubuntu.sh /opt/optiexpress
```

---

## 1. Instalar dependencias

```bash
sudo apt update
sudo apt install -y mysql-server python3 python3-venv python3-pip nodejs npm nginx
```

Verificar versiones:
```bash
python3 --version   # 3.8+
node --version      # 18+ recomendado
mysql --version
```

---

## 2. Base de datos MySQL

### Crear base de datos y usuario

```bash
sudo mysql -u root
```

En MySQL:
```sql
CREATE DATABASE optiexpress_online CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'optiexpress_user'@'localhost' IDENTIFIED BY 'TU_PASSWORD_SEGURO';
GRANT ALL PRIVILEGES ON optiexpress_online.* TO 'optiexpress_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

O usar el script del proyecto:
```bash
cd backend
python3 setup_database.py
```

---

## 3. Backend

### Copiar archivos

```bash
# En el servidor, crear directorio
sudo mkdir -p /opt/optiexpress
sudo chown $USER:$USER /opt/optiexpress
cd /opt/optiexpress

# Copiar backend (desde tu máquina local con scp, o clonar repo)
# scp -r backend usuario@servidor:/opt/optiexpress/
```

### Configurar entorno

```bash
cd /opt/optiexpress/backend
cp .env.example .env
nano .env
```

Editar `.env` con valores reales:
```
DATABASE_URL=mysql+pymysql://optiexpress_user:TU_PASSWORD@localhost:3306/optiexpress_online
SECRET_KEY=genera_una_clave_con_openssl_rand_hex_32
CORS_ORIGINS=http://192.168.1.100,http://localhost
DEBUG=false
```

Generar SECRET_KEY:
```bash
openssl rand -hex 32
```

### Instalar y ejecutar migraciones

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
```

### Probar backend

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 9081
```

En otro terminal o desde otra máquina: `curl http://IP_SERVIDOR:9081/health` debe responder `{"status":"healthy"}`.

---

## 4. Frontend

### Compilar (en el servidor o en tu máquina)

**Opción A: Compilar en el servidor**
```bash
cd /opt/optiexpress/frontend
npm install
npm run build
```

**Opción B: Compilar localmente y copiar**
```bash
# En tu máquina
cd frontend
npm run build
scp -r dist usuario@servidor:/opt/optiexpress/frontend/
```

Si usas Nginx, el frontend se sirve como archivos estáticos. La API se usa con URL relativa `/api/v1`, así que no hace falta `VITE_API_URL` si Nginx sirve todo en el mismo dominio.

---

## 5. Nginx (reverse proxy)

Copiar la configuración incluida en el proyecto:

```bash
sudo cp scripts/nginx-optiexpress.conf /etc/nginx/sites-available/optiexpress
sudo ln -sf /etc/nginx/sites-available/optiexpress /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # Deshabilitar sitio por defecto si existe
sudo nginx -t
sudo systemctl reload nginx
```

O crear manualmente el archivo (ver `scripts/nginx-optiexpress.conf`).

---

## 6. Servicio systemd (backend)

Copiar el archivo de servicio incluido:

```bash
sudo cp scripts/optiexpress-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
```

Ajustar permisos y usuario si es necesario:

```bash
sudo chown -R www-data:www-data /opt/optiexpress
```

Habilitar e iniciar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable optiexpress-backend
sudo systemctl start optiexpress-backend
sudo systemctl status optiexpress-backend
```

---

## 7. Acceso

- **URL**: `http://IP_SERVIDOR` (ej: `http://192.168.1.100`)
- **Usuario admin por defecto**: `admin`. Ya no tiene una contraseña fija: si defines `ADMIN_DEFAULT_PASSWORD` en `.env` se usa esa; si no, se genera una aleatoria y se imprime **una sola vez** en el log de arranque (`sudo journalctl -u optiexpress-backend -n 50`). En ambos casos se exige cambiarla en el primer login.

---

## Comandos útiles

| Acción | Comando |
|--------|---------|
| Ver logs backend | `sudo journalctl -u optiexpress-backend -f` |
| Reiniciar backend | `sudo systemctl restart optiexpress-backend` |
| Ver logs Nginx | `sudo tail -f /var/log/nginx/error.log` |
| Actualizar backend | `cd /opt/optiexpress/backend && git pull && source venv/bin/activate && pip install -r requirements.txt && alembic upgrade head && sudo systemctl restart optiexpress-backend` |
| Actualizar frontend | `cd /opt/optiexpress/frontend && npm run build && sudo systemctl reload nginx` |

---

## Solución de problemas

### Backend no inicia
- Revisar `.env` y que `DATABASE_URL` sea correcta
- Verificar que MySQL esté corriendo: `sudo systemctl status mysql`
- `sudo journalctl -u optiexpress-backend -n 50`

### Error 502 Bad Gateway
- Verificar que el backend esté en 9081: `curl http://127.0.0.1:9081/health`
- Revisar permisos de `/opt/optiexpress`

### CORS / bloqueo
- Añadir la IP o dominio del cliente a `CORS_ORIGINS` en `.env`
- Si usas Nginx con mismo dominio, CORS no suele ser problema

### Frontend en blanco
- Verificar que `dist` exista y tenga `index.html`
- Revisar la consola del navegador (F12) para errores de red o API
