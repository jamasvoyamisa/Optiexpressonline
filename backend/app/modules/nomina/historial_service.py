"""Historial de periodos de nómina agrupados por ejercicio fiscal."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from app.modules.nomina.models import PeriodoEstado, PeriodoNomina
from app.modules.nomina.numero_periodo import meta_periodo_nomina


def ejercicio_fiscal_de_fecha(fecha_fin: datetime) -> int:
    if hasattr(fecha_fin, "year"):
        return int(fecha_fin.year)
    return int(str(fecha_fin)[:4])


def periodo_a_dict(p: PeriodoNomina) -> Dict[str, Any]:
    estado = p.estado.value if hasattr(p.estado, "value") else str(p.estado)
    tipo = p.tipo.value if hasattr(p.tipo, "value") else str(p.tipo)
    meta = meta_periodo_nomina(p.periodicidad, p.fecha_inicio, p.fecha_fin)
    return {
        "id": p.id,
        "empresa_id": p.empresa_id,
        "fecha_inicio": p.fecha_inicio,
        "fecha_fin": p.fecha_fin,
        "tipo": tipo,
        "periodicidad": p.periodicidad,
        "estado": estado,
        **meta,
        "total_percepciones": p.total_percepciones,
        "total_deducciones": p.total_deducciones,
        "total_neto": p.total_neto,
        "notas": p.notas,
        "created_by": p.created_by,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }


def listar_ejercicios(
    db: Session,
    empresa_id: Optional[int] = None,
    solo_cerrados: bool = False,
) -> List[dict]:
    """Ejercicios fiscales con resumen (año = YEAR(fecha_fin))."""
    ejercicio_col = extract("year", PeriodoNomina.fecha_fin).label("ejercicio")
    q = db.query(
        ejercicio_col,
        func.count(PeriodoNomina.id).label("total_periodos"),
        func.sum(PeriodoNomina.total_neto).label("total_neto"),
        func.sum(PeriodoNomina.total_percepciones).label("total_percepciones"),
        func.sum(PeriodoNomina.total_deducciones).label("total_deducciones"),
    )
    if empresa_id is not None:
        q = q.filter(PeriodoNomina.empresa_id == empresa_id)
    if solo_cerrados:
        q = q.filter(PeriodoNomina.estado == PeriodoEstado.PAGADA)
    else:
        q = q.filter(
            PeriodoNomina.estado.in_([PeriodoEstado.TIMBRADA, PeriodoEstado.PAGADA])
        )

    rows = (
        q.group_by(ejercicio_col)
        .order_by(ejercicio_col.desc())
        .all()
    )

    out: List[dict] = []
    for row in rows:
        ej = int(row.ejercicio)
        detalle_q = db.query(PeriodoNomina).filter(
            extract("year", PeriodoNomina.fecha_fin) == ej
        )
        if empresa_id is not None:
            detalle_q = detalle_q.filter(PeriodoNomina.empresa_id == empresa_id)
        periodos = detalle_q.all()
        pagados = sum(1 for p in periodos if p.estado == PeriodoEstado.PAGADA)
        timbrados = sum(1 for p in periodos if p.estado == PeriodoEstado.TIMBRADA)
        out.append({
            "ejercicio": ej,
            "total_periodos": int(row.total_periodos or 0),
            "periodos_pagados": pagados,
            "periodos_timbrados": timbrados,
            "total_neto": float(row.total_neto or 0),
            "total_percepciones": float(row.total_percepciones or 0),
            "total_deducciones": float(row.total_deducciones or 0),
        })
    return out


def listar_periodos_ejercicio(
    db: Session,
    ejercicio: int,
    empresa_id: Optional[int] = None,
    solo_cerrados: bool = False,
    skip: int = 0,
    limit: int = 100,
) -> Tuple[List[dict], int]:
    q = db.query(PeriodoNomina).filter(
        extract("year", PeriodoNomina.fecha_fin) == ejercicio
    )
    if empresa_id is not None:
        q = q.filter(PeriodoNomina.empresa_id == empresa_id)
    if solo_cerrados:
        q = q.filter(PeriodoNomina.estado == PeriodoEstado.PAGADA)
    else:
        q = q.filter(
            PeriodoNomina.estado.in_([PeriodoEstado.TIMBRADA, PeriodoEstado.PAGADA])
        )

    total = q.count()
    items = (
        q.order_by(PeriodoNomina.fecha_fin.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [periodo_a_dict(p) for p in items], total


def cerrar_periodo_historial(db: Session, periodo_id: int) -> dict:
    """
    Guarda el periodo en historial (estado pagada).
    Permitido desde calculada o timbrada.
    """
    periodo = db.query(PeriodoNomina).filter(PeriodoNomina.id == periodo_id).first()
    if not periodo:
        raise ValueError("Periodo no encontrado.")
    if periodo.estado == PeriodoEstado.PAGADA:
        return {
            "periodo_id": periodo_id,
            "estado": "pagada",
            "ejercicio_fiscal": ejercicio_fiscal_de_fecha(periodo.fecha_fin),
            "ya_cerrado": True,
            "mensaje": "El periodo ya estaba guardado en el historial.",
        }
    if periodo.estado not in (PeriodoEstado.CALCULADA, PeriodoEstado.TIMBRADA):
        raise ValueError(
            "Solo se puede guardar en historial un periodo calculado o timbrado."
        )
    if periodo.estado == PeriodoEstado.CALCULADA and not periodo.total_neto:
        raise ValueError("Calcule la nómina antes de guardar el periodo en historial.")

    periodo.estado = PeriodoEstado.PAGADA
    db.commit()
    db.refresh(periodo)
    ej = ejercicio_fiscal_de_fecha(periodo.fecha_fin)
    return {
        "periodo_id": periodo_id,
        "estado": "pagada",
        "ejercicio_fiscal": ej,
        "ya_cerrado": False,
        "mensaje": f"Periodo guardado en historial del ejercicio fiscal {ej}.",
    }
