"""Parámetros fiscales por defecto (México). Validar con contador antes de producción."""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List, Tuple

# Tabla ISR art. 96 — quincenal 2025 (lím inf, lím sup, cuota fija, tasa marginal)
ISR_QUINCENAL_2025: Tuple[Tuple[Decimal, Decimal, Decimal, Decimal], ...] = (
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

# Subsidio al empleo — quincenal 2025 (lím inf, lím sup, subsidio)
SUBSIDIO_QUINCENAL_2025: Tuple[Tuple[Decimal, Decimal, Decimal], ...] = (
    (Decimal("0.01"), Decimal("872.85"), Decimal("200.85")),
    (Decimal("872.86"), Decimal("1309.20"), Decimal("200.70")),
    (Decimal("1309.21"), Decimal("1745.70"), Decimal("200.55")),
    (Decimal("1745.71"), Decimal("2181.00"), Decimal("200.40")),
    (Decimal("2181.01"), Decimal("2617.35"), Decimal("200.25")),
    (Decimal("2617.36"), Decimal("3053.70"), Decimal("200.10")),
    (Decimal("3053.71"), Decimal("3489.60"), Decimal("199.95")),
    (Decimal("3489.61"), Decimal("3925.95"), Decimal("199.80")),
    (Decimal("3925.96"), Decimal("4362.30"), Decimal("199.65")),
    (Decimal("4362.31"), Decimal("4798.65"), Decimal("199.50")),
    (Decimal("4798.66"), Decimal("9999999999"), Decimal("0")),
)

# Cuotas obreras IMSS (% sobre SBC del periodo) — estructura simplificada 2025
IMSS_OBRERO_2025: Dict[str, Decimal] = {
    "enfermedades_maternidad": Decimal("0.00375"),
    "invalidez_vida": Decimal("0.00625"),
    "retiro": Decimal("0"),
    "cesantia_vejez": Decimal("0.01125"),
    "guarderias": Decimal("0"),
    "riesgo_trabajo": Decimal("0"),  # variable por empresa; 0 en cálculo base
}

EJERCICIOS_DEFAULT: Dict[int, Dict[str, Any]] = {
    2025: {
        "uma_diaria": Decimal("108.57"),
        "dias_base_mes": Decimal("30"),
        "tope_uma_sbc": 25,
        "isr_quincenal": ISR_QUINCENAL_2025,
        "subsidio_quincenal": SUBSIDIO_QUINCENAL_2025,
        "imss_obrero": IMSS_OBRERO_2025,
    },
    2026: {
        "uma_diaria": Decimal("113.14"),
        "dias_base_mes": Decimal("30"),
        "tope_uma_sbc": 25,
        "isr_quincenal": ISR_QUINCENAL_2025,  # actualizar cuando SAT publique 2026
        "subsidio_quincenal": SUBSIDIO_QUINCENAL_2025,
        "imss_obrero": IMSS_OBRERO_2025,
    },
}


def tabla_a_json_filas(tabla: tuple) -> List[List[str]]:
    out: List[List[str]] = []
    for row in tabla:
        out.append([str(x) for x in row])
    return out


def imss_a_json(tasas: Dict[str, Decimal]) -> Dict[str, str]:
    return {k: str(v) for k, v in tasas.items()}


def json_a_tabla_isr(data: List[List[str]]) -> Tuple[Tuple[Decimal, Decimal, Decimal, Decimal], ...]:
    return tuple(
        (Decimal(r[0]), Decimal(r[1]), Decimal(r[2]), Decimal(r[3])) for r in data
    )


def json_a_tabla_subsidio(data: List[List[str]]) -> Tuple[Tuple[Decimal, Decimal, Decimal], ...]:
    return tuple((Decimal(r[0]), Decimal(r[1]), Decimal(r[2])) for r in data)


def json_a_imss(data: Dict[str, str]) -> Dict[str, Decimal]:
    return {k: Decimal(v) for k, v in data.items()}
