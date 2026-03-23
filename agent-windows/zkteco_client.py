"""
Cliente para comunicarse con dispositivos ZKTeco MB160
Usa la libreria pyzk (protocolo ZK, puerto 4370)
"""
from zk import ZK
from zk.finger import Finger
from typing import List, Dict, Optional
from datetime import datetime
import base64
import logging

logger = logging.getLogger(__name__)


class ZKTecoClient:
    """Cliente para interactuar con dispositivos ZKTeco MB160 mediante pyzk"""

    def __init__(self, ip: str, port: int = 4370, timeout: int = 5):
        self.ip = ip
        self.port = port
        self.timeout = timeout
        # Evita que pyzk lance ping del sistema en cada conexión (en Windows abre ventana de consola).
        self.zk = ZK(ip, port=port, timeout=timeout, ommit_ping=True)

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
                ts = rec.timestamp.strftime("%Y-%m-%d %H:%M:%S") if rec.timestamp else ""
                rec_no = f"{rec.user_id}_{rec.timestamp}" if rec.timestamp else f"{rec.user_id}_{len(logs)}"
                logs.append({
                    "user_id": str(rec.user_id),
                    "timestamp": ts,
                    "type": "checada",
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
        user_id: pin_checador (o numero_empleado como fallback)
        name: nombre del usuario
        uid: ID interno del dispositivo (opcional; si no se da, se busca uno disponible)
        """
        conn = None
        user_id = str(user_id or "").strip()
        name = str(name or user_id or "Usuario").strip()[:24]
        if not user_id:
            logger.error("set_user: user_id vacio")
            return False
        try:
            conn = self.zk.connect()
            conn.disable_device()
            try:
                users = conn.get_users() or []
                existing = next((u for u in users if str(getattr(u, 'user_id', '')) == user_id), None)
                if existing:
                    uid = int(getattr(existing, 'uid', existing.user_id))
                elif uid is None:
                    uids = [getattr(u, 'uid', u.user_id) for u in users]
                    numeric_uids = [int(x) for x in uids if x is not None and str(x).replace('-', '').isdigit()]
                    uid = max([0] + numeric_uids) + 1
                uid = int(uid) if uid is not None else 1
                conn.set_user(uid=uid, name=name, privilege=0, password='', group_id='', user_id=user_id, card=0)
                logger.info(f"Usuario creado/actualizado en dispositivo: uid={uid}, user_id={user_id}, name={name}")
                return True
            finally:
                conn.enable_device()
        except Exception as e:
            logger.error(f"Error al set_user en {self.ip}:{self.port} - {e}")
            return False
        finally:
            if conn:
                conn.disconnect()

    def delete_user(self, user_id: str) -> bool:
        """Elimina un usuario del dispositivo por su user_id (pin_checador)."""
        conn = None
        user_id = str(user_id or "").strip()
        if not user_id:
            logger.error("delete_user: user_id vacio")
            return False
        try:
            conn = self.zk.connect()
            users = conn.get_users() or []
            user = next((u for u in users if str(getattr(u, 'user_id', '')) == user_id), None)
            if not user:
                logger.info(f"delete_user: usuario {user_id} no existe en el dispositivo (ya eliminado)")
                return True
            uid = int(getattr(user, 'uid', 0))
            conn.disable_device()
            try:
                conn.delete_user(uid=uid, user_id=user_id)
                logger.info(f"Usuario eliminado del dispositivo: uid={uid}, user_id={user_id}")
                return True
            finally:
                try:
                    conn.enable_device()
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"Error al delete_user en {self.ip}:{self.port} - {e}")
            return False
        finally:
            if conn:
                try:
                    conn.disconnect()
                except Exception:
                    pass

    def enroll_user(self, user_id: str, finger_index: int = 0, timeout_seconds: int = 60) -> bool:
        """
        Inicia el registro de huella para un usuario.
        El usuario debe acudir al dispositivo y colocar el dedo 3 veces.
        user_id: pin_checador (debe existir en el dispositivo)
        finger_index: indice del dedo (0-9, default 0)
        timeout_seconds: tiempo maximo de espera
        """
        conn = None
        try:
            conn = self.zk.connect()
            users = conn.get_users()
            user = next((u for u in users if str(getattr(u, 'user_id', '')) == str(user_id)), None)
            if not user:
                logger.error(f"Usuario {user_id} no encontrado en el dispositivo. Primero enviar con set_user.")
                return False
            uid = int(getattr(user, 'uid', 0))
            logger.info(f"Enroll: uid={uid}, user_id={user_id}, dedo={finger_index}. Esperando que el empleado coloque el dedo ({timeout_seconds}s)...")
            conn.disable_device()
            try:
                conn.reg_event(0xFFFF)
                ok = conn.enroll_user(uid=uid, temp_id=finger_index, user_id=str(user_id))
                if ok:
                    logger.info(f"Enroll completado exitosamente para {user_id}")
                else:
                    logger.warning(f"Enroll no completado para {user_id}. El empleado no coloco el dedo o hubo timeout.")
                return bool(ok)
            finally:
                try:
                    conn.cancel_capture()
                except Exception:
                    pass
                try:
                    conn.enable_device()
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"Error al enroll_user en {self.ip}:{self.port} - {e}")
            return False
        finally:
            if conn:
                try:
                    conn.disconnect()
                except Exception:
                    pass

    def get_user_templates(self, user_id: str) -> List[Dict]:
        """Descarga los templates de huella de un usuario.
        Retorna lista de dicts con finger_index y template_data (base64)."""
        conn = None
        try:
            conn = self.zk.connect()
            users = conn.get_users()
            user = next((u for u in users if str(getattr(u, 'user_id', '')) == str(user_id)), None)
            if not user:
                logger.warning(f"get_user_templates: usuario {user_id} no encontrado en dispositivo")
                return []
            uid = int(getattr(user, 'uid', 0))
            templates = conn.get_templates()
            result = []
            for t in templates:
                if t.uid == uid:
                    raw = t.template if hasattr(t, 'template') else getattr(t, 'data', None)
                    if raw:
                        b64 = base64.b64encode(raw).decode('ascii')
                        result.append({
                            "finger_index": t.fid if hasattr(t, 'fid') else 0,
                            "template_data": b64,
                        })
            logger.info(f"get_user_templates: {len(result)} template(s) para user_id={user_id}")
            return result
        except Exception as e:
            logger.error(f"Error al get_user_templates en {self.ip}:{self.port} - {e}")
            return []
        finally:
            if conn:
                try:
                    conn.disconnect()
                except Exception:
                    pass

    def upload_template(self, user_id: str, finger_index: int, template_b64: str) -> bool:
        """Sube un template de huella (base64) a un usuario en el dispositivo."""
        conn = None
        try:
            conn = self.zk.connect()
            users = conn.get_users()
            user = next((u for u in users if str(getattr(u, 'user_id', '')) == str(user_id)), None)
            if not user:
                logger.error(f"upload_template: usuario {user_id} no existe en dispositivo. Enviar primero.")
                return False
            uid = int(getattr(user, 'uid', 0))
            raw = base64.b64decode(template_b64)
            finger = Finger(uid=uid, fid=finger_index, valid=1, template=raw)
            conn.disable_device()
            try:
                conn.save_user_template(user, [finger])
                logger.info(f"Template subido: user_id={user_id}, dedo={finger_index}")
                return True
            finally:
                try:
                    conn.enable_device()
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"Error al upload_template en {self.ip}:{self.port} - {e}")
            return False
        finally:
            if conn:
                try:
                    conn.disconnect()
                except Exception:
                    pass
