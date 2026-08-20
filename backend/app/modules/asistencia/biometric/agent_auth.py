from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import Optional
from app.core.config import settings
from app.core.database import get_db
from app.modules.asistencia import models

# Igual que oauth2_scheme de core/security.py pero sin exigir el header (auto_error=False),
# para endpoints que aceptan JWT de administrador O X-API-Key de un dispositivo/agente.
_optional_oauth2 = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login", auto_error=False)


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


def require_device_api_key_or_superuser(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    token: Optional[str] = Depends(_optional_oauth2),
    db: Session = Depends(get_db),
) -> dict:
    """
    Para endpoints consultados tanto por el agente local (X-API-Key de un dispositivo
    activo) como por el frontend (JWT de Administrador/Superuser o RH).
    """
    if x_api_key:
        if verify_api_key(db, x_api_key):
            return {"via": "api_key"}
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API Key inválida")

    if token:
        from app.core.security import decode_access_token
        from app.modules.personal.models import Empleado, Rol, Puesto

        payload = decode_access_token(token)
        user_id = payload.get("sub") if payload else None
        if user_id:
            empleado = db.query(Empleado).filter(Empleado.id == int(user_id)).first()
            if empleado:
                if empleado.rol_id:
                    rol = db.query(Rol).filter(Rol.id == empleado.rol_id).first()
                    if rol and rol.nombre in ("Administrador", "Superuser", "RH", "Recursos Humanos"):
                        return {"via": "jwt", "user_id": user_id}
                if empleado.puesto_id:
                    puesto = db.query(Puesto).filter(Puesto.id == empleado.puesto_id).first()
                    if puesto and (puesto.nombre or "").strip().lower() in ("rh", "recursos humanos"):
                        return {"via": "jwt", "user_id": user_id}
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores, RH o un dispositivo autorizado pueden consultar esto",
        )

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
