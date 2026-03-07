from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, get_current_user
from app.modules.personal.models import Empleado, Departamento, Rol
from app.modules.personal.service import PersonalService
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
    # Buscar empleado por email, número de empleado o username (con puesto para Mi Área)
    empleado = db.query(Empleado).options(joinedload(Empleado.puesto_rel)).filter(
        (Empleado.email == login_data.username) |
        (Empleado.numero_empleado == login_data.username) |
        (Empleado.username == login_data.username)
    ).first()
    
    if not empleado:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas"
        )
    
    # Verificar contraseña
    import hashlib
    if not empleado.password_hash:
        # Empleados sin contraseña (legacy): permitir numero_empleado como contraseña o "admin123"
        ok = (
            login_data.password == (empleado.numero_empleado or "")
            or login_data.password == "admin123"
        )
        if not ok:
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
    
    # Incluir payload de /auth/me para que el front no tenga que llamar /auth/me al entrar
    departamentos = db.query(Departamento).filter(Departamento.jefe_id == empleado.id).all()
    is_jefe = len(departamentos) > 0
    is_superuser = False
    if empleado.rol_id:
        rol = db.query(Rol).filter(Rol.id == empleado.rol_id).first()
        if rol and rol.nombre in ("Administrador", "Superuser"):
            is_superuser = True
    depto_ids_admin = PersonalService.get_departamento_ids_que_administro(db, empleado.id)
    puede_ver_mi_area = len(depto_ids_admin) > 0
    if not puede_ver_mi_area and empleado.puesto_rel:
        puesto_n = (empleado.puesto_rel.nombre or "").strip().lower()
        if "gerente" in puesto_n or "supervisor" in puesto_n:
            puede_ver_mi_area = True
    if is_superuser:
        puede_ver_mi_area = True
    departamentos_que_administro = []
    if depto_ids_admin:
        deptos = db.query(Departamento).filter(Departamento.id.in_(depto_ids_admin)).all()
        departamentos_que_administro = [{"id": d.id, "nombre": d.nombre} for d in deptos]
    me_payload = {
        "id": empleado.id,
        "numero_empleado": empleado.numero_empleado,
        "nombre": empleado.nombre,
        "apellido_paterno": empleado.apellido_paterno,
        "apellido_materno": empleado.apellido_materno,
        "email": empleado.email,
        "rol_id": empleado.rol_id,
        "is_jefe": is_jefe,
        "is_superuser": is_superuser,
        "puede_ver_mi_area": puede_ver_mi_area,
        "departamento_ids": [d.id for d in departamentos],
        "departamentos": [{"id": d.id, "nombre": d.nombre} for d in departamentos],
        "departamentos_que_administro": departamentos_que_administro,
    }
    
    return TokenResponse(
        access_token=access_token,
        user=user_info,
        me=me_payload,
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


@router.get("/me")
async def get_me(
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Devuelve el empleado actual y si es jefe de área (departamentos a su cargo).
    Usado por el módulo Mi área / Justificaciones.
    """
    empleado_id = int(current["user_id"])
    empleado = db.query(Empleado).options(joinedload(Empleado.puesto_rel)).filter(Empleado.id == empleado_id).first()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    departamentos = db.query(Departamento).filter(Departamento.jefe_id == empleado_id).all()
    is_jefe = len(departamentos) > 0
    departamento_ids = [d.id for d in departamentos]
    is_superuser = False
    is_gerente_general = False
    if empleado.rol_id:
        rol = db.query(Rol).filter(Rol.id == empleado.rol_id).first()
        if rol:
            if rol.nombre in ("Administrador", "Superuser"):
                is_superuser = True
            if rol.nombre in ("Gerente General", "Gerente general"):
                is_gerente_general = True
    depto_ids_admin = PersonalService.get_departamento_ids_que_administro(db, empleado_id)
    puede_ver_mi_area = len(depto_ids_admin) > 0
    if not puede_ver_mi_area and empleado.puesto_rel:
        puesto_n = (empleado.puesto_rel.nombre or "").strip().lower()
        if "gerente" in puesto_n or "supervisor" in puesto_n:
            puede_ver_mi_area = True
    if is_gerente_general:
        puede_ver_mi_area = True
    if is_superuser:
        puede_ver_mi_area = True
    departamentos_que_administro = []
    if depto_ids_admin:
        deptos = db.query(Departamento).filter(Departamento.id.in_(depto_ids_admin)).all()
        departamentos_que_administro = [{"id": d.id, "nombre": d.nombre} for d in deptos]
    return {
        "id": empleado.id,
        "numero_empleado": empleado.numero_empleado,
        "nombre": empleado.nombre,
        "apellido_paterno": empleado.apellido_paterno,
        "apellido_materno": empleado.apellido_materno,
        "email": empleado.email,
        "rol_id": empleado.rol_id,
        "is_jefe": is_jefe,
        "is_superuser": is_superuser,
        "is_gerente_general": is_gerente_general,
        "puede_ver_mi_area": puede_ver_mi_area,
        "departamento_ids": departamento_ids,
        "departamentos": [{"id": d.id, "nombre": d.nombre} for d in departamentos],
        "departamentos_que_administro": departamentos_que_administro,
    }
