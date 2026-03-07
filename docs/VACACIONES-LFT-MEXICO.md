# Vacaciones según LFT México

Este documento explica cómo se aplican las reglas de vacaciones en el sistema, conforme a la Ley Federal del Trabajo (LFT) de México, en particular la reforma de **Vacaciones Dignas** (artículos 76 y 78).

---

## 1. Marco legal

- **Art. 76 LFT**: Los trabajadores tienen derecho a vacaciones pagadas.
- **Art. 78 LFT (Vacaciones Dignas)**: Tras el **primer año** de servicio, el trabajador tiene derecho a **12 días laborables** de vacaciones pagadas. Los días aumentan con la antigüedad según la tabla que se describe más adelante.
- **Plazo para disfrutarlas**: Aunque el plazo ideal son 6 meses tras el aniversario, la ley otorga hasta **18 meses** después de haber cumplido el año de servicio para disfrutarlas. De no hacerlo en ese tiempo, el derecho puede **prescribir** (perderse).

---

## 2. Días de vacaciones por antigüedad

Los días que corresponden al trabajador dependen de los **años completos** de servicio (antigüedad) a la fecha de referencia. La tabla aplica así:

| Años de servicio cumplidos | Días de vacaciones |
|---------------------------|---------------------|
| 1 año                     | 12 días             |
| 2 años                    | 14 días             |
| 3 años                    | 16 días             |
| 4 años                    | 18 días             |
| 5 años                    | 20 días             |
| 6 a 9 años               | 20 días             |
| 10 a 14 años             | 22 días             |
| 15 a 19 años             | 24 días             |
| 20 a 24 años             | 26 días             |
| … y así sucesivamente    | +2 días por cada 5 años más |

**Regla resumida:**
- Del **1º al 5º año**: 12 días el primer año y se suman **2 días por cada año** hasta llegar a 20.
- A partir del **6º año**: se suman **2 días por cada 5 años** de servicio (no por cada año).

**Ejemplo:** Un empleado con fecha de ingreso 15 de marzo de 2023, al 31 de diciembre de 2024 tiene 1 año completo → le corresponden **12 días**. Al cumplir 2 años (15 de marzo de 2025) tendrá derecho a **14 días** para ese nuevo periodo.

---

## 3. Prescripción (cuándo se pierden los días)

- Cada “bloque” de días está ligado a un **aniversario**: al cumplir N años se ganan X días (según la tabla).
- Esos días deben **disfrutarse antes** de la fecha: **aniversario + 18 meses**.
- Si no se gozan antes de esa fecha, **prescriben**: el derecho a esos días se pierde y el sistema los marca como no disponibles (0 disponibles para ese periodo).

**Ejemplo:**  
- Ingreso: 10 de enero de 2023.  
- 1er aniversario: 10 de enero de 2024 → derecho a 12 días.  
- **Fecha límite de goce**: 10 de enero de 2024 + 18 meses = **10 de julio de 2025**.  
- Si el 11 de julio de 2025 aún tiene días de ese periodo sin tomar, esos días se consideran prescritos.

---

## 4. Periodo actual y periodo anterior

El sistema separa los días en dos conceptos para que se vea qué está por vencer:

### Periodo anterior
- Corresponde al **aniversario anterior** (menos años de antigüedad).
- Es el bloque cuyos días **vencen antes** (fecha límite más próxima).
- Son los días que conviene usar primero para no perderlos por prescripción.

### Periodo actual
- Corresponde al **aniversario más reciente** (más años de antigüedad).
- Tiene una **fecha límite de goce posterior** a la del periodo anterior.
- Representa el derecho más nuevo.

**Ejemplo:**  
- Empleado con 2 años de antigüedad:  
  - **Periodo anterior**: 12 días (por 1er año), límite = 1er aniversario + 18 meses.  
  - **Periodo actual**: 14 días (por 2º año), límite = 2º aniversario + 18 meses.  
- El sistema muestra ambos para que el empleado y el jefe sepan cuántos días hay “por vencer” (anterior) y cuántos del periodo actual.

---

## 5. Cómo lo aplica el sistema

### Alta de empleados
- Al dar de alta un empleado se registra su **fecha de ingreso**.
- No se asignan días de vacaciones **antes** de cumplir 1 año; hasta entonces el balance de días será 0 para ese empleado.
- Al **cumplir el primer año** (y en adelante), el sistema genera los **periodos** según antigüedad y aplica la tabla LFT y la fecha límite de cada periodo.

### Cálculo del balance
- Para cada empleado y año, el sistema:
  1. Calcula los **años completos** de antigüedad a la fecha de referencia (por ejemplo, fin del año anterior).
  2. Crea o actualiza un **periodo por cada año cumplido** (1, 2, 3, …) con:
     - Días de derecho (según tabla LFT).
     - Fecha de aniversario.
     - Fecha límite de goce (aniversario + 18 meses).
  3. Si la **fecha actual es posterior** a la fecha límite de un periodo, los días no gozados de ese periodo se consideran **prescritos** (0 disponibles para ese bloque).

### Solicitudes y aprobación
- El empleado solicita vacaciones (fecha inicio, fecha fin); el sistema calcula los días solicitados.
- Al **aprobar** una solicitud, el sistema **descuenta los días** primero del **periodo anterior** (el que vence antes) y, si hace falta, del **periodo actual**.
- Así se prioriza el uso de los días que están por prescribir.

### Respuesta del API (balance)
- Los endpoints de balance (por ejemplo `GET /api/v1/vacaciones/mi-balance` y `GET /api/v1/vacaciones/balance/{empleado_id}`) devuelven:
  - **periodo_actual**: días disponibles, tomados, fecha límite de goce del periodo más reciente.
  - **periodo_anterior**: lo mismo del periodo que vence antes.
  - **dias_disponibles**, **dias_tomados**, **dias_pendientes**: totales.
  - **fecha_limite_goce**: la del periodo que vence primero (normalmente el anterior), para avisos de “usar antes de esta fecha”.

---

## 6. Cómo aplica en el sistema (pantallas y flujo)

A continuación se describe cómo se usa el módulo de vacaciones en la aplicación: pantallas, flujos y APIs.

### 6.1 Pantallas

| Pantalla | Ruta | Quién la ve | Uso |
|----------|------|-------------|-----|
| **Vacaciones** (mis vacaciones) | `/mis-vacaciones` | Cualquier empleado autenticado | Ver mi balance (días disponibles, tomados, pendientes y periodo actual/anterior), crear solicitudes y ver el historial. |
| **Mi área** | `/mi-area` | Jefes de departamento y administradores | Pestaña **Vacaciones**: ver solicitudes de vacaciones del equipo (pendientes, aprobadas, rechazadas), aprobar o rechazar con comentarios. |

### 6.2 Flujo del empleado

1. **Entrar a Vacaciones**  
   Menú → **Vacaciones** (o ir a `/mis-vacaciones`).

2. **Ver el balance**  
   La pantalla llama a:
   - `GET /api/v1/vacaciones/mi-balance` (opcional: `?año=2025`).  
   La respuesta incluye:
   - **periodo_actual**: días disponibles, tomados y fecha límite de goce del periodo más reciente.
   - **periodo_anterior**: lo mismo del periodo que vence antes (por vencer).
   - **dias_disponibles**, **dias_tomados**, **dias_pendientes**: totales.
   - **fecha_limite_goce**: fecha hasta la cual debe usar los días (sobre todo los del periodo anterior) para no perderlos.

3. **Crear una solicitud**  
   El empleado indica:
   - Fecha inicio y fecha fin (el sistema calcula los días naturales entre ambas).
   - Motivo (opcional).  
   Se envía `POST /api/v1/vacaciones/mis-solicitudes` con `fecha_inicio`, `fecha_fin`, `motivo`.  
   El backend:
   - Calcula los días solicitados.
   - Crea la solicitud en estado **Pendiente**.
   - Asigna como aprobador al jefe del empleado (si tiene).
   - Actualiza los **días pendientes** del balance (reserva esos días).

4. **Ver mis solicitudes**  
   `GET /api/v1/vacaciones/mis-solicitudes` lista las solicitudes del empleado (pendientes, aprobadas, rechazadas).

### 6.3 Flujo del jefe o administrador

1. **Entrar a Mi área**  
   Menú → **Asistencia y solicitudes** (o `/mi-area`). Solo visible para usuarios con rol de jefe o administrador.

2. **Pestaña Vacaciones**  
   Se listan las solicitudes de vacaciones que le corresponden al jefe (las de su equipo) o todas si es administrador.  
   Se usa `GET /api/v1/vacaciones/solicitudes?jefe_id={id}` (o el backend resuelve el jefe por el usuario actual).

3. **Aprobar o rechazar**  
   El jefe (o administrador) elige **Aprobar** o **Rechazar** y puede añadir comentarios.  
   Se llama a `PUT /api/v1/vacaciones/solicitudes/{id}/aprobar` con `aprobar: true/false` y `comentarios`.  
   Si **aprueba**, el backend:
   - Descuenta los días de la solicitud **primero del periodo anterior** (por vencer) y, si faltan, del **periodo actual**.
   - Actualiza días tomados y pendientes del empleado.
   - Marca la solicitud como **Aprobada**.  
   Si **rechaza**, solo se actualiza el estado a Rechazada y se quitan esos días de “pendientes”.

### 6.4 APIs de vacaciones (resumen)

| Método y ruta | Uso |
|----------------|-----|
| `GET /api/v1/vacaciones/mi-balance?año=...` | Balance del empleado logueado, con **periodo_actual**, **periodo_anterior**, totales y **fecha_limite_goce**. |
| `GET /api/v1/vacaciones/balance/{empleado_id}?año=...` | Mismo formato de balance para un empleado (p. ej. para RH o jefe). |
| `GET /api/v1/vacaciones/dias-por-antiguedad/{empleado_id}?año=...` | Días que le corresponden por antigüedad (LFT) y fecha límite de goce; útil al dar de alta o en reportes. |
| `GET /api/v1/vacaciones/mis-solicitudes` | Lista de solicitudes del empleado actual. |
| `POST /api/v1/vacaciones/mis-solicitudes` | Crear solicitud (fecha_inicio, fecha_fin, motivo). |
| `GET /api/v1/vacaciones/solicitudes?...` | Listar solicitudes (filtros: empleado_id, estado, jefe_id). |
| `PUT /api/v1/vacaciones/solicitudes/{id}/aprobar` | Aprobar o rechazar; al aprobar se descuentan días del periodo anterior y luego del actual. |

### 6.5 Estructura del balance en la respuesta

El balance (`mi-balance` y `balance/{empleado_id}`) devuelve un objeto con esta estructura (periodo actual y anterior según LFT):

```json
{
  "empleado_id": 1,
  "año": 2025,
  "periodo_actual": {
    "anios_antiguedad": 2,
    "dias_derecho": 14,
    "dias_tomados": 0,
    "dias_disponibles": 14,
    "fecha_aniversario": "2025-03-15",
    "fecha_limite_goce": "2026-09-15"
  },
  "periodo_anterior": {
    "anios_antiguedad": 1,
    "dias_derecho": 12,
    "dias_tomados": 5,
    "dias_disponibles": 7,
    "fecha_aniversario": "2024-03-15",
    "fecha_limite_goce": "2025-09-15"
  },
  "dias_disponibles": 21,
  "dias_tomados": 5,
  "dias_pendientes": 0,
  "fecha_limite_goce": "2025-09-15"
}
```

- **periodo_anterior** son los días que vencen antes; **periodo_actual** los del aniversario más reciente.
- **fecha_limite_goce** a nivel raíz es la del periodo que vence primero (para avisos de “usar antes de esta fecha”).

### 6.6 Alta de empleados y vacaciones

Al dar de alta un empleado en **Recursos Humanos** (Personal) se registra su **fecha de ingreso**. Esa fecha es la que usa el sistema para:

- Calcular años de antigüedad.
- Generar los periodos (por aniversario) cuando el empleado consulta su balance o cuando se crea el balance.
- No se asignan días antes de cumplir 1 año; a partir del primer aniversario se aplica la tabla LFT y los 18 meses de plazo para cada periodo.

---

## 7. Resumen rápido

| Concepto | Aplicación |
|----------|------------|
| **Días por antigüedad** | Tabla LFT: 12 (1º año), +2 hasta 20 (2º–5º), luego +2 cada 5 años. |
| **Cuándo se ganan** | Al cumplir cada aniversario (año de servicio). |
| **Plazo para usarlos** | Hasta **18 meses** después del aniversario que generó ese derecho. |
| **Prescripción** | Pasada la fecha límite, los días no gozados de ese periodo se pierden. |
| **Periodo anterior** | Bloque con fecha límite más próxima; conviene usarlo primero. |
| **Periodo actual** | Bloque del aniversario más reciente; vence después. |
| **Al aprobar solicitudes** | Se descuentan primero del periodo anterior, luego del actual. |

---

## 8. Referencias

- Ley Federal del Trabajo (México), artículos 76 y 78 (Vacaciones Dignas).
- Reforma publicada en el DOF; el sistema implementa la tabla de días progresivos y el plazo de 18 meses para el goce de las vacaciones.
