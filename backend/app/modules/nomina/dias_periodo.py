"""Días laborados del periodo: asistencia (checadas) o calendario de la empresa."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional, Set

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.timezone_utils import to_mexico
from app.modules.asistencia.models import Asistencia
from app.modules.personal.models import Empresa


def _dias_semana_laborables(dias_laborales: Optional[str]) -> Set[int]:
    """0=lunes … 6=domingo. lun-sab = lun–sáb; lun-dom = todos."""
    if dias_laborales == "lun-dom":
        return set(range(7))
    return set(range(6))  # lun–sáb por defecto


def contar_dias_calendario_laborables(
    fecha_inicio: date,
    fecha_fin: date,
    dias_laborales: Optional[str],
) -> int:
    laborables = _dias_semana_laborables(dias_laborales)
    n = 0
    d = fecha_inicio
    while d <= fecha_fin:
        if d.weekday() in laborables:
            n += 1
        d += timedelta(days=1)
    return n


def contar_dias_con_checada(
    db: Session,
    empleado_id: int,
    fecha_inicio: date,
    fecha_fin: date,
) -> int:
    """Días distintos con al menos una checada en el rango (fecha México)."""
    rows = (
        db.query(Asistencia.timestamp)
        .filter(
            Asistencia.empleado_id == empleado_id,
            func.date(Asistencia.timestamp) >= fecha_inicio,
            func.date(Asistencia.timestamp) <= fecha_fin,
        )
        .all()
    )
    fechas: Set[date] = set()
    for (ts,) in rows:
        if ts is None:
            continue
        mx = to_mexico(ts)
        fechas.add(mx.date())
    return len(fechas)


def contar_dias_periodo(fecha_inicio: date, fecha_fin: date) -> int:
    """Días naturales del periodo (incluye domingos de descanso remunerado)."""
    return (fecha_fin - fecha_inicio).days + 1


def resolver_dias_pagados(
    db: Session,
    empleado_id: int,
    fecha_inicio: date,
    fecha_fin: date,
    empresa: Empresa,
    dias_pagados_override: Optional[Decimal],
    periodicidad: str,
) -> tuple[Decimal, Decimal, str]:
    """
    Retorna (dias_laborados, dias_pagados, fuente).
    fuente: manual | asistencia | calendario

    Días pagados = días naturales del periodo (15/16 en quincena), incluyendo
    domingos de descanso remunerado. dias_laborados refleja días con checada.
    """
    if dias_pagados_override is not None:
        d = Decimal(str(dias_pagados_override))
        return d, d, "manual"

    dias_periodo = Decimal(contar_dias_periodo(fecha_inicio, fecha_fin))
    dias_checada = contar_dias_con_checada(db, empleado_id, fecha_inicio, fecha_fin)
    if dias_checada > 0:
        laborados = Decimal(dias_checada)
        fuente = "asistencia"
    else:
        laborados = dias_periodo
        fuente = "calendario"

    cap = _cap_dias_periodo(periodicidad, fecha_inicio, fecha_fin)
    pagados = min(dias_periodo, Decimal(cap))
    return laborados, pagados, fuente


def _cap_dias_periodo(periodicidad: str, fecha_inicio: date, fecha_fin: date) -> int:
    # Días naturales reales del periodo: 1ª quincena = 15, 2ª quincena = 13/14/15/16
    # según el mes (los meses de 31 días pagan un día más).
    dias_periodo = (fecha_fin - fecha_inicio).days + 1
    if periodicidad == "semanal":
        return 7
    return dias_periodo
