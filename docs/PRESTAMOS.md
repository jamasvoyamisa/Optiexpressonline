# Módulo de Solicitudes de Préstamos

Este documento describe el módulo de solicitudes de préstamos: su uso, flujo, permisos y detalles técnicos.

---

## 1. Descripción general

El módulo permite a los empleados solicitar préstamos de nómina y a Recursos Humanos (RH) o Administradores gestionar esas solicitudes (aprobar, rechazar o registrar en nombre de empleados).

**Características principales:**
- El empleado crea su solicitud indicando monto y plazo en meses.
- El descuento quincenal se calcula automáticamente.
- RH/Admin aprueba o rechaza las solicitudes pendientes.
- El empleado puede cancelar sus propias solicitudes mientras estén pendientes.

---

## 2. Flujo del proceso

El flujo es similar al de vacaciones: **Gerente General/Director/Admin aprueban**; **RH solo confirma**.

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐     ┌──────────┐
│    EMPLEADO     │     │ GG / DIRECTOR / ADM  │     │         RH           │     │  ESTADO  │
└────────┬────────┘     └──────────┬───────────┘     └──────────┬──────────┘     └────┬─────┘
         │                        │                            │                     │
         │ 1. Crear solicitud    │                            │                     │
         │   (monto, plazo)      │                            │                     │
         │───────────────────────┼────────────────────────────┼─────────────────────► PENDIENTE
         │                       │                            │                     │
         │                       │ 2. Aprobar / Rechazar      │                     │
         │                       │────────────────────────────┼─────────────────────► APROBADA_GERENTE
         │                       │                    o       │              o       RECHAZADA
         │                       │                            │                     │
         │                       │                            │ 3. Confirmar        │
         │                       │                            │─────────────────────► APROBADA
         │                       │                            │                     │
         │ 4. (Opcional)         │                            │                     │
         │    Cancelar (pendiente)│                            │                     │
         │───────────────────────┼────────────────────────────┼─────────────────────► CANCELADA
```

### Pasos detallados

| Paso | Actor | Acción | Estado resultante |
|------|-------|--------|-------------------|
| 1 | Empleado | Crea solicitud con monto, plazo (meses) y motivo opcional | `pendiente` |
| 2a | Gerente General / Director / Admin | Aprueba la solicitud | `aprobada_gerente` |
| 2b | Gerente General / Director / Admin | Rechaza la solicitud | `rechazada` |
| 3 | RH | Confirma la solicitud ya aprobada por gerente | `aprobada` |
| 4 | Empleado | Cancela su solicitud (solo si está pendiente) | `cancelada` |

**Restricciones:**
- Solo se pueden editar o cancelar solicitudes en estado `pendiente`.
- Gerente General, Director y Administrador aprueban o rechazan (primer nivel).
- RH solo confirma las ya aprobadas por gerente; no puede rechazar desde la confirmación.

---

## 3. Roles y permisos

| Rol | Ver solicitudes | Crear (propias) | Crear (en nombre de otros) | Aprobar/Rechazar (1er nivel) | Confirmar (RH) | Cancelar (propias) |
|-----|-----------------|-----------------|----------------------------|------------------------------|----------------|---------------------|
| Empleado | Solo las propias | ✓ | — | — | — | ✓ (pendientes) |
| Gerente General | Todas | ✓ | — | ✓ | — | — |
| Director | Todas | ✓ | — | ✓ | — | — |
| RH | Todas | ✓ | ✓ | — | ✓ | — |
| Administrador | Todas | ✓ | ✓ | ✓ | ✓ | — |

- **Aprobar/Rechazar**: Gerente General, Director o Administrador (igual que vacaciones).
- **Confirmar**: Solo RH (o Administrador). Mueve `aprobada_gerente` → `aprobada`.

---

## 4. Cálculo del descuento quincenal

El descuento quincenal se calcula automáticamente en base al monto y al plazo:

```
descuento_quincenal = monto ÷ (plazo_meses × 2)
```

- **2 quincenas por mes**: Se asume nómina quincenal (común en México).
- **Redondeo**: A 2 decimales (centavos).

**Ejemplos:**

| Monto | Plazo | Quincenas | Descuento quincenal |
|-------|-------|-----------|---------------------|
| $10,000 | 12 meses | 24 | $416.67 |
| $5,000 | 6 meses | 12 | $416.67 |
| $15,000 | 24 meses | 48 | $312.50 |

---

## 5. Modelo de datos

### Tabla `solicitudes_prestamos`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | Integer | Clave primaria |
| `empleado_id` | Integer | Empleado que solicita (FK a empleados) |
| `monto` | Numeric(12,2) | Monto solicitado en MXN |
| `plazo_meses` | Integer | Plazo en meses |
| `motivo` | Text | Motivo opcional |
| `descuento_quincenal` | Numeric(10,2) | Calculado automáticamente |
| `estado` | Enum | pendiente, aprobada_gerente, aprobada, rechazada, cancelada |
| `aprobado_por_id` | Integer | Empleado que aprobó/rechazó (FK) |
| `fecha_aprobacion` | DateTime | Fecha de aprobación/rechazo |
| `comentarios_aprobacion` | Text | Comentarios del aprobador |
| `created_at` | DateTime | Fecha de creación |
| `updated_at` | DateTime | Última actualización |

---

## 6. API (Backend)

**Prefijo base:** `/api/v1/prestamos`

| Método | Ruta | Descripción | Permiso |
|--------|------|-------------|---------|
| GET | `/` | Listar solicitudes | Empleado: propias; RH/Admin: todas |
| GET | `/solicitudes-pendientes` | Listar pendientes para aprobar | GG/Director/Admin |
| GET | `/solicitudes-pendientes-rh` | Listar pendientes de confirmar RH | RH/Admin |
| POST | `/` | Crear solicitud propia | Cualquier autenticado |
| POST | `/rh` | Crear solicitud en nombre de empleado | RH/Admin |
| GET | `/{id}` | Obtener detalle | Propietario o RH |
| PUT | `/{id}` | Actualizar (solo pendientes) | Propietario |
| POST | `/{id}/aprobar` | Aprobar o rechazar (1er nivel) | GG/Director/Admin |
| PUT | `/{id}/confirmar-rh` | Confirmar (aprobada_gerente → aprobada) | RH/Admin |
| DELETE | `/{id}` | Cancelar (solo pendientes) | Propietario |

### Parámetros de listado (GET)

- `empleado_id`: Filtrar por empleado (solo RH).
- `estado`: Filtrar por estado (pendiente, aprobada, rechazada, cancelada).
- `skip`, `limit`: Paginación.

### Payload de creación (POST)

```json
{
  "monto": 10000,
  "plazo_meses": 12,
  "motivo": "Gastos médicos"
}
```

El campo `descuento_quincenal` no se envía; se calcula en el backend.

---

## 7. Uso en el frontend

### Empleados: "Mis préstamos" (`/mis-prestamos`)

- **Acceso**: Menú lateral "Mis préstamos" (cualquier empleado autenticado).
- **Funciones**:
  - Ver todas sus solicitudes.
  - Crear nueva solicitud (monto, plazo, motivo).
  - Vista previa del descuento quincenal calculado (a X quincenas).
  - Cancelar solicitudes pendientes.

### Gerente General / Director: "Solicitudes a aprobar"

- **Acceso**: Menú "Solicitudes a aprobar" → pestaña "Préstamos".
- **Funciones**:
  - Ver solicitudes de préstamos pendientes.
  - Aprobar o rechazar (primer nivel). Aprobado → pendiente confirmación RH.

### RH: Pestaña "Préstamos" (dentro de Recursos Humanos)

- **Acceso**: Recursos Humanos → pestaña "Préstamos".
- **Funciones**:
  - Ver todas las solicitudes de la organización.
  - Filtrar por estado (incl. "Aprobada por gerente") y buscar por empleado.
  - Registrar solicitud en nombre de un empleado (Empresa → Departamento → Empleado).
  - **Confirmar** solicitudes en estado "Aprobada por gerente" (botón Confirmar).
  - Administrador puede además aprobar/rechazar pendientes.
  - Ver columna "Descuento/q" con el monto calculado.

---

## 8. Archivos del módulo

### Backend

```
backend/app/modules/prestamos/
├── models.py      # SolicitudPrestamo, EstadoSolicitudPrestamo
├── schemas.py     # Create, Update, Response, AprobarRechazar
├── service.py     # Lógica de negocio y cálculo de descuento
└── routes.py      # Endpoints REST
```

### Frontend

```
frontend/src/modules/
├── rh/PrestamosPage.tsx           # Vista RH (tab dentro de RH)
└── empleado/MisPrestamosPage.tsx  # Vista empleado
```

### Migración

```
backend/alembic/versions/p9q0r1s2t3u4_add_solicitudes_prestamos.py
```
