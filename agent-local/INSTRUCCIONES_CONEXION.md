# Instrucciones para conectar el ZKTeco MB160 al backend

## Requisitos previos

- ZKTeco MB160 con soporte ADMS
- Backend desplegado y accesible (URL pública en producción)
- El dispositivo debe tener acceso a internet (en cada sucursal)

---

## Paso 1: Obtener el número de serie (SN)

1. En el MB160, entra al **menú principal**
2. Ve a **Info** (o **System Info** / **Información**)
3. Busca **Serial Number** o **SN**
4. Anota el valor completo (ej: `DGD919000012345`)

---

## Paso 2: Registrar el dispositivo en el sistema

1. Abre la aplicación: `https://tu-servidor.com` (o `http://localhost:3000` en desarrollo)
2. Entra al módulo **Asistencia**
3. Haz clic en **+ Registrar Dispositivo**
4. Completa:
   - **Nombre**: Ej. "Sucursal Centro", "Oficina Principal"
   - **Ubicación**: Ej. "Sucursal Centro", "Recepción"
   - **Número de Serie (SN)**: El SN del Paso 1
5. Haz clic en **Registrar Dispositivo**
6. Guarda la **API Key** si la ves (para el agente local; para ADMS no la necesitas)

---

## Paso 3: Configurar el MB160

1. En el dispositivo, entra al **menú principal**
2. Ve a **COMM** (o **Communication** / **Comunicación**)
3. Entra a **Cloud Server Setting** (o **Server** / **Configuración de servidor**)
4. Configura:
   - **Server Mode**: **ADMS**
   - **Server Address**: 
     - **Desarrollo**: IP (ej: `192.168.2.55`), Puerto: `9081`
     - **Producción**: `https://tu-dominio.com` (sin puerto si usas 443)
   - **HTTPS**: Activar en producción
5. Guarda los cambios y sal del menú

---

## Paso 4: Verificar la conexión

1. Espera 30–60 segundos (el dispositivo hace ping al servidor)
2. Haz una **checada de prueba** (huella o rostro)
3. En la aplicación, ve a **Asistencia → Registro de Checadas**
4. Comprueba que aparece la checada

---

## Resumen rápido

| Paso | Acción |
|------|--------|
| 1 | Obtener SN en el dispositivo: Info → Serial Number |
| 2 | Registrar en la app: Asistencia → Registrar Dispositivo (con ese SN) |
| 3 | Configurar MB160: COMM → Cloud Server → Server Address = URL del backend |
| 4 | Hacer checada de prueba y revisar en la app |

---

## URLs que usa el dispositivo

El MB160 envía datos a:

- **Ping**: `GET [tu-servidor]/iclock/getrequest?SN=XXXXXXXXXX`
- **Checadas**: `POST [tu-servidor]/iclock/cdata?SN=XXXXXXXXXX&table=ATTLOG`

El backend responde `OK` para confirmar la recepción.

---

## Solución de problemas

| Problema | Posible causa | Solución |
|----------|---------------|----------|
| No llegan checadas | SN no registrado | Verifica que el SN en el dispositivo coincida con el registrado |
| No llegan checadas | Red/firewall | Comprueba que el dispositivo tenga salida HTTPS al servidor |
| No llegan checadas | URL incorrecta | Revisa Server Address (sin espacios, con http/https correcto) |
| Empleado "No registrado" | Número de empleado no existe | Registra al empleado con ese número en Personal |

---

## Multi-sucursal

Cada sucursal puede tener su propio MB160. Para cada uno:

1. Obtén su SN
2. Regístralo en el sistema (con nombre/ubicación distintos)
3. Configura el mismo Server Address en todos
4. Las checadas se identifican por el SN de cada dispositivo
