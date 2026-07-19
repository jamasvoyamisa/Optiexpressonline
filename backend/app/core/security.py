import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session, joinedload
from app.core.config import settings
from app.core.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login")

# Único punto de creación/verificación de hashes de contraseña (bcrypt directo,
# sin passlib: passlib 1.7.4 es incompatible con bcrypt>=4 y lanza ValueError
# al hashear/verificar).
_BCRYPT_MAX_BYTES = 72  # límite duro del algoritmo bcrypt

# Hashes legacy (SHA-256 hexdigest) siempre tienen 64 caracteres hexadecimales.
_LEGACY_SHA256_LEN = 64


def get_password_hash(password: str) -> str:
    """Genera hash bcrypt de la contraseña."""
    pw_bytes = password.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(pw_bytes, bcrypt.gensalt()).decode("utf-8")


def is_legacy_sha256_hash(hashed_password: Optional[str]) -> bool:
    """True si el hash almacenado es el formato legacy SHA-256 (64 hex chars, sin salt)."""
    return bool(hashed_password) and len(hashed_password) == _LEGACY_SHA256_LEN


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica una contraseña contra un hash bcrypt."""
    try:
        pw_bytes = (plain_password or "").encode("utf-8")[:_BCRYPT_MAX_BYTES]
        return bcrypt.checkpw(pw_bytes, hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def verify_empleado_password(empleado, plain_password: str) -> bool:
    """
    Verifica la contraseña de un Empleado.
    - Sin password_hash: acceso denegado (ya no existe contraseña por defecto/backdoor).
    - Hash legacy SHA-256 (64 hex chars): se compara en ese formato por compatibilidad.
    - Cualquier otro caso: hash bcrypt.
    """
    plain = (plain_password or "").strip()
    if not plain:
        return False
    ph = getattr(empleado, "password_hash", None)
    if not ph:
        return False
    if is_legacy_sha256_hash(ph):
        return hashlib.sha256(plain.encode()).hexdigest() == ph
    return verify_password(plain, ph)


def verify_and_upgrade_password(db: Session, empleado, plain_password: str) -> bool:
    """
    Verifica la contraseña del empleado y, si el hash almacenado es el formato legacy
    SHA-256, lo re-hashea a bcrypt de forma transparente (migración progresiva, sin
    downtime ni script masivo). Usar esta función en todos los puntos de login/verificación
    en lugar de reimplementar la lógica legacy/bcrypt.
    """
    ok = verify_empleado_password(empleado, plain_password)
    if ok and is_legacy_sha256_hash(getattr(empleado, "password_hash", None)):
        empleado.password_hash = get_password_hash(plain_password)
        db.add(empleado)
        db.commit()
    return ok


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
    request: Request,
    download_token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Descargas protegidas: prefiere el JWT en el header Authorization (como cualquier
    otra petición autenticada) y, solo si no viene, acepta ?download_token=xxx por
    compatibilidad con enlaces directos antiguos. El JWT en la URL puede quedar
    expuesto en logs de servidor/proxy o en el historial del navegador.
    """
    token = None
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth_header:
        scheme, _, param = auth_header.partition(" ")
        if scheme.lower() == "bearer" and param:
            token = param
    if not token:
        token = download_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await _validate_token(token, db)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """
    Dependency para obtener usuario actual desde token JWT (header Authorization: Bearer).
    """
    return await _validate_token(token, db)
