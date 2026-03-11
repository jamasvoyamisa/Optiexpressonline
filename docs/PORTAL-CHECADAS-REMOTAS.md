# Portal de Checadas Remotas

El portal permite a los empleados registrar checadas (entrada, salida, comida) desde cualquier dispositivo con navegador, sin necesidad del dispositivo biométrico físico.

## Características

- **Acceso directo al backend**: No requiere el frontend React. Se sirve una página HTML estática desde FastAPI.
- **Empresa selectiva**: Solo las empresas con `checadas_remotas` habilitado aparecen en el selector.
- **Autenticación**: Número de empleado + contraseña de la app (la misma que usan para login en el sistema).
- **Secuencia automática**: El sistema determina el tipo de checada según el día (entrada → salida_comer → regreso_comer → salida en L-V; entrada → salida en fin de semana).

## URL de acceso

```
http://SERVIDOR:9081/portal
```

Ejemplo: `http://192.168.1.50:9081/portal` o `http://localhost:9081/portal`

## Configuración

### 1. Habilitar checadas remotas en una empresa

1. Iniciar sesión como Administrador.
2. Ir a **Configuración** → pestaña **Empresas**.
3. Editar la empresa deseada.
4. Marcar **"Habilitar checadas remotas (portal web)"**.
5. Guardar.

### 2. Empleados con contraseña

Los empleados deben tener contraseña asignada en el módulo Personal. Sin contraseña, no podrán usar el portal.

## API del portal

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/portal` | Página HTML del portal |
| GET | `/api/v1/portal/empresas` | Lista empresas con checadas remotas habilitadas (público) |
| POST | `/api/v1/portal/checadas` | Registrar checada (empresa_id, numero_empleado, password) |

### Ejemplo POST /api/v1/portal/checadas

```json
{
  "empresa_id": 1,
  "numero_empleado": "001",
  "password": "contraseña_del_empleado"
}
```

**Respuesta exitosa:**
```json
{
  "ok": true,
  "mensaje": "Checada registrada: entrada",
  "tipo": "entrada",
  "timestamp": "2026-03-10 14:30:00"
}
```

**Respuesta error:**
```json
{
  "ok": false,
  "mensaje": "Credenciales incorrectas."
}
```

## Estructura técnica

```
backend/app/modules/portal/
├── __init__.py
├── routes.py      # Endpoints API y definición de rutas
├── schemas.py     # ChecadaRemotaRequest, ChecadaRemotaResponse
├── service.py     # Lógica de autenticación y registro de checadas
└── templates/
    └── checadas_remotas.html   # Página HTML del portal
```

- **Dispositivo virtual**: Las checadas del portal se registran con el dispositivo "Portal Checadas Remotas", creado automáticamente en la primera checada.
- **Incidencias**: Se aplican las mismas reglas que para checadas biométricas (retardo, salida anticipada, etc.).
- **Usuarios exentos**: Los empleados marcados como "usuarios especiales" (exento_incidencias) no generan incidencias automáticas.

## Seguridad

- No se requiere token JWT para el portal.
- La autenticación es por empresa + número de empleado + contraseña.
- Solo empleados activos de empresas con checadas remotas habilitadas pueden registrar.
- Se evitan duplicados por ventana de 5 segundos (doble clic).
