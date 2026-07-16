# Propuestas pendientes — Checadas remotas y checador físico

Documento para evaluar dos mejoras solicitadas. **Ninguna está implementada todavía**; esto solo describe qué se haría, qué implica y en qué orden conviene abordarlas.

---

## Propuesta 1 — Motivo cuando alguien checa por el portal web

### Cómo funciona hoy

Algunos empleados pueden checar por el **portal web** (página de checadas remotas) en lugar del reloj con huella de la sucursal.

El sistema solo guarda **quién** checó y **a qué hora**. No pregunta **por qué** lo hizo por internet y no en el checador.

En los reportes de RH, esa checada se ve **igual** que una checada normal del reloj. No hay forma de saber el motivo.

### Qué se quiere lograr

Que, al checar por el portal, el empleado indique un **motivo** (por ejemplo: olvidó checar, trabaja fuera, el reloj no funcionaba, cita o permiso, etc.) y que **RH pueda ver ese motivo** en los reportes de asistencia.

### Qué habría que hacer

| Área | Qué cambiaría |
|------|----------------|
| Portal web | Agregar un campo de motivo en la pantalla de checada |
| Sistema (servidor) | Guardar el motivo junto con la checada |
| Base de datos | Un campo nuevo para almacenar el motivo |
| Reportes de RH | Mostrar el motivo y dejar claro que fue checada por portal |

### Decisiones que RH debe definir

1. **¿Cómo se captura el motivo?** Lista de opciones fijas, texto libre, o lista + “Otro”.
2. **¿Es obligatorio?** Si RH siempre quiere saber el motivo, no debería poder checar sin elegirlo.
3. **¿Una vez al día o en cada checada?** Un empleado puede checar hasta 4 veces al día; conviene definir si pide motivo cada vez o solo la primera.
4. **¿Dónde lo verá RH?** En el detalle del empleado, en el resumen del periodo y/o en el Excel de exportación.

### Impacto

| Aspecto | Nivel | Comentario |
|---------|-------|------------|
| Cambios en el sistema | Medio | Portal, reportes y base de datos |
| Sucursales / agente del reloj | **Ninguno** | Todo es web; no hay que tocar las PCs de las sucursales |
| Riesgo | Bajo | El principal cuidado es definir bien el formato del motivo para que los reportes sean útiles |
| Tiempo estimado | Bajo–medio | Sin despliegue en sucursales |

---

## Propuesta 2 — Ver el PIN y checar con contraseña en el reloj físico

### Cómo funciona hoy

Cada empleado tiene un **número PIN** asignado automáticamente para el reloj (por bloques de 1000 por empresa). Ese número **ya existe en el sistema**, pero **no se muestra** en la pantalla de Personal.

En el reloj, los usuarios se crean **sin contraseña**. Solo pueden checar con **huella**. Si la huella falla (dedo desgastado, resequedad, etc.), el empleado **no tiene alternativa** en el reloj.

### Qué se quiere lograr

1. **Mostrar el PIN** de cada empleado en la app, para que RH o el empleado sepan qué número usar en el reloj.
2. **Asignar una contraseña** desde la app para que, cuando falle la huella, pueda checar con **PIN + contraseña** en el reloj físico.

### Qué habría que hacer

| Área | Qué cambiaría |
|------|----------------|
| Pantalla de Personal | Mostrar el PIN del empleado |
| Pantalla de Personal | Campo para definir o cambiar la contraseña del checador |
| Sistema (servidor) | Guardar la contraseña y enviarla al reloj cuando corresponda |
| Base de datos | Un campo nuevo para la contraseña del checador |
| **Programa en cada sucursal (agente)** | **Debe actualizarse** para que envíe la contraseña al reloj en lugar de dejarla vacía |

### Punto importante sobre el reloj

Antes de implementar la contraseña, hay que **confirmar en el reloj físico** (ZKTeco) que:

- Está activada la opción de verificar por **contraseña** o **huella + contraseña**.
- La contraseña aceptada es **numérica** (suele ser de hasta 8 dígitos).

Si el reloj no tiene ese modo activado, asignar contraseña en el sistema no servirá.

### Impacto

| Aspecto | Nivel | Comentario |
|---------|-------|------------|
| Solo mostrar el PIN | **Muy bajo** | Es mostrar un dato que ya existe; no toca sucursales |
| Contraseña en el reloj | Medio en desarrollo | Cambios en servidor, pantallas y base de datos |
| **Sucursales / agente** | **Alto** | Hay que **actualizar el programa en cada sucursal** donde hay checador |
| Riesgo | Medio | Cuidado de no borrar contraseñas ya puestas al sincronizar usuarios |
| Tiempo estimado | Medio (código) / **Alto (operación)** | La parte costosa es llevar la actualización a todas las sucursales |

---

## Comparación rápida

| | Motivo en portal | PIN + contraseña en reloj |
|--|------------------|---------------------------|
| ¿Para qué sirve? | RH sabe **por qué** checaron por internet | Empleado puede checar **sin huella** cuando falle |
| ¿Toca sucursales? | **No** | **Sí** (actualizar agente en cada una) |
| ¿Toca base de datos? | Sí | Sí |
| Esfuerzo general | Bajo–medio | Medio en sistema / **alto en campo** |
| Se puede hacer por partes | Sí | Sí: primero mostrar PIN, después contraseña |

---

## Orden recomendado

1. **Mostrar el PIN** en Personal — rápido, sin riesgo, sin ir a sucursales.
2. **Motivo en checadas remotas** — responde a lo que pide RH; no requiere cambios en sucursales.
3. **Contraseña en el reloj** — al final; antes validar el reloj físico y planear la actualización en cada sucursal.

---

## Estado actual del sistema (referencia)

- **Re-enrolar huella** (volver a capturar otro dedo): ya implementado. Botón “Volver a registrar huella”, aviso automático mientras el agente borra la huella anterior, y luego “Iniciar Registro de Huella”.
- **Portal de checadas**: activo; registra checadas como normales sin motivo.
- **PIN del empleado**: existe en el sistema pero no se muestra en pantalla.
