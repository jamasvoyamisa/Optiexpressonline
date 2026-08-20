# Cambios — 20 de agosto de 2026

## Vacaciones retroactivas (falta + 7 días + autojustificar)

**General** para todas las empresas.

### Comportamiento
- Se pueden solicitar vacaciones de días **ya pasados** solo si ese día tiene **falta automática sin justificar**.
- Ventana: máximo **7 días** desde la falta.
- Al **aprobar el jefe**: se descuenta el saldo (como ya ocurría) y la falta se **autojustifica** con comentario de la solicitud.
- Si la solicitud sigue pendiente o se rechaza, la falta no se toca.
- Días hoy/futuro: sin cambio.

### Dónde se ve
- Mis vacaciones: días con falta elegible en ámbar; texto de ayuda bajo el calendario.
- API: `GET /vacaciones/mis-faltas-retroactivas`

### Técnico
- Validación en `VacacionesService.create_solicitud` / `_validar_dias_retroactivos_solicitud`
- `AsistenciaService.justificar_faltas_por_solicitud_vacaciones` al aprobar jefe
- Constante `VENTANA_DIAS_VACACIONES_RETROACTIVAS = 7`

---

*Ctrl+F5 tras el deploy.*
