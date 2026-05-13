"""
Cálculo de nómina solo para pruebas locales (Fase 2 experimental).

NO usar como referencia fiscal definitiva: tablas ISR y tasas IMSS son ilustrativas
del ejercicio 2025 y están simplificadas. Validar siempre con contador y tablas SAT vigentes.

Ver documentación en docstrings y en docs/MODULO-NOMINAS-PROPUESTA.md.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, List, Optional, Tuple

from sqlalchemy.orm import Session, joinedload

from app.modules.personal import models as personal_models
from app.modules.prestamos.models import EstadoSolicitudPrestamo, SolicitudPrestamo

from .models import (
    DetalleNominaEmpleado,
    EmpleadoNomina,
    PeriodoEstado,
    PeriodoNomina,
)

# ── Parámetros ilustrativos (ejercicio 2025, revisar ante SAT) ─────────────

UMA_DIARIA = Decimal("113.14")  # UMA 2025 (referencia común; confirmar por año)
TOPE_UMA_SBC = Decimal("25")  # tope 25 UMAs sobre salario diario para SBC

# Tabla ISR art. 96 — periodicidad quincenal 2025 (límites y cuotas SAT)
# Formato: (lim_inf, lim_sup, cuota_fija, tasa_marginal)
# Último tramo: lim_sup muy alto
_ISR_QUINCENAL_2025: Tuple[Tuple[Decimal, Decimal, Decimal, Decimal], ...] = (
    (Decimal("0.01"), Decimal("401.10"), Decimal("0"), Decimal("0.0192")),
    (Decimal("401.11"), Decimal("599.39"), Decimal("7.69"), Decimal("0.0640")),
    (Decimal("599.40"), Decimal("1289.82"), Decimal("20.38"), Decimal("0.1088")),
    (Decimal("1289.83"), Decimal("1923.95"), Decimal("95.52"), Decimal("0.1600")),
    (Decimal("1923.96"), Decimal("3627.85"), Decimal("196.90"), Decimal("0.2136")),
    (Decimal("3627.86"), Decimal("7275.57"), Decimal("560.38"), Decimal("0.2352")),
    (Decimal("7275.58"), Decimal("11551.67"), Decimal("1613.56"), Decimal("0.3000")),
    (Decimal("11551.68"), Decimal("23525.65"), Decimal("2396.16"), Decimal("0.3200")),
    (Decimal("23525.66"), Decimal("35288.92"), Decimal("6230.88"), Decimal("0.3400")),
    (Decimal("35288.93"), Decimal("9999999999"), Decimal("10269.34"), Decimal("0.3500")),
)

# Tasa única ilustrativa cuota obrera IMSS sobre base cotizada del periodo (pruebas)
_TASA_IMSS_OBRERO_ILUSTRATIVA = Decimal("0.03625")


def _q2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _isr_quincenal(sueldo_gravable: Decimal) -> Decimal:
    """ISR retenido quincenal por tablas 2025 (sin subsidio al empleo en esta versión)."""
    if sueldo_gravable <= 0:
        return Decimal("0")
    for lim_inf, lim_sup, cuota, tasa in _ISR_QUINCENAL_2025:
        if sueldo_gravable <= lim_sup:
            excedente = sueldo_gravable - lim_inf
            if excedente < 0:
                excedente = Decimal("0")
            return _q2(cuota + excedente * tasa)
    return Decimal("0")


def _dias_natural_periodo(fi: datetime, ff: datetime) -> int:
    di = fi.date() if hasattr(fi, "date") else fi
    df = ff.date() if hasattr(ff, "date") else ff
    return max(1, (df - di).days + 1)


def _sbc_diario(sdi: Optional[Decimal], salario_diario_nominal: Decimal) -> Decimal:
    """Salario base de cotización diario (simplificado: min(SDI, tope UMA))."""
    if sdi and sdi > 0:
        tope = UMA_DIARIA * TOPE_UMA_SBC
        return min(sdi, tope)
    return min(salario_diario_nominal, UMA_DIARIA * TOPE_UMA_SBC)


def _prestamo_quincena(db: Session, empleado_id: int) -> Decimal:
    total = Decimal("0")
    rows = (
        db.query(SolicitudPrestamo)
        .filter(
            SolicitudPrestamo.empleado_id == empleado_id,
            SolicitudPrestamo.estado == EstadoSolicitudPrestamo.DEPOSITADO,
            SolicitudPrestamo.descuento_quincenal.isnot(None),
        )
        .all()
    )
    for r in rows:
        if r.descuento_quincenal:
            total += Decimal(str(r.descuento_quincenal))
    return _q2(total)


def _json_lineas(lineas: List[dict]) -> str:
    def _d(obj: Any) -> Any:
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, dict):
            return {k: _d(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_d(x) for x in obj]
        return obj

    return json.dumps(_d(lineas), ensure_ascii=False)


def calcular_periodo_prueba(db: Session, periodo_id: int) -> dict:
    """
    Calcula percepciones y deducciones de prueba para todos los empleados activos
    de la empresa del periodo que tengan salario_base en empleado_nomina.

    - Solo periodos en estado borrador.
    - Periodicidad 04 (quincenal): escala por días naturales del periodo vs 15.
    - Otras periodicidades: aproxima con factor mensual 30.4 y días del periodo.
    """
    periodo = db.query(PeriodoNomina).filter(PeriodoNomina.id == periodo_id).first()
    if not periodo:
        raise ValueError("Periodo no encontrado.")
    if periodo.estado in (PeriodoEstado.TIMBRADA, PeriodoEstado.PAGADA):
        raise ValueError("No se puede recalcular un periodo timbrado o pagado.")

    per = (periodo.periodicidad or "04").strip()
    dias_nat = _dias_natural_periodo(periodo.fecha_inicio, periodo.fecha_fin)
    if per == "04":
        factor_dias_nomina = Decimal("15")
        dias_pagados = min(Decimal(str(dias_nat)), Decimal("15"))
    elif per == "05":
        factor_dias_nomina = Decimal("30.4")
        dias_pagados = min(Decimal(str(dias_nat)), Decimal("31"))
    else:
        factor_dias_nomina = Decimal("15")
        dias_pagados = min(Decimal(str(dias_nat)), Decimal("15"))

    empleados = (
        db.query(personal_models.Empleado)
        .options(joinedload(personal_models.Empleado.empresa))
        .filter(
            personal_models.Empleado.empresa_id == periodo.empresa_id,
            personal_models.Empleado.estado == personal_models.EstadoEmpleado.ACTIVO,
        )
        .all()
    )

    omitidos: List[dict] = []
    procesados = 0
    sum_perc = Decimal("0")
    sum_ded = Decimal("0")
    sum_neto = Decimal("0")

    for emp in empleados:
        nom = db.query(EmpleadoNomina).filter(EmpleadoNomina.empleado_id == emp.id).first()
        if not nom or nom.salario_base is None or Decimal(str(nom.salario_base)) <= 0:
            omitidos.append({"empleado_id": emp.id, "motivo": "sin salario_base en nómina"})
            continue

        salario_mensual = Decimal(str(nom.salario_base))
        salario_diario_nom = _q2(salario_mensual / Decimal("30.4"))
        sueldo = _q2(salario_mensual * (dias_pagados / factor_dias_nomina))

        percepciones: List[dict] = [
            {
                "clave": "001",
                "tipo": "percepcion",
                "concepto": "Sueldos, salarios y rayas gravados (prueba)",
                "importe_gravado": sueldo,
                "importe_exento": Decimal("0"),
            }
        ]
        gravado_total = sueldo
        exento_total = Decimal("0")

        isr = _isr_quincenal(gravado_total)

        sbc_d = _sbc_diario(
            Decimal(str(nom.salario_diario_integrado)) if nom.salario_diario_integrado else None,
            salario_diario_nom,
        )
        base_cot_periodo = sbc_d * dias_pagados
        imss = _q2(base_cot_periodo * _TASA_IMSS_OBRERO_ILUSTRATIVA)

        deducciones: List[dict] = [
            {
                "clave": "002",
                "tipo": "deduccion",
                "concepto": "ISR (tabla quincenal 2025 prueba)",
                "importe": isr,
            },
            {
                "clave": "021",
                "tipo": "deduccion",
                "concepto": "IMSS cuota obrera (tasa ilustrativa prueba)",
                "importe": imss,
            },
        ]
        total_ded = isr + imss

        if nom.descuento_infonavit and Decimal(str(nom.descuento_infonavit)) > 0:
            inf = _q2(Decimal(str(nom.descuento_infonavit)))
            deducciones.append(
                {
                    "clave": "010",
                    "tipo": "deduccion",
                    "concepto": "INFONAVIT (monto capturado)",
                    "importe": inf,
                }
            )
            total_ded += inf

        if nom.descuento_infonacot and Decimal(str(nom.descuento_infonacot)) > 0:
            fona = _q2(Decimal(str(nom.descuento_infonacot)))
            deducciones.append(
                {
                    "clave": "011",
                    "tipo": "deduccion",
                    "concepto": "INFONACOT (monto capturado)",
                    "importe": fona,
                }
            )
            total_ded += fona

        pres = _prestamo_quincena(db, emp.id)
        if pres > 0:
            deducciones.append(
                {
                    "clave": "004",
                    "tipo": "deduccion",
                    "concepto": "Préstamo (descuento quincenal)",
                    "importe": pres,
                }
            )
            total_ded += pres

        total_ded = _q2(total_ded)
        neto = _q2(gravado_total + exento_total - total_ded)

        det = (
            db.query(DetalleNominaEmpleado)
            .filter(
                DetalleNominaEmpleado.periodo_nomina_id == periodo.id,
                DetalleNominaEmpleado.empleado_id == emp.id,
            )
            .first()
        )
        if det is None:
            det = DetalleNominaEmpleado(periodo_nomina_id=periodo.id, empleado_id=emp.id)
            db.add(det)

        det.dias_pagados = dias_pagados
        det.dias_laborados = dias_pagados
        det.dias_descuento = Decimal("0")
        det.total_percepciones = gravado_total + exento_total
        det.total_gravado = gravado_total
        det.total_exento = exento_total
        det.total_deducciones = total_ded
        det.total_neto = neto
        det.subsidio_causado = Decimal("0")
        det.percepciones_json = _json_lineas(percepciones)
        det.deducciones_json = _json_lineas(deducciones)

        procesados += 1
        sum_perc += det.total_percepciones or Decimal("0")
        sum_ded += total_ded
        sum_neto += neto

    if procesados == 0:
        raise ValueError(
            "No se calculó ningún empleado: active la empresa del periodo y asigne salario_base "
            "en datos de nómina de cada colaborador."
        )

    periodo.total_percepciones = _q2(sum_perc)
    periodo.total_deducciones = _q2(sum_ded)
    periodo.total_neto = _q2(sum_neto)
    periodo.estado = PeriodoEstado.CALCULADA
    periodo.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(periodo)

    return {
        "periodo_id": periodo.id,
        "estado": periodo.estado.value,
        "empleados_procesados": procesados,
        "omitidos": omitidos,
        "totales": {
            "percepciones": float(periodo.total_percepciones or 0),
            "deducciones": float(periodo.total_deducciones or 0),
            "neto": float(periodo.total_neto or 0),
        },
        "advertencia": "Cálculo solo para pruebas locales. No sustituye dictamen fiscal.",
    }
