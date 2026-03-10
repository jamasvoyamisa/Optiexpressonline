# Agente Optiexpress - Linux

Agente local para sincronizar checadores ZKTeco con el sistema en la nube. **Versión para Linux.**

## Requisitos

- Python 3.8+
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

## Ubuntu Server (servicio systemd)

Para ejecutar como servicio con inicio automático:

```bash
./install-ubuntu.sh --service
```

Ver [UBUNTU_SERVER.md](UBUNTU_SERVER.md) para la guía completa.

## Interfaz gráfica

```bash
./run_gui.sh
```

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `install.sh` | Instalar dependencias y crear venv |
| `run.sh` | Ejecutar agente (consola) |
| `run_gui.sh` | Ejecutar con interfaz gráfica |
| `install-ubuntu.sh` | Instalador para Ubuntu Server + servicio |
| `optiexpress-agent.service` | Plantilla systemd |
| `UBUNTU_SERVER.md` | Guía Ubuntu Server |
