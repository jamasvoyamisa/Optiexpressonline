# Frontend - Optiexpress

Aplicación web desarrollada con **React 18**, **TypeScript** y **Vite**. Interfaz de usuario del sistema de gestión interna.

## Requisitos

- Node.js 18+
- npm o yarn

## Instalación y ejecución

```bash
cd frontend
npm install
npm run dev
```

Por defecto corre en `http://localhost:3000`. El proxy de Vite redirige `/api` al backend en `http://127.0.0.1:9081`.

## Estructura

```
frontend/src/
├── main.tsx              # Punto de entrada, ReactDOM
├── App.tsx               # Rutas y ProtectedRoute
├── index.css              # Estilos globales
├── components/
│   ├── Layout.tsx        # Barra lateral, header, menú
│   ├── Login.tsx         # Formulario de login
│   ├── HomeRedirect.tsx  # Redirige según rol (dashboard, mi-area, mis-asistencias)
│   ├── ProtectedRoute.tsx # Protege rutas por permiso
│   └── NotificationBell.tsx
├── hooks/
│   └── useAuth.ts        # AuthProvider, login, logout, authMe
├── services/
│   └── api.ts            # Cliente axios, baseURL /api/v1, interceptor token
├── types/
│   ├── api.ts            # Interfaces (Empleado, Empresa, Asistencia, etc.)
│   └── index.ts          # Re-exports
├── utils/
│   └── date.ts
└── modules/
    ├── dashboard/       # DashboardPage
    ├── rh/              # RHPage, IncapacidadesPage, ReportesAsistenciaPage, SolicitudesVacRH
    ├── asistencia/      # AsistenciaPage
    ├── mi-area/         # MiAreaPage
    ├── vacaciones/     # VacacionesPage, SolicitudesVacacionesAprobarPage
    ├── configuracion/   # ConfiguracionPage
    └── empleado/        # MisAsistenciasPage, MisVacacionesPage, MisDatosPage
```

## Rutas y permisos

| Ruta | Permiso | Descripción |
|------|---------|-------------|
| `/login` | — | Login |
| `/` | autenticado | Redirige según rol |
| `/dashboard` | `dashboard` | Panel principal (Admin, Director, GG, RH) |
| `/rh` | `rh` | Hub de RH |
| `/asistencia` | `superuser` | Gestión de asistencia |
| `/mi-area` | `mi_area` | Vista jefes de área |
| `/solicitudes-vacaciones` | `solicitudes_vacaciones` | Aprobar vacaciones |
| `/configuracion` | `superuser` | Configuración |
| `/mis-asistencias` | autenticado | Mis checadas e incidencias |
| `/mis-vacaciones` | autenticado | Mis vacaciones |
| `/mis-datos` | autenticado | Mis datos personales |

## Permisos (useAuth / authMe)

- `puede_ver_dashboard` — Admin, Director, Gerente General, RH
- `puede_ver_mi_area` — Gerentes, supervisores, Admin
- `is_superuser` — Administrador
- `is_rh` — Rol RH
- `is_director` — Puesto Director
- `is_gerente_general` — Puesto Gerente General
- `solicitudes_vacaciones` — Admin, Director, GG (para aprobar vacaciones)

## API

El frontend usa `api.ts` (axios) con:

- `baseURL`: `import.meta.env.VITE_API_URL || '/api/v1'`
- Interceptor: añade `Authorization: Bearer <token>` si existe en localStorage
- En 401 (excepto login): borra token y redirige a `/login?session_expired=1`

## Configuración

- **Vite**: `vite.config.ts` — proxy `/api` → `http://127.0.0.1:9081`
- **Puerto**: 3000 por defecto
- **Host**: `0.0.0.0` para acceso desde red interna

## Build para producción

```bash
npm run build
```

Los archivos se generan en `dist/`. Servir con cualquier servidor estático (nginx, etc.) y configurar el proxy de `/api` al backend.
