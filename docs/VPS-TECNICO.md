# Documento técnico — VPS Optiexpress (producción)

Referencia para operación, despliegue y credenciales. **No incluyas contraseñas reales en commits públicos.** Los secretos deben vivir en el servidor, en un gestor de contraseñas o en archivos locales ignorados por Git.

---

## 1. Servidor

| Concepto | Valor (referencia del proyecto) |
|----------|----------------------------------|
| **IP / host** | `148.230.83.108` |
| **Usuario SSH** | `root` |
| **Clave privada** | `~/.ssh/hostinger_opti` (en la máquina desde la que se despliega) |
| **Ruta remota de la aplicación** | `/opt/optiexpress` |
| **Servicio backend (systemd)** | `optiexpress-backend` |

### Comandos útiles (desde tu PC)

```bash
# Conexión SSH
ssh -i ~/.ssh/hostinger_opti root@148.230.83.108

# Estado del API
ssh -i ~/.ssh/hostinger_opti root@148.230.83.108 "systemctl status optiexpress-backend"

# Reinicio del backend
ssh -i ~/.ssh/hostinger_opti root@148.230.83.108 "systemctl restart optiexpress-backend"
```

### Despliegue desde el repositorio

```bash
./scripts/deploy-vps.sh
```

Qué hace (resumen): compila el frontend, sincroniza `backend/app`, `alembic`, `alembic.ini`, `scripts/`, ejecuta `alembic upgrade head`, sube `frontend/dist`, copia la landing a `web/` y reinicia `optiexpress-backend`. La SPA React la sirve Nginx con `index.html` desde `frontend/dist/` (ubicación `@react_spa` en `scripts/nginx-optiexpress.conf`).

---

## 2. Base de datos (MySQL / MariaDB)

| Concepto | Notas |
|----------|--------|
| **Motor** | MySQL (PyMySQL en la app: `mysql+pymysql://...`) |
| **URL de conexión** | Variable `DATABASE_URL` en el servidor: `/opt/optiexpress/backend/.env` |
| **Formato** | `mysql+pymysql://USUARIO:CONTRASEÑA@HOST:PUERTO/NOMBRE_BD` |

### Producción (VPS) — datos actuales

| Campo | Valor |
|-------|--------|
| **Host** | `localhost` (vista desde el mismo servidor) |
| **Puerto** | `3306` |
| **Base de datos** | `optiexpress_online` |
| **Usuario MySQL** | `optiexpress_user` |
| **Contraseña** | Ver archivo local **`docs/VPS-CREDENCIALES-LOCAL.md`** (lista usuario, contraseña y `DATABASE_URL` completa; **no está en Git** para no filtrar secretos). |

Si no ves ese archivo (otro clon del repo), obtén la cadena en el servidor:

```bash
grep -E '^DATABASE_URL=' /opt/optiexpress/backend/.env
```

**Ejemplo genérico** de estructura: `backend/.env.example`.

### Migraciones

```bash
cd /opt/optiexpress/backend && ./venv/bin/alembic upgrade head
```

---

## 3. Aplicación backend

| Concepto | Ubicación |
|----------|-----------|
| **Código** | `/opt/optiexpress/backend/` |
| **Entorno virtual** | `/opt/optiexpress/backend/venv/` |
| **Variables de entorno** | `/opt/optiexpress/backend/.env` |

Variables relevantes (nombres; valores en el servidor):

- `DATABASE_URL` — conexión a MySQL  
- `SECRET_KEY` — firma de tokens JWT  
- `CORS_ORIGINS` — orígenes permitidos  
- `DEBUG` — en producción suele ser `false`  

---

## 4. Frontend y web estática

| Ruta remota | Uso |
|-------------|-----|
| `/opt/optiexpress/frontend/dist/` | Build de Vite (subido por el deploy) |
| `/opt/optiexpress/web/` | Landing / sitio estático sincronizado desde `intranet optiexpress/` |
| SPA (React) | `index.html` y `/assets/` desde `frontend/dist/` vía Nginx; no hace falta `app.html` en `web/` |

---

## 5. Usuario administrador de la aplicación

Cuenta de sistema creada por el arranque de la API cuando no existe el registro:

| Campo | Valor típico |
|-------|----------------|
| **Email** | `admin@admin.com` |
| **Usuario (login)** | `admin` |

La **contraseña** puede cambiarse con el script `scripts/set_admin_password.py` en el servidor. Si guardaste una copia local (por ejemplo en `backups/.admin_password_vps.txt`), **no subas ese archivo a Git** (la carpeta `backups/` está ignorada en el repositorio).

---

## 6. Scripts de utilidad (en el repo y en el VPS)

| Script | Propósito |
|--------|-----------|
| `scripts/deploy-vps.sh` | Despliegue completo |
| `scripts/set_admin_password.py` | Cambiar contraseña del `admin@admin.com` |
| `scripts/wipe_app_database.py` | Vaciar datos de todas las tablas excepto `alembic_version` (destructivo; requiere `CONFIRM_WIPE=1`) |

En el VPS, los scripts suelen estar en `/opt/optiexpress/scripts/` si el último deploy los sincronizó.

---

## 7. Respaldos

- Los volcados SQL manuales suelen guardarse en el proyecto bajo `backups/` (ignorado por Git).  
- Convención de nombres vista en el equipo: `optiexpress_vps_YYYYMMDD_HHMMSS.sql`, `optiexpress_vps_pre_wipe_*.sql`, etc.

---

## 8. Seguridad y buenas prácticas

1. **No** pegar `DATABASE_URL`, `SECRET_KEY` ni contraseñas de admin en issues, chats públicos ni en el repositorio.  
2. Si necesitas un documento con **valores reales**, mantenlo fuera del repo (por ejemplo `docs/VPS-CREDENCIALES-LOCAL.md` en tu máquina) o usa un gestor de secretos.  
3. Rota contraseñas si sospechas filtración.  
4. Limita quién tiene la clave SSH `hostinger_opti` y acceso root al VPS.

---

## 9. Plantilla local opcional (rellenar a mano, no commitear)

Puedes copiar este bloque a un archivo **solo en tu equipo** (por ejemplo `docs/VPS-CREDENCIALES-LOCAL.md`):

```text
Fecha de revisión: ___________

SSH
  Host: 148.230.83.108
  Usuario: root
  Clave privada: ~/.ssh/hostinger_opti

MySQL (extraído de DATABASE_URL en el VPS)
  Host:
  Puerto:
  Base de datos:
  Usuario app:
  Contraseña:

JWT / .env
  SECRET_KEY: (no anotar en texto plano si no es necesario; usar gestor)

Admin web
  Usuario: admin
  Contraseña: (gestor o backups/.admin_password_vps.txt)

Notas:
```

---

*Última actualización del documento: coherente con `scripts/deploy-vps.sh` y `backend/.env.example` del repositorio.*
