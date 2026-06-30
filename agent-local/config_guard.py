"""
Protección opcional por contraseña para la configuración del agente.
Solo pide clave si el usuario la definió explícitamente (gui_password_hash en config.yaml).
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path
from typing import Optional

import yaml

# Hash que venía por error en config.yaml.example (contraseña "Optiexpress") — se elimina al arrancar.
_LEGACY_BAD_HASH = "08cb49c000cde884ba7e0bf3a9b66d09e94cb9f3acbc8551e72502819c53e8e4"


def agent_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent.resolve()
    return Path(__file__).parent.resolve()


def config_path() -> Path:
    return agent_dir() / "config.yaml"


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def _load_config() -> dict:
    path = config_path()
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}


def _save_config(cfg: dict) -> None:
    with open(config_path(), "w", encoding="utf-8") as f:
        yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def migrate_legacy_password_lock() -> None:
    """Quita el hash erróneo del instalador v1.2.1 para no bloquear la configuración."""
    path = config_path()
    if not path.exists():
        return
    cfg = _load_config()
    security = dict(cfg.get("security") or {})
    stored = str(security.get("gui_password_hash") or "").strip()
    if stored == _LEGACY_BAD_HASH:
        security.pop("gui_password_hash", None)
        if security:
            cfg["security"] = security
        else:
            cfg.pop("security", None)
        _save_config(cfg)


def get_stored_hash() -> Optional[str]:
    migrate_legacy_password_lock()
    security = _load_config().get("security") or {}
    value = security.get("gui_password_hash")
    if value and str(value).strip():
        return str(value).strip()
    return None


def is_setup_pending() -> bool:
    """Primera configuración: sin config o sin dispositivos listos."""
    path = config_path()
    if not path.exists():
        return True
    cfg = _load_config()
    devices = cfg.get("devices") or []
    if not devices:
        return True
    for d in devices:
        if not isinstance(d, dict):
            continue
        ip = str(d.get("ip") or "").strip()
        key = str(d.get("api_key") or "").strip()
        if ip and key and key != "COPIAR_DE_LA_WEB":
            return False
    return True


def is_protection_enabled() -> bool:
    if is_setup_pending():
        return False
    security = _load_config().get("security") or {}
    if security.get("gui_password_required") is False:
        return False
    return get_stored_hash() is not None


def verify_password(password: str) -> bool:
    stored = get_stored_hash()
    if not stored:
        return True
    return hash_password(password) == stored


def set_password(new_password: str) -> None:
    cfg = _load_config() if config_path().exists() else {}
    security = dict(cfg.get("security") or {})
    pwd = new_password.strip()
    if not pwd:
        security.pop("gui_password_hash", None)
    else:
        security["gui_password_hash"] = hash_password(pwd)
    security.pop("gui_password_required", None)
    if security:
        cfg["security"] = security
    else:
        cfg.pop("security", None)
    _save_config(cfg)


def remove_password() -> None:
    set_password("")


def prompt_password(title: str = "Acceso a configuración") -> bool:
    if not is_protection_enabled():
        return True

    import tkinter as tk
    from tkinter import ttk

    result = {"ok": False}

    root = tk.Tk()
    root.title(title)
    root.resizable(False, False)
    root.configure(bg="#f0f0f0")
    root.attributes("-topmost", True)

    frame = ttk.Frame(root, padding=16)
    frame.pack(fill=tk.BOTH, expand=True)

    ttk.Label(
        frame,
        text="Introduce la contraseña de administrador del agente:",
        wraplength=320,
    ).pack(anchor="w", pady=(0, 8))

    var_pwd = tk.StringVar()
    entry = ttk.Entry(frame, textvariable=var_pwd, show="*", width=36)
    entry.pack(fill=tk.X, pady=(0, 12))
    entry.focus_set()

    msg = ttk.Label(frame, text="", foreground="#c0392b")
    msg.pack(anchor="w", pady=(0, 8))

    def submit(_event=None):
        if verify_password(var_pwd.get()):
            result["ok"] = True
            root.destroy()
        else:
            msg.configure(text="Contraseña incorrecta")
            var_pwd.set("")
            entry.focus_set()

    def cancel():
        root.destroy()

    btns = ttk.Frame(frame)
    btns.pack(fill=tk.X)
    ttk.Button(btns, text="Aceptar", command=submit).pack(side=tk.RIGHT, padx=(6, 0))
    ttk.Button(btns, text="Cancelar", command=cancel).pack(side=tk.RIGHT)

    root.bind("<Return>", submit)
    root.bind("<Escape>", lambda _e: cancel())
    root.protocol("WM_DELETE_WINDOW", cancel)

    w, h = 380, 160
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    root.geometry(f"{w}x{h}+{(sw - w) // 2}+{(sh - h) // 2}")

    root.mainloop()
    return result["ok"]


def require_config_access(title: str = "Acceso a configuración") -> bool:
    migrate_legacy_password_lock()
    return prompt_password(title)
