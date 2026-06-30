# Agente Optiexpress — Instalador Windows

El paquete para sucursales es un **instalador** (`OptiexpressAgent-Setup-X.Y.Z.exe`), no archivos sueltos.

## Construir el instalador (PC Windows)

### Requisitos

1. **Python 3.8+** ([python.org](https://python.org), marcar "Add to PATH")
2. **Inno Setup 6** ([jrsoftware.org/isdl.php](https://jrsoftware.org/isdl.php))

### Comandos

```bat
cd agent-local
install.bat
build_installer.bat
```

Salida: **`dist\OptiexpressAgent-Setup-1.2.9.exe`**

(Solo el exe de bandeja, sin instalador: `build_exe.bat`)

---

## Qué hace el instalador

| | Instalación nueva | Actualización |
|---|---|---|
| Detecta versión previa | No | **Sí** (registro `HKCU\Software\Optiexpress\Agent`) |
| Pantalla inicial | "Instalar Agente Optiexpress" | "Actualizar… versión actual: X" |
| `config.yaml` | Crea desde ejemplo si no existe | **No lo toca** |
| Logs / buffer / checadas | — | **Se conservan** |
| Autoinicio Windows | Opción marcada por defecto | Se mantiene / actualiza ruta |
| Al terminar | Opción "Iniciar Agente Optiexpress" | Arranca solo (sync automático si hay config) |

Carpeta por defecto: `%LOCALAPPDATA%\Optiexpress\Agent`

---

## Contraseña de configuración (opcional)

- **Instalación nueva / primera configuración:** abre Configuración **sin pedir contraseña**.
- **Protección:** solo si defines una desde la GUI → *Establecer contraseña*.
- **v1.2.2+** quita automáticamente el hash erróneo del instalador 1.2.1.

Si quedaste bloqueado con 1.2.1: edita `config.yaml` y **borra** toda la sección `security:`.

---

## En sucursal

**Actualizar:** ejecutar el nuevo `OptiexpressAgent-Setup-1.2.1.exe` → Siguiente → Instalar.  
No hace falta desinstalar ni reconfigurar.

**Instalar por primera vez:** mismo Setup → editar `config.yaml` en la carpeta de instalación (o desde bandeja → Configuración).

Verificar en `agent.log`:

```
Optiexpress Agent v1.2.1
Motor de sync v1.2.1
```

---

## Versión en el código

Al cambiar versión, actualizar:

- `agent-local/cloud_sync.py` → `AGENT_VERSION`
- `agent-local/agent_tray.py` → `VERSION`
- `agent-local/installer/setup.iss` → `#define MyAppVersion`
