# Guía ZKTeco ADMS - Conexión dispositivo ↔ servidor

Documentación basada en protocolo iClock de ZKTeco y experiencias reportadas.

---

## 1. Cómo funciona ADMS

El dispositivo **inicia** la conexión. Llama periódicamente (cada 30-60 s) a:

- `GET /iclock/getrequest?SN=SERIAL` → el servidor responde `OK` (o USERINFO si hay usuarios pendientes)
- `POST /iclock/cdata?SN=SERIAL&table=ATTLOG` → envía checadas, el servidor responde `OK`

**El servidor NUNCA inicia la conexión.** Solo responde.

---

## 2. Probar si el dispositivo llega al servidor

### Paso 1: Servidor de diagnóstico (sin base de datos)

Detén el backend normal y ejecuta:

```bash
cd backend
python iclock_diagnostico.py 9081
```

Configura el dispositivo: **Server Address** = `192.168.2.55`, **Server Port** = `8081`

- **Si ves líneas en consola** → El dispositivo SÍ llega. El problema era el backend (DB, etc.).
- **Si NO ves nada en 2-3 minutos** → El dispositivo NO está llegando. Problema de red o configuración del dispositivo.

### Paso 2: Probar desde otra máquina en la red

Desde un celular o PC en la misma red, abre en el navegador:

```
http://192.168.2.55:9081/iclock/getrequest?SN=TEST123
```

- Si carga y muestra "OK" → el servidor responde. El problema es la configuración del dispositivo.
- Si no carga → firewall del Mac o el backend no está corriendo.

---

## 3. Configuración del dispositivo MB160

Según documentación ZKTeco:

| Campo | Valor |
|-------|-------|
| **COMM → Cloud Server Setting** | |
| Server Mode | ADMS |
| Server Address | `192.168.2.55` (solo IP, **sin** http://) |
| Server Port | `9081` |
| Enable Domain Name | OFF |
| HTTPS | OFF |

**Algunos modelos** tienen un solo campo "Server URL": prueba `http://192.168.2.55:9081`

### Reiniciar el dispositivo

Después de cambiar la configuración, **apaga y enciende** el dispositivo.

### Icono de conexión

Si el dispositivo conecta correctamente, suele mostrar un **icono de globo/conexión** en la esquina superior de la pantalla.

---

## 4. Problemas comunes

### El dispositivo no llega al servidor

| Causa | Solución |
|------|----------|
| Firewall del Mac bloquea puerto 9081 | Preferencias → Seguridad → Firewall: permitir conexiones entrantes, o desactivar temporalmente |
| Dispositivo en otra subred | Device y servidor deben estar en 192.168.2.x (o red accesible) |
| Puerto incorrecto en el dispositivo | Este backend usa 9081; configura el dispositivo con ese puerto |
| Backend no escucha en 0.0.0.0 | Debe usar `host="0.0.0.0"` para aceptar conexiones de la red |

### El dispositivo llega pero no se registra en la web

- Verifica que el **Serial Number (SN)** del dispositivo coincida **exactamente** con el registrado en la web.
- El SN se ve en el menú del dispositivo: **Info → Serial Number**.

---

## 5. Alternativa: Agente local (cuando ADMS no funciona)

Si ADMS no conecta (red, firewall, modelo de dispositivo), usa el **agente local**:

1. En un PC en la **misma red** que el dispositivo
2. Configura `agent-local/config.yaml` con la IP del dispositivo y la API Key
3. Ejecuta: `python main.py`

El agente se conecta al dispositivo por **pyzk (puerto 4370)** y envía los datos al backend. No depende de ADMS.

---

## 6. Referencias

- [zk-protocol](https://github.com/adrobinoga/zk-protocol) - Descripción del protocolo ZKTeco
- [ZktecoApi How it works](http://zktecoapi.com/how-it-works.html) - Configuración Server Address/Port
- [ADMS server ZKTeco](https://github.com/saifulcoder/adms-server-ZKTeco) - Implementación de referencia
