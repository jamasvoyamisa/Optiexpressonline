"""PyInstaller runtime hook: ejecutar antes que cualquier otro módulo del agente."""
import sys

if sys.platform == "win32" and getattr(sys, "frozen", False):
    try:
        from win_utils import init_frozen_windows
        init_frozen_windows()
    except Exception:
        pass
