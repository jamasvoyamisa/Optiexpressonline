"""
Cliente para comunicarse con dispositivos ZKTeco MB160
Usa la librería pyzk (protocolo ZK, puerto 4370)
"""
from zk import ZK
from typing import List, Dict, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class ZKTecoClient:
    """Cliente para interactuar con dispositivos ZKTeco MB160 mediante pyzk"""

    def __init__(self, ip: str, port: int = 4370, timeout: int = 5):
        self.ip = ip
        self.port = port
        self.timeout = timeout
        self.zk = ZK(ip, port=port, timeout=timeout)

    def get_attendance_logs(self, start_time: Optional[str] = None, end_time: Optional[str] = None) -> List[Dict]:
        """
        Obtiene los registros de asistencia del dispositivo.
        Retorna lista de dicts con user_id, timestamp, type (entrada/salida).
        """
        conn = None
        try:
            conn = self.zk.connect()
            records = conn.get_attendance()

            logs = []
            for rec in records:
                # rec: Attendance(user_id, timestamp, status, punch)
                # punch: 0=entrada, 1=salida (puede variar por modelo)
                ts = rec.timestamp.strftime("%Y-%m-%d %H:%M:%S") if rec.timestamp else ""
                tipo = "salida" if rec.punch == 1 else "entrada"
                rec_no = f"{rec.user_id}_{rec.timestamp}" if rec.timestamp else f"{rec.user_id}_{len(logs)}"
                logs.append({
                    "user_id": str(rec.user_id),
                    "timestamp": ts,
                    "type": tipo,
                    "rec_no": rec_no
                })
            return logs
        except Exception as e:
            logger.error(f"Error al obtener asistencia de {self.ip}:{self.port} - {e}")
            return []
        finally:
            if conn:
                conn.disconnect()

    def test_connection(self) -> bool:
        """Prueba la conexión con el dispositivo"""
        conn = None
        try:
            conn = self.zk.connect()
            conn.get_firmware_version()
            return True
        except Exception as e:
            logger.error(f"Error al conectar con {self.ip}:{self.port} - {e}")
            return False
        finally:
            if conn:
                conn.disconnect()

    def get_users(self) -> List[Dict]:
        """Obtiene la lista de usuarios del dispositivo. Retorna dicts con uid, user_id, name."""
        conn = None
        try:
            conn = self.zk.connect()
            users = conn.get_users()
            result = []
            for u in users:
                uid_val = getattr(u, 'uid', None) or getattr(u, 'user_id', 0)
                user_id_val = str(getattr(u, 'user_id', None) or getattr(u, 'uid', ''))
                result.append({"uid": uid_val, "user_id": user_id_val, "name": getattr(u, 'name', '') or ''})
            return result
        except Exception as e:
            logger.error(f"Error al obtener usuarios de {self.ip}:{self.port} - {e}")
            return []
        finally:
            if conn:
                conn.disconnect()

    def set_user(self, user_id: str, name: str, uid: Optional[int] = None) -> bool:
        """
        Crea o actualiza un usuario en el dispositivo.
        user_id: número de empleado (PIN)
        name: nombre del usuario
        uid: ID interno del dispositivo (opcional; si no se da, se busca uno disponible)
        """
        conn = None
        user_id = str(user_id or "").strip()
        name = str(name or user_id or "Usuario").strip()[:24]  # Algunos dispositivos limitan longitud
        if not user_id:
            logger.error("set_user: user_id vacío")
            return False
        try:
            conn = self.zk.connect()
            users = conn.get_users() or []
            existing = next((u for u in users if str(getattr(u, 'user_id', '')) == user_id), None)
            if existing:
                uid = getattr(existing, 'uid', existing.user_id)
            elif uid is None:
                uids = [getattr(u, 'uid', u.user_id) for u in users]
                numeric_uids = [int(x) for x in uids if x is not None and str(x).replace('-', '').isdigit()]
                uid = max([0] + numeric_uids) + 1
            ok = conn.set_user(uid=uid, name=name, privilege=0, password=0, group_id='', user_id=user_id, card=0)
            if ok:
                logger.info(f"Usuario creado/actualizado en dispositivo: uid={uid}, user_id={user_id}, name={name}")
            return bool(ok)
        except Exception as e:
            logger.error(f"Error al set_user en {self.ip}:{self.port} - {e}")
            return False
        finally:
            if conn:
                conn.disconnect()

    def enroll_user(self, user_id: str, timeout_seconds: int = 60) -> bool:
        """
        Inicia el registro de huella para un usuario.
        El usuario debe acudir al dispositivo y colocar el dedo.
        user_id: número de empleado (debe existir en el dispositivo)
        timeout_seconds: tiempo máximo de espera
        """
        conn = None
        try:
            conn = self.zk.connect()
            users = conn.get_users()
            user = next((u for u in users if str(getattr(u, 'user_id', '')) == user_id), None)
            if not user:
                logger.error(f"Usuario {user_id} no encontrado en el dispositivo")
                return False
            uid = getattr(user, 'uid', None) or getattr(user, 'user_id', 0)
            logger.info(f"Iniciando enroll para uid={uid}, user_id={user_id}. El empleado debe colocar el dedo en el dispositivo.")
            ok = conn.enroll_user(uid=uid, temp_id=0, user_id=user_id)
            return bool(ok)
        except Exception as e:
            logger.error(f"Error al enroll_user en {self.ip}:{self.port} - {e}")
            return False
        finally:
            if conn:
                conn.disconnect()
