"""Carga parámetros fiscales por ejercicio (BD o defaults embebidos)."""
from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, Tuple

from sqlalchemy.orm import Session

from app.modules.nomina import fiscal_defaults as fd
from app.modules.nomina.models import NominaEjercicioFiscal


@dataclass
class ParametrosFiscales:
    ejercicio: int
    uma_diaria: Decimal
    dias_base_mes: Decimal
    tope_uma_sbc: int
    isr_quincenal: Tuple[Tuple[Decimal, Decimal, Decimal, Decimal], ...]
    subsidio_quincenal: Tuple[Tuple[Decimal, Decimal, Decimal], ...]
    imss_obrero: Dict[str, Decimal]


def get_parametros_fiscales(db: Session, ejercicio: int) -> ParametrosFiscales:
    row = (
        db.query(NominaEjercicioFiscal)
        .filter(NominaEjercicioFiscal.ejercicio == ejercicio)
        .first()
    )
    if row:
        isr_raw = row.isr_quincenal_json
        sub_raw = row.subsidio_quincenal_json
        imss_raw = row.imss_obrero_json
        if isinstance(isr_raw, str):
            isr_raw = json.loads(isr_raw)
        if isinstance(sub_raw, str):
            sub_raw = json.loads(sub_raw)
        if isinstance(imss_raw, str):
            imss_raw = json.loads(imss_raw)
        return ParametrosFiscales(
            ejercicio=row.ejercicio,
            uma_diaria=Decimal(str(row.uma_diaria)),
            dias_base_mes=Decimal(str(row.dias_base_mes)),
            tope_uma_sbc=int(row.tope_uma_sbc),
            isr_quincenal=fd.json_a_tabla_isr(isr_raw),
            subsidio_quincenal=fd.json_a_tabla_subsidio(sub_raw),
            imss_obrero=fd.json_a_imss(imss_raw),
        )
    default = fd.EJERCICIOS_DEFAULT.get(ejercicio) or fd.EJERCICIOS_DEFAULT[2025]
    return ParametrosFiscales(
        ejercicio=ejercicio,
        uma_diaria=default["uma_diaria"],
        dias_base_mes=default["dias_base_mes"],
        tope_uma_sbc=default["tope_uma_sbc"],
        isr_quincenal=default["isr_quincenal"],
        subsidio_quincenal=default["subsidio_quincenal"],
        imss_obrero=default["imss_obrero"],
    )
