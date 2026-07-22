"""Registro explícito de actividad de negocio (solicitudes, incapacidades, RH, etc.)."""
from __future__ import annotations

from typing import Any, Dict, Optional, Union

from fastapi import Request
from sqlalchemy.orm import Session

from app.modules.audit.middleware import _client_ip
from app.modules.audit.service import ActividadService

CAMPOS_SENSIBLES = frozenset({
    "password",
    "password_hash",
    "clabe",
    "cuenta_bancaria",
    "numero_cuenta",
    "salario",
    "sueldo",
    "sueldo_diario",
    "nss",
    "curp",
    "rfc",
})


def actor_rol(current: Optional[dict]) -> str:
    if not current:
        return "otro"
    if current.get("is_superuser"):
        return "admin"
    if current.get("is_rh"):
        return "rh"
    if current.get("is_director"):
        return "director"
    if current.get("is_gerente_general"):
        return "gerente_general"
    return "otro"


def nombre_empleado(emp: Any) -> Optional[str]:
    if emp is None:
        return None
    return (
        " ".join(
            p for p in [
                getattr(emp, "nombre", None),
                getattr(emp, "apellido_paterno", None),
                getattr(emp, "apellido_materno", None),
            ]
            if p and str(p).strip()
        )
        or None
    )


def contexto_empleado_afectado(emp: Any = None, *, empleado_id: Optional[int] = None) -> Dict[str, Any]:
    eid = empleado_id
    if emp is not None and eid is None:
        eid = getattr(emp, "id", None)
    empresa = None
    if emp is not None:
        emp_empresa = getattr(emp, "empresa", None)
        if emp_empresa is not None:
            empresa = getattr(emp_empresa, "nombre", None)
    return {
        "empleado_afectado_id": eid,
        "empleado_afectado_numero": (
            (getattr(emp, "numero_empleado", None) if emp is not None else None) or (str(eid) if eid else None)
        ),
        "empleado_afectado_nombre": nombre_empleado(emp),
        "empleado_afectado_empresa": empresa,
    }


def sanitize_cambios(data: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not data:
        return None
    out: Dict[str, Any] = {}
    for k, v in data.items():
        if k in CAMPOS_SENSIBLES:
            out[k] = "[modificado]" if v is not None else None
        else:
            out[k] = v if not isinstance(v, (dict, list)) else str(v)[:200]
    return out


def registrar_negocio(
    db: Session,
    *,
    empleado_id: Optional[int],
    mensaje: str,
    contexto: Any = None,
) -> None:
    ActividadService.registrar(
        db,
        nivel="info",
        categoria="negocio",
        mensaje=mensaje,
        empleado_id=empleado_id,
        contexto=contexto,
    )


def registrar_accion_rh(
    db: Session,
    *,
    current: dict,
    mensaje: str,
    accion: str,
    request: Optional[Request] = None,
    empleado_afectado: Any = None,
    empleado_afectado_id: Optional[int] = None,
    cambios: Optional[Dict[str, Any]] = None,
    extras: Optional[Dict[str, Any]] = None,
    metodo_http: Optional[str] = None,
    ruta: Optional[str] = None,
    codigo_http: int = 200,
    categoria: str = "negocio",
) -> None:
    """
    Auditoría de acciones RH/admin: quién (actor) → qué (accion) → a quién (afectado).
    `empleado_id` del log = actor (quien hizo el cambio).
    """
    actor_id = None
    try:
        if current.get("user_id") is not None:
            actor_id = int(current["user_id"])
    except (TypeError, ValueError):
        actor_id = None

    ctx: Dict[str, Any] = {
        "accion": accion,
        "actor_rol": actor_rol(current),
        **contexto_empleado_afectado(empleado_afectado, empleado_id=empleado_afectado_id),
    }
    sanitized = sanitize_cambios(cambios)
    if sanitized:
        ctx["cambios"] = sanitized
    if extras:
        ctx.update(extras)

    ActividadService.registrar(
        db,
        nivel="info",
        categoria=categoria,
        mensaje=mensaje,
        empleado_id=actor_id,
        ip_cliente=(_client_ip(request) or None) if request is not None else None,
        metodo_http=metodo_http,
        ruta=(ruta[:500] if ruta else None),
        codigo_http=codigo_http,
        contexto=ctx,
    )
