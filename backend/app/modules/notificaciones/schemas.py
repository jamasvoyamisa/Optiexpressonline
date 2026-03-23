from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class NotificacionResponse(BaseModel):
    id: int
    empleado_id: int
    titulo: str
    mensaje: Optional[str] = None
    tipo: str
    referencia_id: Optional[int] = None
    leida: bool
    created_at: datetime

    class Config:
        from_attributes = True


class NotificacionesResumen(BaseModel):
    total_no_leidas: int
    incidencias_por_justificar: int = 0
    notificaciones: list[NotificacionResponse]
