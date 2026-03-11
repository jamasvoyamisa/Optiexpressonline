# Agente Windows - Sincronización ZKTeco

Agente para Windows que sincroniza dispositivos biométricos ZKTeco con el sistema en la nube.

**Correcciones aplicadas:**
- Usa `pin_checador` (no `numero_empleado`) para enviar usuarios al dispositivo
- El backend asigna `pin_checador` por rango de empresa (1-1000, 1001-2000, etc.)
- Eliminaciones usan `pin_checador` para borrar el ID correcto del dispositivo

## Requisitos

- Windows 7 o superior
- Python 3.8 o superior
- Acceso a la red local donde está el dispositivo
- Acceso a internet para sincronizar con la nube

## Instalación rápida

1. **Ejecutar** `install.bat` (crea venv e instala dependencias)
2. **Editar** `config.yaml` con la IP del dispositivo y la API Key
3. **Ejecutar** `run.bat` o `run_gui.bat`

## Archivos de ejecución

| Archivo | Uso |
|---------|-----|
| `install.bat` | Instala Python venv y dependencias |
| `run.bat` | Ejecuta el agente en consola (visible) |
| `run_gui.bat` | Ejecuta la interfaz gráfica |
| `run_silent.bat` | Ejecuta sin ventana (para tareas programadas) |
| `iniciar_oculto.vbs` | Lanza run_silent.bat sin mostrar ventana |
| `instalar_autoinicio.bat` | Instala como tarea de Windows (inicio automático) |

## Configuración

### Obtener API Key

1. Accede al sistema web
2. Ve a Asistencia → Dispositivos → Registrar dispositivo
3. Copia la API Key generada
4. Pégala en `config.yaml`

### config.yaml

```yaml
api_url: "http://TU_SERVIDOR:9081/api/v1/asistencia/device-sync"

devices:
  - name: "Entrada Principal"
    ip: "192.168.2.74"
    port: 4370
    api_key: "TU_API_KEY"
```

## Inicio automático

Ejecuta `instalar_autoinicio.bat` **como Administrador** (clic derecho → Ejecutar como administrador). El agente se iniciará al iniciar sesión en Windows.

Para desinstalar el inicio automático:
```
schtasks /Delete /TN "AgenteZKTeco" /F
```

## Solución de problemas

### No se puede conectar con el dispositivo
- Verifica que la IP y puerto (4370) sean correctos
- Asegúrate de estar en la misma red local
- El firewall de Windows puede bloquear; permite Python

### API Key inválida
- Copia la API Key exactamente desde la web del sistema
- Verifica que el dispositivo esté registrado en el backend

### Las checadas no se sincronizan
- Revisa `agent.log` en la carpeta del agente
- El dispositivo usa `pin_checador` como ID; el backend mapea a `numero_empleado`
