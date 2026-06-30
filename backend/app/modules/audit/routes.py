from typing import Optional
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, text
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
from app.modules.audit.models import ActividadLog
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


@router.get("/metricas")
def get_metricas(
    dias: int = Query(30, ge=1, le=365),
    nivel: Optional[str] = Query(None),
    categoria: Optional[str] = Query(None),
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """Métricas agregadas de actividad_log para el panel de métricas de uso."""
    desde = datetime.now(timezone.utc) - timedelta(days=dias)

    def base_filter(q):
        q = q.filter(ActividadLog.created_at >= desde)
        if nivel:
            q = q.filter(ActividadLog.nivel == nivel)
        if categoria:
            q = q.filter(ActividadLog.categoria == categoria)
        return q

    # ── Totales por nivel ──────────────────────────────────────────────────────
    totales_nivel = base_filter(db.query(
        ActividadLog.nivel,
        func.count().label("n"),
    )).group_by(ActividadLog.nivel).all()
    por_nivel = {r.nivel: r.n for r in totales_nivel}

    # ── Totales por categoría ─────────────────────────────────────────────────
    totales_cat = base_filter(db.query(
        ActividadLog.categoria,
        func.count().label("n"),
    ).filter(ActividadLog.categoria != "request")).group_by(ActividadLog.categoria).all()
    por_categoria = {r.categoria: r.n for r in totales_cat}

    # ── Eventos por día (últimos `dias`) ──────────────────────────────────────
    eventos_dia_q = db.query(
        func.date(ActividadLog.created_at).label("dia"),
        ActividadLog.nivel,
        func.count().label("n"),
    ).filter(ActividadLog.created_at >= desde)
    if nivel:
        eventos_dia_q = eventos_dia_q.filter(ActividadLog.nivel == nivel)
    if categoria:
        eventos_dia_q = eventos_dia_q.filter(ActividadLog.categoria == categoria)
    else:
        eventos_dia_q = eventos_dia_q.filter(ActividadLog.categoria != "request")
    eventos_dia_raw = (
        eventos_dia_q
        .group_by(func.date(ActividadLog.created_at), ActividadLog.nivel)
        .order_by(func.date(ActividadLog.created_at).asc())
        .all()
    )

    dias_map: dict = {}
    for row in eventos_dia_raw:
        d = str(row.dia)
        if d not in dias_map:
            dias_map[d] = {"dia": d, "error": 0, "warning": 0, "info": 0}
        nivel = str(row.nivel).lower()
        if nivel in dias_map[d]:
            dias_map[d][nivel] = int(row.n)
    eventos_por_dia = list(dias_map.values())

    # ── Logins por día ────────────────────────────────────────────────────────
    logins_dia_raw = db.execute(text("""
        SELECT DATE(created_at) AS dia, COUNT(*) AS n
        FROM actividad_log
        WHERE created_at >= :desde
          AND categoria = 'auth'
          AND nivel = 'info'
          AND mensaje LIKE '%sesión iniciada%'
        GROUP BY DATE(created_at)
        ORDER BY dia ASC
    """), {"desde": desde.strftime("%Y-%m-%d %H:%M:%S")}).fetchall()
    logins_por_dia = [{"dia": str(r.dia), "n": int(r.n)} for r in logins_dia_raw]

    # ── Top rutas con errores ─────────────────────────────────────────────────
    err_q = db.query(
        ActividadLog.ruta,
        func.count().label("n"),
    ).filter(
        ActividadLog.created_at >= desde,
        ActividadLog.nivel == "error",
        ActividadLog.ruta.isnot(None),
    )
    if categoria:
        err_q = err_q.filter(ActividadLog.categoria == categoria)
    top_errores = err_q.group_by(ActividadLog.ruta).order_by(func.count().desc()).limit(10).all()

    # ── Empleados más activos (más registros con empleado_id) ─────────────────
    top_empleados_raw = base_filter(db.query(
        ActividadLog.empleado_id,
        Empleado.nombre,
        Empleado.apellido_paterno,
        Empleado.numero_empleado,
        func.count().label("n"),
    ).join(
        Empleado, Empleado.id == ActividadLog.empleado_id, isouter=True,
    ).filter(
        ActividadLog.empleado_id.isnot(None),
    )).group_by(
        ActividadLog.empleado_id,
        Empleado.nombre,
        Empleado.apellido_paterno,
        Empleado.numero_empleado,
    ).order_by(func.count().desc()).limit(8).all()

    top_empleados = [
        {
            "empleado_id": r.empleado_id,
            "nombre": " ".join(filter(None, [r.nombre, r.apellido_paterno])) or f"ID {r.empleado_id}",
            "numero": r.numero_empleado,
            "n": r.n,
        }
        for r in top_empleados_raw
    ]

    # ── Total general ─────────────────────────────────────────────────────────
    total = sum(por_nivel.values())

    return {
        "dias": dias,
        "desde": desde.isoformat(),
        "total": total,
        "por_nivel": por_nivel,
        "por_categoria": por_categoria,
        "eventos_por_dia": eventos_por_dia,
        "logins_por_dia": logins_por_dia,
        "top_errores": [{"ruta": r.ruta, "n": r.n} for r in top_errores],
        "top_empleados": top_empleados,
    }


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
