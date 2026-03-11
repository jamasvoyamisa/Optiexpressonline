from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.deps import get_current_empleado_with_rol
from app.core.config import settings
from . import service, schemas

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/prestamos", tags=["prestamos"])


@router.get("", response_model=List[schemas.SolicitudPrestamoResponse])
def listar(
    empleado_id: Optional[int] = None,
    estado: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """
    Lista solicitudes de préstamo.
    - Empleado: solo las propias.
    - RH/Admin: todas, con filtros opcionales.
    """
    user_id = int(current["user_id"])
    is_rh = current.get("is_superuser") or current.get("is_rh")
    if not is_rh and empleado_id is not None and empleado_id != user_id:
        raise HTTPException(status_code=403, detail="Solo puedes ver tus propias solicitudes")
    if not is_rh:
        empleado_id = user_id
    return service.listar_solicitudes(db, empleado_id=empleado_id, estado=estado, skip=skip, limit=limit)


@router.post("", response_model=schemas.SolicitudPrestamoResponse, status_code=status.HTTP_201_CREATED)
def crear(
    data: schemas.SolicitudPrestamoCreate,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    """El empleado crea su propia solicitud de préstamo."""
    empleado_id = int(current["user_id"])
    try:
        return service.crear_solicitud(db, data, empleado_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/rh", response_model=schemas.SolicitudPrestamoResponse, status_code=status.HTTP_201_CREATED)
def crear_rh(
    data: schemas.SolicitudPrestamoCreateRH,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    """RH crea una solicitud en nombre de un empleado."""
    if not current.get("is_superuser") and not current.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH puede crear solicitudes en nombre de empleados")
    try:
        return service.crear_solicitud_rh(db, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/solicitudes-pendientes", response_model=List[schemas.SolicitudPrestamoResponse])
def solicitudes_pendientes(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """Solicitudes pendientes para que Gerente General/Director/Admin aprueben."""
    if not current.get("is_superuser") and not current.get("is_director") and not current.get("is_gerente_general"):
        raise HTTPException(status_code=403, detail="Solo Gerente General, Director o Administrador pueden aprobar préstamos")
    return service.listar_solicitudes(db, estado="pendiente", skip=skip, limit=limit)


@router.get("/solicitudes-pendientes-rh", response_model=List[schemas.SolicitudPrestamoResponse])
def solicitudes_pendientes_rh(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """Solicitudes aprobadas por gerente, pendientes de confirmación por RH."""
    if not current.get("is_superuser") and not current.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH puede confirmar solicitudes")
    return service.listar_solicitudes(db, estado="aprobada_gerente", skip=skip, limit=limit)


@router.get("/{solicitud_id}", response_model=schemas.SolicitudPrestamoResponse)
def obtener(
    solicitud_id: int,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    sol = service.get_solicitud(db, solicitud_id)
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    user_id = int(current["user_id"])
    is_rh = current.get("is_superuser") or current.get("is_rh")
    if not is_rh and sol.empleado_id != user_id:
        raise HTTPException(status_code=403, detail="No tienes permiso para ver esta solicitud")
    return sol


@router.put("/{solicitud_id}", response_model=schemas.SolicitudPrestamoResponse)
def actualizar(
    solicitud_id: int,
    data: schemas.SolicitudPrestamoUpdate,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    sol = service.get_solicitud(db, solicitud_id)
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    user_id = int(current["user_id"])
    if sol.empleado_id != user_id:
        raise HTTPException(status_code=403, detail="Solo puedes editar tus propias solicitudes")
    result = service.actualizar_solicitud(db, solicitud_id, data)
    if not result:
        raise HTTPException(status_code=400, detail="La solicitud no está pendiente o no se pudo actualizar")
    return result


@router.post("/{solicitud_id}/aprobar", response_model=schemas.SolicitudPrestamoResponse)
def aprobar_gerente(
    solicitud_id: int,
    data: schemas.AprobarRechazarPrestamo,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """Gerente General/Director/Admin aprueba o rechaza. Aprobado → pendiente confirmación RH."""
    if not current.get("is_superuser") and not current.get("is_director") and not current.get("is_gerente_general"):
        raise HTTPException(status_code=403, detail="Solo Gerente General, Director o Administrador pueden aprobar préstamos")
    aprobador_id = int(current["user_id"])
    result = service.aprobar_gerente(
        db, solicitud_id, data.aprobado, aprobador_id, data.comentarios
    )
    if not result:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada o no está pendiente")
    return result


@router.put("/{solicitud_id}/confirmar-rh", response_model=schemas.SolicitudPrestamoResponse)
def confirmar_rh(
    solicitud_id: int,
    data: schemas.ConfirmarRHPrestamo,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """RH confirma una solicitud ya aprobada por el gerente."""
    if not current.get("is_superuser") and not current.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH puede confirmar solicitudes")
    result = service.confirmar_rh(db, solicitud_id, data.comentarios)
    if not result:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada o no está en estado aprobada por gerente")
    return result


@router.delete("/{solicitud_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancelar(
    solicitud_id: int,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    sol = service.get_solicitud(db, solicitud_id)
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    user_id = int(current["user_id"])
    if sol.empleado_id != user_id:
        raise HTTPException(status_code=403, detail="Solo puedes cancelar tus propias solicitudes")
    result = service.cancelar_solicitud(db, solicitud_id)
    if not result:
        raise HTTPException(status_code=400, detail="La solicitud no está pendiente o no se pudo cancelar")
