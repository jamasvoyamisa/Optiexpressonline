from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.deps import require_superuser_or_rh
from app.core.config import settings
from app.modules.audit.negocio import registrar_negocio
from . import service, schemas

# Datos médicos/sensibles: solo Administrador o RH (antes cualquier empleado autenticado
# podía listar/ver/crear/editar incapacidades de cualquier otro empleado).
router = APIRouter(
    prefix=f"{settings.API_V1_PREFIX}/incapacidades",
    tags=["incapacidades"],
    dependencies=[Depends(require_superuser_or_rh)],
)


@router.get("", response_model=List[schemas.IncapacidadResponse])
def listar(
    empleado_id: Optional[int] = None,
    estado: Optional[str] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    _current: dict = Depends(get_current_user),
):
    return service.listar_incapacidades(db, empleado_id, estado, fecha_desde, fecha_hasta, skip, limit)


@router.post("", response_model=schemas.IncapacidadCreateResponse, status_code=status.HTTP_201_CREATED)
def crear(
    data: schemas.IncapacidadCreate,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    registrado_por = int(current["user_id"])
    try:
        out = service.crear_incapacidad(db, data, registrado_por)
        inc = out.get("incapacidad")
        iid = getattr(inc, "id", None) if inc is not None else None
        registrar_negocio(
            db,
            empleado_id=registrado_por,
            mensaje=f"Incapacidad registrada id={iid} empleado_afectado={data.empleado_id} período {data.fecha_inicio}–{data.fecha_fin}",
        )
        return out
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{incapacidad_id}", response_model=schemas.IncapacidadResponse)
def obtener(
    incapacidad_id: int,
    db: Session = Depends(get_db),
    _current: dict = Depends(get_current_user),
):
    inc = service.get_incapacidad(db, incapacidad_id)
    if not inc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incapacidad no encontrada")
    return inc


@router.put("/{incapacidad_id}", response_model=schemas.IncapacidadResponse)
def actualizar(
    incapacidad_id: int,
    data: schemas.IncapacidadUpdate,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_user),
):
    inc = service.actualizar_incapacidad(db, incapacidad_id, data)
    if not inc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incapacidad no encontrada")
    registrar_negocio(
        db,
        empleado_id=int(current["user_id"]),
        mensaje=f"Incapacidad actualizada id={incapacidad_id}",
    )
    return inc


@router.delete("/{incapacidad_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancelar(
    incapacidad_id: int,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_user),
):
    inc = service.cancelar_incapacidad(db, incapacidad_id)
    if not inc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incapacidad no encontrada")
    registrar_negocio(
        db,
        empleado_id=int(current["user_id"]),
        mensaje=f"Incapacidad cancelada id={incapacidad_id}",
    )
