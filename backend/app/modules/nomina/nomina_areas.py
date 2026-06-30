"""Agrupación de recibos de nómina por área (departamento)."""
from __future__ import annotations

from collections import defaultdict
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session, joinedload

from app.modules.personal.models import Empleado

from .models import DetalleNominaEmpleado, PeriodoNomina


def departamento_de_empleado(emp: Empleado | None) -> Tuple[Optional[int], str]:
    if emp is None:
        return None, "Sin área"
    if emp.departamento_rel and emp.departamento_rel.nombre:
        return emp.departamento_rel.id, emp.departamento_rel.nombre.strip()
    if emp.departamento_id:
        return emp.departamento_id, f"Área #{emp.departamento_id}"
    return None, "Sin área"


def cargar_detalles_periodo(
    db: Session,
    periodo_id: int,
) -> Tuple[PeriodoNomina, List[DetalleNominaEmpleado]]:
    periodo = db.query(PeriodoNomina).filter(PeriodoNomina.id == periodo_id).first()
    if not periodo:
        raise ValueError("Periodo no encontrado.")

    detalles = (
        db.query(DetalleNominaEmpleado)
        .options(
            joinedload(DetalleNominaEmpleado.empleado).joinedload(Empleado.departamento_rel),
        )
        .filter(DetalleNominaEmpleado.periodo_nomina_id == periodo_id)
        .order_by(DetalleNominaEmpleado.empleado_id)
        .all()
    )
    return periodo, detalles


def agrupar_detalles_por_area(
    detalles: List[DetalleNominaEmpleado],
) -> Dict[Optional[int], List[DetalleNominaEmpleado]]:
    grupos: Dict[Optional[int], List[DetalleNominaEmpleado]] = defaultdict(list)
    for det in detalles:
        dep_id, _ = departamento_de_empleado(det.empleado)
        grupos[dep_id].append(det)
    return dict(grupos)


def listar_areas_periodo(db: Session, periodo_id: int) -> List[dict]:
    _, detalles = cargar_detalles_periodo(db, periodo_id)
    if not detalles:
        return []

    conteo: Dict[Optional[int], dict] = {}
    for det in detalles:
        dep_id, dep_nombre = departamento_de_empleado(det.empleado)
        if dep_id not in conteo:
            conteo[dep_id] = {
                "departamento_id": dep_id,
                "departamento_nombre": dep_nombre,
                "empleados": 0,
            }
        conteo[dep_id]["empleados"] += 1

    return sorted(
        conteo.values(),
        key=lambda x: (x["departamento_nombre"] or "").lower(),
    )


def filtrar_detalles_area(
    detalles: List[DetalleNominaEmpleado],
    departamento_id: Optional[int],
) -> List[DetalleNominaEmpleado]:
    if departamento_id is None:
        return detalles
    out: List[DetalleNominaEmpleado] = []
    for det in detalles:
        dep_id, _ = departamento_de_empleado(det.empleado)
        if dep_id == departamento_id:
            out.append(det)
    return out


def slug_area(nombre: str, max_len: int = 28) -> str:
    s = "".join(c if c.isalnum() or c in " _-" else "_" for c in nombre)
    s = "_".join(s.split())
    return s[:max_len] or "area"
