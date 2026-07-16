"""Etiquetas de motivo para checadas remotas (Fase D). Sin dependencias de routes."""
from typing import Optional

MOTIVOS_REMOTOS_VALIDOS = frozenset({"HO", "TFO", "OTRO"})
MOTIVO_REMOTO_LABELS = {
    "HO": "Home Office",
    "TFO": "Trabajo fuera de oficina",
    "OTRO": "Otro",
}


def label_motivo_remoto(codigo: Optional[str], detalle: Optional[str] = None) -> Optional[str]:
    if not codigo:
        return None
    base = MOTIVO_REMOTO_LABELS.get(codigo, codigo)
    if codigo == "OTRO" and (detalle or "").strip():
        return f"{base}: {detalle.strip()}"
    return base
