# TAREA PENDIENTE — Replicación de huellas entre dispositivos

## Estado
**No implementado.** La tabla `pending_replicate` existe en la base de datos (migración `l3m4n5o6p7q8`) pero no hay endpoints en el backend, lógica en el agente ni UI en el frontend.

---

## Problema técnico principal (LEER ANTES DE IMPLEMENTAR)

### Las plantillas de huella son específicas del dispositivo

Los checadores ZKTeco almacenan las huellas como **plantillas biométricas** en un formato propietario.
El formato varía según:

- **Modelo del dispositivo** (ej. ZK4500, F18, SpeedFace, K40, etc.)
- **Versión del firmware**
- **Algoritmo SDK** usado (ZKFinger 10, ZKFinger 11, VX 10.0, etc.)

**Consecuencia:** Una plantilla exportada de un dispositivo **solo puede importarse en otro dispositivo que use exactamente el mismo modelo/versión de firmware y el mismo algoritmo SDK.** Si los dispositivos difieren, la importación falla silenciosamente o la huella queda corrupta y el empleado no puede checar.

### Cuándo SÍ funciona la replicación

| Condición | Resultado |
|-----------|-----------|
| Mismo modelo + mismo firmware + mismo SDK | ✅ Replicación posible |
| Mismo modelo + firmware distinto | ⚠️ Puede funcionar, hay que probar caso por caso |
| Modelos distintos | ❌ No funciona, plantillas incompatibles |
| Un dispositivo usa ZKFinger 10 y otro ZKFinger 11 | ❌ No funciona |

### Cómo verificar compatibilidad antes de replicar

1. Conectar a ambos dispositivos con el SDK de ZKTeco.
2. Leer el campo `device_info["firmware_version"]` y `device_info["algorithm_version"]` en cada uno.
3. Solo si ambos campos coinciden exactamente, la replicación es segura.

---

## Qué habría que implementar

### 1. Backend — `pending_replicate`

La tabla ya existe con estructura:

```sql
id              INT PK
dispositivo_id  INT FK → dispositivos.id   (dispositivo DESTINO)
numero_empleado VARCHAR(50)
procesado       BOOLEAN DEFAULT FALSE
procesado_at    DATETIME NULL
created_at      DATETIME
```

Endpoints necesarios:

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/personal/empleados/{id}/replicar-huella` | Encola replicación hacia uno o varios dispositivos destino |
| `GET`  | `/agent/pending-replicate` | El agente consulta la cola (requiere API Key) |
| `POST` | `/agent/pending-replicate/{id}/mark-done` | Agente marca como completado |

El endpoint de encolar debe **validar** que el dispositivo origen y destino sean compatibles (misma versión de firmware/SDK). Si no se puede validar automáticamente, al menos advertir al administrador.

### 2. Agente local — `agent-local/main.py`

Agregar un paso en el ciclo principal después del enroll:

```python
# Pseudocódigo
pending = api.get("/agent/pending-replicate")
for item in pending:
    template = zk.get_user_template(pin=empleado.pin_checador)  # leer del origen
    if template:
        zk_destino.upload_user_template(pin=..., template=template)
        api.post(f"/agent/pending-replicate/{item.id}/mark-done", {"success": True})
    else:
        api.post(f"/agent/pending-replicate/{item.id}/mark-done", {"success": False, "error": "Sin plantilla en origen"})
```

> ⚠️ El agente necesita acceso **simultáneo** al dispositivo origen y al dispositivo destino, o bien un paso en dos fases: primero exportar la plantilla desde el origen y guardarla en el backend, luego el agente del destino la descarga e importa.

### 3. Frontend — tab Huella en detalle de empleado

- Mostrar botón **"Replicar a otro dispositivo"** solo si el empleado ya tiene huellas registradas (`tieneHuella === true`).
- Al hacer clic, mostrar lista de dispositivos activos (excluir el dispositivo origen y "Portal Checadas Remotas").
- Confirmar y encolar.

---

## Consideración adicional: exportar plantilla

El SDK de ZKTeco permite:
- `get_templates()` → exportar plantillas del dispositivo
- `upload_user(user_id, templates)` → importar plantillas al dispositivo

La plantilla exportada es un `bytes` (bytestring). Para la replicación en dos fases (agentes distintos), se puede almacenar temporalmente en la tabla `fingerprint_templates` que ya existe en la BD.

---

## Referencia

- Migración: `backend/alembic/versions/l3m4n5o6p7q8_add_pending_replicate.py`
- Tabla de plantillas: `fingerprint_templates` (ya existe)
- Documentación de colas: `docs/COLAS-Y-ENVIO-AL-DISPOSITIVO.md`
