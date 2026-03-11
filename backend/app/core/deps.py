"""Dependencias compartidas (empleado actual, superuser, etc.)."""
from fastapi import Depends
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import get_current_user
from app.modules.personal.models import Empleado, Rol

SUPERUSER_ROL_NAMES = ("Administrador", "Superuser")
RH_ROL_NAMES = ("RH", "Recursos Humanos", "Recursos humanos", "rh")
GERENTE_GENERAL_ROL_NAMES = ("Gerente General", "Gerente general")


def get_current_empleado_with_rol(
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Devuelve user_id, is_jefe, is_superuser, is_rh, is_gerente_general, puede_ver_dashboard,
    puede_ver_mi_area, departamento_ids_que_administro.
    """
    empleado_id = int(current["user_id"])
    empleado = db.query(Empleado).options(joinedload(Empleado.puesto_rel)).filter(Empleado.id == empleado_id).first()
    is_superuser = False
    is_jefe = False
    is_rh = False
    is_gerente_general = False
    is_director = False
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
        if empleado.puesto_rel and (empleado.puesto_rel.nombre or "").strip().lower() == "director":
            is_director = True
        if empleado.puesto_rel and (empleado.puesto_rel.nombre or "").strip().lower() == "gerente general":
            is_gerente_general = True
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
        "puede_ver_dashboard": puede_ver_dashboard,
        "puede_ver_mi_area": puede_ver_mi_area,
        "departamento_ids_que_administro": departamento_ids_que_administro,
    }
