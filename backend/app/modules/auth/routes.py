import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session, joinedload
from datetime import date
from zoneinfo import ZoneInfo
from app.core.database import get_db
from app.modules.personal.models import Empleado, Departamento, Rol
from app.modules.personal.service import PersonalService
from app.modules.auth.schemas import (
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserInfo,
    CambiarPasswordRequest,
)
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.security import (
    verify_and_upgrade_password,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    get_current_user,
    get_password_hash,
)
from app.modules.audit.middleware import _client_ip
from app.modules.audit.service import ActividadService


def _calcular_aniversario_empresa(fecha_ingreso) -> dict:
    """
    Calcula si hoy (hora México) es el aniversario laboral del empleado,
    cuántos años cumple y cuántos días de vacaciones le corresponden por LFT.
    """
    from app.modules.vacaciones.service import _anios_antiguedad, _dias_vacaciones_lft_mexico

    if not fecha_ingreso:
        return {"es_aniversario_hoy": False, "anios_empresa": 0, "dias_vacaciones_aniversario": 0}

    hoy_mx = date.today()
    try:
        hoy_mx = date.today().__class__.today()
        import datetime as _dt
        hoy_mx = _dt.datetime.now(ZoneInfo("America/Mexico_City")).date()
    except Exception:
        pass

    ingreso = fecha_ingreso.date() if hasattr(fecha_ingreso, "date") else fecha_ingreso

    # ¿Es hoy el aniversario? (mismo mes y día, pero en un año posterior)
    es_aniversario = (
        ingreso.month == hoy_mx.month
        and ingreso.day == hoy_mx.day
        and hoy_mx > ingreso
    )

    anios = _anios_antiguedad(fecha_ingreso, hoy_mx)
    dias_vac = _dias_vacaciones_lft_mexico(anios) if anios >= 1 else 0

    return {
        "es_aniversario_hoy": es_aniversario,
        "anios_empresa": anios,
        "dias_vacaciones_aniversario": dias_vac,
        "fecha_ingreso": ingreso.isoformat(),
    }


def _is_ti_department_name(nombre: str) -> bool:
    n = (nombre or "").strip().lower()
    return n in ("ti", "it", "sistemas", "tecnologia", "tecnologías de la información") or ("sistemas" in n) or ("tecnolog" in n)


def _puede_acceso_bloqueo_mantenimiento(db: Session, empleado: Empleado) -> bool:
    """Durante bloqueo: Administrador/Superuser (rol) o Gerente/Supervisor (puesto, por nombre)."""
    if empleado.rol_id:
        rol = db.query(Rol).filter(Rol.id == empleado.rol_id).first()
        if rol and rol.nombre in ("Administrador", "Superuser"):
            return True
    puesto_n = (empleado.puesto_rel.nombre if empleado.puesto_rel else "") or ""
    pl = puesto_n.strip().lower()
    if "gerente" in pl or "supervisor" in pl:
        return True
    return False


router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/auth", tags=["autenticación"])


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(
    login_data: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Endpoint de login usando username (email o número de empleado) y password
    """
    # Buscar empleado por email, número de empleado o username (con puesto para Mi Área)
    empleado = db.query(Empleado).options(joinedload(Empleado.puesto_rel), joinedload(Empleado.departamento_rel)).filter(
        (Empleado.email == login_data.username) |
        (Empleado.numero_empleado == login_data.username) |
        (Empleado.username == login_data.username)
    ).first()
    
    if not empleado:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas"
        )

    # Bloqueo temporal opcional por mantenimiento.
    if settings.LOGIN_MAINTENANCE_RESTRICTED and not _puede_acceso_bloqueo_mantenimiento(db, empleado):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso suspendido temporalmente: solo Administrador, Gerente o Supervisor puede ingresar."
        )
    
    # Verificar contraseña (legacy SHA-256 con upgrade transparente a bcrypt, o bcrypt directo).
    # Sin password_hash = sin acceso: ya no existe contraseña por defecto/backdoor.
    if not verify_and_upgrade_password(db, empleado, login_data.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas"
        )
    
    # Generar session_id único para esta sesión (invalida cualquier sesión anterior)
    session_id = str(uuid.uuid4()).replace("-", "")
    empleado.session_id = session_id
    db.commit()

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
    is_rh = False
    is_gerente_general = False
    is_director = False
    is_ti = False
    if empleado.rol_id:
        rol = db.query(Rol).filter(Rol.id == empleado.rol_id).first()
        if rol:
            if rol.nombre in ("Administrador", "Superuser"):
                is_superuser = True
            if rol.nombre in ("RH", "Recursos Humanos", "Recursos humanos", "rh"):
                is_rh = True
            if rol.nombre in ("Gerente General", "Gerente general"):
                is_gerente_general = True
    if empleado.puesto_rel:
        puesto_lower = (empleado.puesto_rel.nombre or "").strip().lower()
        if puesto_lower == "director":
            is_director = True
        if puesto_lower == "gerente general":
            is_gerente_general = True
        if puesto_lower in ("rh", "recursos humanos"):
            is_rh = True
    if empleado.departamento_rel and _is_ti_department_name(empleado.departamento_rel.nombre or ""):
        is_ti = True
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
    puede_ver_dashboard = is_superuser or is_rh or is_gerente_general or is_director
    aniv = _calcular_aniversario_empresa(empleado.fecha_ingreso)

    # Tokens: incluyen su (superusuario) para no registrar tráfico HTTP de empleados/jefes en actividad
    token_data = {"sub": str(empleado.id), "sid": session_id, "su": is_superuser}
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)

    ip_login = _client_ip(request)
    ActividadService.registrar(
        db,
        nivel="info",
        categoria="auth",
        mensaje=f"Inicio de sesión: {empleado.numero_empleado or empleado.email or empleado.id}",
        empleado_id=empleado.id,
        ip_cliente=ip_login or None,
        metodo_http="POST",
        ruta=(f"{settings.API_V1_PREFIX}/auth/login")[:500],
        codigo_http=200,
    )

    me_payload = {
        "id": empleado.id,
        "numero_empleado": empleado.numero_empleado,
        "nombre": empleado.nombre,
        "apellido_paterno": empleado.apellido_paterno,
        "apellido_materno": empleado.apellido_materno,
        "email": empleado.email,
        "fecha_nacimiento": empleado.fecha_nacimiento.isoformat() if empleado.fecha_nacimiento else None,
        "fecha_ingreso": aniv.get("fecha_ingreso"),
        "es_aniversario_hoy": aniv["es_aniversario_hoy"],
        "anios_empresa": aniv["anios_empresa"],
        "dias_vacaciones_aniversario": aniv["dias_vacaciones_aniversario"],
        "rol_id": empleado.rol_id,
        "is_jefe": is_jefe,
        "is_superuser": is_superuser,
        "is_rh": is_rh,
        "is_gerente_general": is_gerente_general,
        "is_director": is_director,
        "is_ti": is_ti,
        "puede_ver_dashboard": puede_ver_dashboard,
        "puede_ver_mi_area": puede_ver_mi_area,
        "departamento_ids": [d.id for d in departamentos],
        "departamentos": [{"id": d.id, "nombre": d.nombre} for d in departamentos],
        "departamentos_que_administro": departamentos_que_administro,
        "exento_incidencias": bool(getattr(empleado, "exento_incidencias", False)),
        "must_change_password": bool(getattr(empleado, "must_change_password", False)),
    }
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user_info,
        me=me_payload,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    decoded = decode_access_token(payload.refresh_token)
    if not decoded or decoded.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido")

    sub = decoded.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido")

    empleado = db.query(Empleado).options(joinedload(Empleado.puesto_rel)).filter(Empleado.id == int(sub)).first()
    if not empleado:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")
    if settings.LOGIN_MAINTENANCE_RESTRICTED and not _puede_acceso_bloqueo_mantenimiento(db, empleado):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso suspendido temporalmente: solo Administrador, Gerente o Supervisor puede ingresar."
        )

    # Mantener el session_id activo (no regenerar en refresh; solo en login nuevo)
    session_id = empleado.session_id or str(uuid.uuid4()).replace("-", "")
    if not empleado.session_id:
        empleado.session_id = session_id
        db.commit()

    is_superuser = False
    if empleado.rol_id:
        rol_r = db.query(Rol).filter(Rol.id == empleado.rol_id).first()
        if rol_r and rol_r.nombre in ("Administrador", "Superuser"):
            is_superuser = True

    token_data = {"sub": str(empleado.id), "sid": session_id, "su": is_superuser}
    access_token = create_access_token(data=token_data)
    new_refresh_token = create_refresh_token(data=token_data)

    user_info = {
        "id": empleado.id,
        "numero_empleado": empleado.numero_empleado,
        "nombre": empleado.nombre,
        "apellido_paterno": empleado.apellido_paterno,
        "apellido_materno": empleado.apellido_materno,
        "email": empleado.email,
        "rol_id": empleado.rol_id,
    }
    # Reutilizar payload de /auth/me para mantener contrato.
    me_payload = get_me(current={"user_id": str(empleado.id)}, db=db)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=user_info,
        me=me_payload,
    )


@router.post("/login-form", response_model=TokenResponse)
def login_form(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Endpoint de login compatible con OAuth2PasswordRequestForm (para Swagger UI)
    """
    login_data = LoginRequest(username=form_data.username, password=form_data.password)
    return login(login_data, request, db)


@router.get("/me")
def get_me(
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Devuelve el empleado actual y si es jefe de área (departamentos a su cargo).
    Usado por el módulo Mi área / Justificaciones.
    """
    empleado_id = int(current["user_id"])
    empleado = db.query(Empleado).options(joinedload(Empleado.puesto_rel), joinedload(Empleado.departamento_rel)).filter(Empleado.id == empleado_id).first()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    departamentos = db.query(Departamento).filter(Departamento.jefe_id == empleado_id).all()
    is_jefe = len(departamentos) > 0
    departamento_ids = [d.id for d in departamentos]
    is_superuser = False
    is_rh = False
    is_gerente_general = False
    is_director = False
    is_ti = False
    if empleado.rol_id:
        rol = db.query(Rol).filter(Rol.id == empleado.rol_id).first()
        if rol:
            if rol.nombre in ("Administrador", "Superuser"):
                is_superuser = True
            if rol.nombre in ("RH", "Recursos Humanos", "Recursos humanos", "rh"):
                is_rh = True
            if rol.nombre in ("Gerente General", "Gerente general"):
                is_gerente_general = True
    if empleado.puesto_rel:
        puesto_lower = (empleado.puesto_rel.nombre or "").strip().lower()
        if puesto_lower == "director":
            is_director = True
        if puesto_lower == "gerente general":
            is_gerente_general = True
        if puesto_lower in ("rh", "recursos humanos"):
            is_rh = True
    if empleado.departamento_rel and _is_ti_department_name(empleado.departamento_rel.nombre or ""):
        is_ti = True
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
    puede_ver_dashboard = is_superuser or is_rh or is_gerente_general or is_director
    aniv = _calcular_aniversario_empresa(empleado.fecha_ingreso)
    return {
        "id": empleado.id,
        "numero_empleado": empleado.numero_empleado,
        "nombre": empleado.nombre,
        "apellido_paterno": empleado.apellido_paterno,
        "apellido_materno": empleado.apellido_materno,
        "email": empleado.email,
        "rol_id": empleado.rol_id,
        "fecha_nacimiento": empleado.fecha_nacimiento.isoformat() if empleado.fecha_nacimiento else None,
        "fecha_ingreso": aniv.get("fecha_ingreso"),
        "es_aniversario_hoy": aniv["es_aniversario_hoy"],
        "anios_empresa": aniv["anios_empresa"],
        "dias_vacaciones_aniversario": aniv["dias_vacaciones_aniversario"],
        "is_jefe": is_jefe,
        "is_superuser": is_superuser,
        "is_rh": is_rh,
        "is_gerente_general": is_gerente_general,
        "is_director": is_director,
        "is_ti": is_ti,
        "puede_ver_dashboard": puede_ver_dashboard,
        "puede_ver_mi_area": puede_ver_mi_area,
        "departamento_ids": departamento_ids,
        "departamentos": [{"id": d.id, "nombre": d.nombre} for d in departamentos],
        "departamentos_que_administro": departamentos_que_administro,
        "exento_incidencias": bool(getattr(empleado, "exento_incidencias", False)),
        "must_change_password": bool(getattr(empleado, "must_change_password", False)),
    }


@router.post("/cambiar-password")
def cambiar_password(
    body: CambiarPasswordRequest,
    request: Request,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    El colaborador cambia su propia contraseña (definitiva).
    - Si must_change_password: no pide la actual (ya entró con la temporal).
    - Si no: exige password_actual correcta.
    """
    empleado_id = int(current["user_id"])
    empleado = db.query(Empleado).filter(Empleado.id == empleado_id).first()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    nueva = (body.password_nueva or "").strip()
    if len(nueva) < 8:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 8 caracteres")

    debe_cambiar = bool(getattr(empleado, "must_change_password", False))
    if not debe_cambiar:
        actual = (body.password_actual or "").strip()
        if not actual:
            raise HTTPException(status_code=400, detail="Indica tu contraseña actual")
        if nueva == actual:
            raise HTTPException(status_code=400, detail="La nueva contraseña debe ser distinta a la actual")

        if not verify_and_upgrade_password(db, empleado, actual):
            raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")

    empleado.password_hash = get_password_hash(nueva)
    empleado.must_change_password = False
    db.commit()
    ActividadService.registrar(
        db,
        nivel="info",
        categoria="auth",
        mensaje="Contraseña cambiada por el colaborador",
        empleado_id=empleado_id,
        ip_cliente=_client_ip(request) or None,
        metodo_http="POST",
        ruta=(f"{settings.API_V1_PREFIX}/auth/cambiar-password")[:500],
        codigo_http=200,
        contexto={"forzado_por_must_change": debe_cambiar},
    )
    return {"ok": True, "mensaje": "Contraseña actualizada"}
