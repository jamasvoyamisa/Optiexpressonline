from sqlalchemy.orm import Session
from typing import Optional
from app.modules.asistencia import models


def verify_api_key(db: Session, api_key: str) -> Optional[models.Dispositivo]:
    """Verifica si la API key es válida y retorna el dispositivo"""
    dispositivo = db.query(models.Dispositivo).filter(
        models.Dispositivo.api_key == api_key,
        models.Dispositivo.activo == True
    ).first()
    return dispositivo


def verify_serial_number(db: Session, serial_number: str) -> Optional[models.Dispositivo]:
    """Verifica si el SN está registrado y retorna el dispositivo (para ADMS/iClock)"""
    sn_clean = (serial_number or "").strip()
    if not sn_clean:
        return None
    # Buscar por coincidencia exacta primero
    dispositivo = db.query(models.Dispositivo).filter(
        models.Dispositivo.serial_number == sn_clean,
        models.Dispositivo.activo == True
    ).first()
    if dispositivo:
        return dispositivo
    # Fallback: coincidencia ignorando espacios extra (el dispositivo puede enviar distinto)
    all_devices = db.query(models.Dispositivo).filter(
        models.Dispositivo.activo == True,
        models.Dispositivo.serial_number.isnot(None)
    ).all()
    for d in all_devices:
        if d.serial_number and d.serial_number.strip() == sn_clean:
            return d
    return None


def generate_api_key() -> str:
    """Genera una nueva API key única"""
    import secrets
    return secrets.token_urlsafe(32)
