"""Validación de datos antes de timbrar nómina (FiscalAPI sandbox)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

from app.modules.personal.models import Empleado, Empresa
from app.modules.nomina.cfdi_builder import validar_datos_timbrado
from app.modules.nomina.fiscalapi_client import fiscalapi_status_publico
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


def validar_periodo_para_timbrado(db: Session, periodo_id: int) -> Dict[str, Any]:
    periodo = db.query(PeriodoNomina).filter(PeriodoNomina.id == periodo_id).first()
    if not periodo:
        raise ValueError("Periodo no encontrado.")

    fiscal = fiscalapi_status_publico()
    empresa = db.query(Empresa).filter(Empresa.id == periodo.empresa_id).first()
    cfg = (
        db.query(EmpresaNominaConfig)
        .filter(EmpresaNominaConfig.empresa_id == periodo.empresa_id)
        .first()
    )

    errores_empresa: List[str] = []
    if not empresa:
        errores_empresa.append("Empresa no encontrada.")
    else:
        if not (empresa.rfc or "").strip():
            errores_empresa.append("Falta RFC de la empresa (Configuración → Empresa).")
        cp_exp = (cfg.codigo_postal_expedicion if cfg else None) or empresa.codigo_postal
        if not cp_exp:
            errores_empresa.append(
                "Falta CP de expedición CFDI (Configuración → Nómina / Timbrado o CP fiscal de la empresa)."
            )
        if not cfg or not (cfg.registro_patronal or "").strip():
            errores_empresa.append("Falta registro patronal IMSS (Configuración → Nómina / Timbrado).")

    if not fiscal["habilitado"]:
        errores_empresa.append(
            "FiscalAPI no está habilitado (NOMINA_FISCALAPI_ENABLED + API key + tenant en .env)."
        )

    periodo_ok = periodo.estado in (PeriodoEstado.CALCULADA, PeriodoEstado.TIMBRADA)
    if not periodo_ok:
        errores_empresa.append(
            f"El periodo debe estar calculado (estado actual: {periodo.estado.value})."
        )

    detalles = (
        db.query(DetalleNominaEmpleado)
        .options(joinedload(DetalleNominaEmpleado.empleado))
        .filter(DetalleNominaEmpleado.periodo_nomina_id == periodo_id)
        .order_by(DetalleNominaEmpleado.empleado_id)
        .all()
    )
    if not detalles:
        errores_empresa.append("No hay empleados en el detalle. Calcule el periodo primero.")

    empleados: List[dict] = []
    listos = 0
    con_errores = 0
    ya_timbrados = 0

    nom_map: Dict[int, EmpleadoNomina] = {
        n.empleado_id: n
        for n in db.query(EmpleadoNomina)
        .filter(EmpleadoNomina.empleado_id.in_([d.empleado_id for d in detalles]))
        .all()
    } if detalles else {}

    for det in detalles:
        emp = det.empleado
        if not emp:
            empleados.append({
                "empleado_id": det.empleado_id,
                "nombre": f"#{det.empleado_id}",
                "listo": False,
                "ya_timbrado": bool(det.cfdi_uuid and not det.cfdi_error),
                "errores": ["Empleado no encontrado en el sistema."],
            })
            con_errores += 1
            continue

        nom = nom_map.get(det.empleado_id)
        errores = list(validar_datos_timbrado(empresa, emp, nom, det, cfg)) if empresa else []
        ya = bool(det.cfdi_uuid and not det.cfdi_error)
        if ya:
            ya_timbrados += 1
        elif not errores:
            listos += 1
        else:
            con_errores += 1

        empleados.append({
            "empleado_id": det.empleado_id,
            "nombre": _nombre_empleado(emp),
            "listo": not errores and not ya,
            "ya_timbrado": ya,
            "cfdi_uuid": det.cfdi_uuid,
            "cfdi_error": det.cfdi_error,
            "errores": errores,
        })

    puede_timbrar = (
        fiscal["habilitado"]
        and periodo_ok
        and bool(detalles)
        and not errores_empresa
        and (listos > 0 or ya_timbrados > 0)
    )

    return {
        "periodo_id": periodo_id,
        "empresa_id": periodo.empresa_id,
        "estado_periodo": periodo.estado.value,
        "fiscalapi": fiscal,
        "errores_empresa": errores_empresa,
        "resumen": {
            "total": len(empleados),
            "listos": listos,
            "con_errores": con_errores,
            "ya_timbrados": ya_timbrados,
        },
        "puede_timbrar": puede_timbrar and listos > 0,
        "empleados": empleados,
    }
