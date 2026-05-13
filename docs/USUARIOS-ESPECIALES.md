# Usuarios especiales

Guía funcional y técnica del módulo de **Usuarios especiales** en Configuración.

## Objetivo

Un usuario especial es un empleado que:

- **no genera incidencias automáticas** (faltas, retardos, salida anticipada, incompleta),
- puede pertenecer a **cualquier empresa, departamento y puesto**,
- se da de alta desde `Configuración -> Usuarios especiales`.

## Alta desde frontend

Pantalla: `frontend/src/modules/configuracion/ConfiguracionPage.tsx`

Formulario de alta:

- Nombre (obligatorio)
- Apellido paterno
- Apellido materno
- Email
- Teléfono
- Usuario (opcional)
- Contraseña (opcional)
- Empresa (obligatorio)
- Departamento (obligatorio)
- Puesto (obligatorio)
- Permitir checadas remotas (opcional)

Notas:

- El formulario **no pide número de empleado**.
- El número de empleado se genera automáticamente en backend.
- El usuario se crea con `exento_incidencias = true`.

## API backend

Ruta nueva:

- `POST /api/v1/personal/usuarios-especiales`

Archivo:

- `backend/app/modules/personal/routes.py`

Permisos:

- Solo administrador (`is_superuser`).

Validaciones principales:

- Empresa existe.
- Departamento existe y pertenece a la empresa.
- Puesto existe y pertenece al mismo contexto (global o empresa/departamento seleccionado).

## Lógica de generación de número

Archivo:

- `backend/app/modules/personal/service.py`

Regla:

- Se genera como `ESP-{empresa_id}-{folio}`.
- Ejemplo: `ESP-3-0007`.

Implementación:

- Método `_next_numero_especial(...)`.
- Método `create_usuario_especial(...)` que arma un `EmpleadoCreate` interno y reutiliza `create_empleado(...)`.

## Esquemas

Archivo:

- `backend/app/modules/personal/schemas.py`

Nuevo schema:

- `UsuarioEspecialCreate`

Incluye campos simplificados de alta y evita pedir `numero_empleado`.

## Consideraciones operativas

- Si no se envía contraseña, backend usa su regla existente de fallback.
- Si no se envía username, backend autogenera uno único.
- Los usuarios especiales siguen siendo empleados válidos para estructura organizacional, pero quedan exentos de incidencias.
