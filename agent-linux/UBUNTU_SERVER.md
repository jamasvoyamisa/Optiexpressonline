# Agente Optiexpress en Ubuntu Server

Guía para instalar y ejecutar el agente de sincronización de checadores ZKTeco en Ubuntu Server.

## Requisitos

- Ubuntu Server 20.04 LTS o superior (también funciona en Debian)
- Python 3.8 o superior
- Acceso a la red local donde están los dispositivos biométricos
- Acceso a internet para sincronizar con el backend

## Instalación rápida

### 1. Copiar el agente al servidor

```bash
# Desde tu máquina local (ejemplo con scp)
scp -r agent-local usuario@tu-servidor:/home/usuario/

# O clonar el repositorio en el servidor
git clone <repo-url>
cd Optiexpressonline/agent-local
```

### 2. Ejecutar el instalador

```bash
cd agent-local
chmod +x install-ubuntu.sh
./install-ubuntu.sh
```

### 3. Configurar

```bash
nano config.yaml
```

Edita:
- **api_url**: URL del backend (ej: `https://tu-dominio.com/api/v1/asistencia/device-sync`)
- **devices**: IP, puerto y `api_key` de cada checador (obtén la API Key desde la web del sistema)

### 4. Probar manualmente

```bash
./run.sh
```

Deberías ver logs de sincronización. Detén con `Ctrl+C`.

---

## Instalación como servicio (inicio automático)

Para que el agente se ejecute automáticamente al reiniciar el servidor:

```bash
./install-ubuntu.sh --service
```

Esto crea el servicio systemd `optiexpress-agent` y lo habilita.

**Antes de iniciar**, asegúrate de haber editado `config.yaml`.

```bash
sudo systemctl start optiexpress-agent
sudo systemctl status optiexpress-agent
```

### Comandos del servicio

| Comando | Descripción |
|---------|-------------|
| `sudo systemctl start optiexpress-agent` | Iniciar el agente |
| `sudo systemctl stop optiexpress-agent` | Detener el agente |
| `sudo systemctl restart optiexpress-agent` | Reiniciar |
| `sudo systemctl status optiexpress-agent` | Ver estado |
| `sudo journalctl -u optiexpress-agent -f` | Ver logs en tiempo real |
| `sudo journalctl -u optiexpress-agent -n 100` | Últimas 100 líneas de log |

---

## Instalación en /opt (recomendado para producción)

```bash
sudo mkdir -p /opt/optiexpress-agent
sudo cp -r agent-local/* /opt/optiexpress-agent/
sudo chown -R $USER:$USER /opt/optiexpress-agent
cd /opt/optiexpress-agent
./install-ubuntu.sh --service
```

---

## Verificar que funciona

1. **Desde la web**: Configuración → Dispositivos. La tarjeta debe mostrar "Última sincronización" con fecha/hora reciente.

2. **Logs del servicio**:
   ```bash
   sudo journalctl -u optiexpress-agent -f
   ```

3. **Archivo de log** (si está configurado en `config.yaml`):
   ```bash
   tail -f agent.log
   ```

---

## Solución de problemas

### No se puede conectar al dispositivo

- Verifica que la IP y puerto sean correctos en `config.yaml`
- Comprueba que el servidor esté en la misma red que el checador
- Prueba: `ping 192.168.x.x` (IP del dispositivo)
- El puerto por defecto ZKTeco es 4370

### No se puede conectar al backend

- Verifica que `api_url` sea correcta y accesible desde el servidor
- Prueba: `curl -I https://tu-backend.com/api/v1/health`
- Las checadas se guardan en el buffer local (`buffer_*.db`) y se sincronizarán cuando haya conexión

### El servicio no inicia

```bash
sudo journalctl -u optiexpress-agent -n 50 --no-pager
```

Revisa errores de Python o de configuración. Asegúrate de que `config.yaml` existe y tiene datos válidos.

### Permisos

Si el servicio corre como root por defecto, los archivos `buffer_*.db`, `synced_*.txt` y `agent.log` se crearán en el directorio del agente. Si usas un usuario dedicado, ajusta los permisos:

```bash
sudo chown -R optiexpress:optiexpress /opt/optiexpress-agent
```

Y descomenta `User=` y `Group=` en el archivo de servicio.

---

## Actualizar el agente

```bash
cd /opt/optiexpress-agent  # o tu ruta
git pull  # si usas git
# O copia los archivos nuevos manualmente

source venv/bin/activate
pip install -r requirements.txt

sudo systemctl restart optiexpress-agent
```
