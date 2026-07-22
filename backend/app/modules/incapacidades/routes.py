from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.deps import require_superuser_or_rh, get_current_empleado_with_rol
from app.core.config import settings
from app.modules.audit.negocio import registrar_accion_rh
from app.modules.personal import models as personal_models
from . import service, schemas

# Datos médicos/sensibles: solo Administrador o RH (antes cualquier empleado autenticado
# podía listar/ver/crear/editar incapacidades de cualquier otro empleado).
router = APIRouter(
    prefix=f"{settings.API_V1_PREFIX}/incapacidades",
    tags=["incapacidades"],
    dependencies=[Depends(require_superuser_or_rh)],
)


def _emp(db: Session, empleado_id: Optional[int]):
    if not empleado_id:
        return None
    return db.query(personal_models.Empleado).filter(personal_models.Empleado.id == empleado_id).first()


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
    request: Request,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    registrado_por = int(current["user_id"])
    try:
        out = service.crear_incapacidad(db, data, registrado_por)
        inc = out.get("incapacidad")
        iid = getattr(inc, "id", None) if inc is not None else None
        afectado = _emp(db, data.empleado_id)
        registrar_accion_rh(
            db,
            current=current,
            request=request,
            accion="crear_incapacidad",
            mensaje=(
                f"Incapacidad registrada id={iid} No. "
                f"{getattr(afectado, 'numero_empleado', data.empleado_id)} "
                f"período {data.fecha_inicio}–{data.fecha_fin}"
            ),
            empleado_afectado=afectado,
            empleado_afectado_id=data.empleado_id,
            extras={
                "incapacidad_id": iid,
                "fecha_inicio": str(data.fecha_inicio),
                "fecha_fin": str(data.fecha_fin),
                "tipo": getattr(data, "tipo", None),
            },
            metodo_http="POST",
            ruta=f"{settings.API_V1_PREFIX}/incapacidades",
            codigo_http=201,
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
    request: Request,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    prev = service.get_incapacidad(db, incapacidad_id)
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incapacidad no encontrada")
    emp_id = getattr(prev, "empleado_id", None)
    inc = service.actualizar_incapacidad(db, incapacidad_id, data)
    if not inc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incapacidad no encontrada")
    cambios = data.model_dump(exclude_unset=True) if hasattr(data, "model_dump") else {}
    afectado = _emp(db, emp_id)
    registrar_accion_rh(
        db,
        current=current,
        request=request,
        accion="actualizar_incapacidad",
        mensaje=f"Incapacidad actualizada id={incapacidad_id} No. {getattr(afectado, 'numero_empleado', emp_id)}",
        empleado_afectado=afectado,
        empleado_afectado_id=emp_id,
        cambios=cambios,
        extras={"incapacidad_id": incapacidad_id},
        metodo_http="PUT",
        ruta=f"{settings.API_V1_PREFIX}/incapacidades/{incapacidad_id}",
    )
    return inc


@router.delete("/{incapacidad_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancelar(
    incapacidad_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    prev = service.get_incapacidad(db, incapacidad_id)
    if not prev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incapacidad no encontrada")
    emp_id = getattr(prev, "empleado_id", None)
    inc = service.cancelar_incapacidad(db, incapacidad_id)
    if not inc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incapacidad no encontrada")
    afectado = _emp(db, emp_id)
    registrar_accion_rh(
        db,
        current=current,
        request=request,
        accion="cancelar_incapacidad",
        mensaje=f"Incapacidad cancelada id={incapacidad_id} No. {getattr(afectado, 'numero_empleado', emp_id)}",
        empleado_afectado=afectado,
        empleado_afectado_id=emp_id,
        extras={"incapacidad_id": incapacidad_id},
        metodo_http="DELETE",
        ruta=f"{settings.API_V1_PREFIX}/incapacidades/{incapacidad_id}",
        codigo_http=204,
    )
