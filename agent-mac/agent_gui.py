#!/usr/bin/env python3
"""
Interfaz grafica para el Agente Local Multi-Dispositivo ZKTeco.
Permite configurar multiples checadores, iniciar/detener el agente y ver logs.
"""
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import yaml
import threading
import subprocess
import sys
import os
import requests

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")
CONFIG_EXAMPLE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml.example")

BG = "#f0f0f0"


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
    def __init__(self, root):
        self.root = root
        self.root.title("Agente Local Multi-Dispositivo - ZKTeco")
        self.root.geometry("880x720")
        self.root.minsize(800, 650)
        self.root.configure(bg=BG)

        self.agent_process = None
        self.log_thread = None
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

    # ─── UI ───────────────────────────────────────────────────

    def _build_ui(self):
        main = ttk.Frame(self.root, padding=10)
        main.pack(fill=tk.BOTH, expand=True)

        ttk.Label(main, text="Agente Local Multi-Dispositivo", style="Title.TLabel").pack(anchor="w", pady=(0, 8))

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

        cfg = {
            "api_url": self.var_api_url.get().strip(),
            "devices": devices,
            "sync": {
                "interval_seconds": int(self.var_interval.get() or 30),
            },
            "buffer": {"enabled": True},
            "logging": {"level": "INFO", "file": "agent.log"},
        }
        try:
            with open(CONFIG_PATH, "w") as f:
                yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
            self._append_log(f"Config guardada: {len(devices)} dispositivo(s)")
        except Exception as e:
            self._append_log(f"Error al guardar: {e}")
            messagebox.showerror("Error", str(e))

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

    def _start_agent(self):
        if self.running:
            return

        self._save_config()

        agent_dir = os.path.dirname(os.path.abspath(__file__))
        main_py = os.path.join(agent_dir, "main.py")

        is_win = sys.platform == "win32"
        candidates = (
            [os.path.join(agent_dir, "venv", "Scripts", "python.exe")]
            if is_win else
            [os.path.join(agent_dir, "venv", "bin", "python3"),
             os.path.join(agent_dir, "venv", "bin", "python")]
        )
        candidates.append(sys.executable)

        python_exe = next((c for c in candidates if os.path.isfile(c)), None)
        if not python_exe:
            self._append_log("ERROR: No se encontro python. Ejecuta install.bat primero.")
            return

        if is_win and "bin" in python_exe and "Scripts" not in python_exe:
            self._append_log("ERROR: El venv es de Mac/Linux. Elimina 'venv' y ejecuta install.bat")
            return

        self._append_log(f"Usando: {python_exe}")
        try:
            self.agent_process = subprocess.Popen(
                [python_exe, main_py],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                cwd=agent_dir, bufsize=1, universal_newlines=True,
                encoding="utf-8", errors="replace",
            )
            self.running = True
            self.btn_start.configure(state=tk.DISABLED)
            self.btn_stop.configure(state=tk.NORMAL)
            self.var_status.set("Ejecutando")
            self._draw_indicator("#2ecc40")
            self._append_log("=== Agente iniciado ===")

            self.log_thread = threading.Thread(target=self._read_output, daemon=True)
            self.log_thread.start()
            self._monitor_process()
        except Exception as e:
            self._append_log(f"Error al iniciar agente: {e}")
            self.running = False

    def _stop_agent(self):
        if not self.running or not self.agent_process:
            return
        self._append_log("Deteniendo agente...")
        try:
            self.agent_process.terminate()
            try:
                self.agent_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.agent_process.kill()
        except Exception as e:
            self._append_log(f"Error al detener: {e}")

        self.running = False
        self.agent_process = None
        self.btn_start.configure(state=tk.NORMAL)
        self.btn_stop.configure(state=tk.DISABLED)
        self.var_status.set("Detenido")
        self._draw_indicator("gray")
        self._append_log("=== Agente detenido ===")

    def _read_output(self):
        try:
            proc = self.agent_process
            if not proc or not proc.stdout:
                return
            for line in iter(proc.stdout.readline, ""):
                if not self.running:
                    break
                line = line.rstrip("\n\r")
                if line:
                    self.root.after(0, self._append_log, line)
        except Exception:
            pass

    def _monitor_process(self):
        if self.agent_process and self.agent_process.poll() is not None:
            exit_code = self.agent_process.returncode
            self.running = False
            self.agent_process = None
            self.btn_start.configure(state=tk.NORMAL)
            self.btn_stop.configure(state=tk.DISABLED)
            self.var_status.set(f"Finalizado (codigo {exit_code})")
            self._draw_indicator("#e74c3c" if exit_code != 0 else "gray")
            self._append_log(f"=== Agente finalizo con codigo {exit_code} ===")
            return
        if self.running:
            self.root.after(1000, self._monitor_process)

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
        if self.running:
            if not messagebox.askyesno("Confirmar", "El agente esta corriendo. Detener y salir?"):
                return
            self._stop_agent()
        self.root.destroy()


def main():
    root = tk.Tk()
    AgentGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
