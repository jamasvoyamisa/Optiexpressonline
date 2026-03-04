"""
Buffer local SQLite para almacenar checadas cuando el backend no esta disponible.
Se reenvian automaticamente cuando se restablece la conexion.
"""
import sqlite3
import os
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


class LocalBuffer:
    """Buffer SQLite para checadas pendientes de sincronizar"""

    def __init__(self, db_path: str = "buffer.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        try:
            conn = sqlite3.connect(self.db_path)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS checadas_pendientes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    device_id TEXT NOT NULL,
                    tipo TEXT DEFAULT 'checada',
                    retries INTEGER DEFAULT 0,
                    synced INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT ''
                )
            """)
            conn.commit()

            cols = {row[1] for row in conn.execute("PRAGMA table_info(checadas_pendientes)").fetchall()}
            if "retries" not in cols:
                conn.execute("ALTER TABLE checadas_pendientes ADD COLUMN retries INTEGER DEFAULT 0")
                conn.commit()
            if "created_at" not in cols:
                conn.execute("ALTER TABLE checadas_pendientes ADD COLUMN created_at TEXT NOT NULL DEFAULT ''")
                conn.commit()

            conn.close()
            logger.info(f"Buffer local inicializado: {self.db_path}")
        except Exception as e:
            logger.error(f"Error al inicializar buffer: {e}")
            try:
                os.remove(self.db_path)
                logger.info("Buffer corrupto eliminado, se recreara en el siguiente ciclo")
            except Exception:
                pass

    def add_checada(self, user_id: str, timestamp: str, device_id: str, tipo: str = "checada"):
        try:
            from datetime import datetime
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            conn = sqlite3.connect(self.db_path)
            conn.execute(
                "INSERT INTO checadas_pendientes (user_id, timestamp, device_id, tipo, created_at) VALUES (?, ?, ?, ?, ?)",
                (str(user_id), timestamp, device_id, tipo, now)
            )
            conn.commit()
            conn.close()
            logger.info(f"Checada guardada en buffer: {user_id} - {timestamp}")
        except Exception as e:
            logger.error(f"Error al guardar en buffer: {e}")

    def get_pendientes(self, limit: int = 50) -> List[Dict]:
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT id, user_id, timestamp, device_id, tipo FROM checadas_pendientes WHERE synced = 0 ORDER BY id LIMIT ?",
                (limit,)
            ).fetchall()
            conn.close()
            return [dict(r) for r in rows]
        except Exception as e:
            logger.error(f"Error al leer buffer: {e}")
            return []

    def mark_synced(self, checada_id: int):
        try:
            conn = sqlite3.connect(self.db_path)
            conn.execute("UPDATE checadas_pendientes SET synced = 1 WHERE id = ?", (checada_id,))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error al marcar como sincronizada: {e}")

    def increment_retry(self, checada_id: int):
        try:
            conn = sqlite3.connect(self.db_path)
            conn.execute("UPDATE checadas_pendientes SET retries = COALESCE(retries, 0) + 1 WHERE id = ?", (checada_id,))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error al incrementar retry: {e}")

    def count_pendientes(self) -> int:
        try:
            conn = sqlite3.connect(self.db_path)
            count = conn.execute("SELECT COUNT(*) FROM checadas_pendientes WHERE synced = 0").fetchone()[0]
            conn.close()
            return count
        except Exception as e:
            logger.error(f"Error al contar pendientes: {e}")
            return 0
