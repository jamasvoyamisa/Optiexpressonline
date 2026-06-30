# Agente Optiexpress — ZKTeco

Sincroniza checadores biométricos ZKTeco con Optiexpress Online.

## Modos de ejecución

| Modo | Archivo | Uso |
|------|---------|-----|
| **Bandeja (Windows)** | `OptiexpressAgent.exe` | Producción en sucursales |
| **Consola** | `main.py` / `run.sh` | Linux, Mac, depuración |
| **GUI config** | `agent_gui.py` | Configurar dispositivos (protegido con contraseña) |

## Requisitos

- Python 3.8+
- Red local al checador (TCP 4370)
- Internet hacia el backend

## Instalación

### Windows — instalador (sucursales)

Ver [BUILD_TRAY.md](BUILD_TRAY.md). Resumen:

```bat
install.bat
build_installer.bat
```

Entrega: `dist\OptiexpressAgent-Setup-1.2.1.exe`

### Windows / Linux / Mac — desde fuentes

```bash
# Windows
install.bat

# Linux / Mac
chmod +x install.sh && ./install.sh
```

Copiar y editar configuración:

```bash
cp config.yaml.example config.yaml
```

Obtener la **API Key** en la web: Dispositivos → Registrar agente.

## Configuración

`config.yaml` define URL del backend, dispositivos (IP, API Key) e intervalo de sync.

La ventana de configuración pide contraseña **solo si la definiste** en la GUI. Ver [BUILD_TRAY.md](BUILD_TRAY.md).

## Uso

| Plataforma | Comando |
|------------|---------|
| Windows bandeja | `OptiexpressAgent.exe` o autoinicio del instalador |
| Windows consola | `run.bat` |
| Linux / Mac | `./run.sh` |
| GUI | `run_gui.bat` / `./run_gui.sh` |

### Servicio Linux (Ubuntu Server)

```bash
./install-ubuntu.sh --service
```

Ver [UBUNTU_SERVER.md](UBUNTU_SERVER.md).

## Archivos principales

| Archivo | Función |
|---------|---------|
| `main.py` | Motor de sync multi-dispositivo |
| `cloud_sync.py` | Cliente HTTP al backend |
| `zkteco_client.py` | Comunicación con checador |
| `local_buffer.py` | Buffer SQLite offline |
| `agent_tray.py` | Bandeja del sistema (Windows) |
| `agent_gui.py` | Interfaz de configuración |
| `config_guard.py` | Protección por contraseña |

## Solución de problemas

- **No conecta al checador**: revisar IP/puerto en la misma red LAN
- **401 en backend**: API Key incorrecta
- **404 en upload-template**: empleado no mapeado (`pin_checador` en el sistema)
- **Logs**: `agent.log` en la carpeta del agente (rotación diaria; se conservan 30 días)
