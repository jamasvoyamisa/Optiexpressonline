#!/usr/bin/env python3
"""
Interfaz gráfica del agente local multi-dispositivo (Grupo Cristal).
Permite configurar checadores, iniciar/detener el agente y ver logs.
"""
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import yaml
import threading
import logging
import sys
import os
import requests

from win_utils import init_frozen_windows, should_use_console_logging, remove_console_log_handlers

init_frozen_windows()

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")
CONFIG_EXAMPLE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml.example")

BG = "#f0f0f0"
APP_DISPLAY_NAME = "Grupo Cristal"


class DeviceRow:
    """Representa una fila de dispositivo en la UI."""
    def __init__(self):
        self.var_name = None
        self.var_ip = None
        self.var_port = None
        self.var_api_key = None
        self.frame = None
        self.key_entry = None
        self.key_visible = False


class AgentGUI:
    def __init__(self, root, tray_controller=None):
        self.root = root
        self.tray = tray_controller
        self.root.title(f"Agente Local - {APP_DISPLAY_NAME}")
        self.root.geometry("880x720")
        self.root.minsize(800, 650)
        self.root.configure(bg=BG)

        self.agent = None
        self.agent_thread = None
        self.log_handler = None
        self.running = False
        self.device_rows = []

        style = ttk.Style()
        style.theme_use("clam")
        style.configure("Title.TLabel", font=("Segoe UI", 14, "bold"), background=BG)
        style.configure("Section.TLabelframe.Label", font=("Segoe UI", 10, "bold"))
        style.configure("Small.TButton", font=("Segoe UI", 8))
        style.configure("Status.TLabel", font=("Segoe UI", 9))

        self._build_ui()
        self._load_config()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self._sync_running_state()
        if self.tray:
            if self.tray.running:
                self._attach_log_handler()
            self._poll_tray_state()

    # ─── UI ───────────────────────────────────────────────────

    def _build_ui(self):
        main = ttk.Frame(self.root, padding=10)
        main.pack(fill=tk.BOTH, expand=True)

        ttk.Label(main, text=APP_DISPLAY_NAME, style="Title.TLabel").pack(anchor="w", pady=(0, 8))

        # --- API URL ---
        url_frame = ttk.Frame(main)
        url_frame.pack(fill=tk.X, pady=(0, 6))
        ttk.Label(url_frame, text="API URL:").pack(side=tk.LEFT, padx=(0, 6))
        self.var_api_url = tk.StringVar()
        ttk.Entry(url_frame, textvariable=self.var_api_url, width=65).pack(side=tk.LEFT, fill=tk.X, expand=True)

        ttk.Label(url_frame, text="Intervalo (s):").pack(side=tk.LEFT, padx=(12, 4))
        self.var_interval = tk.StringVar(value="30")
        ttk.Entry(url_frame, textvariable=self.var_interval, width=6).pack(side=tk.LEFT)

        # --- Dispositivos ---
        dev_outer = ttk.LabelFrame(main, text=" Dispositivos ", style="Section.TLabelframe", padding=8)
        dev_outer.pack(fill=tk.X, pady=(0, 8))

        header = ttk.Frame(dev_outer)
        header.pack(fill=tk.X, pady=(0, 4))
        for txt, w in [("Nombre", 18), ("IP", 16), ("Puerto", 6), ("API Key", 36), ("", 5)]:
            ttk.Label(header, text=txt, font=("Segoe UI", 8, "bold"), width=w, anchor="w").pack(side=tk.LEFT, padx=2)

        self.devices_container = ttk.Frame(dev_outer)
        self.devices_container.pack(fill=tk.X)

        btn_add = ttk.Button(dev_outer, text="+ Agregar Dispositivo", command=self._add_device_row)
        btn_add.pack(anchor="w", pady=(6, 0))

        # --- Buttons ---
        btn_frame = ttk.Frame(main)
        btn_frame.pack(fill=tk.X, pady=(0, 8))

        ttk.Button(btn_frame, text="Guardar Config", command=self._save_config).pack(side=tk.LEFT, padx=(0, 4))
        ttk.Button(btn_frame, text="Cargar Config", command=self._load_config).pack(side=tk.LEFT, padx=(0, 4))
        ttk.Button(btn_frame, text="Cambiar contraseña", command=self._change_password).pack(side=tk.LEFT, padx=(0, 4))
        ttk.Separator(btn_frame, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=8)
        ttk.Button(btn_frame, text="Probar Conexiones", command=self._test_connections).pack(side=tk.LEFT, padx=(0, 4))
        ttk.Separator(btn_frame, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=8)
        self.btn_start = ttk.Button(btn_frame, text="Iniciar Agente", command=self._start_agent)
        self.btn_start.pack(side=tk.LEFT, padx=(0, 4))
        self.btn_stop = ttk.Button(btn_frame, text="Detener Agente", command=self._stop_agent, state=tk.DISABLED)
        self.btn_stop.pack(side=tk.LEFT, padx=(0, 4))

        # --- Status ---
        status_frame = ttk.Frame(main)
        status_frame.pack(fill=tk.X, pady=(0, 4))
        self.status_indicator = tk.Canvas(status_frame, width=14, height=14, highlightthickness=0, bg=BG)
        self.status_indicator.pack(side=tk.LEFT, padx=(0, 6))
        self._draw_indicator("gray")
        self.var_status = tk.StringVar(value="Detenido")
        ttk.Label(status_frame, textvariable=self.var_status, style="Status.TLabel").pack(side=tk.LEFT)

        # --- Log ---
        log_frame = ttk.LabelFrame(main, text=" Log del Agente ", style="Section.TLabelframe", padding=4)
        log_frame.pack(fill=tk.BOTH, expand=True)
        self.log_text = scrolledtext.ScrolledText(
            log_frame, wrap=tk.WORD, font=("Consolas", 9),
            bg="#1e1e1e", fg="#d4d4d4", insertbackground="#d4d4d4",
            state=tk.DISABLED, height=12
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)
        log_btn = ttk.Frame(log_frame)
        log_btn.pack(fill=tk.X, pady=(4, 0))
        ttk.Button(log_btn, text="Limpiar Log", command=self._clear_log).pack(side=tk.RIGHT)

    def _add_device_row(self, name="", ip="", port="4370", api_key=""):
        row = DeviceRow()
        row.var_name = tk.StringVar(value=name)
        row.var_ip = tk.StringVar(value=ip)
        row.var_port = tk.StringVar(value=str(port))
        row.var_api_key = tk.StringVar(value=api_key)

        row.frame = ttk.Frame(self.devices_container)
        row.frame.pack(fill=tk.X, pady=1)

        ttk.Entry(row.frame, textvariable=row.var_name, width=18).pack(side=tk.LEFT, padx=2)
        ttk.Entry(row.frame, textvariable=row.var_ip, width=16).pack(side=tk.LEFT, padx=2)
        ttk.Entry(row.frame, textvariable=row.var_port, width=6).pack(side=tk.LEFT, padx=2)

        row.key_entry = ttk.Entry(row.frame, textvariable=row.var_api_key, width=30, show="*")
        row.key_entry.pack(side=tk.LEFT, padx=2)

        def toggle_key():
            if row.key_visible:
                row.key_entry.configure(show="*")
            else:
                row.key_entry.configure(show="")
            row.key_visible = not row.key_visible

        ttk.Button(row.frame, text="Ojo", width=4, command=toggle_key, style="Small.TButton").pack(side=tk.LEFT, padx=1)

        def remove():
            row.frame.destroy()
            self.device_rows.remove(row)

        ttk.Button(row.frame, text="X", width=3, command=remove, style="Small.TButton").pack(side=tk.LEFT, padx=1)

        self.device_rows.append(row)
        return row

    def _draw_indicator(self, color):
        self.status_indicator.delete("all")
        self.status_indicator.create_oval(2, 2, 12, 12, fill=color, outline="")

    # ─── Config ───────────────────────────────────────────────

    def _load_config(self):
        path = CONFIG_PATH if os.path.exists(CONFIG_PATH) else CONFIG_EXAMPLE
        try:
            with open(path, "r") as f:
                cfg = yaml.safe_load(f) or {}
        except Exception as e:
            self._append_log(f"Error al cargar config: {e}")
            return

        api_url = cfg.get("api_url", "")
        if not api_url:
            api_url = cfg.get("cloud", {}).get("api_url", "")
        self.var_api_url.set(api_url)
        self.var_interval.set(str(cfg.get("sync", {}).get("interval_seconds", 30)))

        for row in list(self.device_rows):
            row.frame.destroy()
        self.device_rows.clear()

        devices = cfg.get("devices", [])
        if not devices:
            old_dev = cfg.get("device", {})
            old_cloud = cfg.get("cloud", {})
            if old_dev.get("ip"):
                devices = [{
                    "name": old_cloud.get("device_id", "Dispositivo"),
                    "ip": old_dev["ip"],
                    "port": old_dev.get("port", 4370),
                    "api_key": old_cloud.get("api_key", "COPIAR_DE_LA_WEB"),
                }]

        for d in devices:
            self._add_device_row(
                name=d.get("name", ""),
                ip=d.get("ip", ""),
                port=d.get("port", 4370),
                api_key=d.get("api_key", ""),
            )

        if not devices:
            self._add_device_row()

        self._append_log(f"Config cargada desde {os.path.basename(path)} ({len(self.device_rows)} dispositivo(s))")

    def _save_config(self):
        devices = []
        for row in self.device_rows:
            name = row.var_name.get().strip()
            ip = row.var_ip.get().strip()
            if not ip:
                continue
            devices.append({
                "name": name or f"Dispositivo",
                "ip": ip,
                "port": int(row.var_port.get() or 4370),
                "api_key": row.var_api_key.get().strip(),
            })

        existing = {}
        if os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    existing = yaml.safe_load(f) or {}
            except Exception:
                existing = {}

        existing_log = dict(existing.get("logging") or {})
        cfg = {
            "api_url": self.var_api_url.get().strip(),
            "devices": devices,
            "sync": {
                "interval_seconds": int(self.var_interval.get() or 30),
            },
            "buffer": {"enabled": True},
            "logging": {
                "level": existing_log.get("level", "INFO"),
                "file": existing_log.get("file", "agent.log"),
                "retention_days": int(existing_log.get("retention_days", 30)),
            },
        }
        if existing.get("security"):
            cfg["security"] = existing["security"]
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
            self._append_log(f"Config guardada: {len(devices)} dispositivo(s)")
        except Exception as e:
            self._append_log(f"Error al guardar: {e}")
            messagebox.showerror("Error", str(e))

    def _change_password(self):
        from tkinter import simpledialog
        from config_guard import get_stored_hash, set_password, verify_password, remove_password

        has_password = get_stored_hash() is not None

        if has_password:
            current = simpledialog.askstring(
                "Contraseña actual",
                "Introduce la contraseña actual:",
                show="*",
                parent=self.root,
            )
            if current is None:
                return
            if not verify_password(current):
                messagebox.showerror("Error", "Contraseña actual incorrecta")
                return

        new_pwd = simpledialog.askstring(
            "Nueva contraseña" if has_password else "Establecer contraseña",
            "Introduce la contraseña (vacío = quitar protección):" if has_password
            else "Introduce una contraseña para proteger la configuración\n(vacío = cancelar):",
            show="*",
            parent=self.root,
        )
        if new_pwd is None:
            return
        if not new_pwd.strip():
            if has_password and messagebox.askyesno(
                "Confirmar", "¿Quitar la contraseña de acceso a la configuración?"
            ):
                remove_password()
                messagebox.showinfo("Listo", "Protección por contraseña desactivada")
            return
        confirm = simpledialog.askstring(
            "Confirmar",
            "Repite la contraseña:",
            show="*",
            parent=self.root,
        )
        if new_pwd != confirm:
            messagebox.showerror("Error", "Las contraseñas no coinciden")
            return
        if len(new_pwd.strip()) < 4:
            messagebox.showerror("Error", "La contraseña debe tener al menos 4 caracteres")
            return
        set_password(new_pwd.strip())
        messagebox.showinfo("Listo", "Contraseña de acceso actualizada")

    # ─── Test ─────────────────────────────────────────────────

    def _test_connections(self):
        if not self.device_rows:
            self._append_log("No hay dispositivos configurados")
            return

        self._append_log("Probando conexiones...")

        def do_test():
            for row in self.device_rows:
                name = row.var_name.get().strip() or "Dispositivo"
                ip = row.var_ip.get().strip()
                api_key = row.var_api_key.get().strip()
                api_url = self.var_api_url.get().strip()

                if not ip:
                    self._safe_log(f"[{name}] Sin IP, omitido")
                    continue

                if not api_key or api_key == "COPIAR_DE_LA_WEB":
                    self._safe_log(f"[{name}] API Key no configurada")
                    continue

                try:
                    base_url = api_url.rsplit("/", 1)[0] if "/device-sync" in api_url else api_url
                    headers = {"X-API-Key": api_key, "Content-Type": "application/json"}
                    url = f"{base_url}/agent/pending-users"
                    resp = requests.get(url, headers=headers, timeout=8)
                    if resp.status_code == 200:
                        data = resp.json()
                        count = len(data) if isinstance(data, list) else 0
                        self._safe_log(f"[{name}] Backend OK - {count} usuario(s) pendiente(s)")
                    elif resp.status_code == 401:
                        self._safe_log(f"[{name}] API Key invalida (401)")
                    else:
                        self._safe_log(f"[{name}] Backend HTTP {resp.status_code}")
                except requests.exceptions.ConnectionError:
                    self._safe_log(f"[{name}] No se pudo conectar al backend")
                except Exception as e:
                    self._safe_log(f"[{name}] Error: {e}")

        threading.Thread(target=do_test, daemon=True).start()

    def _safe_log(self, text):
        self.root.after(0, self._append_log, text)

    # ─── Agent control ────────────────────────────────────────

    def _is_agent_running(self) -> bool:
        if self.tray:
            return bool(self.tray.running)
        return self.running

    def _sync_running_state(self):
        if self.tray:
            self.running = bool(self.tray.running)
        running = self._is_agent_running()
        if running:
            self.btn_start.configure(state=tk.DISABLED)
            self.btn_stop.configure(state=tk.NORMAL)
            self.var_status.set("Ejecutando")
            self._draw_indicator("#2ecc40")
        elif self.tray and self.tray.error:
            self.btn_start.configure(state=tk.NORMAL)
            self.btn_stop.configure(state=tk.DISABLED)
            self.var_status.set(f"Error: {self.tray.error[:40]}")
            self._draw_indicator("#e74c3c")
        else:
            self.btn_start.configure(state=tk.NORMAL)
            self.btn_stop.configure(state=tk.DISABLED)
            self.var_status.set("Detenido")
            self._draw_indicator("gray")

    def _poll_tray_state(self):
        if not self.tray:
            return
        was_running = self.running
        self.running = bool(self.tray.running)
        self._sync_running_state()
        if self.tray.running and not self.log_handler:
            self._attach_log_handler()
        if was_running and not self.tray.running:
            self._detach_log_handler()
            self._append_log("=== Agente detenido (desde bandeja) ===")
        self.root.after(1000, self._poll_tray_state)

    def _start_agent(self):
        if self._is_agent_running():
            return

        self._save_config()

        if self.tray:
            self._append_log("Iniciando agente desde configuración...")
            self.tray._start_agent()
            self.running = self.tray.running
            if self.running:
                self._attach_log_handler()
                self._append_log("=== Agente iniciado ===")
            self._sync_running_state()
            return

        self._append_log("Iniciando agente en segundo plano (sin consola)...")
        try:
            from main import Agent
            self.agent = Agent()
        except SystemExit:
            self._append_log("ERROR: Configuracion invalida. Revisa config.yaml.")
            return
        except Exception as e:
            self._append_log(f"ERROR al iniciar agente: {e}")
            return

        self._attach_log_handler()
        self.running = True
        self.btn_start.configure(state=tk.DISABLED)
        self.btn_stop.configure(state=tk.NORMAL)
        self.var_status.set("Ejecutando")
        self._draw_indicator("#2ecc40")
        self._append_log("=== Agente iniciado ===")

        self.agent_thread = threading.Thread(target=self._agent_loop, daemon=True)
        self.agent_thread.start()

    def _attach_log_handler(self):
        if self.log_handler:
            return

        gui = self

        class _GuiLogHandler(logging.Handler):
            def emit(self, record):
                try:
                    msg = self.format(record)
                    gui.root.after(0, gui._append_log, msg)
                except Exception:
                    pass

        self.log_handler = _GuiLogHandler()
        self.log_handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
        logging.getLogger().addHandler(self.log_handler)

    def _detach_log_handler(self):
        if self.log_handler:
            logging.getLogger().removeHandler(self.log_handler)
            self.log_handler = None

    def _agent_loop(self):
        try:
            self.agent.run()
        except Exception as e:
            self.root.after(0, self._append_log, f"Error en agente: {e}")
        finally:
            self.root.after(0, self._on_agent_stopped)

    def _on_agent_stopped(self):
        self.running = False
        self.agent = None
        self._detach_log_handler()
        self.btn_start.configure(state=tk.NORMAL)
        self.btn_stop.configure(state=tk.DISABLED)
        self.var_status.set("Detenido")
        self._draw_indicator("gray")
        self._append_log("=== Agente detenido ===")

    def _stop_agent(self):
        if not self._is_agent_running():
            return
        self._append_log("Deteniendo agente...")
        if self.tray:
            self.tray._stop_agent()
            self.running = False
            self._detach_log_handler()
            self._sync_running_state()
            self._append_log("=== Agente detenido ===")
            return
        if self.agent:
            self.agent.running = False
        self.running = False

    # ─── Log ──────────────────────────────────────────────────

    def _append_log(self, text):
        self.log_text.configure(state=tk.NORMAL)
        self.log_text.insert(tk.END, text + "\n")
        self.log_text.see(tk.END)
        self.log_text.configure(state=tk.DISABLED)

    def _clear_log(self):
        self.log_text.configure(state=tk.NORMAL)
        self.log_text.delete("1.0", tk.END)
        self.log_text.configure(state=tk.DISABLED)

    def _on_close(self):
        if self.tray:
            self._detach_log_handler()
            self.root.destroy()
            return
        if self.running:
            if not messagebox.askyesno("Confirmar", "El agente esta corriendo. Detener y salir?"):
                return
            self._stop_agent()
        self.root.destroy()


def main():
    from config_guard import require_config_access
    if not require_config_access("Configuración del agente"):
        return
    root = tk.Tk()
    AgentGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
