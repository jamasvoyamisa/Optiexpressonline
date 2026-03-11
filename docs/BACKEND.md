# Backend - Optiexpress

API REST desarrollada con **FastAPI** y **SQLAlchemy** (MySQL). Gestiona la lógica de negocio del sistema de gestión interna.

## Requisitos

- Python 3.8+
- MySQL 8.0+
- Dependencias: `pip install -r requirements.txt`

## Instalación y ejecución

```bash
cd backend
cp .env.example .env
# Editar .env con DATABASE_URL, SECRET_KEY, etc.
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 9081
```

Para desarrollo con recarga automática:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 9081
```

## Estructura

```
backend/app/
├── main.py                 # Punto de entrada FastAPI, CORS, rutas raíz
├── core/
│   ├── config.py          # Settings (DATABASE_URL, SECRET_KEY, API_V1_PREFIX, CORS)
│   ├── database.py        # Engine, SessionLocal, get_db
│   ├── deps.py            # get_current_empleado_with_rol, permisos por rol
│   ├── scheduler.py       # Tareas programadas (procesar asistencia diaria)
│   ├── security.py       # JWT, bcrypt, verify_password, create_access_token
│   └── timezone_utils.py  # to_mexico, to_utc, mexico_date_to_utc_range
└── modules/
    ├── auth/              # Login, JWT, /auth/me
    ├── personal/          # Empresas, departamentos, empleados, puestos, roles, horarios
    ├── asistencia/        # Checadas, dispositivos, incidencias, reportes
    │   └── biometric/     # Sync con agentes locales, iClock
    ├── vacaciones/        # Solicitudes, aprobación, balance
    ├── incapacidades/     # Registro de incapacidades médicas
    ├── rh/                # Expedientes, documentos, tipos de documento
    ├── notificaciones/    # Notificaciones por usuario
    └── portal/            # Checadas remotas (API pública)
```

## Módulos

| Módulo | Prefijo | Descripción |
|--------|---------|-------------|
| **auth** | `/api/v1/auth` | Login (username/password), JWT, GET /me |
| **personal** | `/api/v1/personal` | CRUD empresas, departamentos, empleados, puestos, roles, horarios |
| **asistencia** | `/api/v1/asistencia` | Dispositivos, checadas, incidencias, reportes, sync desde agentes |
| **vacaciones** | `/api/v1/vacaciones` | Solicitudes, aprobación, balance por empleado |
| **incapacidades** | `/api/v1/incapacidades` | Alta y consulta de incapacidades |
| **rh** | `/api/v1/rh` | Expedientes, documentos, tipos de documento |
| **notificaciones** | `/api/v1/notificaciones` | Listar, marcar leídas |
| **portal** | `/api/v1/portal` | Empresas con checadas remotas, POST checadas (público) |

## Rutas principales (sin autenticación)

- `GET /` — Info del sistema
- `GET /health` — Health check
- `GET /portal` — Página HTML del portal de checadas remotas
- `POST /api/v1/auth/login` — Login
- `GET /api/v1/portal/empresas` — Empresas con checadas remotas
- `POST /api/v1/portal/checadas` — Registrar checada remota

## Autenticación

- **JWT** en header: `Authorization: Bearer <token>`
- El token se obtiene con `POST /api/v1/auth/login` (username: email, número de empleado o username; password).
- `GET /api/v1/auth/me` devuelve el usuario actual y permisos (is_superuser, is_rh, is_director, is_gerente_general, puede_ver_dashboard, puede_ver_mi_area, etc.).

## Base de datos

- **ORM**: SQLAlchemy
- **Migraciones**: Alembic (`alembic upgrade head`)
- **Modelos principales**: Empresa, Departamento, Puesto, Empleado, Rol, Dispositivo, Asistencia, Incidencia, Horario, SolicitudVacaciones, Incapacidad, etc.

## Configuración (.env)

```env
DATABASE_URL=mysql+pymysql://user:password@host:3306/optiexpress_online
SECRET_KEY=tu_clave_secreta
API_V1_PREFIX=/api/v1
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

## Documentación API

Con el servidor en marcha:

- Swagger UI: `http://localhost:9081/docs`
- ReDoc: `http://localhost:9081/redoc`
