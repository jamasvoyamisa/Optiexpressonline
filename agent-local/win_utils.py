"""
Utilidades Windows: ejecutar sin ventana de consola (agente discreto en bandeja).
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
from typing import Any, Dict

CREATE_NO_WINDOW = 0x08000000
DETACHED_PROCESS = 0x00000008


def is_frozen_exe() -> bool:
    return bool(getattr(sys, "frozen", False))


def should_use_console_logging() -> bool:
    """Solo en desarrollo con terminal real. Nunca en el .exe de bandeja."""
    if is_frozen_exe():
        return False
    if sys.platform == "win32":
        stdout = getattr(sys, "stdout", None)
        if stdout is None:
            return False
        try:
            return bool(stdout.isatty())
        except Exception:
            return False
    return bool(getattr(sys, "stdout", None))


def remove_console_log_handlers() -> None:
    """Quita handlers que escriben a stdout/stderr (provocan flash de CMD en Win11)."""
    root = logging.getLogger()
    for handler in list(root.handlers):
        if type(handler) is logging.StreamHandler:
            root.removeHandler(handler)
            try:
                handler.close()
            except Exception:
                pass


_subprocess_patched = False


def patch_subprocess_no_window() -> None:
    """
    Fuerza CREATE_NO_WINDOW en TODO subprocess.Popen del proceso.
    Esto evita que librerías como pyzk (que ejecuta 'ping' en cada connect)
    abran una ventana CMD en el .exe sin consola.
    """
    global _subprocess_patched
    if _subprocess_patched or sys.platform != "win32":
        return

    import subprocess as _sp

    _orig_popen_init = _sp.Popen.__init__
    flags = CREATE_NO_WINDOW

    def _patched_init(self, *args, **kwargs):
        if kwargs.get("creationflags") is None:
            kwargs["creationflags"] = flags
        else:
            kwargs["creationflags"] |= flags
        # startupinfo para ocultar ventana incluso si el flag no basta
        try:
            si = kwargs.get("startupinfo")
            if si is None:
                si = _sp.STARTUPINFO()
            si.dwFlags |= _sp.STARTF_USESHOWWINDOW
            si.wShowWindow = 0  # SW_HIDE
            kwargs["startupinfo"] = si
        except Exception:
            pass
        _orig_popen_init(self, *args, **kwargs)

    _sp.Popen.__init__ = _patched_init
    _subprocess_patched = True


def init_frozen_windows() -> None:
    """Evita que PyInstaller / librerías abran una ventana CMD al escribir en stdout."""
    if sys.platform != "win32":
        return
    # El parche de subprocess aplica siempre en Windows (también en modo Python),
    # porque pyzk hace ping en cada connect.
    patch_subprocess_no_window()
    if not is_frozen_exe():
        return
    remove_console_log_handlers()
    # Si no hay handler, Python 3 usa lastResort → stderr → flash de CMD en Win11
    logging.lastResort = logging.NullHandler()
    try:
        import ctypes
        ctypes.windll.kernel32.FreeConsole()
    except Exception:
        pass
    try:
        devnull = open(os.devnull, "w", encoding="utf-8")
        sys.stdout = devnull
        sys.stderr = devnull
    except Exception:
        pass


def subprocess_kwargs() -> Dict[str, Any]:
    """Flags para subprocess.Popen sin ventana de consola."""
    if sys.platform != "win32":
        return {}
    return {"creationflags": CREATE_NO_WINDOW | DETACHED_PROCESS}


def python_for_subprocess(agent_dir: str) -> str:
    """Preferir pythonw.exe (sin consola) sobre python.exe en Windows."""
    if sys.platform == "win32":
        pythonw = os.path.join(agent_dir, "venv", "Scripts", "pythonw.exe")
        if os.path.isfile(pythonw):
            return pythonw
    return sys.executable
