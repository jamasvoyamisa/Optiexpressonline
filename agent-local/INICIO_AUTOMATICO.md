# Agente Optiexpress — Inicio automático en Windows

## Producción (recomendado): instalador + bandeja

1. Instalar con **`OptiexpressAgent-Setup-X.Y.Z.exe`** (ver [BUILD_TRAY.md](BUILD_TRAY.md))
2. Marcar **Iniciar con Windows** en el asistente (o activarlo desde bandeja → menú contextual)
3. Configurar desde bandeja → **Abrir Configuración** (contraseña por defecto: `Optiexpress`)

El autoinicio usa el registro `HKCU\...\Run\OptiexpressAgent` (mismo mecanismo que el menú de la bandeja).

Carpeta típica: `%LOCALAPPDATA%\Optiexpress\Agent`

---

## Desarrollo: fuentes Python + tarea programada

Solo si **no** usas el `.exe` de bandeja.

### Requisitos (una vez)

1. Copiar `agent-local` a la PC (ej. `C:\Optiexpress\Agent`)
2. Ejecutar `install.bat`
3. Editar `config.yaml` (API URL, dispositivos, API Keys)
4. Probar con `run.bat`

### Autoinicio con script

Ejecutar **`instalar_autoinicio.bat`** como Administrador.

Crea la tarea `OptiexpressAgentSync` que lanza `pythonw.exe main.py` al iniciar sesión.

### Desinstalar autoinicio (modo Python)

```bat
schtasks /Delete /TN "OptiexpressAgentSync" /F
```

---

## Verificar

- **Web**: Configuración → Dispositivos → “Última sincronización” reciente
- **Log**: `agent.log` en la carpeta del agente
- **Bandeja**: icono “O” junto al reloj (modo exe)
- **Tareas**: `OptiexpressAgent.exe` o `pythonw.exe` en Administrador de tareas
