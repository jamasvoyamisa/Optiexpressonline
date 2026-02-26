from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.modules.personal.models import Empleado
from app.modules.auth.schemas import LoginRequest, TokenResponse, UserInfo

from app.core.config import settings

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/auth", tags=["autenticación"])


@router.post("/login", response_model=TokenResponse)
async def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Endpoint de login usando username (email o número de empleado) y password
    """
    # Buscar empleado por email o número de empleado
    empleado = db.query(Empleado).filter(
        (Empleado.email == login_data.username) | 
        (Empleado.numero_empleado == login_data.username)
    ).first()
    
    if not empleado:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas"
        )
    
    # Verificar contraseña
    import hashlib
    if not empleado.password_hash:
        # Si no tiene password_hash, usar "admin123" por defecto para desarrollo
        if login_data.password != "admin123":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciales incorrectas"
            )
    else:
        # Verificar si es hash SHA256 (desarrollo) o bcrypt (producción)
        if len(empleado.password_hash) == 64:  # SHA256 hash
            password_hash = hashlib.sha256(login_data.password.encode()).hexdigest()
            if password_hash != empleado.password_hash:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Credenciales incorrectas"
                )
        else:
            # Usar bcrypt para producción
            if not verify_password(login_data.password, empleado.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Credenciales incorrectas"
                )
    
    # Crear token
    access_token = create_access_token(data={"sub": str(empleado.id)})
    
    # Información del usuario
    user_info = {
        "id": empleado.id,
        "numero_empleado": empleado.numero_empleado,
        "nombre": empleado.nombre,
        "apellido_paterno": empleado.apellido_paterno,
        "apellido_materno": empleado.apellido_materno,
        "email": empleado.email,
        "rol_id": empleado.rol_id,
    }
    
    return TokenResponse(
        access_token=access_token,
        user=user_info
    )


@router.post("/login-form", response_model=TokenResponse)
async def login_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Endpoint de login compatible con OAuth2PasswordRequestForm (para Swagger UI)
    """
    login_data = LoginRequest(username=form_data.username, password=form_data.password)
    return await login(login_data, db)
