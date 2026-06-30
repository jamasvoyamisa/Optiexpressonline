"""Numeración de periodos de nómina (quincena 1–24 del ejercicio, mes, semana, etc.)."""
from __future__ import annotations

import calendar
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple, Union

FechaLike = Union[date, datetime, str]


def _a_fecha(val: FechaLike) -> date:
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val)[:10]
    y, m, d = (int(x) for x in s.split("-"))
    return date(y, m, d)


def quincena_en_mes(fecha: FechaLike) -> Tuple[int, int, int]:
    """Año, mes (1–12) y quincena del mes (1 = días 1–15, 2 = 16–fin)."""
    f = _a_fecha(fecha)
    num = 1 if f.day <= 15 else 2
    return f.year, f.month, num


def numero_quincena_anual(fecha: FechaLike) -> int:
    """
    Número de quincena dentro del ejercicio (1–24).
    Q1 = 1–15 ene, Q2 = 16–31 ene, … Q24 = 16–31 dic.
    Se determina por la fecha fin del periodo (fecha de corte/pago).
    """
    _, mes, q_mes = quincena_en_mes(fecha)
    return (mes - 1) * 2 + q_mes


def rango_quincena_anual(ejercicio: int, numero: int) -> Tuple[date, date]:
    """Fechas inicio/fin de la quincena `numero` (1–24) del `ejercicio`."""
    if numero < 1 or numero > 24:
        raise ValueError("El número de quincena debe estar entre 1 y 24.")
    mes = (numero - 1) // 2 + 1
    q_mes = 1 if numero % 2 == 1 else 2
    if q_mes == 1:
        return date(ejercicio, mes, 1), date(ejercicio, mes, 15)
    ultimo = calendar.monthrange(ejercicio, mes)[1]
    return date(ejercicio, mes, 16), date(ejercicio, mes, ultimo)


def quincena_es_pasada(fecha_fin: FechaLike) -> bool:
    """True si la quincena ya terminó según el calendario de hoy en México."""
    from app.core.timezone_utils import hoy_mexico

    return _a_fecha(fecha_fin) < hoy_mexico()


def listar_quincenas_ejercicio(ejercicio: int) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for n in range(1, 25):
        fi, ff = rango_quincena_anual(ejercicio, n)
        _, mes, q_mes = quincena_en_mes(ff)
        items.append({
            "numero": n,
            "ejercicio": ejercicio,
            "mes": mes,
            "quincena_mes": q_mes,
            "fecha_inicio": fi.isoformat(),
            "fecha_fin": ff.isoformat(),
            "etiqueta": etiqueta_quincena_anual(n, fi, ff),
        })
    return items


def _fmt_fecha_slash(fecha: FechaLike) -> str:
    return _a_fecha(fecha).isoformat().replace("-", "/")


def fechas_son_quincena_calendario(fecha_inicio: FechaLike, fecha_fin: FechaLike) -> bool:
    """True si el rango coincide con 1–15 o 16–fin de mes del mismo mes/año."""
    fi, ff = _a_fecha(fecha_inicio), _a_fecha(fecha_fin)
    if fi.year != ff.year or fi.month != ff.month:
        return False
    ultimo = calendar.monthrange(ff.year, ff.month)[1]
    if fi.day == 1 and ff.day == 15:
        return True
    if fi.day == 16 and ff.day == ultimo:
        return True
    return False


def etiqueta_quincena_mes(year: int, month: int, num_mes: int) -> str:
    meses = (
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    )
    mes = meses[month - 1].capitalize()
    if num_mes == 1:
        return f"1° quincena {mes} {year} (1–15)"
    ultimo = calendar.monthrange(year, month)[1]
    return f"2° quincena {mes} {year} (16–{ultimo})"


def etiqueta_quincena_numero(numero: int) -> str:
    """Etiqueta corta: Quincena 8."""
    return f"Quincena {numero}"


def etiqueta_quincena_anual(numero: int, fecha_inicio: date, fecha_fin: date) -> str:
    _, mes, q_mes = quincena_en_mes(fecha_fin)
    detalle = etiqueta_quincena_mes(fecha_fin.year, mes, q_mes)
    return f"{etiqueta_quincena_numero(numero)} — {detalle}"


def numero_periodo_nomina(
    periodicidad: Optional[str],
    fecha_fin: FechaLike,
) -> Optional[int]:
    per = (periodicidad or "04").strip()
    f = _a_fecha(fecha_fin)
    if per == "04":
        return numero_quincena_anual(f)
    if per == "05":
        return f.month
    if per == "02":
        return f.isocalendar()[1]
    if per == "03":
        return (f.isocalendar()[1] + 1) // 2
    if per == "01":  # diario
        return f.timetuple().tm_yday
    return None


def total_periodos_ejercicio(periodicidad: Optional[str]) -> Optional[int]:
    per = (periodicidad or "04").strip()
    if per == "04":
        return 24
    if per == "05":
        return 12
    if per == "02":
        return 53
    if per == "03":
        return 26
    return None


def etiqueta_periodo_nomina(
    periodicidad: Optional[str],
    fecha_inicio: FechaLike,
    fecha_fin: FechaLike,
) -> str:
    per = (periodicidad or "04").strip()
    fi, ff = _a_fecha(fecha_inicio), _a_fecha(fecha_fin)
    n = numero_periodo_nomina(per, ff)
    total = total_periodos_ejercicio(per)

    if per == "04" and n is not None:
        return etiqueta_quincena_anual(n, fi, ff)
    if per == "05" and n is not None:
        meses = (
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
        )
        return f"M{n:02d}/12 — {meses[n - 1].capitalize()} {ff.year}"
    if n is not None and total is not None:
        return f"P{n:02d}/{total:02d} — {_fmt_fecha_slash(fi)} a {_fmt_fecha_slash(ff)}"
    return f"{_fmt_fecha_slash(fi)} a {_fmt_fecha_slash(ff)}"


def meta_periodo_nomina(
    periodicidad: Optional[str],
    fecha_inicio: FechaLike,
    fecha_fin: FechaLike,
) -> Dict[str, Any]:
    ff = _a_fecha(fecha_fin)
    fi = _a_fecha(fecha_inicio)
    per = (periodicidad or "04").strip()
    numero = numero_periodo_nomina(per, ff)
    ejercicio = ff.year
    _, mes, quincena_mes = quincena_en_mes(ff)
    return {
        "numero_periodo": numero,
        "total_periodos_ejercicio": total_periodos_ejercicio(per),
        "periodo_etiqueta": etiqueta_periodo_nomina(per, fi, ff),
        "ejercicio_fiscal": ejercicio,
        "mes": mes if per == "04" else None,
        "quincena_mes": quincena_mes if per == "04" else None,
    }
