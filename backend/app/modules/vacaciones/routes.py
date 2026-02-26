from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.config import settings
from . import schemas, service

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
    return service.VacacionesService.get_solicitudes(
        db,
        skip=skip,
        limit=limit,
        empleado_id=empleado_id,
        estado=estado,
        jefe_id=jefe_id
    )


@router.get("/solicitudes/{solicitud_id}", response_model=schemas.SolicitudVacacionesResponse)
def get_solicitud(solicitud_id: int, db: Session = Depends(get_db)):
    """Obtener solicitud por ID"""
    db_solicitud = service.VacacionesService.get_solicitud(db, solicitud_id)
    if not db_solicitud:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud no encontrada"
        )
    return db_solicitud


@router.put("/solicitudes/{solicitud_id}/aprobar", response_model=schemas.SolicitudVacacionesResponse)
def aprobar_solicitud(
    solicitud_id: int,
    aprobacion: schemas.SolicitudVacacionesAprobar,
    jefe_id: int = Query(..., description="ID del jefe que aprueba"),
    db: Session = Depends(get_db)
):
    """Aprobar o rechazar solicitud de vacaciones"""
    try:
        return service.VacacionesService.aprobar_solicitud(
            db,
            solicitud_id,
            jefe_id,
            aprobacion.aprobar,
            aprobacion.comentarios
        )
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


@router.get("/balance/{empleado_id}", response_model=schemas.BalanceVacacionesResponse)
def get_balance(
    empleado_id: int,
    año: Optional[int] = Query(None, description="Año del balance (por defecto año actual)"),
    db: Session = Depends(get_db)
):
    """Obtener balance de vacaciones de un empleado"""
    balance = service.VacacionesService.get_balance(db, empleado_id, año)
    if not balance:
        # Crear balance si no existe
        balance = service.VacacionesService.get_or_create_balance(db, empleado_id, año)
    return balance


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
