# Cadena de mando — Roles y Permisos

Documento basado en la lógica real del backend:
`deps.py` · `vacaciones/service.py` · `personal/service.py`

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
- Ver todas las solicitudes pendientes en "Asistencia y solicitudes" sin filtro por departamento.
- Ver todos los empleados, asistencias e incidencias.
- Gestionar dispositivos, empresas, horarios, festivos y toda la configuración.
- No tiene departamento ni número de empleado operativo; administra la aplicación.

**¿Quién aprueba SUS vacaciones?**
Solo otro Superadmin. No se puede autoaprobar (regla universal).

---

## Nivel 2 — Gerente General 🏢

**Cómo se detecta en el backend:**
- Rol en BD: `Gerente General`
- Flag resultante: `is_gerente_general = True`

**¿Qué puede hacer?**
- Aprobar o rechazar vacaciones **únicamente** de empleados cuyo Puesto contenga `"gerente"` o `"supervisor"` (búsqueda `ilike`, sin distinguir mayúsculas).
- Ve en "Mi Área" las solicitudes pendientes de gerentes y supervisores de todos los departamentos.
- **NO** puede aprobar vacaciones de empleados regulares → error: *"Solo puedes aprobar vacaciones de gerentes y supervisores"*.
- **NO** puede aprobar sus propias vacaciones (regla universal).

**¿Quién aprueba SUS vacaciones?**
Solo el **Superadmin**. El Gerente General no tiene área que lo supervise en el sistema.

---

## Nivel 3 — Gerente de área / Supervisor 👔

**Cómo se detecta en el backend:**
- Sin rol especial en BD.
- Se detecta si: `Departamento.jefe_id == empleado.id` **O** el Puesto del empleado contiene `"gerente"` o `"supervisor"`.
- Flag resultante: `is_jefe = True`

**¿Qué puede hacer?**
- Aprobar o rechazar vacaciones de empleados dentro de su(s) departamento(s) asignado(s).
- La verificación llama a `get_ids_aprobadores_area(departamento_id)`:
  - Devuelve el `jefe_id` del departamento.
  - Más todos los empleados del mismo departamento cuyo Puesto contenga `"gerente"` o `"supervisor"`.
- Puede aprobar si su ID está en esa lista **O** si es el `jefe_aprobador_id` original de la solicitud.
- **NO** puede aprobar sus propias vacaciones (regla universal).

**¿Quién aprueba SUS vacaciones?**
El **Gerente General** (si el puesto del gerente contiene "gerente"/"supervisor") o el **Superadmin**.

---

## Nivel 4 — RH (Recursos Humanos) 📋

**Cómo se detecta en el backend:**
- Rol en BD: `RH` o `Recursos Humanos`
- Flag resultante: `is_rh = True`

**¿Qué puede hacer?**
- Crear, editar y dar de baja empleados.
- Asignar horarios a empleados.
- Gestionar días festivos, ejecutar proceso diario de incidencias.
- **No tiene** permisos especiales de aprobación de vacaciones a menos que también sea jefe de un departamento.

**¿Quién aprueba SUS vacaciones?**
El Gerente/Supervisor de su departamento, el Gerente General o el Superadmin.

---

## Nivel 5 — Empleado 👤

**Cómo se detecta en el backend:**
- Sin rol administrativo.
- Acceso solo a módulos de vista personal (Mis Vacaciones, Mis Asistencias, Mis Datos).

**¿Qué puede hacer?**
- Solicitar vacaciones (`POST /vacaciones/mis-solicitudes`).
- Ver su balance, sus checadas y sus datos personales.
- **No puede** aprobar vacaciones de nadie.

**¿Quién aprueba SUS vacaciones?**
El Gerente/Supervisor de su departamento (`jefe_aprobador_id` asignado al crear la solicitud desde `empleado.jefe_id`), o cualquier aprobador del área, el Gerente General o el Superadmin.

---

## 📊 Flujo de evaluación en backend al aprobar

`PUT /vacaciones/solicitudes/:id/aprobar`

```
1. ¿jefe_id == solicitud.empleado_id?
   → ❌ Error: no puedes autoaprobarte
   ↓ no

2. ¿bypass_permiso (is_superuser)?
   → ✅ Aprueba sin restricciones
   ↓ no

3. ¿is_gerente_general?
   → ¿puesto del solicitante contiene "gerente" / "supervisor"?
       Sí → ✅ Aprueba
       No → ❌ Error: solo gerentes/supervisores
   ↓ tampoco

4. ¿jefe_id ∈ get_ids_aprobadores_area(dpto) O jefe_id == jefe_aprobador_id original?
       Sí → ✅ Aprueba
       No → ❌ Error: sin permisos
   ↓ aprobado

5. ¿solicitud.estado == PENDIENTE?
   No → ❌ Ya procesada
   ↓ sí

✅ Cambia estado + descuenta días del balance de periodos
```

---

## Resumen rápido

| Rol              | Puede aprobar a...                         | Sus vacaciones las aprueba... |
|------------------|--------------------------------------------|-------------------------------|
| Superadmin       | Todos (sin restricciones)                  | Otro Superadmin               |
| Gerente General  | Gerentes y supervisores de cualquier área  | Superadmin                    |
| Gerente de área  | Empleados de su departamento               | Gerente General o Superadmin  |
| RH               | Nadie (salvo que sea jefe de dpto.)        | Su gerente o Superadmin       |
| Empleado         | Nadie                                      | Su gerente o Superadmin       |
