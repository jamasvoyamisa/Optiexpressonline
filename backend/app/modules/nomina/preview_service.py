"""Previsualización de recibos de nómina antes del timbrado."""
from __future__ import annotations

import json
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

from app.modules.personal.models import Empleado, Empresa
from app.modules.nomina.cfdi_builder import build_payroll_invoice, validar_datos_timbrado
from app.modules.nomina.nomina_areas import (
    departamento_de_empleado,
    cargar_detalles_periodo,
    filtrar_detalles_area,
    listar_areas_periodo,
)
from app.modules.nomina.models import (
    DetalleNominaEmpleado,
    EmpleadoNomina,
    EmpresaNominaConfig,
    PeriodoEstado,
    PeriodoNomina,
)


def _nombre_empleado(emp: Empleado) -> str:
    parts = [emp.nombre or "", emp.apellido_paterno or "", emp.apellido_materno or ""]
    return " ".join(p.strip() for p in parts if p and p.strip())


def _parse_lineas(json_str: Optional[str]) -> List[dict]:
    if not json_str:
        return []
    try:
        data = json.loads(json_str)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _dec(v: Any) -> Optional[float]:
    if v is None:
        return None
    return float(Decimal(str(v)))


def _sanitize_cfdi_preview(invoice: Any) -> dict:
    """Resumen del CFDI sin credenciales ni datos sensibles."""
    raw = invoice.model_dump(mode="json")
    issuer = raw.get("issuer") or {}
    if isinstance(issuer, dict) and issuer.get("tax_credentials"):
        issuer = {**issuer, "tax_credentials": "[CSD configurado]"}
        raw["issuer"] = issuer
    recipient = raw.get("recipient") or {}
    payroll = ((raw.get("complement") or {}).get("payroll") or {})
    return {
        "tipo_cfdi": raw.get("type_code"),
        "version": raw.get("version_code"),
        "serie": raw.get("series"),
        "cp_expedicion": raw.get("expedition_zip_code"),
        "emisor": {
            "rfc": issuer.get("tin"),
            "nombre": issuer.get("legal_name"),
            "regimen": issuer.get("tax_regime_code"),
            "registro_patronal": (issuer.get("employer_data") or {}).get("employer_registration"),
        },
        "receptor": {
            "rfc": recipient.get("tin"),
            "nombre": recipient.get("legal_name"),
            "cp": recipient.get("zip_code"),
            "curp": (recipient.get("employee_data") or {}).get("curp"),
            "nss": (recipient.get("employee_data") or {}).get("social_security_number"),
            "puesto": (recipient.get("employee_data") or {}).get("position"),
            "departamento": (recipient.get("employee_data") or {}).get("department"),
        },
        "nomina": {
            "tipo": payroll.get("payroll_type_code"),
            "fecha_pago": payroll.get("payment_date"),
            "fecha_inicio": payroll.get("initial_payment_date"),
            "fecha_fin": payroll.get("final_payment_date"),
            "dias_pagados": payroll.get("days_paid"),
            "percepciones": [
                {
                    "clave": e.get("earning_type_code"),
                    "concepto": e.get("concept"),
                    "gravado": e.get("taxed_amount"),
                    "exento": e.get("exempt_amount"),
                }
                for e in ((payroll.get("earnings") or {}).get("earnings") or [])
            ],
            "deducciones": [
                {
                    "clave": d.get("deduction_type_code"),
                    "concepto": d.get("concept"),
                    "importe": d.get("amount"),
                }
                for d in (payroll.get("deductions") or [])
            ],
            "otros_pagos": [
                {
                    "clave": o.get("other_payment_type_code"),
                    "concepto": o.get("concept"),
                    "subsidio_causado": o.get("subsidy_caused"),
                }
                for o in ((payroll.get("earnings") or {}).get("other_payments") or [])
            ],
        },
    }


def preview_periodo(
    db: Session,
    periodo_id: int,
    departamento_id: Optional[int] = None,
) -> Dict[str, Any]:
    periodo = db.query(PeriodoNomina).filter(PeriodoNomina.id == periodo_id).first()
    if not periodo:
        raise ValueError("Periodo no encontrado.")
    if periodo.estado not in (
        PeriodoEstado.CALCULADA,
        PeriodoEstado.TIMBRADA,
        PeriodoEstado.PAGADA,
    ):
        raise ValueError(
            "Solo se puede previsualizar un periodo calculado. Calcule la nómina primero."
        )

    areas_disponibles = listar_areas_periodo(db, periodo_id)
    if not areas_disponibles:
        raise ValueError("No hay recibos calculados. Ejecute «Calcular nómina» primero.")

    if departamento_id is None:
        departamento_id = areas_disponibles[0]["departamento_id"]

    area_sel = next(
        (a for a in areas_disponibles if a["departamento_id"] == departamento_id),
        None,
    )
    if area_sel is None:
        raise ValueError("El área seleccionada no tiene recibos en este periodo.")

    empresa = db.query(Empresa).filter(Empresa.id == periodo.empresa_id).first()
    cfg = (
        db.query(EmpresaNominaConfig)
        .filter(EmpresaNominaConfig.empresa_id == periodo.empresa_id)
        .first()
    )

    _, todos_detalles = cargar_detalles_periodo(db, periodo_id)
    detalles = filtrar_detalles_area(todos_detalles, departamento_id)
    if not detalles:
        raise ValueError("No hay recibos para el área indicada.")

    nom_map: Dict[int, EmpleadoNomina] = {
        n.empleado_id: n
        for n in db.query(EmpleadoNomina)
        .filter(EmpleadoNomina.empleado_id.in_([d.empleado_id for d in detalles]))
        .all()
    }

    empleados_out: List[dict] = []
    listos = 0
    sum_perc = Decimal("0")
    sum_ded = Decimal("0")
    sum_neto = Decimal("0")

    for det in detalles:
        emp = det.empleado
        dep_id, dep_nombre = departamento_de_empleado(emp)
        nom = nom_map.get(det.empleado_id)
        errores: List[str] = []
        cfdi_resumen = None

        if det.total_percepciones is not None:
            sum_perc += Decimal(str(det.total_percepciones))
        if det.total_deducciones is not None:
            sum_ded += Decimal(str(det.total_deducciones))
        if det.total_neto is not None:
            sum_neto += Decimal(str(det.total_neto))

        if empresa and emp:
            errores = list(validar_datos_timbrado(empresa, emp, nom, det, cfg))
            if not errores:
                try:
                    emp_full = (
                        db.query(Empleado)
                        .options(
                            joinedload(Empleado.departamento_rel),
                            joinedload(Empleado.puesto_rel),
                        )
                        .filter(Empleado.id == det.empleado_id)
                        .first()
                    )
                    if emp_full and nom:
                        invoice = build_payroll_invoice(
                            periodo, det, empresa, emp_full, nom, cfg
                        )
                        cfdi_resumen = _sanitize_cfdi_preview(invoice)
                        listos += 1
                except ValueError as e:
                    errores = [str(e)]
        elif not emp:
            errores = ["Empleado no encontrado."]

        empleados_out.append({
            "empleado_id": det.empleado_id,
            "nombre": _nombre_empleado(emp) if emp else f"#{det.empleado_id}",
            "numero_empleado": emp.numero_empleado if emp else None,
            "departamento_id": dep_id,
            "departamento_nombre": dep_nombre,
            "dias_laborados": _dec(det.dias_laborados),
            "dias_pagados": _dec(det.dias_pagados),
            "dias_fuente": det.dias_fuente,
            "total_percepciones": _dec(det.total_percepciones),
            "total_gravado": _dec(det.total_gravado),
            "total_exento": _dec(det.total_exento),
            "total_deducciones": _dec(det.total_deducciones),
            "total_neto": _dec(det.total_neto),
            "subsidio_causado": _dec(det.subsidio_causado),
            "percepciones": _parse_lineas(det.percepciones_json),
            "deducciones": _parse_lineas(det.deducciones_json),
            "cfdi_uuid": det.cfdi_uuid,
            "cfdi_error": det.cfdi_error,
            "ya_timbrado": bool(det.cfdi_uuid and not det.cfdi_error),
            "listo_timbrado": not errores and cfdi_resumen is not None,
            "errores_timbrado": errores,
            "cfdi_resumen": cfdi_resumen,
        })

    fi = periodo.fecha_inicio
    ff = periodo.fecha_fin

    return {
        "periodo_id": periodo_id,
        "empresa_id": periodo.empresa_id,
        "empresa_nombre": empresa.nombre if empresa else None,
        "departamento_id": departamento_id,
        "departamento_nombre": area_sel["departamento_nombre"],
        "areas_disponibles": areas_disponibles,
        "fecha_inicio": fi.isoformat() if hasattr(fi, "isoformat") else str(fi),
        "fecha_fin": ff.isoformat() if hasattr(ff, "isoformat") else str(ff),
        "tipo": periodo.tipo.value if hasattr(periodo.tipo, "value") else str(periodo.tipo),
        "periodicidad": periodo.periodicidad,
        "estado": periodo.estado.value if hasattr(periodo.estado, "value") else str(periodo.estado),
        "totales": {
            "percepciones": _dec(sum_perc),
            "deducciones": _dec(sum_ded),
            "neto": _dec(sum_neto),
        },
        "resumen": {
            "empleados": len(empleados_out),
            "listos_timbrado": listos,
            "con_advertencias": sum(1 for e in empleados_out if e["errores_timbrado"]),
            "ya_timbrados": sum(1 for e in empleados_out if e["ya_timbrado"]),
        },
        "empleados": empleados_out,
    }
