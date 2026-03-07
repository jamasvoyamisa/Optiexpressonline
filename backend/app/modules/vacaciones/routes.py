from datetime import datetime as dt
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user
from app.core.deps import get_current_empleado_with_rol
from . import schemas, service
from .models import SolicitudVacaciones

def _set_jefe_aprobador_nombre(solicitud: SolicitudVacaciones) -> None:
    if solicitud.jefe_aprobador:
        solicitud.jefe_aprobador_nombre = (
            f"{solicitud.jefe_aprobador.nombre} {solicitud.jefe_aprobador.apellido_paterno or ''}"
        ).strip()
    else:
        solicitud.jefe_aprobador_nombre = None

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/vacaciones", tags=["Vacaciones"])


@router.post("/solicitudes", response_model=schemas.SolicitudVacacionesResponse, status_code=status.HTTP_201_CREATED)
def create_solicitud(solicitud: schemas.SolicitudVacacionesCreate, db: Session = Depends(get_db)):
    """Crear nueva solicitud de vacaciones"""
    try:
        return service.VacacionesService.create_solicitud(db, solicitud)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/mis-solicitudes", response_model=List[schemas.SolicitudVacacionesResponse])
def get_mis_solicitudes(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    estado: Optional[str] = None,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Solicitudes de vacaciones del empleado actual. Requiere autenticación."""
    empleado_id = int(current["user_id"])
    result = service.VacacionesService.get_solicitudes(
        db,
        skip=skip,
        limit=limit,
        empleado_id=empleado_id,
        estado=estado
    )
    for s in result:
        _set_jefe_aprobador_nombre(s)
    return result


@router.post("/mis-solicitudes", response_model=schemas.SolicitudVacacionesResponse, status_code=status.HTTP_201_CREATED)
def create_mi_solicitud(
    body: schemas.SolicitudVacacionesCreateMine,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Crear solicitud de vacaciones del empleado actual. Requiere autenticación."""
    empleado_id = int(current["user_id"])
    solicitud = schemas.SolicitudVacacionesCreate(
        empleado_id=empleado_id,
        fecha_inicio=body.fecha_inicio,
        fecha_fin=body.fecha_fin,
        motivo=body.motivo
    )
    try:
        return service.VacacionesService.create_solicitud(db, solicitud)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/solicitudes", response_model=List[schemas.SolicitudVacacionesResponse])
def get_solicitudes(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    empleado_id: Optional[int] = None,
    estado: Optional[str] = None,
    jefe_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Listar solicitudes de vacaciones"""
    result = service.VacacionesService.get_solicitudes(
        db,
        skip=skip,
        limit=limit,
        empleado_id=empleado_id,
        estado=estado,
        jefe_id=jefe_id
    )
    for s in result:
        _set_jefe_aprobador_nombre(s)
    return result


@router.get("/solicitudes/{solicitud_id}", response_model=schemas.SolicitudVacacionesResponse)
def get_solicitud(solicitud_id: int, db: Session = Depends(get_db)):
    """Obtener solicitud por ID"""
    db_solicitud = service.VacacionesService.get_solicitud(db, solicitud_id)
    if not db_solicitud:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud no encontrada"
        )
    _set_jefe_aprobador_nombre(db_solicitud)
    return db_solicitud


@router.put("/solicitudes/{solicitud_id}/aprobar", response_model=schemas.SolicitudVacacionesResponse)
def aprobar_solicitud(
    solicitud_id: int,
    aprobacion: schemas.SolicitudVacacionesAprobar,
    jefe_id: int = Query(..., description="ID del jefe que aprueba"),
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Aprobar o rechazar. Super admin autoriza todo. Gerente General solo aprueba vacaciones de gerentes/supervisores."""
    try:
        result = service.VacacionesService.aprobar_solicitud(
            db,
            solicitud_id,
            jefe_id,
            aprobacion.aprobar,
            aprobacion.comentarios,
            bypass_permiso=current_extra.get("is_superuser") is True,
            es_gerente_general=current_extra.get("is_gerente_general") is True
        )
        if result:
            _set_jefe_aprobador_nombre(result)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar solicitud: {str(e)}"
        )


@router.get("/mi-balance", response_model=schemas.BalanceConPeriodosResponse)
def get_mi_balance(
    año: Optional[int] = Query(None, description="Año del balance (por defecto año actual)"),
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Balance de vacaciones con periodo actual y periodo anterior (por vencer). Requiere autenticación."""
    empleado_id = int(current["user_id"])
    año_val = año or dt.now().year
    data = service.VacacionesService.get_balance_con_periodos(db, empleado_id, año_val)
    return schemas.BalanceConPeriodosResponse(
        empleado_id=data["empleado_id"],
        año=data["año"],
        periodo_actual=schemas.PeriodoVacacionesResponse(**data["periodo_actual"]) if data.get("periodo_actual") else None,
        periodo_anterior=schemas.PeriodoVacacionesResponse(**data["periodo_anterior"]) if data.get("periodo_anterior") else None,
        dias_disponibles=data["dias_disponibles"],
        dias_tomados=data["dias_tomados"],
        dias_pendientes=data["dias_pendientes"],
        fecha_limite_goce=data.get("fecha_limite_goce"),
    )


@router.get("/balance/{empleado_id}", response_model=schemas.BalanceConPeriodosResponse)
def get_balance(
    empleado_id: int,
    año: Optional[int] = Query(None, description="Año del balance (por defecto año actual)"),
    db: Session = Depends(get_db)
):
    """Balance de vacaciones con periodo actual y periodo anterior (por vencer). Días por LFT México; goce antes de 18 meses tras aniversario."""
    año_val = año or dt.now().year
    data = service.VacacionesService.get_balance_con_periodos(db, empleado_id, año_val)
    return schemas.BalanceConPeriodosResponse(
        empleado_id=data["empleado_id"],
        año=data["año"],
        periodo_actual=schemas.PeriodoVacacionesResponse(**data["periodo_actual"]) if data.get("periodo_actual") else None,
        periodo_anterior=schemas.PeriodoVacacionesResponse(**data["periodo_anterior"]) if data.get("periodo_anterior") else None,
        dias_disponibles=data["dias_disponibles"],
        dias_tomados=data["dias_tomados"],
        dias_pendientes=data["dias_pendientes"],
        fecha_limite_goce=data.get("fecha_limite_goce"),
    )


@router.get("/dias-por-antiguedad/{empleado_id}")
def get_dias_por_antiguedad(
    empleado_id: int,
    año: Optional[int] = Query(None, description="Año de referencia (por defecto año actual)"),
    db: Session = Depends(get_db)
):
    """
    Días de vacaciones que corresponden al empleado por antigüedad según LFT México.
    Tras 1 año = 12 días; +2 por año hasta 20; luego +2 cada 5 años.
    """
    return service.VacacionesService.dias_derecho_empleado(db, empleado_id, año)


@router.put("/balance/{empleado_id}/dias-disponibles", response_model=schemas.BalanceVacacionesResponse)
def actualizar_dias_disponibles(
    empleado_id: int,
    dias: float,
    año: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """Actualizar días disponibles en el balance"""
    from decimal import Decimal
    return service.VacacionesService.actualizar_dias_disponibles(
        db,
        empleado_id,
        Decimal(str(dias)),
        año
    )
