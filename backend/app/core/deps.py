"""Dependencias compartidas (empleado actual, superuser, etc.)."""
from typing import Optional
from fastapi import Depends
from sqlalchemy.orm import Session

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
    Devuelve user_id, is_jefe, is_superuser, is_rh, is_gerente_general.
    is_superuser: solo super admin autoriza todo (vacaciones de cualquiera).
    is_gerente_general: puede aprobar vacaciones solo de gerentes y supervisores.
    """
    empleado_id = int(current["user_id"])
    empleado = db.query(Empleado).filter(Empleado.id == empleado_id).first()
    is_superuser = False
    is_jefe = False
    is_rh = False
    is_gerente_general = False
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
        from app.modules.personal.models import Departamento
        jefe_count = db.query(Departamento).filter(Departamento.jefe_id == empleado_id).count()
        is_jefe = jefe_count > 0
    return {
        "user_id": empleado_id,
        "is_jefe": is_jefe,
        "is_superuser": is_superuser,
        "is_rh": is_rh,
        "is_gerente_general": is_gerente_general,
    }
