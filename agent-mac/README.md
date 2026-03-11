# Agente Optiexpress - macOS

Agente local para sincronizar checadores ZKTeco con el sistema en la nube. **Versión para macOS.**

## Requisitos

- Python 3.8+ (incluido en macOS o instalar desde [python.org](https://python.org))
- Acceso a la red local del dispositivo
- Acceso a internet para sincronizar

## Instalación rápida

```bash
chmod +x install.sh run.sh
./install.sh
```

Edita `config.yaml` con la IP del dispositivo y la API Key, luego:

```bash
./run.sh
```

## Interfaz gráfica

```bash
./run_gui.sh
```

## Inicio automático (opcional)

Para que el agente inicie al encender el Mac, puedes usar **Automator** o **launchd**:

1. Crear un "Programa" en Automator que ejecute `venv/bin/python main.py` en el directorio del agente
2. Añadirlo a "Elementos de inicio de sesión" en Preferencias del Sistema → Usuarios y grupos

O crear un LaunchAgent en `~/Library/LaunchAgents/` (ver documentación de launchd).

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `install.sh` | Instalar dependencias y crear venv |
| `run.sh` | Ejecutar agente (consola) |
| `run_gui.sh` | Ejecutar con interfaz gráfica |
