# Instalación del Agente Local - ZKTeco MB160

El agente sincroniza el dispositivo biométrico MB160 con el backend. Debe ejecutarse en un PC de la **misma red** que el dispositivo.

---

## Requisitos

- **Python 3.8 o superior** ([descargar](https://www.python.org/downloads/))
- PC en la misma red que el MB160 (acceso al puerto 4370)
- Conexión de red al servidor donde corre el backend

---

## Instalación en Windows

### 1. Instalar Python

1. Descarga Python desde https://www.python.org/downloads/
2. Durante la instalación, **marca "Add Python to PATH"**
3. Verifica: abre CMD y ejecuta `python --version`

### 2. Copiar la carpeta del agente

Copia la carpeta `agent-local` al PC (ej: `C:\Optiexpress\agent-local`).

**Archivos necesarios:** `main.py`, `zkteco_client.py`, `cloud_sync.py`, `local_buffer.py`, `requirements.txt`, `config.yaml.example`, `install.bat`, `run.bat`, `install.sh`, `run.sh`, `INSTALAR.md`

**No copies** la carpeta `venv` (se crea al ejecutar `install.bat`).

### 3. Instalar dependencias

Abre **Símbolo del sistema** (CMD) o PowerShell en la carpeta del agente:

```cmd
cd C:\Optiexpress\agent-local
install.bat
```

O manualmente:

```cmd
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Configurar

1. Copia `config.yaml.example` a `config.yaml`
2. Edita `config.yaml` con un editor de texto:
   - **device.ip**: IP del MB160 (ej: 192.168.2.74)
   - **cloud.api_url**: URL del backend (ej: `http://IP_SERVIDOR:9081/api/v1/asistencia/device-sync`)
   - **cloud.api_key**: API Key del dispositivo (Asistencia → tarjeta del dispositivo en la web)
   - **cloud.device_id**: ID del dispositivo (ej: OFFICE_01)

### 5. Ejecutar

```cmd
run.bat
```

Para que siga corriendo al cerrar la ventana, ejecútalo como servicio o usa **nssm** (Non-Sucking Service Manager).

---

## Instalación en Linux / Mac

### 1. Verificar Python

```bash
python3 --version
```

### 2. Instalar dependencias

```bash
cd /ruta/a/agent-local
chmod +x install.sh run.sh
./install.sh
```

O manualmente:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Configurar

```bash
cp config.yaml.example config.yaml
nano config.yaml   # o el editor que prefieras
```

### 4. Ejecutar

```bash
./run.sh
```

Para ejecutar en segundo plano:

```bash
nohup ./run.sh > agent.out 2>&1 &
```

---

## Ejecutar como servicio (Windows)

Con **nssm** (https://nssm.cc/):

```cmd
nssm install AgenteZKTeco "C:\Optiexpress\agent-local\venv\Scripts\python.exe" "C:\Optiexpress\agent-local\main.py"
nssm set AgenteZKTeco AppDirectory "C:\Optiexpress\agent-local"
nssm start AgenteZKTeco
```

---

## Ejecutar como servicio (Linux - systemd)

Crea `/etc/systemd/system/agente-zkteco.service`:

```ini
[Unit]
Description=Agente ZKTeco MB160
After=network.target

[Service]
Type=simple
User=tu_usuario
WorkingDirectory=/ruta/a/agent-local
ExecStart=/ruta/a/agent-local/venv/bin/python main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Luego:

```bash
sudo systemctl daemon-reload
sudo systemctl enable agente-zkteco
sudo systemctl start agente-zkteco
sudo systemctl status agente-zkteco
```

---

## Verificar que funciona

1. El agente mostrará: `Conexión con dispositivo ZKTeco establecida`
2. Si el backend está accesible: `Agente iniciado. Sincronizando cada 30 segundos...`
3. Si no hay conexión al backend: las checadas se guardan en `buffer.db` y se enviarán cuando haya conexión

---

## Archivos generados

- `agent.log` - Log del agente
- `buffer.db` - Checadas pendientes (cuando no hay conexión al backend)
- `synced_checadas.txt` - Registro de checadas ya sincronizadas
