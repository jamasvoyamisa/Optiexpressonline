"""
Zona horaria para asistencia: todas las checadas se muestran y se interpretan
en hora de México (America/Mexico_City). En BD se guardan en UTC.
Usa solo stdlib para compatibilidad con Python 3.8 (sin zoneinfo).
"""
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Tuple

# México Centro: UTC-6 (sin horario de verano desde 2022)
ZONE_MEXICO = timezone(timedelta(hours=-6))


def to_mexico(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Convierte un datetime a hora de México para mostrar.
    Si es naive (ej. desde MySQL), se asume UTC y se convierte a México.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(ZONE_MEXICO)


def to_utc(dt: datetime) -> datetime:
    """Convierte a UTC. Si dt es naive, se asume hora local México."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZONE_MEXICO)
    return dt.astimezone(timezone.utc)


def mexico_date_to_utc_range(fecha: date) -> Tuple[datetime, datetime]:
    """
    Dado un date (en calendario México), devuelve el rango UTC que cubre ese día:
    (inicio_utc, fin_utc) donde inicio_utc = 00:00:00 de fecha en México, fin_utc = 00:00:00 del día siguiente en México.
    """
    inicio_mex = datetime(fecha.year, fecha.month, fecha.day, 0, 0, 0, tzinfo=ZONE_MEXICO)
    fin_mex = inicio_mex + timedelta(days=1)
    inicio_utc = inicio_mex.astimezone(timezone.utc)
    fin_utc = fin_mex.astimezone(timezone.utc)
    return inicio_utc, fin_utc
