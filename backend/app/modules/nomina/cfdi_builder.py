"""Arma Invoice tipo N (nómina) para FiscalAPI desde datos Optiexpress."""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, List, Optional, Tuple

from app.core.config import settings
from app.core.timezone_utils import to_mexico
from app.modules.nomina.models import (
    DetalleNominaEmpleado,
    EmpleadoNomina,
    PeriodoNomina,
)
from app.modules.personal.models import Empleado, Empresa
from app.modules.nomina.models import EmpresaNominaConfig

# c_Estado complemento nómina (3 letras) desde claves internas de 2 letras
_ENTIDAD_NOMINA_SAT: dict[str, str] = {
    "AS": "AGU", "BC": "BCN", "BS": "BCS", "CC": "CAM", "CL": "COA", "CM": "COL",
    "CS": "CHP", "CH": "CHH", "DF": "CMX", "DG": "DUR", "GT": "GUA", "GR": "GRO",
    "HG": "HID", "JC": "JAL", "MC": "MEX", "MN": "MIC", "MS": "MOR", "NT": "NAY",
    "NL": "NLE", "OC": "OAX", "PL": "PUE", "QT": "QUE", "QR": "ROO", "SP": "SLP",
    "SL": "SIN", "SR": "SON", "TC": "TAB", "TS": "TAM", "TL": "TLA", "VZ": "VER",
    "YN": "YUC", "ZS": "ZAC",
}

# Claves de deducción internas → c_TipoDeduccion SAT para timbrado
_DEDUCCION_SAT: dict[str, str] = {
    "002": "002",  # ISR
    "001": "001",  # Seguridad social
    "021": "001",  # IMSS cuota obrera → Seguridad social
    "010": "010",  # INFONAVIT
    "011": "011",  # INFONACOT / crédito
    "004": "004",  # Otros / préstamos
}


def _q2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"))


def _nombre_empleado(emp: Empleado) -> str:
    parts = [emp.nombre or "", emp.apellido_paterno or "", emp.apellido_materno or ""]
    return " ".join(p.strip() for p in parts if p and p.strip()).upper()


def _fecha_iso(d: date | datetime) -> str:
    if isinstance(d, datetime):
        d = to_mexico(d).date() if d.tzinfo else d.date()
    return f"{d.isoformat()}T12:00:00"


def calcular_antiguedad_sat(fecha_ingreso: Optional[datetime], ref: date) -> str:
    if not fecha_ingreso:
        return "P0W"
    fi = fecha_ingreso.date() if isinstance(fecha_ingreso, datetime) else fecha_ingreso
    if fi > ref:
        return "P0W"
    semanas = max((ref - fi).days // 7, 0)
    return f"P{semanas}W"


def _entidad_sat(clave: Optional[str]) -> Optional[str]:
    if not clave:
        return None
    k = clave.strip().upper()
    if len(k) == 3:
        return k
    return _ENTIDAD_NOMINA_SAT.get(k, k)


def _parse_lineas(json_str: Optional[str]) -> List[dict]:
    if not json_str:
        return []
    try:
        data = json.loads(json_str)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _map_deduccion_clave(clave: str) -> str:
    c = (clave or "004").strip()
    return _DEDUCCION_SAT.get(c, c)


def validar_datos_timbrado(
    empresa: Empresa,
    emp: Empleado,
    nom: EmpleadoNomina,
    det: DetalleNominaEmpleado,
    cfg: Optional[EmpresaNominaConfig],
) -> List[str]:
    errores: List[str] = []
    if not empresa.rfc:
        errores.append(f"Empresa #{empresa.id}: falta RFC.")
    if not (emp.rfc or "").strip():
        errores.append(f"Empleado #{emp.id}: falta RFC.")
    if not (emp.curp or "").strip():
        errores.append(f"Empleado #{emp.id}: falta CURP.")
    if not (emp.cp or "").strip():
        errores.append(f"Empleado #{emp.id}: falta código postal (cp).")
    if not nom or nom.salario_base is None:
        errores.append(f"Empleado #{emp.id}: falta salario_base en nómina.")
    if not det.percepciones_json:
        errores.append(f"Empleado #{emp.id}: sin percepciones (calcule el periodo).")
    cp_exp = (cfg.codigo_postal_expedicion if cfg else None) or empresa.codigo_postal
    if not cp_exp:
        errores.append(f"Empresa #{empresa.id}: falta CP de expedición (config nómina o empresa).")
    reg_pat = cfg.registro_patronal if cfg else None
    if not reg_pat:
        errores.append(f"Empresa #{empresa.id}: falta registro patronal IMSS.")
    return errores


def fiscalapi_requiere_csd() -> bool:
    """Modo valores: CSD en cada request si no hay emisor registrado en FiscalAPI."""
    return True


def _tiene_csd_configurado() -> bool:
    return bool(
        settings.FISCALAPI_CSD_CER_BASE64
        and settings.FISCALAPI_CSD_KEY_BASE64
        and settings.FISCALAPI_CSD_PASSWORD
    )


def build_payroll_invoice(
    periodo: PeriodoNomina,
    det: DetalleNominaEmpleado,
    empresa: Empresa,
    emp: Empleado,
    nom: EmpleadoNomina,
    cfg: Optional[EmpresaNominaConfig],
    *,
    series: str = "NOM",
) -> Any:
    """
    Construye fiscalapi.models.fiscalapi_models.Invoice listo para timbrar.
    """
    from fiscalapi.models.fiscalapi_models import (
        Invoice,
        InvoiceComplement,
        InvoiceIssuer,
        InvoiceIssuerEmployerData,
        InvoiceRecipient,
        InvoiceRecipientEmployeeData,
        PayrollComplement,
        PayrollDeduction,
        PayrollEarning,
        PayrollEarningsComplement,
        PayrollOtherPayment,
        TaxCredential,
    )

    errores = validar_datos_timbrado(empresa, emp, nom, det, cfg)
    if errores:
        raise ValueError("; ".join(errores))

    fi = periodo.fecha_inicio
    ff = periodo.fecha_fin
    fi_d = fi.date() if isinstance(fi, datetime) else fi
    ff_d = ff.date() if isinstance(ff, datetime) else ff

    cp_exp = (cfg.codigo_postal_expedicion if cfg else None) or empresa.codigo_postal or ""
    regimen_emisor = (
        (cfg.regimen_fiscal_sat if cfg else None)
        or empresa.regimen_fiscal
        or "601"
    )
    if len(str(regimen_emisor)) == 3:
        regimen_emisor = str(regimen_emisor).zfill(3)

    percepciones_raw = _parse_lineas(det.percepciones_json)
    deducciones_raw = _parse_lineas(det.deducciones_json)

    earnings: List[PayrollEarning] = []
    for i, p in enumerate(percepciones_raw, start=1):
        grav = Decimal(str(p.get("importe_gravado") or p.get("importe") or 0))
        exento = Decimal(str(p.get("importe_exento") or 0))
        clave = str(p.get("clave") or "001")
        earnings.append(
            PayrollEarning(
                earning_type_code=clave,
                code=f"P{i:04d}",
                concept=str(p.get("concepto") or "Percepción")[:100],
                taxed_amount=_q2(grav),
                exempt_amount=_q2(exento),
            )
        )

    deductions: List[PayrollDeduction] = []
    for i, d in enumerate(deducciones_raw, start=1):
        monto = Decimal(str(d.get("importe") or 0))
        if monto <= 0:
            continue
        clave_int = str(d.get("clave") or "004")
        deductions.append(
            PayrollDeduction(
                deduction_type_code=_map_deduccion_clave(clave_int),
                code=f"D{i:04d}",
                concept=str(d.get("concepto") or "Deducción")[:100],
                amount=_q2(monto),
            )
        )

    other_payments: List[PayrollOtherPayment] = []
    subsidio = Decimal(str(det.subsidio_causado or 0))
    if subsidio > 0:
        other_payments.append(
            PayrollOtherPayment(
                other_payment_type_code="002",
                code="SUB01",
                concept="Subsidio al empleo",
                amount=Decimal("0"),
                subsidy_caused=_q2(subsidio),
            )
        )

    dept_nombre = ""
    if emp.departamento_rel:
        dept_nombre = emp.departamento_rel.nombre or ""
    puesto_nombre = ""
    if emp.puesto_rel:
        puesto_nombre = emp.puesto_rel.nombre or ""

    sdi = nom.salario_diario_integrado
    sbc = None
    if sdi and Decimal(str(sdi)) > 0:
        sbc = _q2(Decimal(str(sdi)) * Decimal(str(det.dias_pagados or 0)))
    elif nom.salario_base:
        dias_mes = Decimal("30.4")
        sbc = _q2(Decimal(str(nom.salario_base)) / dias_mes * Decimal(str(det.dias_pagados or 0)))

    tax_credentials = None
    if _tiene_csd_configurado():
        tax_credentials = [
            TaxCredential(
                base64_file=settings.FISCALAPI_CSD_CER_BASE64,
                file_type=0,
                password=settings.FISCALAPI_CSD_PASSWORD,
            ),
            TaxCredential(
                base64_file=settings.FISCALAPI_CSD_KEY_BASE64,
                file_type=1,
                password=settings.FISCALAPI_CSD_PASSWORD,
            ),
        ]

    issuer = InvoiceIssuer(
        tin=(empresa.rfc or "").strip().upper(),
        legal_name=(empresa.nombre or "").strip().upper(),
        tax_regime_code=str(regimen_emisor),
        employer_data=InvoiceIssuerEmployerData(
            employer_registration=(cfg.registro_patronal if cfg else "").strip(),
            origin_employer_tin=(settings.FISCALAPI_ORIGIN_EMPLOYER_TIN or None),
        ),
        tax_credentials=tax_credentials,
    )

    recipient = InvoiceRecipient(
        tin=(emp.rfc or "").strip().upper(),
        legal_name=_nombre_empleado(emp),
        zip_code=(emp.cp or "").strip()[:5],
        tax_regime_code="605",
        cfdi_use_code="CN01",
        employee_data=InvoiceRecipientEmployeeData(
            curp=(emp.curp or "").strip().upper(),
            social_security_number=(emp.nss or "00000000000").strip()[:11],
            labor_relation_start_date=emp.fecha_ingreso,
            seniority=calcular_antiguedad_sat(emp.fecha_ingreso, ff_d),
            sat_contract_type_id=(nom.tipo_contrato or "01"),
            sat_workday_type_id=(nom.tipo_jornada or "01"),
            sat_tax_regime_type_id=(nom.regimen_tipo or "02"),
            employee_number=str(emp.numero_empleado or emp.id),
            department=dept_nombre[:100] if dept_nombre else "General",
            position=puesto_nombre[:100] if puesto_nombre else "Empleado",
            sat_job_risk_id=(nom.riesgo_puesto or "1"),
            sat_payment_periodicity_id=(periodo.periodicidad or nom.periodicidad_pago or "04"),
            sat_bank_id=nom.banco_clave,
            bank_account=nom.cuenta_bancaria or nom.clabe_interbancaria,
            base_salary_for_contributions=sbc,
            integrated_daily_salary=_q2(Decimal(str(sdi))) if sdi else None,
            sat_payroll_state_id=_entidad_sat(nom.entidad_federativa),
        ),
    )

    tipo_nom = periodo.tipo.value if hasattr(periodo.tipo, "value") else str(periodo.tipo or "O")

    payroll = PayrollComplement(
        version="1.2",
        payroll_type_code=tipo_nom,
        payment_date=_fecha_iso(ff_d),
        initial_payment_date=_fecha_iso(fi_d),
        final_payment_date=_fecha_iso(ff_d),
        days_paid=Decimal(str(det.dias_pagados or 0)),
        earnings=PayrollEarningsComplement(
            earnings=earnings,
            other_payments=other_payments or None,
        ),
        deductions=deductions or None,
    )

    ahora_mx = to_mexico(datetime.now(timezone.utc))

    return Invoice(
        version_code="4.0",
        series=series,
        date=ahora_mx,
        payment_method_code="PUE",
        currency_code="MXN",
        type_code="N",
        expedition_zip_code=str(cp_exp).strip()[:5],
        export_code="01",
        issuer=issuer,
        recipient=recipient,
        complement=InvoiceComplement(payroll=payroll),
        metadata={
            "optiexpress_periodo_id": str(periodo.id),
            "optiexpress_empleado_id": str(emp.id),
            "optiexpress_detalle_id": str(det.id),
            "modo": "sandbox_prueba",
        },
    )
