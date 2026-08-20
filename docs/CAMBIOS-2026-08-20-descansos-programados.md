# Cambios — 20 de agosto de 2026

## Descansos rotativos (solo empresas con flag)

**No afecta** empresas lun–sáb ni empresas sin el flag (descanso fijo).

### Comportamiento
- Flag por empresa: **Gestiona descansos rotativos** (`gestiona_descansos_rotativos`, default **OFF**).
- Activar a mano solo en Optivisión / COF (u otras lun–dom con rotación).
- Con flag ON:
  - El **domingo** respeta el horario (`dias_semana` / «¿Trabaja los domingos?»).
  - Se pueden **programar descansos** por empleado y fecha (grid semanal); ese día no genera falta.

### Dónde se ve
- Configuración → Empresas → checkbox del flag.
- Configuración → Horarios → «¿Trabaja los domingos?».
- Configuración → Eventos especiales → Descansos programados.
- Menú / ruta `/descansos-programados` (RH / jefes / organigrama).

### Técnico
- Migración `k6l7m8n9o0p1`
- Tabla `descansos_programados`
- API: `GET/PUT /asistencia/descansos-programados`
- `procesar_dia` y checadas requeridas solo aplican la lógica nueva si el flag está ON

**No activar el flag en producción** hasta probar con una semana de prueba.

---

*Ctrl+F5 tras el deploy.*
