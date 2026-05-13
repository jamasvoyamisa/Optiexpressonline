"""Registro explícito de actividad de negocio (solicitudes, incapacidades, etc.)."""
from typing import Any, Optional

from sqlalchemy.orm import Session

from .service import ActividadService


def registrar_negocio(
    db: Session,
    *,
    empleado_id: Optional[int],
    mensaje: str,
    contexto: Any = None,
) -> None:
    ActividadService.registrar(
        db,
        nivel="info",
        categoria="negocio",
        mensaje=mensaje,
        empleado_id=empleado_id,
        contexto=contexto,
    )
