"""Timbrado de nómina vía FiscalAPI (sandbox / pruebas)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

from app.modules.personal.models import Empleado, Empresa
from app.modules.nomina.models import (
    DetalleNominaEmpleado,
    EmpleadoNomina,
    EmpresaNominaConfig,
    PeriodoEstado,
    PeriodoNomina,
)
from app.modules.nomina.cfdi_builder import build_payroll_invoice
from app.modules.nomina.fiscalapi_client import (
    assert_fiscalapi_timbrado_permitido,
    fiscalapi_es_sandbox,
    get_fiscalapi_client,
)


def _extraer_uuid(invoice_data: Any) -> Optional[str]:
    if invoice_data is None:
        return None
    uid = getattr(invoice_data, "uuid", None)
    if uid:
        return str(uid)
    responses = getattr(invoice_data, "responses", None) or []
    for r in responses:
        iu = getattr(r, "invoice_uuid", None)
        if iu:
            return str(iu)
    return getattr(invoice_data, "id", None)


def timbrar_detalle_empleado(
    db: Session,
    periodo_id: int,
    empleado_id: int,
) -> Dict[str, Any]:
    assert_fiscalapi_timbrado_permitido()

    periodo = db.query(PeriodoNomina).filter(PeriodoNomina.id == periodo_id).first()
    if not periodo:
        raise ValueError("Periodo no encontrado.")
    if periodo.estado not in (PeriodoEstado.CALCULADA, PeriodoEstado.TIMBRADA):
        raise ValueError("Solo se puede timbrar un periodo en estado calculada.")

    det = (
        db.query(DetalleNominaEmpleado)
        .filter(
            DetalleNominaEmpleado.periodo_nomina_id == periodo_id,
            DetalleNominaEmpleado.empleado_id == empleado_id,
        )
        .first()
    )
    if not det:
        raise ValueError("El empleado no tiene detalle en este periodo. Calcule primero.")

    if det.cfdi_uuid and not det.cfdi_error:
        return {
            "empleado_id": empleado_id,
            "ok": True,
            "ya_timbrado": True,
            "cfdi_uuid": det.cfdi_uuid,
            "mensaje": "Recibo ya timbrado previamente.",
        }

    empresa = (
        db.query(Empresa)
        .filter(Empresa.id == periodo.empresa_id)
        .first()
    )
    emp = (
        db.query(Empleado)
        .options(
            joinedload(Empleado.departamento_rel),
            joinedload(Empleado.puesto_rel),
        )
        .filter(Empleado.id == empleado_id)
        .first()
    )
    nom = db.query(EmpleadoNomina).filter(EmpleadoNomina.empleado_id == empleado_id).first()
    cfg = (
        db.query(EmpresaNominaConfig)
        .filter(EmpresaNominaConfig.empresa_id == periodo.empresa_id)
        .first()
    )

    if not empresa or not emp:
        raise ValueError("Empresa o empleado no encontrado.")

    invoice = build_payroll_invoice(periodo, det, empresa, emp, nom, cfg)
    client = get_fiscalapi_client()
    resp = client.invoices.create(invoice)

    if not resp.succeeded or not resp.data:
        det.cfdi_error = f"{resp.message or 'Error FiscalAPI'}: {resp.details or ''}"[:2000]
        db.commit()
        raise ValueError(det.cfdi_error)

    inv = resp.data
    uuid = _extraer_uuid(inv)
    invoice_id = getattr(inv, "id", None)

    det.cfdi_uuid = uuid
    det.cfdi_error = None
    if invoice_id:
        from app.core.config import settings as app_settings
        base = (app_settings.FISCALAPI_API_URL or "https://test.fiscalapi.com").rstrip("/")
        det.cfdi_xml_url = f"{base}/portal/invoices/{invoice_id}"
    det.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(det)

    return {
        "empleado_id": empleado_id,
        "ok": True,
        "cfdi_uuid": uuid,
        "fiscalapi_invoice_id": invoice_id,
        "sandbox": fiscalapi_es_sandbox(),
    }


def timbrar_periodo(
    db: Session,
    periodo_id: int,
) -> Dict[str, Any]:
    assert_fiscalapi_timbrado_permitido()

    periodo = db.query(PeriodoNomina).filter(PeriodoNomina.id == periodo_id).first()
    if not periodo:
        raise ValueError("Periodo no encontrado.")
    if periodo.estado != PeriodoEstado.CALCULADA:
        raise ValueError("El periodo debe estar en estado calculada para timbrar.")

    detalles = (
        db.query(DetalleNominaEmpleado)
        .filter(DetalleNominaEmpleado.periodo_nomina_id == periodo_id)
        .order_by(DetalleNominaEmpleado.empleado_id)
        .all()
    )
    if not detalles:
        raise ValueError("No hay detalle de empleados. Calcule el periodo primero.")

    exitos: List[dict] = []
    fallos: List[dict] = []

    for det in detalles:
        try:
            r = timbrar_detalle_empleado(db, periodo_id, det.empleado_id)
            exitos.append(r)
        except ValueError as e:
            fallos.append({"empleado_id": det.empleado_id, "error": str(e)})

    periodo = db.query(PeriodoNomina).filter(PeriodoNomina.id == periodo_id).first()
    if fallos and not exitos:
        raise ValueError(
            f"No se timbró ningún recibo. Primer error: {fallos[0]['error']}"
        )

    if not fallos and exitos:
        periodo.estado = PeriodoEstado.TIMBRADA
        periodo.updated_at = datetime.now(timezone.utc)
        db.commit()

    return {
        "periodo_id": periodo_id,
        "estado": periodo.estado.value if hasattr(periodo.estado, "value") else str(periodo.estado),
        "timbrados": len(exitos),
        "fallidos": len(fallos),
        "exitos": exitos,
        "fallos": fallos,
        "sandbox": fiscalapi_es_sandbox(),
    }
