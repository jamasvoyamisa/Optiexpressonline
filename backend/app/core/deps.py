"""Dependencias compartidas (empleado actual, superuser, etc.)."""
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import get_current_user, get_current_user_download
from app.modules.personal.models import Empleado, Rol

SUPERUSER_ROL_NAMES = ("Administrador", "Superuser")
RH_ROL_NAMES = ("RH", "Recursos Humanos", "Recursos humanos", "rh")
GERENTE_GENERAL_ROL_NAMES = ("Gerente General", "Gerente general")


def _is_ti_department_name(nombre: str) -> bool:
    n = (nombre or "").strip().lower()
    return n in ("ti", "it", "sistemas", "tecnologia", "tecnologías de la información") or ("sistemas" in n) or ("tecnolog" in n)


def build_empleado_rol_context(empleado_id: int, db: Session) -> dict:
    """
    Contexto de permisos del empleado (misma lógica para Bearer y para ?download_token=).
    """
    empleado = (
        db.query(Empleado)
        .options(joinedload(Empleado.puesto_rel), joinedload(Empleado.departamento_rel))
        .filter(Empleado.id == empleado_id)
        .first()
    )
    is_superuser = False
    is_jefe = False
    is_rh = False
    is_gerente_general = False
    is_director = False
    is_ti = False
    departamento_ids_que_administro = []
    if empleado:
        if empleado.rol_id:
            rol = db.query(Rol).filter(Rol.id == empleado.rol_id).first()
            if rol:
                if rol.nombre in SUPERUSER_ROL_NAMES:
                    is_superuser = True
                if rol.nombre in RH_ROL_NAMES:
                    is_rh = True
                if rol.nombre in GERENTE_GENERAL_ROL_NAMES:
                    is_gerente_general = True
        if empleado.puesto_rel:
            puesto_lower = (empleado.puesto_rel.nombre or "").strip().lower()
            if puesto_lower in ("director", "director general", "director general adjunto"):
                is_director = True
            if puesto_lower in ("gerente general", "gerente administrativo y operaciones"):
                is_gerente_general = True
            if puesto_lower in ("rh", "recursos humanos"):
                is_rh = True
        if empleado.departamento_rel and _is_ti_department_name(empleado.departamento_rel.nombre or ""):
            is_ti = True
        from app.modules.personal.models import Departamento
        from app.modules.personal import service as personal_service
        jefe_count = db.query(Departamento).filter(Departamento.jefe_id == empleado_id).count()
        is_jefe = jefe_count > 0
        departamento_ids_que_administro = personal_service.PersonalService.get_departamento_ids_que_administro(db, empleado_id)
    puede_ver_dashboard = is_superuser or is_rh or is_gerente_general or is_director
    puede_ver_mi_area = len(departamento_ids_que_administro) > 0
    if not puede_ver_mi_area and empleado and empleado.puesto_rel:
        puesto_n = (empleado.puesto_rel.nombre or "").strip().lower()
        if "gerente" in puesto_n or "supervisor" in puesto_n:
            puede_ver_mi_area = True
    if is_gerente_general or is_superuser:
        puede_ver_mi_area = True
    return {
        "user_id": empleado_id,
        "is_jefe": is_jefe,
        "is_superuser": is_superuser,
        "is_rh": is_rh,
        "is_gerente_general": is_gerente_general,
        "is_director": is_director,
        "is_ti": is_ti,
        "puede_ver_dashboard": puede_ver_dashboard,
        "puede_ver_mi_area": puede_ver_mi_area,
        "departamento_ids_que_administro": departamento_ids_que_administro,
    }


def get_current_empleado_with_rol(
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Devuelve user_id, is_jefe, is_superuser, is_rh, is_gerente_general, puede_ver_dashboard,
    puede_ver_mi_area, departamento_ids_que_administro.
    """
    return build_empleado_rol_context(int(current["user_id"]), db)


def get_current_empleado_with_rol_download(
    current: dict = Depends(get_current_user_download),
    db: Session = Depends(get_db),
) -> dict:
    """Igual que get_current_empleado_with_rol pero con JWT en ?download_token= (enlace directo de descarga)."""
    return build_empleado_rol_context(int(current["user_id"]), db)


def require_superuser(
    ctx: dict = Depends(get_current_empleado_with_rol),
) -> dict:
    """Solo rol Administrador / Superuser."""
    if not ctx.get("is_superuser"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden realizar esta acción",
        )
    return ctx


def _build_ctx_from_user(current: dict, db: Session) -> dict:
    """Reutiliza la lógica de get_current_empleado_with_rol dado un dict de usuario."""
    from fastapi import Request
    # Construir ctx directamente sin crear una Request falsa
    empleado_id = int(current["user_id"])
    empleado = db.query(Empleado).options(joinedload(Empleado.puesto_rel)).filter(Empleado.id == empleado_id).first()
    is_superuser = False
    is_rh = False
    if empleado and empleado.rol_id:
        rol = db.query(Rol).filter(Rol.id == empleado.rol_id).first()
        if rol:
            if rol.nombre in SUPERUSER_ROL_NAMES:
                is_superuser = True
            if rol.nombre in RH_ROL_NAMES:
                is_rh = True
    if empleado and empleado.puesto_rel:
        puesto_lower = (empleado.puesto_rel.nombre or "").strip().lower()
        if puesto_lower in ("rh", "recursos humanos"):
            is_rh = True
    return {"user_id": empleado_id, "is_superuser": is_superuser, "is_rh": is_rh}


def require_superuser_download(
    current: dict = Depends(get_current_user_download),
    db: Session = Depends(get_db),
) -> dict:
    """Igual que require_superuser pero acepta token desde ?download_token=xxx."""
    ctx = _build_ctx_from_user(current, db)
    if not ctx.get("is_superuser"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden realizar esta acción",
        )
    return ctx


def require_superuser_or_rh(
    ctx: dict = Depends(get_current_empleado_with_rol),
) -> dict:
    """Solo rol Administrador / Superuser o RH."""
    if not (ctx.get("is_superuser") or ctx.get("is_rh")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores o RH pueden realizar esta acción",
        )
    return ctx


def require_superuser_or_rh_download(
    current: dict = Depends(get_current_user_download),
    db: Session = Depends(get_db),
) -> dict:
    """Igual que require_superuser_or_rh pero acepta token desde ?download_token=xxx."""
    ctx = _build_ctx_from_user(current, db)
    if not (ctx.get("is_superuser") or ctx.get("is_rh")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores o RH pueden realizar esta acción",
        )
    return ctx
