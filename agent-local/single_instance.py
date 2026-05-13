"""
Lock de instancia única para evitar que se ejecuten dos agentes al mismo tiempo
en la misma máquina (lo que duplicaría las checadas enviadas al servidor).

Uso:
    lock = SingleInstanceLock("optiexpress-agent")
    if not lock.acquire():
        sys.exit(1)
    # ... el agente corre normal ...
    lock.release()
"""
import os
import sys
import logging
from pathlib import Path

logger = logging.getLogger("single_instance")


class SingleInstanceLock:
    """
    Asegura que sólo una instancia del agente corra a la vez.

    Funciona en Windows y Linux/Mac usando un archivo lock con PID.
    Si encuentra un archivo lock huérfano (PID muerto), lo reemplaza.
    """

    def __init__(self, name: str = "optiexpress-agent"):
        self.name = name
        self.lock_path = Path(self._lock_dir()) / f"{name}.lock"
        self._fh = None

    @staticmethod
    def _lock_dir() -> str:
        if sys.platform == "win32":
            return os.environ.get("TEMP", os.environ.get("TMP", "."))
        return "/tmp"

    @staticmethod
    def _is_pid_alive(pid: int) -> bool:
        if pid <= 0:
            return False
        try:
            if sys.platform == "win32":
                import ctypes
                PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
                handle = ctypes.windll.kernel32.OpenProcess(
                    PROCESS_QUERY_LIMITED_INFORMATION, False, pid
                )
                if handle == 0:
                    return False
                exit_code = ctypes.c_ulong()
                ok = ctypes.windll.kernel32.GetExitCodeProcess(
                    handle, ctypes.byref(exit_code)
                )
                ctypes.windll.kernel32.CloseHandle(handle)
                STILL_ACTIVE = 259
                return bool(ok) and exit_code.value == STILL_ACTIVE
            else:
                os.kill(pid, 0)
                return True
        except (OSError, ProcessLookupError, PermissionError):
            return False
        except Exception:
            return False

    def _read_existing_pid(self):
        try:
            if not self.lock_path.exists():
                return None
            content = self.lock_path.read_text(encoding="utf-8").strip()
            if not content:
                return None
            return int(content)
        except (OSError, ValueError):
            return None

    def acquire(self) -> bool:
        """
        Intenta adquirir el lock. Devuelve True si tuvo éxito (esta es la única
        instancia), False si ya hay otra instancia corriendo.
        """
        existing_pid = self._read_existing_pid()
        if existing_pid and existing_pid != os.getpid():
            if self._is_pid_alive(existing_pid):
                logger.error(
                    "Ya hay otra instancia del agente corriendo (PID=%s). "
                    "No se iniciará una segunda instancia para evitar duplicar checadas. "
                    "Si crees que esto es un error, cierra el otro proceso o borra %s",
                    existing_pid, self.lock_path,
                )
                return False
            logger.warning(
                "Lock huérfano detectado (PID=%s no existe), se reemplazará.",
                existing_pid,
            )

        try:
            self.lock_path.write_text(str(os.getpid()), encoding="utf-8")
            return True
        except OSError as e:
            logger.error("No se pudo crear el archivo de lock %s: %s", self.lock_path, e)
            return False

    def release(self) -> None:
        try:
            if self.lock_path.exists():
                pid_in_file = self._read_existing_pid()
                if pid_in_file == os.getpid():
                    self.lock_path.unlink()
        except OSError:
            pass
