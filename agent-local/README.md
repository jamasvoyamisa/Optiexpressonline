# Agente Local - Sincronización DHI-ASI1212F-D

Agente local para sincronizar el dispositivo biométrico DHI-ASI1212F-D con el sistema en la nube.

## Requisitos

- Python 3.8 o superior
- Acceso a la red local donde está el dispositivo
- Acceso a internet para sincronizar con la nube

## Instalación

1. **Instalar dependencias**:
```bash
pip install -r requirements.txt
```

2. **Configurar el agente**:
```bash
cp config.yaml.example config.yaml
```

3. **Editar `config.yaml`** con tus datos:
   - IP del dispositivo
   - Credenciales del dispositivo
   - URL de la API en la nube
   - API Key generada desde el sistema

## Configuración

### Obtener API Key

1. Accede al sistema web en la nube
2. Ve a la sección "Dispositivos" → "Registrar Nuevo Agente"
3. Ingresa los datos del dispositivo
4. Copia la API Key generada
5. Pégala en `config.yaml`

### Configuración del Dispositivo

- Asegúrate de conocer la IP local del dispositivo (ej: 192.168.1.100)
- Verifica las credenciales de acceso (usuario y contraseña)
- El dispositivo debe tener acceso HTTP habilitado

## Uso

### Ejecución manual

```bash
python main.py
```

### Ejecutar como servicio (Linux)

1. Crear archivo de servicio systemd `/etc/systemd/system/optiexpress-agent.service`:

```ini
[Unit]
Description=Optiexpress Agent Local
After=network.target

[Service]
Type=simple
User=tu_usuario
WorkingDirectory=/ruta/al/agent-local
ExecStart=/usr/bin/python3 /ruta/al/agent-local/main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

2. Habilitar y iniciar el servicio:
```bash
sudo systemctl enable optiexpress-agent
sudo systemctl start optiexpress-agent
```

### Ejecutar como servicio (Windows)

Usar NSSM (Non-Sucking Service Manager) o Task Scheduler.

## Funcionamiento

1. El agente se conecta al dispositivo cada 30 segundos (configurable)
2. Obtiene las nuevas checadas desde el último sincronizado
3. Envía cada checada a la API en la nube mediante HTTPS
4. Si no hay conexión a internet, guarda las checadas en un buffer local (SQLite)
5. Cuando se restablece la conexión, sincroniza las checadas pendientes

## Solución de Problemas

### No se puede conectar con el dispositivo

- Verifica que la IP y puerto sean correctos
- Verifica las credenciales (usuario/contraseña)
- Asegúrate de estar en la misma red local
- Prueba acceder a la interfaz web del dispositivo desde un navegador

### No se puede conectar con la nube

- Verifica que la URL de la API sea correcta
- Verifica que la API Key sea válida
- Verifica tu conexión a internet
- Las checadas se guardarán en el buffer hasta que se restablezca la conexión

### Las checadas no se sincronizan

- Verifica los logs del agente
- Verifica que el número de empleado en el dispositivo coincida con el del sistema
- Verifica que el dispositivo esté generando logs correctamente

## Logs

Los logs se muestran en la consola. Si configuraste un archivo de log en `config.yaml`, también se guardarán ahí.

## Buffer Local

El buffer local guarda checadas cuando no hay conexión. Se limpia automáticamente después de sincronizar exitosamente.

El archivo `buffer.db` contiene las checadas pendientes. No es necesario hacer backup manual, el agente las sincroniza automáticamente.
