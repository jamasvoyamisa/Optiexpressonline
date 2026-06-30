"""
Motor de cálculo de nómina v1.

- Días pagados desde asistencia (checadas) o calendario de la empresa; override manual en detalle.
- Sueldo del periodo: salario mensual × (días pagados / días base mes), p. ej. 30.4.
- ISR quincenal + subsidio al empleo (tablas por ejercicio).
- IMSS cuota obrera por ramos (parametrizable).
- INFONAVIT/INFONACOT y préstamos depositados.

Validar tablas y tasas con contador antes de timbrado fiscal.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.modules.personal import models as personal_models
from app.modules.personal.models import Empresa
from app.modules.prestamos.models import EstadoSolicitudPrestamo, SolicitudPrestamo

from .dias_periodo import resolver_dias_pagados
from .fiscal_parametros import ParametrosFiscales, get_parametros_fiscales
from .models import (
    DetalleNominaEmpleado,
    EmpleadoNomina,
    PeriodoEstado,
    PeriodoNomina,
)

CALCULO_VERSION = 1


def _q2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _periodicidad_clave(per: str) -> str:
    p = (per or "04").strip()
    if p == "04":
        return "quincenal"
    if p == "05":
        return "mensual"
    if p == "02":
        return "semanal"
    return "quincenal"


def _sueldo_periodo(
    salario_mensual: Decimal, dias_pagados: Decimal, dias_base_mes: Decimal
) -> Decimal:
    """Prorrateo mensual → periodo: salario_mensual × (días pagados / días del mes)."""
    if dias_base_mes <= 0:
        return Decimal("0")
    return _q2(salario_mensual * (dias_pagados / dias_base_mes))


def _isr_tabla(
    sueldo_gravable: Decimal, tabla: Tuple[Tuple[Decimal, Decimal, Decimal, Decimal], ...]
) -> Decimal:
    if sueldo_gravable <= 0:
        return Decimal("0")
    for lim_inf, lim_sup, cuota, tasa in tabla:
        if sueldo_gravable <= lim_sup:
            excedente = max(sueldo_gravable - lim_inf, Decimal("0"))
            return _q2(cuota + excedente * tasa)
    return Decimal("0")


def _subsidio_tabla(
    sueldo_gravable: Decimal, tabla: Tuple[Tuple[Decimal, Decimal, Decimal], ...]
) -> Decimal:
    if sueldo_gravable <= 0:
        return Decimal("0")
    for lim_inf, lim_sup, subsidio in tabla:
        if sueldo_gravable <= lim_sup:
            return subsidio
    return Decimal("0")


def _isr_con_subsidio(
    sueldo_gravable: Decimal, params: ParametrosFiscales
) -> Tuple[Decimal, Decimal]:
    """Retorna (isr_retenido, subsidio_causado)."""
    isr = _isr_tabla(sueldo_gravable, params.isr_quincenal)
    subsidio = _subsidio_tabla(sueldo_gravable, params.subsidio_quincenal)
    if subsidio > isr:
        return Decimal("0"), _q2(subsidio)
    return _q2(isr - subsidio), _q2(subsidio)


def _imss_obrero(base_cot_periodo: Decimal, params: ParametrosFiscales) -> Decimal:
    tasa = sum(params.imss_obrero.values())
    return _q2(base_cot_periodo * tasa)


def _sbc_diario(
    sdi: Optional[Decimal],
    salario_diario_nominal: Decimal,
    params: ParametrosFiscales,
) -> Decimal:
    tope = params.uma_diaria * Decimal(str(params.tope_uma_sbc))
    if sdi and sdi > 0:
        return min(sdi, tope)
    return min(salario_diario_nominal, tope)


def _prestamo_periodo(db: Session, empleado_id: int) -> Decimal:
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


def _fecha_periodo(dt: datetime):
    return dt.date() if hasattr(dt, "date") else dt


def calcular_periodo_nomina(db: Session, periodo_id: int) -> dict:
    periodo = db.query(PeriodoNomina).filter(PeriodoNomina.id == periodo_id).first()
    if not periodo:
        raise ValueError("Periodo no encontrado.")
    if periodo.estado in (PeriodoEstado.TIMBRADA, PeriodoEstado.PAGADA):
        raise ValueError("No se puede recalcular un periodo timbrado o pagado.")

    empresa = db.query(Empresa).filter(Empresa.id == periodo.empresa_id).first()
    if not empresa:
        raise ValueError("Empresa del periodo no encontrada.")

    fi = _fecha_periodo(periodo.fecha_inicio)
    ff = _fecha_periodo(periodo.fecha_fin)
    ejercicio = ff.year
    params = get_parametros_fiscales(db, ejercicio)
    per_sat = (periodo.periodicidad or "04").strip()
    periodicidad = _periodicidad_clave(per_sat)

    empleados = (
        db.query(personal_models.Empleado)
        .filter(
            personal_models.Empleado.empresa_id == periodo.empresa_id,
            personal_models.Empleado.estado == personal_models.EstadoEmpleado.ACTIVO,
        )
        .all()
    )

    omitidos: List[dict] = []
    advertencias: List[str] = []
    procesados = 0
    sum_perc = Decimal("0")
    sum_ded = Decimal("0")
    sum_neto = Decimal("0")

    for emp in empleados:
        nom = db.query(EmpleadoNomina).filter(EmpleadoNomina.empleado_id == emp.id).first()
        if not nom or nom.salario_base is None or Decimal(str(nom.salario_base)) <= 0:
            omitidos.append({"empleado_id": emp.id, "motivo": "sin salario_base en nómina"})
            continue

        det_previo = (
            db.query(DetalleNominaEmpleado)
            .filter(
                DetalleNominaEmpleado.periodo_nomina_id == periodo.id,
                DetalleNominaEmpleado.empleado_id == emp.id,
            )
            .first()
        )
        override = None
        if det_previo and det_previo.dias_pagados_override is not None:
            override = det_previo.dias_pagados_override

        dias_laborados, dias_pagados, dias_fuente = resolver_dias_pagados(
            db,
            emp.id,
            fi,
            ff,
            empresa,
            override,
            periodicidad,
        )
        if dias_fuente == "calendario":
            advertencias.append(
                f"Empleado #{emp.id}: sin checadas; días por calendario ({dias_pagados})."
            )

        salario_mensual = Decimal(str(nom.salario_base))
        salario_diario_nom = _q2(salario_mensual / params.dias_base_mes)
        sueldo = _sueldo_periodo(salario_mensual, dias_pagados, params.dias_base_mes)

        percepciones: List[dict] = [
            {
                "clave": "001",
                "tipo": "percepcion",
                "concepto": "Sueldos, salarios y rayas gravados",
                "importe_gravado": sueldo,
                "importe_exento": Decimal("0"),
            }
        ]
        gravado_total = sueldo
        exento_total = Decimal("0")

        isr, subsidio = _isr_con_subsidio(gravado_total, params)

        sbc_d = _sbc_diario(
            Decimal(str(nom.salario_diario_integrado))
            if nom.salario_diario_integrado
            else None,
            salario_diario_nom,
            params,
        )
        base_cot_periodo = sbc_d * dias_pagados
        imss = _imss_obrero(base_cot_periodo, params)

        deducciones: List[dict] = [
            {
                "clave": "002",
                "tipo": "deduccion",
                "concepto": f"ISR ({ejercicio}, {periodicidad})",
                "importe": isr,
            },
            {
                "clave": "021",
                "tipo": "deduccion",
                "concepto": "IMSS cuota obrera",
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

        pres = _prestamo_periodo(db, emp.id)
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

        det = det_previo
        if det is None:
            det = DetalleNominaEmpleado(periodo_nomina_id=periodo.id, empleado_id=emp.id)
            db.add(det)

        det.dias_pagados = dias_pagados
        det.dias_laborados = dias_laborados
        det.dias_descuento = Decimal("0")
        det.dias_fuente = dias_fuente
        det.calculo_version = CALCULO_VERSION
        det.total_percepciones = gravado_total + exento_total
        det.total_gravado = gravado_total
        det.total_exento = exento_total
        det.total_deducciones = total_ded
        det.total_neto = neto
        det.subsidio_causado = subsidio
        det.percepciones_json = _json_lineas(percepciones)
        det.deducciones_json = _json_lineas(deducciones)

        procesados += 1
        sum_perc += det.total_percepciones or Decimal("0")
        sum_ded += total_ded
        sum_neto += neto

    if procesados == 0:
        raise ValueError(
            "No se calculó ningún empleado: asigne salario_base en datos de nómina "
            "de cada colaborador activo."
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
        "advertencias": advertencias[:50],
        "ejercicio_fiscal": ejercicio,
        "calculo_version": CALCULO_VERSION,
        "totales": {
            "percepciones": float(periodo.total_percepciones or 0),
            "deducciones": float(periodo.total_deducciones or 0),
            "neto": float(periodo.total_neto or 0),
        },
    }
