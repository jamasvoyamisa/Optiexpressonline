from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from . import service, schemas

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/notificaciones", tags=["notificaciones"])


def _get_empleado_id(current: dict) -> int:
    """Devuelve el empleado_id del usuario autenticado (user_id == empleado_id en este sistema)."""
    return int(current["user_id"])


@router.get("/mis-notificaciones", response_model=schemas.NotificacionesResumen)
def get_mis_notificaciones(
    solo_no_leidas: bool = False,
    limit: int = 50,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    empleado_id = _get_empleado_id(current)
    notificaciones = service.get_mis_notificaciones(db, empleado_id, solo_no_leidas, limit)
    total_no_leidas = service.contar_no_leidas(db, empleado_id)
    return schemas.NotificacionesResumen(
        total_no_leidas=total_no_leidas,
        notificaciones=notificaciones,
    )


@router.put("/{notificacion_id}/leer", status_code=status.HTTP_204_NO_CONTENT)
def marcar_leida(
    notificacion_id: int,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    empleado_id = _get_empleado_id(current)
    ok = service.marcar_leida(db, notificacion_id, empleado_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificación no encontrada")


@router.put("/marcar-todas-leidas", status_code=status.HTTP_204_NO_CONTENT)
def marcar_todas_leidas(
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    empleado_id = _get_empleado_id(current)
    service.marcar_todas_leidas(db, empleado_id)
