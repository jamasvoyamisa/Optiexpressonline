"""
Buffer local para guardar checadas cuando no hay conexión a internet
Usa SQLite para almacenamiento local
"""
import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class LocalBuffer:
    """Buffer local SQLite para almacenar checadas pendientes de sincronizar"""
    
    def __init__(self, db_path: str = "buffer.db"):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        """Inicializa la base de datos SQLite"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS checadas_pendientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                device_id TEXT NOT NULL,
                tipo TEXT NOT NULL,
                intentos INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()
        conn.close()
    
    def add_checada(self, user_id: str, timestamp: str, device_id: str, tipo: str) -> bool:
        """Agrega una checada al buffer"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO checadas_pendientes 
                (user_id, timestamp, device_id, tipo, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (user_id, timestamp, device_id, tipo, datetime.utcnow().isoformat()))
            conn.commit()
            conn.close()
            logger.info(f"Checada guardada en buffer: {user_id} - {timestamp}")
            return True
        except Exception as e:
            logger.error(f"Error al guardar en buffer: {e}")
            return False
    
    def get_pendientes(self, limit: int = 100) -> List[Dict]:
        """Obtiene checadas pendientes de sincronizar"""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM checadas_pendientes
                ORDER BY created_at ASC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            conn.close()
            
            return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error al leer buffer: {e}")
            return []
    
    def mark_synced(self, checada_id: int) -> bool:
        """Marca una checada como sincronizada (la elimina del buffer)"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM checadas_pendientes WHERE id = ?", (checada_id,))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            logger.error(f"Error al marcar como sincronizada: {e}")
            return False
    
    def increment_retry(self, checada_id: int) -> bool:
        """Incrementa el contador de intentos de una checada"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE checadas_pendientes
                SET intentos = intentos + 1
                WHERE id = ?
            """, (checada_id,))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            logger.error(f"Error al incrementar intentos: {e}")
            return False
    
    def clear_old(self, days: int = 30) -> int:
        """Elimina checadas más antiguas que X días"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                DELETE FROM checadas_pendientes
                WHERE created_at < datetime('now', '-' || ? || ' days')
            """, (days,))
            deleted = cursor.rowcount
            conn.commit()
            conn.close()
            logger.info(f"Eliminadas {deleted} checadas antiguas del buffer")
            return deleted
        except Exception as e:
            logger.error(f"Error al limpiar buffer: {e}")
            return 0
