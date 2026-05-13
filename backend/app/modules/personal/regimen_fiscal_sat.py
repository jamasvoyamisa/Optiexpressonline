"""
Catálogo c_RegimenFiscal (CFDI 4.0 / SAT México).
Referencias: Anexo 20, catálogo de régimen fiscal.
"""
from __future__ import annotations

from typing import List, Dict, Optional

# Lista alineada con los códigos oficiales del SAT (descripciones típicas).
REGIMENES_FISCALES_SAT: List[Dict[str, str]] = [
    {"code": "601", "descripcion": "General de Ley Personas Morales"},
    {"code": "603", "descripcion": "Personas Morales con Fines no Lucrativos"},
    {"code": "605", "descripcion": "Sueldos y Salarios e Ingresos Asimilados a Salarios"},
    {"code": "606", "descripcion": "Arrendamiento"},
    {"code": "607", "descripcion": "Régimen de Enajenación o Adquisición de Bienes"},
    {"code": "608", "descripcion": "Demás ingresos"},
    {"code": "609", "descripcion": "Consolidación"},
    {"code": "610", "descripcion": "Residentes en el Extranjero sin Establecimiento Permanente en México"},
    {"code": "611", "descripcion": "Ingresos por Dividendos (socios y accionistas)"},
    {"code": "612", "descripcion": "Personas Físicas con Actividades Empresariales y Profesionales"},
    {"code": "614", "descripcion": "Ingresos por intereses"},
    {"code": "615", "descripcion": "Régimen de los ingresos por obtención de premios"},
    {"code": "616", "descripcion": "Sin obligaciones fiscales"},
    {"code": "620", "descripcion": "Sociedades Cooperativas de Producción que optan por diferir sus ingresos"},
    {"code": "621", "descripcion": "Régimen de Incorporación Fiscal"},
    {"code": "622", "descripcion": "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras"},
    {"code": "623", "descripcion": "Opcional para Grupos de Sociedades"},
    {"code": "624", "descripcion": "Coordinados"},
    {"code": "625", "descripcion": "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas"},
    {"code": "626", "descripcion": "Régimen Simplificado de Confianza"},
    {"code": "628", "descripcion": "Hidrocarburos"},
    {"code": "629", "descripcion": "De los Regímenes Fiscales Preferentes y de las Empresas Multinacionales"},
    {"code": "630", "descripcion": "Enajenación de acciones en bolsa de valores"},
]

VALID_REGIMEN_CODES = frozenset(r["code"] for r in REGIMENES_FISCALES_SAT)


def is_valid_regimen_fiscal(code: Optional[str]) -> bool:
    if not code or not str(code).strip():
        return True
    return str(code).strip() in VALID_REGIMEN_CODES
