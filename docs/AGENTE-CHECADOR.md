# Agente Checador — Documentación Técnica

Documento de referencia sobre el funcionamiento del agente local de checadas, las reglas de negocio que aplica el backend al recibir marcas y los escenarios de recuperación ante fallas.

---

## 1. Arquitectura general

```
┌─────────────────────────────────────┐
│  Dispositivo ZKTeco (checador)      │
│  - Almacena marcas localmente       │
│  - Puerto TCP 4370                  │
└──────────────┬──────────────────────┘
               │ SDK ZK (TCP)
               ▼
┌─────────────────────────────────────┐
│  Agente Local (Python)              │
│  main.py / DeviceHandler            │
│  - Corre en la red local            │
│  - Lee marcas del dispositivo       │
│  - Mantiene buffer SQLite           │
│  - Ciclo cada N segundos (config)   │
└──────────────┬──────────────────────┘
               │ HTTPS / REST
               ▼
┌─────────────────────────────────────┐
│  Backend (FastAPI · VPS)            │
│  POST /asistencia/device-sync       │
│  - Valida API Key del dispositivo   │
│  - Asigna tipo de checada           │
│  - Genera incidencias automáticas   │
└─────────────────────────────────────┘
```

El agente también existe en variantes para Linux (`agent-linux/`), Windows (`agent-windows/`) y uso local de desarrollo (`agent-local/`). Todos comparten la misma lógica.

---

## 2. Componentes del agente

| Archivo | Rol |
|---------|-----|
| `main.py` | Punto de entrada. Instancia `Agent` (multi-dispositivo), ejecuta el ciclo principal |
| `zkteco_client.py` | Comunicación TCP con el checador ZKTeco: leer marcas, gestionar usuarios, enrolar huellas |
| `cloud_sync.py` | Cliente HTTP hacia la API del backend: enviar checadas, consultar colas de trabajo |
| `local_buffer.py` | Buffer SQLite local para checadas que no pudieron enviarse por falta de conexión |
| `config.yaml` | Configuración del agente: IPs de dispositivos, API Keys, intervalo de sync |

---

## 3. Ciclo de sincronización

Cada `interval_seconds` (por defecto 30 s) el agente ejecuta, por cada dispositivo activo:

```
1. ¿Hay conexión con el backend? (GET /health)
   ├─ SÍ → Procesar colas de trabajo:
   │        · Usuarios pendientes de crear en dispositivo
   │        · Enrolls de huella pendientes
   │        · Replicaciones de huella entre dispositivos
   │        · Eliminaciones de usuario pendientes
   └─ NO → Omitir colas de trabajo

2. sync_attendance()
   · Leer TODOS los registros del dispositivo
   · Por cada registro no sincronizado aún:
     - Intentar POST /asistencia/device-sync
     - Si falla (sin red) → guardar en LocalBuffer
     - Si OK o rechazada definitivamente → marcar como procesada

3. sync_buffer()  (solo si hay conexión)
   · Releer el buffer SQLite (checadas que fallaron antes)
   · Reintentar envío al backend en lotes de 50
```

Cada 5 minutos (aprox) se ejecuta adicionalmente `sync_device_templates_to_backend()` para subir huellas nuevas que aún no estén en el servidor.

---

## 4. Reglas de checadas en el backend

### 4.1 Secuencia de tipos

Al recibir una checada, el backend determina automáticamente su tipo según cuántas marcas lleva el empleado ese día (hora México):

| Posición | Lunes–Viernes (4 requeridas) | Sábado / Domingo laborable / Jornada reducida (2 requeridas) |
|----------|------------------------------|--------------------------------------------------------------|
| 0 | ENTRADA | ENTRADA |
| 1 | SALIDA_COMER | SALIDA |
| 2 | REGRESO_COMER | — |
| 3 | SALIDA | — |

La secuencia se selecciona así (en orden de prioridad):
1. **Checada especial** vigente con `checadas_requeridas = 2` en L–V → secuencia de 2
2. **Jornada reducida** (`jornada_reducida_lv = True`) en L–V → secuencia de 2
3. **Fin de semana** (sábado o domingo) → secuencia de 2
4. **Default** (L–V normal) → secuencia de 4

### 4.2 Límite estricto de marcas por día

**El sistema no permite más marcas de las requeridas.** Si el empleado ya completó su secuencia (4 ó 2), cualquier marca adicional ese día es **rechazada**:

- **Agente local:** `sync_attendance` lanza `ValueError` y la marca no se guarda. Se loguea como advertencia.
- **ADMS biométrico:** `_process_attlog` captura el error, loguea y continúa con el siguiente registro del batch sin guardar.
- **Portal web:** la validación `count >= requeridas` retorna error al empleado antes de intentar guardar.

Esto garantiza que la secuencia de tipos siempre sea coherente para nómina y auditorías.

### 4.3 Días sin checada requerida

Cuando `checadas_requeridas = 0`, el sistema no registra la marca y responde con el motivo:

| Motivo | Descripción |
|--------|-------------|
| `festivo` | Día festivo y la empresa no trabaja festivos |
| `domingo` | Domingo y la empresa no opera domingos |
| `sin_horario` | El empleado no tiene horario asignado |
| `no_sabado` | El empleado no tiene horario sabatino |
| `no_laborable` | El día no está en `dias_semana` del horario |
| `incapacidad` | El empleado tiene incapacidad activa ese día |
| `vacacion_solicitud` | Vacaciones por solicitud aprobada |
| `vacacion_general` | Vacación general de empresa aplicada |

---

## 5. Incidencias automáticas

El proceso `procesar_dia` (se ejecuta típicamente en la madrugada del día siguiente) analiza cada empleado activo y genera incidencias automáticas según las marcas registradas:

| Marcas registradas | Tipo de incidencia generada |
|--------------------|----------------------------|
| 0 de 4 (ó 0 de 2) | `FALTA` |
| 1 de 4 | `INCOMPLETA` — solo entrada |
| 2 de 4 | `INCOMPLETA` — faltan regreso y salida |
| 3 de 4 | `INCOMPLETA` — falta salida |
| 1 de 2 | `INCOMPLETA` — falta salida |
| ≥ requeridas | Se verifica salida anticipada (`SALIDA_ANTICIPADA`) |

Además, al momento de sincronizar cada checada, `_detectar_incidencia` puede crear:
- `RETARDO` — si la ENTRADA supera la hora de entrada del horario + tolerancia
- `SALIDA_ANTICIPADA` — si la SALIDA es antes de la hora de salida del horario − tolerancia

Las incidencias de comida (`SALIDA_COMER`, `REGRESO_COMER`) no se validan; el tiempo de comida es libre.

---

## 6. Escenario: agente apagado durante el día

Este es el caso de recuperación más importante del sistema.

### Secuencia de eventos

```
Día D
  08:00  Empleado checa ENTRADA → llega al backend en tiempo real ✓
  12:00  Empleado checa SALIDA_COMER → agente apagado → queda en el dispositivo
  13:00  REGRESO_COMER → queda en el dispositivo
  17:00  SALIDA → queda en el dispositivo
  23:00  procesar_dia corre → ve 1 de 4 marcas → crea INCOMPLETA automática

Día D+1
  08:30  Agente se enciende
         → lee los 3 registros pendientes del dispositivo (timestamps del Día D)
         → POST /device-sync con timestamp 12:00 D  → guarda SALIDA_COMER ✓
         → POST /device-sync con timestamp 13:00 D  → guarda REGRESO_COMER ✓
         → POST /device-sync con timestamp 17:00 D  → guarda SALIDA ✓
         → día D ahora tiene 4/4 marcas
         → sistema elimina la INCOMPLETA automática del Día D ✓
```

### Mecánica de limpieza

Después de guardar cada checada tardía, el backend ejecuta `_limpiar_incidencias_si_dia_completo`:

1. Cuenta cuántas marcas hay en ese día (zona México) incluyendo la recién guardada.
2. Determina cuántas se requerían (`requeridas` = 4 ó 2 según la misma lógica que la secuencia).
3. Si `marcas_actuales >= requeridas` → **elimina** todas las `FALTA` e `INCOMPLETA` automáticas (`origen = "automatico"`, `justificada = False`) de ese día.
4. Loguea cada incidencia eliminada con empleado, tipo, fecha y conteo.

**Qué NO elimina:**
- Incidencias con `justificada = True` (RH las marcó manualmente)
- Incidencias con `origen != "automatico"` (creadas manualmente por RH)
- `RETARDO` o `SALIDA_ANTICIPADA` (esas siguen siendo válidas aunque el día esté completo)

### Escenario con buffer

Si el agente estaba encendido pero sin Internet (red caída), las marcas se guardan en `LocalBuffer` (SQLite local). Al restablecerse la conexión, `sync_buffer` las reenvía en el siguiente ciclo. El resultado final es idéntico: las marcas llegan con su timestamp original y se limpia cualquier incidencia automática incorrecta.

---

## 7. Identificación del empleado en el dispositivo

El agente busca al empleado en este orden:
1. Por `pin_checador` (campo dedicado al ID en el dispositivo ZKTeco)
2. Por `numero_empleado` como fallback

Se recomienda siempre configurar `pin_checador` para evitar colisiones, especialmente en instalaciones con múltiples empresas.

---

## 8. Checadas que el sistema siempre ignora

| Condición | Motivo |
|-----------|--------|
| PIN no registrado en el sistema | Empleado no dado de alta |
| `exento_incidencias = True` | Usuario especial (admin, agente, etc.) |
| Timestamp anterior a `created_at` del empleado | Checada más antigua que el alta en el sistema |
| Timestamp anterior a `fecha_ingreso` del empleado | Checada más antigua que el ingreso laboral |
| Timestamp exacto duplicado | Misma marca ya existe en la BD |
| Marcas ya en el límite del día (≥ requeridas) | Exceso de marcas, día ya completo |

---

## 9. Archivos generados por el agente (local)

| Archivo | Contenido |
|---------|-----------|
| `synced_<dispositivo>.txt` | IDs de checadas ya sincronizadas (evita duplicados entre reinicios) |
| `buffer_<dispositivo>.db` | SQLite con checadas pendientes de enviar |
| `agent.log` | Log del agente (nivel y ruta configurables en `config.yaml`) |
| `config.yaml` | Configuración activa (no commitear API Keys) |

---

## 10. Cambios recientes relevantes (Abril 2026)

### Límite estricto de marcas por día
**Problema:** si llegaban más marcas de las requeridas (p. ej. 5 en un día de 4), la 5.ª se guardaba erróneamente como `ENTRADA`, rompiendo la secuencia para nómina y auditorías.

**Solución:** `_determinar_tipo` lanza `ValueError` cuando `checadas_hoy >= len(secuencia)`. Los canales de recepción (agente, ADMS, portal) capturan el error y rechazan la marca sin guardarla.

### Limpieza automática de incidencias por checadas tardías
**Problema:** si el agente estuvo apagado y `procesar_dia` generó un `FALTA` o `INCOMPLETA`, al subir las marcas tardías al día siguiente la incidencia incorrecta quedaba en la BD.

**Solución:** tras guardar cada checada, `_limpiar_incidencias_si_dia_completo` verifica si el día quedó completo y elimina las incidencias automáticas falsas (`origen="automatico"`, `justificada=False`) de ese día.
