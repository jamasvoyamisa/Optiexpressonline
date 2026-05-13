from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.database import get_db
from app.core.config import settings
from app.modules.personal.models import Empleado, EstadoEmpleado
from app.modules.notificaciones import service as noti_service

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/landing", tags=["Landing"])

_TZ_MX = ZoneInfo("America/Mexico_City")


def _mes_dia_cumple_mx(fecha_nacimiento) -> tuple[int, int] | None:
    """Mes y día del cumpleaños en calendario de México (fecha_nacimiento puede ser timestamptz)."""
    if fecha_nacimiento is None:
        return None
    if getattr(fecha_nacimiento, "tzinfo", None) is not None:
        d = fecha_nacimiento.astimezone(_TZ_MX).date()
    else:
        d = fecha_nacimiento.date()
    return (d.month, d.day)


@router.get("/cumpleaneros-hoy")
def cumpleaneros_hoy(db: Session = Depends(get_db)):
    """Devuelve empleados activos que cumplen años hoy (público, sin auth)."""
    hoy = datetime.now(_TZ_MX).date()
    mes_hoy, dia_hoy = hoy.month, hoy.day

    empleados = (
        db.query(Empleado)
        .options(joinedload(Empleado.puesto_rel), joinedload(Empleado.departamento_rel))
        .filter(
            Empleado.estado == EstadoEmpleado.ACTIVO,
            Empleado.fecha_nacimiento.isnot(None),
        )
        .all()
    )

    resultado = []
    for emp in empleados:
        md = _mes_dia_cumple_mx(emp.fecha_nacimiento)
        if not md or md[0] != mes_hoy or md[1] != dia_hoy:
            continue
        nombre_completo = f"{emp.nombre} {emp.apellido_paterno or ''}".strip()
        resultado.append({
            "id": emp.id,
            "nombre": nombre_completo,
            "puesto": emp.puesto_rel.nombre if emp.puesto_rel else None,
            "departamento": emp.departamento_rel.nombre if emp.departamento_rel else None,
        })

    return {"cumpleaneros": resultado, "total": len(resultado)}


class FelicitarRequest(BaseModel):
    empleado_id: int


@router.post("/felicitar-cumpleanero")
def felicitar_cumpleanero(data: FelicitarRequest, db: Session = Depends(get_db)):
    """
    Envía una felicitación de cumpleaños al empleado como notificación en la app.
    Endpoint público (desde landing). Solo permite una felicitación por empleado por día.
    """
    from app.modules.notificaciones.models import Notificacion

    empleado = db.query(Empleado).filter(
        Empleado.id == data.empleado_id,
        Empleado.estado == EstadoEmpleado.ACTIVO,
    ).first()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    # Verificar que hoy es realmente su cumpleaños (calendario México)
    hoy = datetime.now(_TZ_MX)
    if not empleado.fecha_nacimiento:
        raise HTTPException(status_code=400, detail="El empleado no tiene fecha de nacimiento registrada")
    md_fn = _mes_dia_cumple_mx(empleado.fecha_nacimiento)
    if not md_fn or md_fn[0] != hoy.month or md_fn[1] != hoy.day:
        raise HTTPException(status_code=400, detail="Hoy no es el cumpleaños del empleado")

    # Anti-spam: solo una felicitación de este tipo por día
    hoy_inicio = datetime(hoy.year, hoy.month, hoy.day, 0, 0, 0, tzinfo=_TZ_MX)
    ya_felicitado = db.query(Notificacion).filter(
        Notificacion.empleado_id == data.empleado_id,
        Notificacion.tipo == "cumpleanos_felicitacion",
        Notificacion.created_at >= hoy_inicio,
    ).first()
    if ya_felicitado:
        return {"ok": True, "ya_enviada": True, "message": "Ya se enviaron felicitaciones hoy"}

    nombre = f"{empleado.nombre} {empleado.apellido_paterno or ''}".strip()
    noti_service.crear_notificacion(
        db,
        empleado_id=data.empleado_id,
        titulo=f"🎂 ¡Feliz cumpleaños, {empleado.nombre}!",
        mensaje="El equipo de Óptica Express te manda muchas felicitaciones en tu día especial. ¡Que lo disfrutes mucho! 🎉",
        tipo="cumpleanos_felicitacion",
    )

    return {"ok": True, "ya_enviada": False, "message": f"Felicitaciones enviadas a {nombre}"}
