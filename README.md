# Sistema de Gestión Interna Modular - Optiexpress

Sistema modular de gestión interna con backend FastAPI y frontend React+TypeScript.

## Documentación

| Documento | Descripción |
|-----------|-------------|
| [docs/BACKEND.md](docs/BACKEND.md) | API, módulos, estructura y configuración del backend |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Rutas, permisos, estructura y configuración del frontend |
| [docs/PORTAL-CHECADAS-REMOTAS.md](docs/PORTAL-CHECADAS-REMOTAS.md) | Portal de checadas remotas (acceso directo al backend) |
| [docs/CADENA-DE-MANDO-ROLES.md](docs/CADENA-DE-MANDO-ROLES.md) | Roles y permisos del sistema |
| [docs/VACACIONES-LFT-MEXICO.md](docs/VACACIONES-LFT-MEXICO.md) | Vacaciones según LFT México |
| [docs/DEPLOYMENT_UBUNTU.md](docs/DEPLOYMENT_UBUNTU.md) | Despliegue en Ubuntu |

## Requisitos

- Python 3.8+
- Node.js 18+
- MySQL 8.0+ (instalado localmente o en servidor remoto)

## Configuración del Backend

1. Crear archivo `.env` en `backend/` basado en `.env.example`:

```bash
cd backend
cp .env.example .env
```

2. Editar `.env` con tus credenciales de MySQL:

```env
DATABASE_URL=mysql+pymysql://usuario:password@localhost:3306/optiexpress_online
```

3. Instalar dependencias:

```bash
pip install -r requirements.txt
```

4. Ejecutar migraciones (cuando estén creadas):

```bash
alembic upgrade head
```

5. Iniciar servidor:

```bash
uvicorn app.main:app --reload
```

**Para acceso desde la red interna** (otros equipos en la misma red):

```bash
uvicorn app.main:app --reload --host 0.0.0.0
```

O bien: `python -m app.main` desde la carpeta `backend/` (usa host 0.0.0.0 por defecto).

## Configuración del Frontend

1. Instalar dependencias:

```bash
cd frontend
npm install
```

2. Iniciar servidor de desarrollo:

```bash
npm run dev
```

**Acceso desde la red interna:** El frontend (Vite) escucha en `0.0.0.0`, así que otros equipos pueden acceder con `http://IP_DEL_SERVIDOR:3000` (ej: `http://192.168.1.50:3000`). Asegúrate de que el backend también esté en `--host 0.0.0.0`.

## Agente Local

Ver documentación en `agent-local/README.md`
