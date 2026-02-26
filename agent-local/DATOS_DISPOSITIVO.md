# ZKTeco MB160 - Configuración

## Opción A: Push directo (ADMS) - Recomendado para servidor

El dispositivo envía datos directamente al backend. Sin agente local.

### 1. Registrar dispositivo en el sistema
- En la interfaz: Asistencia → Registrar Dispositivo
- **Nombre**: Ej. "Oficina Principal"
- **Número de Serie (SN)**: Obligatorio. Ver en menú del dispositivo: **Info → Serial Number**

### 2. Configurar el MB160
- En el dispositivo: **COMM → Cloud Server Setting**
- **Server Mode**: ADMS
- **Server Address**: IP (ej: `192.168.2.55`), **Server Port**: `9081`
  - Producción: `https://tu-servidor.com`
- **HTTPS**: Activar en producción

### 3. URLs que usa el dispositivo
- Ping: `GET /iclock/getrequest?SN=XXXXXXXXXX`
- Checadas: `POST /iclock/cdata?SN=XXXXXXXXXX&table=ATTLOG`

---

## Alta remota y registro de huella desde la web

1. **Agregar usuario**: En Asistencia → Alta remota, selecciona dispositivo, número de empleado y nombre. El usuario entra en cola.
2. **Envío al dispositivo**:
   - **Con ADMS**: El dispositivo hace getrequest y recibe USERINFO (30–60 s).
   - **Con agente**: El agente hace `set_user` en el dispositivo (más rápido).
3. **Registro de huella**: Cuando el usuario aparece como "Enviado", pulsa "Iniciar registro de huella". El empleado debe ir al dispositivo y colocar el dedo. **Requiere agente en la misma red** (pyzk `enroll_user`).

Si no hay agente, el registro de huella se hace manualmente en el menú del dispositivo.

---

## Opción B: Agente local (polling)

Para cuando el dispositivo no tiene ADMS o no puede alcanzar el servidor. También permite envío rápido de usuarios y registro de huella desde la web.

### Configuración
```yaml
device:
  ip: "192.168.1.201"
  port: 4370
  timeout: 5

cloud:
  api_url: "http://localhost:9081/api/v1/asistencia/device-sync"
  api_key: "API Key del dispositivo"  # La misma que ves al registrar el dispositivo en la web
  device_id: "OFFICE_01"
```

### Ejecutar
```bash
cd agent-local
pip install pyzk
python main.py
```

---

## Conexión cuando NO estás en la misma red

El backend y el dispositivo pueden estar en redes distintas. La conexión se comprueba así:

1. **El dispositivo llama al servidor** (getrequest, cdata). El dispositivo inicia la conexión.
2. **En la web** verás "Conectó: [fecha] desde [IP]" cuando el dispositivo haya llamado.
3. **IP mostrada**: Es la IP desde la que el dispositivo se conectó (puede ser la IP del dispositivo o de su router/NAT).
4. **ADMS en el dispositivo**: Server Address = IP, Server Port = 9081 (o URL en producción). El dispositivo debe poder alcanzar el servidor.

---

## Depurar: el dispositivo no conecta

### Paso 0: ¿Llegan las peticiones al servidor?
Desde otra máquina en la red (o desde el mismo Mac):
```bash
cd backend
chmod +x test_iclock_conexion.sh
./test_iclock_conexion.sh 192.168.2.55 TU_SERIAL_DEL_DISPOSITIVO
```
- Si responde OK → el servidor está bien. El problema puede ser el SN o la config del dispositivo.
- Si no responde → firewall, backend no corriendo, o red.

En el Mac (192.168.2.55): **Preferencias del Sistema → Seguridad → Firewall** debe permitir conexiones entrantes en el puerto 9081, o desactiva el firewall temporalmente para probar.

### 1. Revisar configuración ADMS
- **COMM → Cloud Server Setting**
- **Server Mode**: ADMS (no otro modo)
- **Server Address**: IP (ej: `192.168.2.55`) — solo IP, sin http://
- **Server Port**: `9081` (puerto que usa este backend)
- **HTTPS**: OFF en desarrollo

### 2. Verificar red
- El dispositivo debe poder alcanzar el servidor (ping, misma red o puertos abiertos)
- Firewall: permitir puerto 9081 entrante

### 3. Alternativa: agente local
Si ADMS no funciona, usa el agente. En un PC en la misma red que el dispositivo:
```bash
cd agent-local
pip install pyzk requests
# Edita config.yaml: IP del dispositivo, api_key del dispositivo
python main.py
```
El agente envía usuarios con pyzk (set_user) sin usar ADMS.

### 4. Forzar desde la web
Si ya agregaste el usuario manualmente en el dispositivo, usa "Forzar getrequest" para marcar como enviados y limpiar la cola.

---

## Cambiar a producción

Cuando el backend esté en producción, actualiza en el dispositivo:
- **Server Address**: `https://tu-dominio.com`
