from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import extract
from datetime import datetime, timezone
from typing import List
from zoneinfo import ZoneInfo

from app.core.database import get_db
from app.core.config import settings
from app.modules.personal.models import Empleado, EstadoEmpleado

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/landing", tags=["Landing"])


@router.get("/cumpleaneros-hoy")
def cumpleaneros_hoy(db: Session = Depends(get_db)):
    """Devuelve empleados activos que cumplen años hoy (público, sin auth)."""
    # Usar hora México para comparar correctamente (no UTC, que puede ser un día diferente)
    hoy = datetime.now(ZoneInfo("America/Mexico_City"))
    mes_hoy = hoy.month
    dia_hoy = hoy.day

    empleados = db.query(Empleado).filter(
        Empleado.estado == EstadoEmpleado.ACTIVO,
        Empleado.fecha_nacimiento.isnot(None),
        extract("month", Empleado.fecha_nacimiento) == mes_hoy,
        extract("day", Empleado.fecha_nacimiento) == dia_hoy,
    ).all()

    resultado = []
    for emp in empleados:
        nombre_completo = f"{emp.nombre} {emp.apellido_paterno or ''}".strip()
        resultado.append({
            "id": emp.id,
            "nombre": nombre_completo,
            "puesto": emp.puesto_rel.nombre if emp.puesto_rel else None,
            "departamento": emp.departamento_rel.nombre if emp.departamento_rel else None,
        })

    return {"cumpleaneros": resultado, "total": len(resultado)}
