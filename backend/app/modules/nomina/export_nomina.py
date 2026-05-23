"""Exportación CSV de detalle de nómina por periodo."""
from __future__ import annotations

import csv
import io
from typing import List

from sqlalchemy.orm import Session, joinedload

from app.modules.personal.models import Empleado

from .models import DetalleNominaEmpleado, PeriodoNomina


def _empleado_nombre(emp: Empleado | None) -> str:
    if not emp:
        return ""
    parts = [emp.nombre or "", emp.apellido_paterno or "", emp.apellido_materno or ""]
    return " ".join(p.strip() for p in parts if p and p.strip())


def generar_csv_periodo(db: Session, periodo_id: int) -> tuple[str, str]:
    periodo = db.query(PeriodoNomina).filter(PeriodoNomina.id == periodo_id).first()
    if not periodo:
        raise ValueError("Periodo no encontrado.")

    detalles: List[DetalleNominaEmpleado] = (
        db.query(DetalleNominaEmpleado)
        .options(joinedload(DetalleNominaEmpleado.empleado))
        .filter(DetalleNominaEmpleado.periodo_nomina_id == periodo_id)
        .order_by(DetalleNominaEmpleado.empleado_id)
        .all()
    )

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "periodo_id",
            "empleado_id",
            "empleado",
            "dias_laborados",
            "dias_pagados",
            "dias_fuente",
            "percepciones",
            "gravado",
            "exento",
            "deducciones",
            "subsidio",
            "neto",
        ]
    )
    for d in detalles:
        w.writerow(
            [
                periodo_id,
                d.empleado_id,
                _empleado_nombre(d.empleado),
                d.dias_laborados,
                d.dias_pagados,
                d.dias_fuente or "",
                d.total_percepciones,
                d.total_gravado,
                d.total_exento,
                d.total_deducciones,
                d.subsidio_causado,
                d.total_neto,
            ]
        )

    fi = str(periodo.fecha_inicio)[:10]
    ff = str(periodo.fecha_fin)[:10]
    filename = f"nomina_periodo_{periodo_id}_{fi}_{ff}.csv"
    return filename, buf.getvalue()
