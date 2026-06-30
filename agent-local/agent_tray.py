#!/usr/bin/env python3
"""
Agente Optiexpress - Aplicación de bandeja del sistema (System Tray).
Se ejecuta en segundo plano, muestra un icono en el área de notificaciones
y permite configurar, iniciar/detener el agente desde ahí.
"""
import sys
import os
import threading
import logging
import time
from pathlib import Path

if getattr(sys, "frozen", False):
    AGENT_DIR = Path(sys.executable).parent.resolve()
else:
    AGENT_DIR = Path(__file__).parent.resolve()

os.chdir(AGENT_DIR)
sys.path.insert(0, str(AGENT_DIR))

from win_utils import init_frozen_windows, should_use_console_logging, remove_console_log_handlers, subprocess_kwargs

init_frozen_windows()

import pystray
from PIL import Image, ImageDraw, ImageFont
from single_instance import SingleInstanceLock
from log_setup import setup_agent_logging, DEFAULT_RETENTION_DAYS

VERSION = "1.2.9"
APP_NAME = "Grupo Cristal"
REG_KEY_NAME = "OptiexpressAgent"

setup_agent_logging(
    "agent.log",
    retention_days=DEFAULT_RETENTION_DAYS,
    console=should_use_console_logging(),
)
if not should_use_console_logging():
    remove_console_log_handlers()
logger = logging.getLogger("tray")


# ── Generación de icono ──────────────────────────────────────────────

def _load_font(size):
    for name in ("segoeui.ttf", "arial.ttf", "Arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def create_tray_icon(color="#6c757d"):
    """Genera una imagen PIL para el icono de la bandeja."""
    sz = 64
    img = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([3, 3, sz - 4, sz - 4], fill=color, outline="#FFFFFF", width=2)
    font = _load_font(30)
    bbox = draw.textbbox((0, 0), "O", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((sz - tw) // 2, (sz - th) // 2 - 2), "O", fill="#FFFFFF", font=font)
    return img


# ── Clase principal ──────────────────────────────────────────────────

class AgentTray:
    """Controlador del icono en la bandeja del sistema."""

    COLOR_OK = "#28a745"
    COLOR_ERR = "#dc3545"
    COLOR_IDLE = "#6c757d"

    def __init__(self):
        self.agent = None
        self.agent_thread = None
        self.running = False
        self.error = None
        self.icon = None
        self._gui_thread = None
        self._gui_open = False

    # ── Menú ──────────────────────────────────────────────

    def _status_text(self, _=None):
        if self.running:
            return "Agente ejecutándose"
        if self.error:
            return f"Error: {self.error}"
        return "Agente detenido"

    def _build_menu(self):
        return pystray.Menu(
            pystray.MenuItem(self._status_text, None, enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "Iniciar Agente", self._on_start,
                visible=lambda _: not self.running,
            ),
            pystray.MenuItem(
                "Detener Agente", self._on_stop,
                visible=lambda _: self.running,
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Abrir Configuración", self._on_open_config),
            pystray.MenuItem("Ver Log", self._on_open_log),
            pystray.MenuItem("Abrir carpeta", self._on_open_folder),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "Iniciar con Windows",
                self._on_toggle_autostart,
                checked=lambda _: self._is_autostart_enabled(),
                visible=sys.platform == "win32",
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Salir", self._on_quit),
        )

    # ── Acciones del menú ─────────────────────────────────

    def _on_start(self, icon, item):
        self._start_agent()

    def _on_stop(self, icon, item):
        self._stop_agent()

    def _on_open_config(self, icon, item):
        if self._gui_open:
            return
        self._gui_thread = threading.Thread(target=self._run_gui, daemon=True)
        self._gui_thread.start()

    def _run_gui(self):
        try:
            from config_guard import migrate_legacy_password_lock, require_config_access
            migrate_legacy_password_lock()
            if not require_config_access("Configuración del agente"):
                return
            import tkinter as tk
            from agent_gui import AgentGUI
            self._gui_open = True
            root = tk.Tk()
            root.protocol("WM_DELETE_WINDOW", lambda: self._close_gui(root))
            AgentGUI(root, tray_controller=self)
            root.mainloop()
        except Exception as e:
            logger.error(f"Error al abrir GUI: {e}")
        finally:
            self._gui_open = False

    def _close_gui(self, root):
        try:
            root.destroy()
        except Exception:
            pass
        self._gui_open = False

    def _on_open_log(self, icon, item):
        log_path = AGENT_DIR / "agent.log"
        if not log_path.exists():
            log_path.touch()
        self._open_path(log_path)

    def _on_open_folder(self, icon, item):
        from config_guard import require_config_access
        if require_config_access("Abrir carpeta del agente"):
            self._open_path(AGENT_DIR)

    def _on_quit(self, icon, item):
        logger.info("Saliendo del agente...")
        self._stop_agent()
        icon.stop()

    # ── Control del agente ────────────────────────────────

    def _start_agent(self):
        if self.running:
            return
        self.error = None
        logger.info("Iniciando agente...")
        try:
            from main import Agent
            self.agent = Agent()
        except SystemExit:
            self.error = "Config inválida"
            logger.error("No se pudo iniciar: configuración inválida o faltante")
            self._set_status(self.COLOR_ERR)
            self._notify("Error", "Configuración inválida. Abre Configuración para corregir.")
            return
        except Exception as e:
            self.error = str(e)[:60]
            logger.error(f"Error al crear agente: {e}")
            self._set_status(self.COLOR_ERR)
            return

        self.running = True
        self.agent_thread = threading.Thread(target=self._agent_loop, daemon=True)
        self.agent_thread.start()
        self._set_status(self.COLOR_OK)
        self._notify("Agente iniciado", "Sincronización en curso")
        logger.info("Agente iniciado correctamente")

    def _agent_loop(self):
        try:
            self.agent.run()
        except Exception as e:
            logger.error(f"Error en agente: {e}")
            self.error = str(e)[:60]
        finally:
            self.running = False
            self._set_status(self.COLOR_IDLE)

    def _stop_agent(self):
        if not self.running:
            return
        logger.info("Deteniendo agente...")
        if self.agent:
            self.agent.running = False
        self.running = False
        self._set_status(self.COLOR_IDLE)
        self._notify("Agente detenido", "La sincronización se ha pausado")
        logger.info("Agente detenido")

    # ── Autoinicio con Windows (Registro) ─────────────────

    def _is_autostart_enabled(self):
        if sys.platform != "win32":
            return False
        try:
            import winreg
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0, winreg.KEY_READ,
            )
            winreg.QueryValueEx(key, REG_KEY_NAME)
            winreg.CloseKey(key)
            return True
        except Exception:
            return False

    def _on_toggle_autostart(self, icon, item):
        if sys.platform != "win32":
            return
        import winreg
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        try:
            if self._is_autostart_enabled():
                key = winreg.OpenKey(
                    winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_WRITE,
                )
                winreg.DeleteValue(key, REG_KEY_NAME)
                winreg.CloseKey(key)
                self._notify("Autoinicio desactivado", "El agente ya no se iniciará con Windows")
                logger.info("Autoinicio con Windows desactivado")
            else:
                if getattr(sys, "frozen", False):
                    exe_path = f'"{sys.executable}"'
                else:
                    exe_path = f'"{sys.executable}" "{Path(__file__).resolve()}"'
                key = winreg.OpenKey(
                    winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_WRITE,
                )
                winreg.SetValueEx(key, REG_KEY_NAME, 0, winreg.REG_SZ, exe_path)
                winreg.CloseKey(key)
                self._notify("Autoinicio activado", "El agente se iniciará con Windows")
                logger.info(f"Autoinicio con Windows activado: {exe_path}")
        except Exception as e:
            logger.error(f"Error al configurar autoinicio: {e}")

    # ── Helpers ───────────────────────────────────────────

    def _set_status(self, color):
        if self.icon:
            self.icon.icon = create_tray_icon(color)
            tooltip = f"{APP_NAME} - {self._status_text()}"
            self.icon.title = tooltip

    def _notify(self, title, message):
        try:
            if self.icon:
                self.icon.notify(message, title)
        except Exception:
            pass

    def _open_path(self, path):
        try:
            if sys.platform == "win32":
                os.startfile(str(path))
            elif sys.platform == "darwin":
                import subprocess
                subprocess.Popen(["open", str(path)], **subprocess_kwargs())
            else:
                import subprocess
                subprocess.Popen(["xdg-open", str(path)], **subprocess_kwargs())
        except Exception as e:
            logger.error(f"Error al abrir {path}: {e}")

    # ── Entry point ───────────────────────────────────────

    def _remove_legacy_scheduled_task(self):
        """Quita tarea OptiexpressAgentSync (instalar_autoinicio.bat) que duplica el agente."""
        if sys.platform != "win32" or not getattr(sys, "frozen", False):
            return
        try:
            import subprocess
            subprocess.run(
                ["schtasks", "/Delete", "/TN", "OptiexpressAgentSync", "/F"],
                capture_output=True,
                **subprocess_kwargs(),
            )
        except Exception:
            pass

    def _fix_autostart_if_needed(self):
        """Corrige autoinicio viejo que apuntaba a python.exe/main.py (abría CMD)."""
        if sys.platform != "win32" or not getattr(sys, "frozen", False):
            return
        if not self._is_autostart_enabled():
            return
        import winreg
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ)
            value, _ = winreg.QueryValueEx(key, REG_KEY_NAME)
            winreg.CloseKey(key)
            low = str(value).lower()
            if "python.exe" in low or "main.py" in low or "cmd.exe" in low:
                exe_path = f'"{sys.executable}"'
                key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_WRITE)
                winreg.SetValueEx(key, REG_KEY_NAME, 0, winreg.REG_SZ, exe_path)
                winreg.CloseKey(key)
                logger.warning("Autoinicio corregido: ya no usa python.exe/main.py")
        except Exception as e:
            logger.debug(f"No se pudo revisar autoinicio: {e}")

    def run(self):
        logger.info(f"{APP_NAME} v{VERSION} iniciando...")
        from config_guard import migrate_legacy_password_lock
        migrate_legacy_password_lock()
        self._remove_legacy_scheduled_task()
        self._fix_autostart_if_needed()
        from cloud_sync import AGENT_VERSION
        logger.info(f"Motor de sync v{AGENT_VERSION}")
        self.icon = pystray.Icon(
            REG_KEY_NAME,
            create_tray_icon(self.COLOR_IDLE),
            APP_NAME,
            menu=self._build_menu(),
        )
        self.icon.run(setup=self._on_icon_ready)

    def _on_icon_ready(self, icon):
        icon.visible = True
        config_path = AGENT_DIR / "config.yaml"
        if config_path.exists():
            time.sleep(2)
            self._start_agent()
        else:
            self._notify(
                "Configuración necesaria",
                "Haz doble clic en el icono para configurar el agente",
            )
            logger.warning("config.yaml no encontrado, esperando configuración del usuario")


def _show_already_running_dialog():
    """Muestra un diálogo nativo informando que ya hay otra instancia."""
    try:
        if sys.platform == "win32":
            import ctypes
            ctypes.windll.user32.MessageBoxW(
                0,
                "El agente de Grupo Cristal ya está en ejecución.\n\n"
                "Revisa el icono en la bandeja del sistema (junto al reloj). "
                "Si no lo ves, abre el Administrador de tareas y cierra el "
                "proceso 'OptiexpressAgent' antes de volver a iniciarlo.\n\n"
                "Iniciar dos agentes a la vez duplica las checadas enviadas "
                "al servidor.",
                "Grupo Cristal — Agente ya en ejecución",
                0x00000010 | 0x00040000,  # MB_ICONERROR | MB_TOPMOST
            )
        else:
            print(
                "ERROR: Ya hay otra instancia del agente corriendo. "
                "Iniciar dos agentes a la vez duplica las checadas enviadas al servidor.",
                file=sys.stderr,
            )
    except Exception:
        pass


def main():
    lock = SingleInstanceLock("optiexpress-agent")
    if not lock.acquire():
        _show_already_running_dialog()
        sys.exit(1)
    try:
        tray = AgentTray()
        tray.run()
    finally:
        lock.release()


if __name__ == "__main__":
    main()
