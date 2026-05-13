# Módulo de Solicitudes de Préstamos

Este documento describe el módulo de solicitudes de préstamos: su uso, flujo, permisos y detalles técnicos.

---

## 1. Descripción general

El módulo permite a los empleados solicitar préstamos de nómina y a **Recursos Humanos (RH)** o **Administradores** registrar solicitudes en nombre de otros. El flujo de aprobación es en dos niveles: **gerente del departamento del solicitante** y luego **Gerente General / Director / Administrador** para registrar el depósito y la **referencia bancaria**.

**Características principales:**
- El empleado crea su solicitud indicando monto y plazo en meses.
- El descuento quincenal se calcula automáticamente.
- Regla de antigüedad: colaboradores con **menos de 1 año** no pueden solicitar préstamos y el módulo no se muestra en su menú.
- El **jefe del departamento** autoriza o rechaza las solicitudes `pendiente` de sus colaboradores.
- El **Gerente General** (o Director/Admin) pasa la solicitud a **depositado** e ingresa la referencia bancaria del depósito.
- **RH** solo **confirma** el registro en nómina después del depósito (`fecha_confirmacion_rh`); al confirmar se notifica al empleado.
- Notificaciones al empleado: **aprobado** (departamento), **depositado** (GG), **confirmado por RH** (nómina).
- El empleado puede cancelar sus propias solicitudes mientras estén `pendiente`.

---

## 2. Flujo del proceso

```
EMPLEADO → crea solicitud → PENDIENTE
    → GERENTE DEL DEPARTAMENTO autoriza/rechaza → APROBADA_DEPARTAMENTO o RECHAZADA
    → GERENTE GENERAL registra depósito + referencia → DEPOSITADO
    → RH confirma nómina (marca fecha_confirmacion_rh)
```

### Pasos detallados

| Paso | Actor | Acción | Estado resultante |
|------|-------|--------|-------------------|
| 1 | Empleado | Crea solicitud | `pendiente` |
| 2a | Gerente del departamento (jefe del depto. del solicitante) | Autoriza | `aprobada_departamento` |
| 2b | Gerente del departamento | Rechaza | `rechazada` |
| 3 | Gerente General / Director / Admin | Registra depósito y referencia bancaria | `depositado` |
| 4 | RH | Confirma registro en nómina (mismo estado; se guarda `fecha_confirmacion_rh`) | `depositado` |
| 5 | Empleado | Cancela (solo si está pendiente) | `cancelada` |

**Notas:**
- La notificación inicial va al **jefe del departamento** del solicitante; si no hay jefe asignado, se notifica a GG/Director/Admin.
- Tras autorización departamental, se notifica a GG/Director/Admin para el depósito.
- El saldo restante del préstamo activo se calcula a partir de **`fecha_deposito`** (o respaldo desde datos previos).
- **Administrador (superuser)** puede autorizar en nombre del departamento si hace falta soporte (misma API `aprobar-departamento`).
- Toda captura en “Mis préstamos” se considera **solicitud sujeta a aprobación**; no implica autorización ni depósito automático.

---

## 3. Políticas vigentes y criterios de evaluación

### 3.1 Reglas técnicas vigentes

- Antigüedad mínima: **1 año cumplido**.
- Un solo préstamo/solicitud activa por empleado (`pendiente`, `aprobada_departamento`, `depositado`).
- Política estándar:
  - Monto máximo: **1 mes de sueldo del empleado**, según sus datos vigentes de nómina.
  - Plazo máximo: **8 quincenas**
- Excepciones (monto/plazo) solo desde flujo RH por perfiles autorizados (Director/GG/Admin).

### 3.2 Capacidad de pago (sugerencias operativas)

Para homologar criterios de autorización, se recomienda validar capacidad de pago antes de aprobar:

1. **Tope de afectación por quincena**  
   Definir un porcentaje máximo del ingreso neto quincenal (ej. 20%–30%) para descuento total por préstamos y otras retenciones.

1.1 **Tope de monto por salario mensual**  
   Como política base, el monto autorizado no debe exceder el equivalente a **1 mes de sueldo** del colaborador
   (referencia: salario vigente en nómina).

2. **Ingreso neto base**  
   Usar promedio de 2 a 3 recibos recientes para evitar aprobar con base en percepciones no recurrentes.

3. **Descuentos concurrentes**  
   Considerar retenciones activas (Infonavit, Fonacot, pensiones, otros préstamos internos) y evitar sobreendeudamiento.

4. **Semáforo de riesgo sugerido**  
   - Verde: descuento propuesto dentro del umbral.  
   - Amarillo: cercano al límite (requiere validación adicional).  
   - Rojo: supera tope permitido (rechazo o ajuste de plazo/monto).

5. **Regla práctica de ajuste**  
   Si no alcanza capacidad de pago, priorizar:  
   a) reducir monto,  
   b) extender plazo (si política lo permite),  
   c) escalar como excepción formal.

---

## 4. Roles y permisos (resumen)

| Rol | Autorizar departamento | Registrar depósito (ref. bancaria) | Ver listados amplios |
|-----|------------------------|------------------------------------|------------------------|
| Jefe de departamento | ✓ sus colaboradores | — | Pendientes de su depto. |
| Gerente General / Director / Admin | — (salvo superuser) | ✓ | Sí |
| RH | — | — | Todas las solicitudes (listado) |
| Empleado | — | — | Solo las propias |

---

## 5. Cálculo del descuento quincenal

Igual que antes:

```
descuento_quincenal = monto ÷ (plazo_meses × 2)
```

Validación recomendada adicional:

```
monto_solicitado <= sueldo_mensual_nomina
```

Donde `sueldo_mensual_nomina` se toma del dato vigente del empleado en el módulo de nómina.

---

## 6. Modelo de datos

### Tabla `solicitudes_prestamos`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `estado` | Enum | `pendiente`, `aprobada_departamento`, `depositado`, `rechazada`, `cancelada` |
| `referencia_bancaria` | String(120) | Referencia del depósito (obligatoria al marcar depositado) |
| `fecha_deposito` | DateTime | Fecha en que GG registró el depósito |
| … | … | Ver migración y modelo SQLAlchemy |

---

## 7. API (Backend)

**Prefijo base:** `/api/v1/prestamos`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/pendientes-mi-departamento` | Pendientes del departamento del jefe actual |
| GET | `/pendientes-deposito` | Autorizadas por depto.; pendientes de depósito (GG/Director/Admin) |
| GET | `/solicitudes-pendientes` | Alias de `pendientes-mi-departamento` |
| POST | `/{id}/aprobar-departamento` | Autorizar o rechazar (gerente de departamento) |
| POST | `/{id}/depositar` | Registrar depósito + `referencia_bancaria` (GG/Director/Admin) |
| POST | `/{id}/aprobar` | **Obsoleto** (410) |
| GET | `/solicitudes-pendientes-rh` | Depositados pendientes de confirmación RH | RH/Admin |
| PUT | `/{id}/confirmar-rh` | RH confirma nómina; **notifica al empleado** | RH/Admin |

El resto de rutas (`GET /`, `POST /`, `POST /rh`, etc.) se mantienen; las respuestas incluyen `referencia_bancaria`, `fecha_deposito`, `fecha_confirmacion_rh` y `saldo_restante` cuando aplica.
La creación valida antigüedad mínima y restricciones de política.

---

## 8. Frontend

- **Mi Área / Solicitudes a aprobar:** tab Préstamos con dos bloques si aplica: autorización por departamento y depósito por GG.
- **RH → Préstamos:** listado completo; acciones según rol (autorizar si es jefe de área; registrar depósito si es GG; **Confirmar RH** si el préstamo está depositado y falta confirmación en nómina).
- **Mis préstamos:** estados y columna de referencia bancaria; muestra aviso de “solicitud sujeta a aprobación”.
- **Documento imprimible:** incorpora cláusula de términos (no garantía de autorización/depósito y evaluación por capacidad de pago).
