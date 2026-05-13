import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session, joinedload
from app.core.config import settings
from app.core.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login")


def get_password_hash(password: str) -> str:
    """Genera hash SHA-256 de la contraseña."""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica si la contraseña coincide con el hash SHA-256."""
    return get_password_hash(plain_password) == hashed_password


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crea token JWT"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crea refresh token JWT."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decodifica y valida token JWT"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


async def _validate_token(token: str, db: Session) -> dict:
    """Lógica compartida de validación JWT (header o query param)."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    session_kicked_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Tu sesión fue cerrada porque iniciaste sesión desde otro dispositivo.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    admin_only_exception = HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Acceso suspendido temporalmente: solo Administrador, Gerente o Supervisor puede ingresar.",
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    if payload.get("type") not in (None, "access"):
        raise credentials_exception

    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    from app.modules.personal.models import Empleado, Rol
    emp = db.query(Empleado).options(joinedload(Empleado.puesto_rel)).filter(Empleado.id == int(user_id)).first()
    if emp is None:
        raise credentials_exception

    # Bloqueo temporal opcional: limita acceso solo a Administrador/Gerente/Supervisor.
    if settings.LOGIN_MAINTENANCE_RESTRICTED:
        allowed = False
        if emp.rol_id:
            rol = db.query(Rol).filter(Rol.id == emp.rol_id).first()
            if rol and rol.nombre in ("Administrador", "Superuser"):
                allowed = True
        if not allowed:
            pn = (emp.puesto_rel.nombre if emp.puesto_rel else "") or ""
            pl = pn.strip().lower()
            if "gerente" in pl or "supervisor" in pl:
                allowed = True
        if not allowed:
            raise admin_only_exception

    sid_token = payload.get("sid")
    if sid_token and emp.session_id and emp.session_id != sid_token:
        raise session_kicked_exception

    return {"user_id": user_id, "payload": payload}


async def get_current_user_download(
    download_token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Acepta el token desde el query param ?download_token=xxx
    para descargas directas (sin JS/fetch intermedio).
    """
    if not download_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await _validate_token(download_token, db)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """
    Dependency para obtener usuario actual desde token JWT (header Authorization: Bearer).
    """
    return await _validate_token(token, db)
