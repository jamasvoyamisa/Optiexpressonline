# Cambios — 20 de agosto de 2026

## Préstamos: PDF firmado y firma en pantalla

Igual que vacaciones, con un cuidado extra: **no se resguardan firmas** (ni en perfil ni reutilizables). Solo se guarda el **PDF final**.

### Comportamiento
- Flag admin `sistema_flags.prestamos_pdf_firmado` (default **OFF**).
- Toggle: Configuración → Eventos especiales → Vacaciones generales → *PDF firmado y firma en pantalla (préstamos)*.
- **Solicitante**: dibujar firma (táctil/PC) o subir imagen temporal → se genera el PDF en el navegador y se sube.
- **Empleado / jefe / RH / Admin**: también pueden subir un PDF escaneado.
- Si ya hay PDF firmado: se muestra «Ver PDF firmado» (se oculta la plantilla HTML).

### Técnico
- Disco: `/opt/optiexpress/storage/prestamos/firmados/{empleado_id}/{solicitud_id}.pdf`
- Migración: `j5k6l7m8n9o0`
- API: `GET/PUT /prestamos/config/pdf-firmado`, `POST/GET /prestamos/{id}/documento-firmado`
- Auth `/me`: `prestamos_pdf_firmado_habilitado`

Estados que permiten firmar/subir: `pendiente`, `aprobada_departamento`, `depositado`.

**No activar el flag en producción** hasta probar en un préstamo de prueba.

---

*Ctrl+F5 tras el deploy.*
