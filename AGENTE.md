# Agente de sincronización ZKTeco

El agente local está organizado en carpetas por plataforma. **Usa la carpeta correspondiente a tu sistema operativo.**

| Carpeta | Plataforma | Uso |
|---------|------------|-----|
| [agent-windows](agent-windows/) | Windows | `install.bat` y `run.bat` (o `run_gui.bat` para interfaz gráfica) |
| [agent-local](agent-local/) | Linux, Mac | `./install.sh` y `./run.sh` |
| [agent-linux](agent-linux/) | Linux, Ubuntu Server | `./install.sh` y `./run.sh` |
| [agent-mac](agent-mac/) | macOS | `./install.sh` y `./run.sh` |

> **Nota:** `agent-windows` incluye las correcciones de `pin_checador` (rango por empresa). Todos los agentes usan un solo backend y varios dispositivos.

## Contenido de cada carpeta

Cada carpeta incluye solo los archivos necesarios para esa plataforma:

- **Archivos comunes**: `main.py`, `cloud_sync.py`, `local_buffer.py`, `zkteco_client.py`, `agent_gui.py`, `requirements.txt`, `config.yaml.example`
- **Linux**: scripts `.sh`, servicio systemd, guía Ubuntu Server
- **agent-windows**: Windows, scripts `.bat`, interfaz gráfica, inicio automático
- **agent-local**: Linux/Mac, scripts `.sh`
- **Mac**: scripts `.sh`

## Configuración

1. Copia la carpeta de tu plataforma al equipo donde correrá el agente
2. Ejecuta el instalador (`install.sh` o `install.bat`)
3. Edita `config.yaml` con la IP del dispositivo y la API Key (obtener desde la web del sistema)
4. Ejecuta el agente (`run.sh` o `run.bat`)

Ver el README dentro de cada carpeta para instrucciones detalladas.
