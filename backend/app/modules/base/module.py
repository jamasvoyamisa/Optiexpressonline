from abc import ABC, abstractmethod
from fastapi import APIRouter
from typing import Optional


class BaseModule(ABC):
    """Clase base abstracta para todos los módulos del sistema"""
    
    def __init__(self, prefix: str, tags: Optional[list] = None):
        self.prefix = prefix
        self.tags = tags or []
        self.router = APIRouter(prefix=prefix, tags=self.tags)
        self._register_routes()
    
    @abstractmethod
    def _register_routes(self):
        """Método abstracto que cada módulo debe implementar para registrar sus rutas"""
        pass
    
    def get_router(self) -> APIRouter:
        """Retorna el router del módulo"""
        return self.router
