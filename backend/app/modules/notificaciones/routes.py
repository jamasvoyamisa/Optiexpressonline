from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.deps import get_current_empleado_with_rol
from app.core.config import settings
from app.core.timezone_utils import ZONE_MEXICO, mexico_date_to_utc_range
from app.modules.asistencia import models as asist_models
from app.modules.personal import models as personal_models
from . import service, schemas

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/notificaciones", tags=["notificaciones"])


def _get_empleado_id(current: dict) -> int:
    """Devuelve el empleado_id del usuario autenticado (user_id == empleado_id en este sistema)."""
    return int(current["user_id"])


@router.get("/mis-notificaciones", response_model=schemas.NotificacionesResumen)
def get_mis_notificaciones(
    solo_no_leidas: bool = False,
    limit: int = 50,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    empleado_id = int(current_extra["user_id"])
    # Limpieza automática: conservar solo últimos 15 días (excepto incidencias)
    service.limpiar_notificaciones_antiguas(db, empleado_id=empleado_id, dias_retencion=15)
    notificaciones = service.get_mis_notificaciones(db, empleado_id, solo_no_leidas, limit)
    total_no_leidas = service.contar_no_leidas(db, empleado_id)

    # Alerta diaria: incidencias pendientes por justificar (mínimo 1 día de antigüedad, acumuladas)
    # Solo para quienes administran área (jefe/gerente/supervisor).
    incidencias_por_justificar = 0
    depto_ids = current_extra.get("departamento_ids_que_administro") or []
    if depto_ids:
        hoy_mex = datetime.now(ZONE_MEXICO).date()
        inicio_hoy_utc, _ = mexico_date_to_utc_range(hoy_mex)
        incidencias_por_justificar = db.query(asist_models.Incidencia).join(
            personal_models.Empleado, personal_models.Empleado.id == asist_models.Incidencia.empleado_id
        ).filter(
            asist_models.Incidencia.justificada == False,
            asist_models.Incidencia.fecha < inicio_hoy_utc,  # solo incidencias de días anteriores
            personal_models.Empleado.departamento_id.in_(depto_ids),
        ).count()

    return schemas.NotificacionesResumen(
        total_no_leidas=total_no_leidas,
        incidencias_por_justificar=incidencias_por_justificar,
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
