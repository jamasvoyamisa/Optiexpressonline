# Colas y envío de usuarios al dispositivo (checador)

Este documento describe cómo funcionan las **colas** del sistema y cómo se envían los usuarios a cada dispositivo (checador ZKTeco).

---

## 1. Resumen rápido

- El sistema usa **colas** por dispositivo: usuarios pendientes de enviar y pendientes de registrar huella.
- Cada empleado tiene un **`pin_checador`** asignado por **serie** dentro del rango de su empresa (1, 2, 3… para la primera empresa; 1001, 1002… para la segunda, etc.).
- El **agente** (en la PC junto al checador) consulta esas colas y envía los usuarios **en serie** al dispositivo: primero los pendientes de alta, luego los de enroll (huella) de uno en uno.

---

## 2. Asignación del PIN en el checador (`pin_checador`)

- **No** se usa el número de empleado (ej. 124) como PIN en el dispositivo.
- Cada **empresa** tiene un **rango numérico** de 1000 PINs:
  - **Empresa 1** → rango `1` a `1000`
  - **Empresa 2** → rango `1001` a `2000`
  - **Empresa 3** → rango `2001` a `3000`
  - etc.
- Al crear un empleado, el sistema asigna el **siguiente número libre** dentro del rango de su empresa.

### Ejemplos de asignación

| Empresa     | Rango    | Empleados ya creados (pin_checador) | Nuevo empleado recibe |
|------------|----------|-------------------------------------|------------------------|
| Optiexpress (1ª) | 1–1000   | 1                                    | **2**                  |
| Optiexpress (1ª) | 1–1000   | 1, 2                                 | **3**                  |
| Otra (2ª)       | 1001–2000| (ninguno)                            | **1001**               |
| Otra (2ª)       | 1001–2000| 1001, 1002                           | **1003**               |

Por eso un empleado con **número de empleado 124** puede tener **`pin_checador = 2`**: es el segundo usuario creado en la primera empresa, y el sistema asigna en serie (1, 2, 3…) dentro de ese rango.

---

## 3. Colas en el backend

Hay dos colas principales por dispositivo:

### 3.1 Cola de usuarios pendientes de enviar (`usuarios_pendientes_dispositivo`)

- **Qué es:** Usuarios que deben crearse en el dispositivo (alta remota), sin huella todavía.
- **Cuándo entra alguien:**
  - Al **crear un empleado** en el sistema y marcar "Registrar en checador" eligiendo uno o más dispositivos.
  - O al encolarlo manualmente con **Enqueue user** para un dispositivo.
- **Orden:** Por fecha de creación (`created_at`). El agente los recibe y envía **en ese orden**.

### 3.2 Cola de enroll (`pending_enroll`)

- **Qué es:** Usuarios que ya deben estar en el dispositivo y están pendientes de **registrar la huella** en el checador.
- **Cuándo entra alguien:** Cuando se solicita "Iniciar registro de huella" para un empleado en un dispositivo.
- **Orden:** Por fecha. El agente procesa **solo el primero** pendiente en cada ciclo; cuando termina (éxito o fallo), pasa al siguiente en el siguiente ciclo.

Otras colas (menos frecuentes): pendientes de eliminar del dispositivo, pendientes de replicar huellas entre dispositivos.

---

## 4. Cómo el agente envía los usuarios al dispositivo

El agente corre en la **PC** (junto al checador) y cada **X segundos** (ej. 30) hace un ciclo. En cada ciclo, para cada dispositivo configurado:

1. **Sync pending users**  
   - Llama a la API: `GET /agent/pending-users` (con la API Key de ese dispositivo).  
   - Recibe la lista de usuarios en cola (ordenada por `created_at`).  
   - Para **cada** usuario de la lista:
     - Toma `pin_checador` (o si no viene, `numero_empleado`).
     - Envía al dispositivo: `set_user(user_id=pin_checador, name=nombre)`.
     - Si OK, marca esos usuarios como enviados con `POST /agent/pending-users/mark-sent`.
   - Así se envían **todos** los pendientes de esa cola en serie en el mismo ciclo.

2. **Sync pending enroll**  
   - Llama a la API: `GET /agent/pending-enroll`.  
   - Si hay al menos uno pendiente, toma **solo el primero**.  
   - Usa `pin_checador` (o `numero_empleado`) como `user_id` en el dispositivo.  
   - Si el usuario no existe en el dispositivo, lo crea con `set_user` y luego inicia el enroll.  
   - Espera a que el empleado ponga el dedo y el dispositivo registre la huella.  
   - Al terminar (éxito o fallo), marca ese enroll como hecho.  
   - El **siguiente** de la cola se procesará en el **siguiente** ciclo.

3. Después hace sync de asistencia (checadas), buffer, etc.

Resumen: **usuarios pendientes de alta** → se envían todos en serie por ciclo; **enroll** → uno por ciclo, en serie.

---

## 5. Ejemplos de flujo

### Ejemplo 1: Alta en el checador al crear empleado

1. En el sistema creas empleado **María López**, número **124**, empresa **Optiexpress**, y marcas "Registrar en checador" en el dispositivo **Oficina**.
2. Backend:
   - Asigna `pin_checador` = siguiente libre en Optiexpress (ej. **2** si ya hay un empleado con 1).
   - Inserta un registro en `usuarios_pendientes_dispositivo` para dispositivo Oficina con `numero_empleado=124`, `pin_checador=2`, `nombre=María López`.
3. En el siguiente ciclo, el agente:
   - Obtiene pending-users → recibe a María.
   - Envía al checador: `set_user(user_id="2", name="María López")`.
   - Marca ese pendiente como enviado.
4. En el checador aparece el usuario con **número 2** (el `pin_checador`), no el 124.

### Ejemplo 2: Registrar huella (enroll)

1. En el sistema pides "Iniciar registro de huella" para María (124) en el dispositivo Oficina.
2. Backend crea/actualiza un registro en `pending_enroll` para ese dispositivo con `numero_empleado=124`, `pin_checador=2`.
3. El agente en el siguiente ciclo:
   - Obtiene pending-enroll → recibe ese registro (y quizá otros después en la cola).
   - Toma solo el primero; si es María, usa `user_id=2` en el dispositivo.
   - Si el usuario 2 no existe, lo crea con `set_user`; luego inicia `enroll_user(user_id="2")` y espera el dedo.
   - Al terminar, marca el enroll como hecho. El siguiente en la cola se atiende en el ciclo siguiente.

### Ejemplo 3: Varios empleados seguidos

- Creas en el sistema: Ana (pin 1), Bruno (pin 2), Carlos (pin 3), todos para el mismo checador.
- En la cola quedan 3 registros en `usuarios_pendientes_dispositivo` (orden: Ana, Bruno, Carlos).
- En un solo ciclo el agente:
  - Pide pending-users → recibe [Ana, Bruno, Carlos].
  - Hace `set_user("1", "Ana")`, `set_user("2", "Bruno")`, `set_user("3", "Carlos")`.
  - Marca los tres como enviados.
- En el dispositivo quedan creados como usuarios **1**, **2** y **3**.

---

## 6. Endpoints de la API usados por el agente

| Acción del agente           | Método y ruta                           | Uso |
|----------------------------|------------------------------------------|-----|
| Obtener usuarios a enviar  | `GET /agent/pending-users`               | Lista de pendientes (orden por `created_at`) |
| Marcar usuarios enviados   | `POST /agent/pending-users/mark-sent`    | Body: `{"ids": [id1, id2, ...]}` |
| Obtener enroll pendiente   | `GET /agent/pending-enroll`              | Lista de enroll pendientes; el agente toma el primero |
| Marcar enroll terminado    | `POST /agent/pending-enroll/{id}/mark-done` | Body: `{"success": true/false}` |

Todos estos endpoints requieren la **API Key del dispositivo** en el header `X-API-Key`. La respuesta de pending-users y pending-enroll incluye `pin_checador` para que el agente use ese valor como `user_id` en el dispositivo.

---

## 7. Resumen

- **Colas:** Usuarios pendientes de enviar al dispositivo y pendientes de registrar huella, por dispositivo, ordenados por fecha.
- **PIN en el checador:** Es el `pin_checador`, asignado **en serie** dentro del rango de la empresa (1, 2, 3… o 1001, 1002…), no el número de empleado.
- **Envío:** El sistema envía los usuarios **en serie**: todos los pending-users en cada ciclo, y un solo pending-enroll por ciclo, usando siempre `pin_checador` como identificador en el dispositivo.
