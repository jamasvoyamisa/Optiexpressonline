from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_superuser
from app.modules.audit.schemas import (
    ActividadLogListResponse,
    ActividadLogResponse,
    ActividadPurgeRequest,
    ActividadPurgeResponse,
)
from app.modules.audit.service import ActividadService
from app.modules.personal.models import Empleado

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/audit", tags=["actividad"])


def _rechazar_categoria_request(categoria: Optional[str]) -> None:
    if categoria and str(categoria).strip().lower() == "request":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La categoría request ya no existe.",
        )


@router.get("/actividad", response_model=ActividadLogListResponse)
def listar_actividad(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    nivel: Optional[str] = None,
    categoria: Optional[str] = None,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    _rechazar_categoria_request(categoria)
    rows, total = ActividadService.listar(
        db,
        skip=skip,
        limit=limit,
        nivel=nivel,
        categoria=categoria,
        desde_iso=desde,
        hasta_iso=hasta,
    )
    empleado_ids = sorted({int(r.empleado_id) for r in rows if r.empleado_id is not None})
    empleados_map = {}
    if empleado_ids:
        empleados = (
            db.query(
                Empleado.id,
                Empleado.numero_empleado,
                Empleado.nombre,
                Empleado.apellido_paterno,
                Empleado.apellido_materno,
                Empleado.username,
            )
            .filter(Empleado.id.in_(empleado_ids))
            .all()
        )
        for e in empleados:
            nombre_parts = [e.nombre, e.apellido_paterno, e.apellido_materno]
            nombre_completo = " ".join([str(x).strip() for x in nombre_parts if x and str(x).strip()]) or None
            empleados_map[int(e.id)] = {
                "empleado_numero": e.numero_empleado,
                "empleado_nombre": nombre_completo,
                "empleado_username": e.username,
            }

    items = []
    for r in rows:
        base = ActividadLogResponse.model_validate(r).model_dump()
        if r.empleado_id is not None:
            base.update(empleados_map.get(int(r.empleado_id), {}))
        items.append(ActividadLogResponse.model_validate(base))
    return ActividadLogListResponse(items=items, total=total)


@router.post("/actividad/purgar", response_model=ActividadPurgeResponse)
def purgar_actividad(
    body: ActividadPurgeRequest,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    _rechazar_categoria_request(body.categoria)
    try:
        n = ActividadService.purgar(
            db,
            modo=body.modo,
            categoria=body.categoria,
            dias=body.dias,
        )
        return ActividadPurgeResponse(eliminados=n)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
