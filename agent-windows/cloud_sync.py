"""
Cliente para sincronizar datos con la API en la nube
"""
import requests
from typing import Dict, Optional, List
import logging

logger = logging.getLogger(__name__)


class CloudSync:
    """Cliente para enviar datos a la API en la nube"""
    
    def __init__(self, api_url: str, api_key: str, device_id: str):
        self.api_url = api_url
        self.api_key = api_key
        self.device_id = device_id
        self.base_url = api_url.rsplit("/", 1)[0]  # quitar /device-sync
        self.headers = {
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        }
    
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
            response = requests.post(
                self.api_url,
                json=payload,
                headers=self.headers,
                timeout=10
            )
            
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
            response = requests.post(url, json={"ids": ids}, headers=self.headers, timeout=10)
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
            response = requests.post(url, params={"success": success}, headers=self.headers, timeout=10)
            if response.status_code == 200:
                logger.info(f"Enroll {enroll_id} marcado como {'completado' if success else 'fallido'} en backend")
                return True
            logger.warning(f"mark_enroll_done: HTTP {response.status_code} - {response.text[:200]}")
            return False
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al marcar enroll done: {e}")
            return False

    def upload_template(self, numero_empleado: str, finger_index: int, template_data: str) -> bool:
        """Sube un template de huella al backend para almacenamiento y replicacion"""
        try:
            url = f"{self.base_url}/agent/upload-template"
            payload = {
                "numero_empleado": numero_empleado,
                "finger_index": finger_index,
                "template_data": template_data,
            }
            response = requests.post(url, json=payload, headers=self.headers, timeout=15)
            if response.status_code == 200:
                logger.info(f"Template subido al backend: {numero_empleado} dedo={finger_index}")
                return True
            logger.warning(f"upload_template: HTTP {response.status_code} - {response.text[:200]}")
            return False
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al subir template: {e}")
            return False

    def get_employee_templates(self, numero_empleado: str) -> list:
        """Consulta si un empleado ya tiene huellas almacenadas en el backend"""
        try:
            url = f"{self.base_url}/fingerprint-templates/{numero_empleado}"
            response = requests.get(url, headers=self.headers, timeout=10)
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
            response = requests.post(url, headers=self.headers, timeout=10)
            if response.status_code == 200:
                logger.info(f"Eliminacion {delete_id} marcada como procesada")
                return True
            logger.warning(f"mark_delete_done: HTTP {response.status_code} - {response.text[:200]}")
            return False
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al marcar delete done: {e}")
            return False

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
