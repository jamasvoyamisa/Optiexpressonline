"""
Cliente para sincronizar datos con la API en la nube
"""
import requests
from typing import Dict, Optional, List, Any
from urllib.parse import urljoin
import logging

logger = logging.getLogger(__name__)

AGENT_VERSION = "1.2.9"

# device-sync puede tardar si el servidor está procesando ráfaga matutina; 10s provocaba 499 y reintentos duplicados
SYNC_ATTENDANCE_TIMEOUT = 30
DEFAULT_REQUEST_TIMEOUT = 10


class CloudSync:
    """Cliente para enviar datos a la API en la nube"""
    
    def __init__(self, api_url: str, api_key: str, device_id: str):
        self.api_url = api_url
        self.api_key = api_key
        self.device_id = device_id
        self.base_url = api_url.rsplit("/", 1)[0]  # quitar /device-sync
        self.headers = {
            "X-API-Key": api_key,
            "Content-Type": "application/json",
            "User-Agent": f"Optiexpress-Agent/{AGENT_VERSION}",
        }

    def _post_follow_redirect(self, url: str, *, timeout: int = 10, **kwargs: Any) -> requests.Response:
        """
        POST que ante redirect 301/302 (p. ej. http→https en nginx) repite POST al Location.
        Con allow_redirects=True, requests puede enviar GET en el segundo salto y el API
        devuelve 405 en rutas que solo aceptan POST (p. ej. /device-sync).
        """
        hdr = kwargs.pop("headers", self.headers)
        current = url
        for _ in range(6):
            r = requests.post(
                current,
                headers=hdr,
                timeout=timeout,
                allow_redirects=False,
                **kwargs,
            )
            if r.status_code not in (301, 302, 303, 307, 308):
                return r
            loc = r.headers.get("Location")
            if not loc:
                return r
            current = urljoin(current, loc)
        return r
    
    def sync_attendance(self, user_id: str, timestamp: str, tipo: str = "entrada") -> bool:
        """
        Sincroniza una checada con la nube.
        Retorna True si fue exitoso o si debe ignorarse (no reintentar).
        Retorna False solo si es un error temporal (ej: sin conexion).
        """
        payload = {
            "user_id": str(user_id),
            "timestamp": timestamp,
            "device_id": self.device_id,
            "tipo": tipo
        }
        
        try:
            response = self._post_follow_redirect(self.api_url, json=payload, timeout=SYNC_ATTENDANCE_TIMEOUT)
            
            if response.status_code == 201:
                logger.info(f"OK Checada sincronizada: Usuario={user_id}, Hora={timestamp}")
                return True

            resp_text = ""
            try:
                resp_text = response.text[:200]
            except Exception:
                pass

            if response.status_code in (400, 422):
                if "no registrado" in resp_text.lower() or "no encontrado" in resp_text.lower():
                    logger.info(f"Checada ignorada (usuario {user_id} no registrado en el sistema)")
                else:
                    logger.warning(f"Checada rechazada ({response.status_code}): {resp_text}")
                return True

            logger.warning(f"Error al sincronizar checada (HTTP {response.status_code}): {resp_text}")
            return False
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error de conexion al sincronizar: {e}")
            return False
    
    def test_connection(self) -> bool:
        """Prueba la conexión con la API"""
        try:
            health_url = self.api_url.replace("/device-sync", "/health")
            if "/asistencia" in health_url:
                health_url = self.api_url.split("/asistencia")[0] + "/health"
            response = requests.get(health_url, headers=self.headers, timeout=5)
            return response.status_code in [200, 404]  # 404 es OK si el endpoint no existe
        except Exception:
            return False

    def get_pending_users(self) -> List[Dict]:
        """Obtiene usuarios pendientes de enviar al dispositivo (para set_user)"""
        try:
            url = f"{self.base_url}/agent/pending-users"
            response = requests.get(url, headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                result = data if isinstance(data, list) else []
                if result:
                    logger.info(f"API: {len(result)} usuario(s) pendiente(s) obtenidos")
                return result
            if response.status_code == 401:
                logger.warning("API Key invalida. Copia la API Key del dispositivo (Asistencia -> tarjeta del dispositivo) a config.yaml")
                return []
            logger.warning(f"get_pending_users: HTTP {response.status_code} - {response.text[:200]}")
            return []
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al obtener pending users: {e}")
            return []

    def mark_users_sent(self, ids: List[int]) -> bool:
        """Marca usuarios como enviados tras set_user"""
        try:
            url = f"{self.base_url}/agent/pending-users/mark-sent"
            response = self._post_follow_redirect(url, json={"ids": ids}, timeout=10)
            return response.status_code == 200
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al marcar usuarios enviados: {e}")
            return False

    def get_pending_enroll(self) -> List[Dict]:
        """Obtiene enrolls pendientes (para enroll_user)"""
        try:
            url = f"{self.base_url}/agent/pending-enroll"
            response = requests.get(url, headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                result = data if isinstance(data, list) else []
                if result:
                    logger.info(f"API: {len(result)} enroll(s) pendiente(s)")
                return result
            if response.status_code == 401:
                logger.warning("API Key invalida para enroll. Verifica X-API-Key en config.yaml")
                return []
            logger.warning(f"get_pending_enroll: HTTP {response.status_code} - {response.text[:200]}")
            return []
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al obtener pending enroll: {e}")
            return []

    def mark_enroll_done(self, enroll_id: int, success: bool = True) -> bool:
        """Marca enroll como completado"""
        try:
            url = f"{self.base_url}/agent/pending-enroll/{enroll_id}/mark-done"
            response = self._post_follow_redirect(url, params={"success": success}, timeout=10)
            if response.status_code == 200:
                logger.info(f"Enroll {enroll_id} marcado como {'completado' if success else 'fallido'} en backend")
                return True
            logger.warning(f"mark_enroll_done: HTTP {response.status_code} - {response.text[:200]}")
            return False
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al marcar enroll done: {e}")
            return False

    def upload_template(
        self,
        numero_empleado: str,
        finger_index: int,
        template_data: str,
        *,
        pin_checador: Optional[str] = None,
        empleado_id: Optional[int] = None,
    ) -> bool:
        """Sube un template de huella al backend para almacenamiento y replicacion"""
        try:
            url = f"{self.base_url}/agent/upload-template"
            payload = {
                "numero_empleado": numero_empleado,
                "finger_index": finger_index,
                "template_data": template_data,
            }
            if pin_checador:
                payload["pin_checador"] = str(pin_checador).strip()
            if empleado_id is not None:
                payload["empleado_id"] = int(empleado_id)
            response = self._post_follow_redirect(url, json=payload, timeout=15)
            if response.status_code == 200:
                logger.info(f"Template subido al backend: {numero_empleado} dedo={finger_index}")
                return True
            logger.warning(f"upload_template: HTTP {response.status_code} - {response.text[:200]}")
            return False
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al subir template: {e}")
            return False

    def get_employee_templates(self, numero_empleado: str, *, pin_checador: str | None = None) -> list:
        """Consulta si un empleado ya tiene huellas almacenadas en el backend.

        Si se provee pin_checador, el backend resuelve al empleado por pin (único globalmente),
        evitando mezclar plantillas cuando numero_empleado está duplicado entre empresas.
        """
        try:
            url = f"{self.base_url}/fingerprint-templates/{numero_empleado}"
            params = {"pin_checador": str(pin_checador).strip()} if pin_checador else None
            response = requests.get(url, headers=self.headers, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                return data if isinstance(data, list) else []
            return []
        except requests.exceptions.RequestException:
            return []

    def get_pin_to_numero(self) -> dict:
        """Mapeo pin_checador -> numero_empleado para subir templates con numero correcto"""
        try:
            url = f"{self.base_url}/agent/pin-to-numero"
            response = requests.get(url, headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                return data if isinstance(data, dict) else {}
            return {}
        except requests.exceptions.RequestException as e:
            logger.warning(f"get_pin_to_numero: {e}")
            return {}

    def log_backend_device_binding(self, handler_name: str) -> None:
        """
        Registra qué Dispositivo del backend corresponde a esta X-API-Key.
        Si la key es de otro checador, las colas (enroll, usuarios) no coincidirán con lo que eliges en la web.
        """
        try:
            url = f"{self.base_url}/agent/diagnostic"
            response = requests.get(url, headers=self.headers, timeout=10)
            if response.status_code != 200:
                logger.warning(
                    f"[{handler_name}] diagnostic: HTTP {response.status_code} — "
                    "revisa API Key y URL del backend"
                )
                return
            data = response.json() if response.content else {}
            d = data.get("dispositivo") or {}
            did = d.get("id")
            dn = d.get("nombre")
            logger.info(
                f"[{handler_name}] Esta API Key en el servidor es el dispositivo id={did} "
                f"nombre=\"{dn}\" (debe ser el mismo checador que configuraste en esta entrada del agente)"
            )
        except requests.exceptions.RequestException as e:
            logger.warning(f"[{handler_name}] diagnostic: {e}")

    def get_pending_deletes(self) -> list:
        """Obtiene usuarios pendientes de eliminar del dispositivo"""
        try:
            url = f"{self.base_url}/agent/pending-deletes"
            response = requests.get(url, headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                result = data if isinstance(data, list) else []
                if result:
                    logger.info(f"API: {len(result)} eliminacion(es) pendiente(s)")
                return result
            return []
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al obtener pending deletes: {e}")
            return []

    def mark_delete_done(self, delete_id: int) -> bool:
        """Marca eliminacion como procesada"""
        try:
            url = f"{self.base_url}/agent/pending-deletes/{delete_id}/mark-done"
            response = self._post_follow_redirect(url, timeout=10)
            if response.status_code == 200:
                logger.info(f"Eliminacion {delete_id} marcada como procesada")
                return True
            logger.warning(f"mark_delete_done: HTTP {response.status_code} - {response.text[:200]}")
            return False
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al marcar delete done: {e}")
            return False

    def get_pending_replicate(self) -> list:
        """Obtiene huellas pendientes de replicar a este dispositivo"""
        try:
            url = f"{self.base_url}/agent/pending-replicate"
            response = requests.get(url, headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                result = data if isinstance(data, list) else []
                if result:
                    logger.info(f"API: {len(result)} huella(s) pendiente(s) de replicar")
                return result
            return []
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al obtener pending replicate: {e}")
            return []

    def mark_replicate_done(self, replicate_id: int, success: bool = True) -> bool:
        """Marca replicación como procesada"""
        try:
            url = f"{self.base_url}/agent/pending-replicate/{replicate_id}/mark-done"
            response = self._post_follow_redirect(url, params={"success": success}, timeout=10)
            if response.status_code == 200:
                logger.info(f"Replicate {replicate_id} marcado como {'OK' if success else 'fallido'}")
                return True
            return False
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al marcar replicate done: {e}")
            return False

    def report_device_users(self, device_users: List[Dict]) -> dict:
        """
        Envía al backend la lista de usuarios del reloj (pin + nombre).
        Retorna el resumen de reconciliación o {} si hay error.
        """
        checador_log = logging.getLogger("checador")
        try:
            url = f"{self.base_url}/agent/sync-device-users"
            payload = {"usuarios": device_users}
            response = self._post_follow_redirect(url, json=payload, timeout=DEFAULT_REQUEST_TIMEOUT)
            if response.status_code == 200:
                result = response.json()
                checador_log.info(
                    f"[{self.device_id}] Usuarios del reloj reportados: "
                    f"{result.get('reconocidos', 0)} reconocidos, "
                    f"{result.get('sin_mapeo', 0)} sin mapeo"
                )
                return result
            checador_log.warning(
                f"[{self.device_id}] Error al reportar usuarios del reloj: "
                f"HTTP {response.status_code} - {response.text[:200]}"
            )
            return {}
        except requests.exceptions.RequestException as e:
            checador_log.error(f"[{self.device_id}] Error de red al reportar usuarios del reloj: {e}")
            return {}

    def get_pending_templates(self) -> list:
        """Obtiene templates pendientes de replicar a este dispositivo"""
        try:
            url = f"{self.base_url}/agent/pending-templates"
            response = requests.get(url, headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                result = data if isinstance(data, list) else []
                if result:
                    logger.info(f"API: {len(result)} template(s) pendiente(s) de replicar")
                return result
            return []
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al obtener pending templates: {e}")
            return []

