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
        Sincroniza una checada con la nube
        Retorna True si fue exitoso, False en caso contrario
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
                logger.info(f"✅ Checada REAL sincronizada exitosamente: Usuario={user_id}, Hora={timestamp}, Tipo={tipo}")
                return True
            else:
                logger.warning(f"❌ Error al sincronizar checada REAL: {response.status_code} - {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error de conexión al sincronizar: {e}")
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
                return response.json()
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
                return response.json()
            return []
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al obtener pending enroll: {e}")
            return []

    def mark_enroll_done(self, enroll_id: int, success: bool = True) -> bool:
        """Marca enroll como completado"""
        try:
            url = f"{self.base_url}/agent/pending-enroll/{enroll_id}/mark-done"
            response = requests.post(url, params={"success": success}, headers=self.headers, timeout=10)
            return response.status_code == 200
        except requests.exceptions.RequestException as e:
            logger.error(f"Error al marcar enroll done: {e}")
            return False
