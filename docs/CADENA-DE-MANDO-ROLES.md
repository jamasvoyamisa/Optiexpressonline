# Cadena de mando — Roles y Permisos

Documento basado en la lógica real del backend:
`deps.py` · `vacaciones/service.py` · `personal/service.py` · `asistencia/routes.py`

---

## 🔒 Regla universal — aplica a TODOS los roles

**Ningún empleado puede aprobar sus propias solicitudes de vacaciones.**
Si `jefe_id == solicitud.empleado_id`, el servidor devuelve **403 — "No puedes aprobar tus propias vacaciones"**.

---

## Nivel 1 — Superadmin 👑

**Cómo se detecta en el backend:**
- Rol en BD: `Administrador` o flag `Superuser`
- Flag resultante: `is_superuser = True`

**¿Qué puede hacer?**
- Aprobar o rechazar vacaciones de **cualquier empleado** (`bypass_permiso = True` — sin restricciones de área ni puesto).
- Justificar incidencias de cualquier empleado.
- Ver todas las solicitudes pendientes sin filtro por departamento.
- Ver todos los empleados, asistencias e incidencias.
- Gestionar dispositivos, empresas, horarios, festivos y toda la configuración.

**¿Quién aprueba SUS vacaciones?**
Solo otro Superadmin. No se puede autoaprobar (regla universal).

---

## Nivel 2 — Director y Gerente General 🏢

**Cómo se detecta en el backend:**
- **Director**: Puesto en BD = `Director` → `is_director = True`
- **Gerente General**: Rol en BD = `Gerente General` **o** Puesto = `Gerente General` → `is_gerente_general = True`

**¿Qué pueden hacer?**
- **Director**: Aprobar vacaciones **únicamente** de gerentes de área y supervisores (cualquier área). No aprueba empleados regulares.
- **Gerente General**: Aprobar vacaciones de (1) gerentes de área y supervisores de cualquier área, y (2) empleados de **su área** (departamento asignado). Justifica incidencias de su área.
- Ven en "Solicitudes a aprobar" y "Mi Área" las solicitudes pendientes.
- **NO** pueden aprobar sus propias vacaciones (regla universal).

**¿Quién aprueba SUS vacaciones?**
Solo el **Superadmin**.

---

## Nivel 3 — Gerente de área 👔

**Cómo se detecta en el backend:**
- Se detecta si: `Departamento.jefe_id == empleado.id` **O** el Puesto del empleado contiene `"gerente"` (sin importar que también contenga "supervisor").
- Flag resultante: `is_jefe = True`
- Función: `get_ids_gerentes_area(departamento_id)` → devuelve jefe del dpto + empleados con `"gerente"` en puesto.

**¿Qué puede hacer?**
- Aprobar o rechazar vacaciones de:
  - **Supervisores** de su mismo departamento/área.
  - **Empleados regulares** de su departamento/área.
- Justificar incidencias de **supervisores** y empleados de su área.
- **NO** puede aprobar vacaciones de otro **gerente de área** (eso requiere Director o Gerente General).
- **NO** puede aprobar sus propias vacaciones (regla universal).

**¿Quién aprueba SUS vacaciones?**
El **Director**, **Gerente General** o **Superadmin**.

---

## Nivel 4 — Supervisor 👤

**Cómo se detecta en el backend:**
- El Puesto del empleado contiene `"supervisor"` (y **no** contiene `"gerente"`).
- Aparece en `get_ids_aprobadores_area(departamento_id)` junto a los gerentes.
- Flag resultante: `is_jefe = True` si además es `jefe_id` de un departamento.

**¿Qué puede hacer?**
- Aprobar o rechazar vacaciones de **empleados regulares** de su departamento/área.
- Justificar incidencias de **empleados regulares** de su área.
- **NO** puede aprobar vacaciones de otro supervisor ni de un gerente.
- **NO** puede justificar incidencias de otro supervisor ni de un gerente.
- **NO** puede aprobar sus propias vacaciones (regla universal).

**¿Quién aprueba SUS vacaciones?**
El **Gerente de área**, **Gerente General**, **Director** o **Superadmin**.

---

## Nivel 5 — RH (Recursos Humanos) 📋

**Cómo se detecta en el backend:**
- Rol en BD: `RH` o `Recursos Humanos`
- Flag resultante: `is_rh = True`

**¿Qué puede hacer?**
- Crear, editar y dar de baja empleados.
- Asignar horarios a empleados.
- Gestionar días festivos, ejecutar proceso diario de incidencias.
- **Confirmación final** de vacaciones (`APROBADA_JEFE → APROBADA`).
- **No tiene** permisos de aprobación de primer nivel a menos que también sea jefe/gerente de un departamento.

**¿Quién aprueba SUS vacaciones?**
El Gerente/Supervisor de su departamento, el Gerente General o el Superadmin.

---

## Nivel 6 — Empleado 👤

**Cómo se detecta en el backend:**
- Sin rol administrativo.
- Acceso solo a módulos de vista personal (Mis Vacaciones, Mis Asistencias, Mis Datos).

**¿Qué puede hacer?**
- Solicitar vacaciones (`POST /vacaciones/mis-solicitudes`).
- Ver su balance, sus checadas y sus datos personales.
- **No puede** aprobar vacaciones de nadie.

**¿Quién aprueba SUS vacaciones?**
El Supervisor o Gerente de su departamento (`jefe_aprobador_id` asignado al crear la solicitud desde `empleado.jefe_id`), o el Gerente General o el Superadmin.

---

## 📊 Flujo de evaluación en backend al aprobar vacaciones

`PUT /vacaciones/solicitudes/:id/aprobar`

```
1. ¿jefe_id == solicitud.empleado_id?
   → ❌ Error: no puedes autoaprobarte
   ↓ no

2. ¿bypass_permiso (is_superuser)?
   → ✅ Aprueba sin restricciones
   ↓ no

3. ¿solicitante tiene puesto "gerente"?
   → ¿aprobador es Director o Gerente General?
       Sí → ✅ Aprueba
       No → ❌ Error: solo Director, Gerente General o Admin
   ↓ no

4. ¿solicitante tiene puesto "supervisor"?
   → ¿aprobador es Director o Gerente General?
       Sí → ✅ Aprueba
       No → ¿aprobador está en get_ids_gerentes_area(dpto)?
           Sí → ✅ Aprueba (gerente del área)
           No → ❌ Error: solo gerente del área, Director, Gerente General o Admin
   ↓ no

5. ¿aprobador es Director o Gerente General? (solicitante es empleado regular)
   → ¿es Gerente General y el empleado está en su área?
       Sí → ✅ Aprueba
       No → ❌ Error: solo empleados de tu área o gerentes/supervisores
   ↓ no

6. ¿jefe_id ∈ get_ids_aprobadores_area(dpto) O jefe_id == jefe_aprobador_id original?
       Sí → ✅ Aprueba (gerente o supervisor del área)
       No → ❌ Error: sin permisos

7. ¿solicitud.estado == PENDIENTE?
   No → ❌ Ya procesada
   ↓ sí

✅ Estado → APROBADA_JEFE (RH confirma después)
```

---

## Justificación de incidencias — reglas

| Quien justifica | Puede justificar a... |
|----------------|----------------------|
| Superadmin | Cualquier empleado |
| Gerente General | Empleados + supervisores + gerentes de su área |
| Director | (no tiene área; solo el Superadmin justifica) |
| **Gerente de área** | Empleados regulares + **supervisores** de su área |
| **Supervisor** | Solo empleados regulares (NO supervisores ni gerentes) |
| RH | Solo si también es jefe/gerente de un departamento |

---

## Resumen rápido

| Rol | Aprueba vacaciones de... | Sus vacaciones las aprueba... |
|-----|--------------------------|-------------------------------|
| Superadmin | **Todos** | Otro Superadmin |
| Director | Gerentes y supervisores (cualquier área) | Superadmin |
| Gerente General | Gerentes/supervisores + empleados de su área | Superadmin |
| **Gerente de área** | **Supervisores + empleados** de su área | Director, Gerente General o Superadmin |
| **Supervisor** | **Solo empleados regulares** de su área | Gerente del área, Director, GG o Superadmin |
| RH | Nadie (salvo que sea jefe de dpto.) | Su gerente o Superadmin |
| Empleado | Nadie | Su supervisor/gerente o Superadmin |
