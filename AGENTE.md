# Agente Optiexpress — ZKTeco

Un solo agente para todas las plataformas: **[agent-local/](agent-local/)**

| Plataforma | Cómo se ejecuta |
|------------|-----------------|
| **Windows (sucursales)** | `OptiexpressAgent.exe` — bandeja del sistema + instalador Setup |
| **Linux / Ubuntu Server** | `python main.py` o servicio systemd |
| **macOS** | `./run.sh` o `./run_gui.sh` |

Documentación detallada:

- [agent-local/README.md](agent-local/README.md) — instalación y uso
- [agent-local/BUILD_TRAY.md](agent-local/BUILD_TRAY.md) — compilar exe e instalador Windows
- [docs/AGENTE-CHECADOR.md](docs/AGENTE-CHECADOR.md) — lógica de sync y reglas del backend

## Inicio rápido

### Windows (sucursales)

1. Ejecutar `OptiexpressAgent-Setup-X.Y.Z.exe` (generado con `build_installer.bat`)
2. Configurar desde bandeja → **Abrir Configuración** (contraseña por defecto: `Optiexpress`)
3. El agente arranca solo si existe `config.yaml`

### Linux / Mac (desarrollo o servidor)

```bash
cd agent-local
./install.sh
cp config.yaml.example config.yaml
# editar config.yaml
./run.sh          # consola
./run_tray.bat    # solo Windows
```

Para Ubuntu Server con systemd: ver [agent-local/UBUNTU_SERVER.md](agent-local/UBUNTU_SERVER.md).
