import logging
from datetime import datetime as dt
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user, verify_empleado_password
from app.core.deps import get_current_empleado_with_rol, require_superuser, require_superuser_or_rh
from app.modules.audit.negocio import registrar_negocio
from app.modules.audit.middleware import _client_ip
from app.modules.audit.service import ActividadService
from app.modules.personal import models as personal_models

from . import schemas, service

logger = logging.getLogger(__name__)

TEXTO_ACEPTACION_SOLICITUD = (
    "Declaro que solicito estas vacaciones de forma voluntaria, "
    "acepto las fechas indicadas y confirmo con mi contraseña."
)


def _require_superuser_vacaciones_generales(current: dict):
    if not current.get("is_superuser"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el administrador puede gestionar vacaciones generales",
        )


def _nombre_empleado(emp: Optional[personal_models.Empleado]) -> Optional[str]:
    if not emp:
        return None
    return (
        " ".join(
            p for p in [emp.nombre, emp.apellido_paterno, emp.apellido_materno]
            if p and str(p).strip()
        )
        or None
    )


def _actor_rol(current: dict) -> str:
    if current.get("is_superuser"):
        return "admin"
    if current.get("is_rh"):
        return "rh"
    return "otro"


def _registrar_ajuste_saldo_vacaciones(
    db: Session,
    *,
    request: Request,
    current: dict,
    empleado_id: int,
    accion: str,
    mensaje: str,
    valor_anterior,
    valor_nuevo,
    ruta: str,
) -> None:
    actor_id = int(current["user_id"])
    afectado = (
        db.query(personal_models.Empleado)
        .filter(personal_models.Empleado.id == empleado_id)
        .first()
    )
    num_afectado = (afectado.numero_empleado if afectado else None) or str(empleado_id)
    empresa_afectado = (
        afectado.empresa.nombre if afectado and getattr(afectado, "empresa", None) else None
    )
    ActividadService.registrar(
        db,
        nivel="info",
        categoria="negocio",
        mensaje=mensaje,
        empleado_id=actor_id,
        ip_cliente=_client_ip(request) or None,
        metodo_http="PUT",
        ruta=ruta[:500],
        codigo_http=200,
        contexto={
            "accion": accion,
            "actor_rol": _actor_rol(current),
            "empleado_afectado_id": empleado_id,
            "empleado_afectado_numero": num_afectado,
            "empleado_afectado_nombre": _nombre_empleado(afectado),
            "empleado_afectado_empresa": empresa_afectado,
            "valor_anterior": str(valor_anterior),
            "valor_nuevo": str(valor_nuevo),
        },
    )


from .models import SolicitudVacaciones
from app.modules.notificaciones import service as noti_service

def _set_jefe_aprobador_nombre(solicitud: SolicitudVacaciones) -> None:
    if solicitud.jefe_aprobador:
        solicitud.jefe_aprobador_nombre = (
            f"{solicitud.jefe_aprobador.nombre} {solicitud.jefe_aprobador.apellido_paterno or ''}"
        ).strip()
        pr = getattr(solicitud.jefe_aprobador, "puesto_rel", None)
        pn = (getattr(pr, "nombre", None) or "").strip() if pr is not None else ""
        solicitud.jefe_aprobador_puesto = pn or None
        # Indicar si el aprobador es el jefe directo registrado del empleado
        # (o si fue otra persona, ej. admin)
        solicitud.aprobador_es_jefe_directo = service.compute_aprobador_es_jefe_directo(solicitud)
    else:
        solicitud.jefe_aprobador_nombre = None
        solicitud.jefe_aprobador_puesto = None
        solicitud.aprobador_es_jefe_directo = None

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/vacaciones", tags=["Vacaciones"])


def _balance_con_periodos_schema(data: dict) -> schemas.BalanceConPeriodosResponse:
    return schemas.BalanceConPeriodosResponse(
        empleado_id=data["empleado_id"],
        año=data["año"],
        periodo_actual=schemas.PeriodoVacacionesResponse(**data["periodo_actual"])
        if data.get("periodo_actual")
        else None,
        periodo_anterior=schemas.PeriodoVacacionesResponse(**data["periodo_anterior"])
        if data.get("periodo_anterior")
        else None,
        dias_disponibles=data["dias_disponibles"],
        dias_tomados=data["dias_tomados"],
        dias_pendientes=data["dias_pendientes"],
        fecha_limite_goce=data.get("fecha_limite_goce"),
        dias_deuda_vacaciones_ley=data.get("dias_deuda_vacaciones_ley", Decimal("0")),
        saldo_dias_lft_neto=data["saldo_dias_lft_neto"],
        dias_saldo_migracion_vacaciones=data.get("dias_saldo_migracion_vacaciones", Decimal("0")),
        saldo_total_con_migracion=data.get(
            "saldo_total_con_migracion", data.get("saldo_dias_lft_neto", Decimal("0"))
        ),
    )


@router.post(
    "/solicitudes",
    response_model=schemas.SolicitudVacacionesResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_superuser_or_rh)],
)
def create_solicitud(solicitud: schemas.SolicitudVacacionesCreate, db: Session = Depends(get_db)):
    """Crear solicitud de vacaciones a nombre de un empleado (uso de RH/Admin). El
    autoservicio del colaborador usa POST /mis-solicitudes, que exige contraseña y
    toma el empleado_id del token."""
    try:
        result = service.VacacionesService.create_solicitud(db, solicitud)
        registrar_negocio(
            db,
            empleado_id=solicitud.empleado_id,
            mensaje=f"Solicitud de vacaciones creada id={result.id} ({result.dias_solicitados} días)",
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/mis-solicitudes", response_model=List[schemas.SolicitudVacacionesResponse])
def get_mis_solicitudes(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    estado: Optional[str] = None,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Solicitudes de vacaciones del empleado actual. Requiere autenticación."""
    empleado_id = int(current["user_id"])
    result = service.VacacionesService.get_solicitudes(
        db,
        skip=skip,
        limit=limit,
        empleado_id=empleado_id,
        estado=estado,
        include_canceladas=True,
    )
    for s in result:
        _set_jefe_aprobador_nombre(s)
    return result


@router.post("/mis-solicitudes", response_model=schemas.SolicitudVacacionesResponse, status_code=status.HTTP_201_CREATED)
def create_mi_solicitud(
    body: schemas.SolicitudVacacionesCreateMine,
    request: Request,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Crear solicitud de vacaciones del empleado actual. Requiere aceptación + contraseña (Fase B)."""
    from datetime import datetime, timezone
    from app.modules.personal.models import Empleado

    empleado_id = int(current["user_id"])
    if not body.acepto:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes marcar que aceptas la solicitud de vacaciones.",
        )
    if not (body.password or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Indica tu contraseña para confirmar la solicitud.",
        )
    emp = db.query(Empleado).filter(Empleado.id == empleado_id).first()
    if not emp or not verify_empleado_password(emp, body.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contraseña incorrecta. No se creó la solicitud.",
        )

    solicitud = schemas.SolicitudVacacionesCreate(
        empleado_id=empleado_id,
        fecha_inicio=body.fecha_inicio,
        fecha_fin=body.fecha_fin,
        motivo=body.motivo,
        aceptacion_solicitante_at=datetime.now(timezone.utc),
        aceptacion_solicitante_ip=(_client_ip(request) or None),
        aceptacion_solicitante_texto=TEXTO_ACEPTACION_SOLICITUD,
    )
    try:
        result = service.VacacionesService.create_solicitud(db, solicitud)
        # Notificar al jefe directo que hay una nueva solicitud pendiente
        try:
            if emp and emp.jefe_id:
                nombre_emp = f"{emp.nombre} {emp.apellido_paterno or ''}".strip()
                fi = body.fecha_inicio.strftime("%d/%m/%Y")
                ff = body.fecha_fin.strftime("%d/%m/%Y")
                noti_service.crear_notificacion(
                    db,
                    empleado_id=emp.jefe_id,
                    titulo="Nueva solicitud de vacaciones",
                    mensaje=f"{nombre_emp} solicita vacaciones del {fi} al {ff}.",
                    tipo="nueva_solicitud",
                    referencia_id=result.id,
                )
        except Exception:
            pass
        registrar_negocio(
            db,
            empleado_id=empleado_id,
            mensaje=f"Solicitud de vacaciones creada id={result.id} ({result.dias_solicitados} días) con aceptación FES",
            contexto={
                "solicitud_id": result.id,
                "accion": "solicitar_fes",
                "dias": result.dias_solicitados,
                "aceptacion_at": getattr(result, "aceptacion_solicitante_at", None)
                or solicitud.aceptacion_solicitante_at,
                "aceptacion_ip": getattr(result, "aceptacion_solicitante_ip", None)
                or solicitud.aceptacion_solicitante_ip,
            },
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/solicitudes", response_model=List[schemas.SolicitudVacacionesResponse])
def get_solicitudes(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    empleado_id: Optional[int] = None,
    estado: Optional[str] = None,
    jefe_id: Optional[int] = None,
    departamento_id: Optional[int] = Query(
        None,
        description="Solo superusuario: filtrar por departamento del solicitante.",
    ),
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Listar solicitudes de vacaciones"""
    if empleado_id is not None:
        uid = int(current["user_id"])
        eid = int(empleado_id)
        if eid != uid and not current.get("is_superuser") and not current.get("is_rh"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No autorizado para listar solicitudes de otro empleado",
            )
    dept_filtro = departamento_id if current.get("is_superuser") else None
    result = service.VacacionesService.get_solicitudes(
        db,
        skip=skip,
        limit=limit,
        empleado_id=empleado_id,
        estado=estado,
        jefe_id=jefe_id,
        include_canceladas=bool(current.get("is_superuser")),
        departamento_id=dept_filtro,
    )
    for s in result:
        _set_jefe_aprobador_nombre(s)
    return result


@router.get("/solicitudes/{solicitud_id}", response_model=schemas.SolicitudVacacionesResponse)
def get_solicitud(
    solicitud_id: int,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    """Obtener solicitud por ID"""
    db_solicitud = service.VacacionesService.get_solicitud(db, solicitud_id)
    if not db_solicitud:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud no encontrada"
        )
    empleado_id = int(current["user_id"])

    # Solo puede verla: el propio solicitante, su jefe directo o de departamento, RH o Admin.
    # Antes cualquier empleado autenticado podía ver la solicitud de cualquier otro cambiando
    # el ID en la URL (motivo, fechas, comentarios de aprobación).
    es_propio = db_solicitud.empleado_id == empleado_id
    solicitante = db_solicitud.empleado
    es_su_jefe = bool(solicitante and getattr(solicitante, "jefe_id", None) == empleado_id)
    es_jefe_depto = bool(
        solicitante
        and getattr(solicitante, "departamento_rel", None)
        and getattr(solicitante.departamento_rel, "jefe_id", None) == empleado_id
    )
    if not (
        es_propio
        or es_su_jefe
        or es_jefe_depto
        or current.get("is_superuser")
        or current.get("is_rh")
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud no encontrada",
        )

    estado_sol = getattr(db_solicitud.estado, "value", str(db_solicitud.estado)).lower()
    if estado_sol == "cancelada" and not es_propio and not current.get("is_superuser"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud no encontrada",
        )
    _set_jefe_aprobador_nombre(db_solicitud)
    return db_solicitud


@router.put("/mis-solicitudes/{solicitud_id}/cancelar", response_model=schemas.SolicitudVacacionesResponse)
def cancelar_mi_solicitud(
    solicitud_id: int,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """El propio empleado cancela su solicitud. Solo permitido si está en estado PENDIENTE."""
    empleado_id = int(current["user_id"])
    try:
        result = service.VacacionesService.cancelar_solicitud(db, solicitud_id, empleado_id)
        _set_jefe_aprobador_nombre(result)
        registrar_negocio(
            db,
            empleado_id=empleado_id,
            mensaje=f"Solicitud de vacaciones cancelada id={solicitud_id}",
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/solicitudes/{solicitud_id}/aprobar", response_model=schemas.SolicitudVacacionesResponse)
def aprobar_solicitud(
    solicitud_id: int,
    aprobacion: schemas.SolicitudVacacionesAprobar,
    request: Request,
    jefe_id: int = Query(..., description="ID del jefe que aprueba"),
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Aprobar o rechazar. Al aprobar, el saldo se descuenta de inmediato; RH solo registra confirmación formal (o auto 24 h antes del inicio)."""
    from datetime import datetime, timezone
    from app.modules.personal.models import Empleado

    uid = int(current_extra["user_id"])
    if uid != int(jefe_id) and not current_extra.get("is_superuser"):
        raise HTTPException(status_code=403, detail="Solo puedes firmar con tu propio usuario.")
    if not aprobacion.acepto:
        raise HTTPException(status_code=400, detail="Debes confirmar la aceptación con el casilla de aceptación.")
    if not (aprobacion.password or "").strip():
        raise HTTPException(status_code=400, detail="Indica tu contraseña para confirmar la decisión.")
    firmante = db.query(Empleado).filter(Empleado.id == uid).first()
    if not firmante or not verify_empleado_password(firmante, aprobacion.password):
        raise HTTPException(status_code=400, detail="Contraseña incorrecta.")

    try:
        result = service.VacacionesService.aprobar_solicitud(
            db,
            solicitud_id,
            jefe_id,
            aprobacion.aprobar,
            aprobacion.comentarios,
            bypass_permiso=current_extra.get("is_superuser") is True,
            es_gerente_o_director=current_extra.get("is_gerente_general") is True or current_extra.get("is_director") is True,
            es_gerente_general=current_extra.get("is_gerente_general") is True,
            departamento_ids_que_administro=current_extra.get("departamento_ids_que_administro") or [],
            aceptacion_jefe_at=datetime.now(timezone.utc),
            aceptacion_jefe_ip=(_client_ip(request) or None),
        )
        if result:
            _set_jefe_aprobador_nombre(result)
            # Notificar al empleado según el resultado
            try:
                if aprobacion.aprobar:
                    noti_service.crear_notificacion(
                        db,
                        empleado_id=result.empleado_id,
                        titulo="Vacaciones aprobadas",
                        mensaje="Tu solicitud fue aprobada: los días ya se descontaron de tu saldo. RH puede dejar constancia formal; si no, el sistema confirma solo 24 h antes del inicio.",
                        tipo="solicitud_aprobada_jefe",
                        referencia_id=result.id,
                    )
                    # Notificar al personal de RH para confirmación
                    from app.modules.personal.models import Empleado, Rol
                    from app.core.deps import RH_ROL_NAMES
                    rh_roles = db.query(Rol).filter(Rol.nombre.in_(RH_ROL_NAMES)).all()
                    rh_ids = {r.id for r in rh_roles}
                    if rh_ids:
                        rh_empleados = db.query(Empleado).filter(Empleado.rol_id.in_(rh_ids)).all()
                        emp = db.query(Empleado).filter(Empleado.id == result.empleado_id).first()
                        nombre_emp = f"{emp.nombre} {emp.apellido_paterno or ''}".strip() if emp else "Un empleado"
                        for rh_emp in rh_empleados:
                            noti_service.crear_notificacion(
                                db,
                                empleado_id=rh_emp.id,
                                titulo="Registro formal RH (vacaciones)",
                                mensaje=f"La solicitud de {nombre_emp} ya está aprobada y descontada; puedes registrar confirmación formal si aplica.",
                                tipo="solicitud_pendiente_rh",
                                referencia_id=result.id,
                            )
                else:
                    noti_service.crear_notificacion(
                        db,
                        empleado_id=result.empleado_id,
                        titulo="Solicitud rechazada",
                        mensaje=f"Tu solicitud de vacaciones fue rechazada.{' Motivo: ' + aprobacion.comentarios if aprobacion.comentarios else ''}",
                        tipo="solicitud_rechazada",
                        referencia_id=result.id,
                    )
            except Exception:
                pass
            accion = "aprobada por jefe (saldo descontado)" if aprobacion.aprobar else "rechazada por jefe"
            solicitante = db.query(Empleado).filter(Empleado.id == result.empleado_id).first()
            num_solicitante = (solicitante.numero_empleado if solicitante else None) or str(result.empleado_id)
            registrar_negocio(
                db,
                empleado_id=jefe_id,
                mensaje=f"Solicitud vacaciones id={solicitud_id} {accion}; solicitante No. {num_solicitante}",
                contexto={
                    "solicitud_id": solicitud_id,
                    "accion": "aprobar_jefe" if aprobacion.aprobar else "rechazar_jefe",
                    "empleado_solicitante_id": result.empleado_id,
                    "empleado_solicitante_numero": num_solicitante,
                    "aceptacion_at": getattr(result, "aceptacion_jefe_at", None),
                    "aceptacion_ip": getattr(result, "aceptacion_jefe_ip", None),
                },
            )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception:
        logger.exception("Error al procesar solicitud de vacaciones (aprobación jefe)")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al procesar la solicitud. Intenta de nuevo o contacta a soporte."
        )


@router.put("/solicitudes/{solicitud_id}/confirmar-rh", response_model=schemas.SolicitudVacacionesResponse)
def confirmar_solicitud_rh(
    solicitud_id: int,
    aprobacion: schemas.SolicitudVacacionesAprobar,
    request: Request,
    current: dict = Depends(get_current_user),
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """
    Registro formal de RH (sin descuento de saldo: ya ocurrió al aprobar el jefe).
    Solo rechazo desde la vista del jefe antes del inicio si aplica políticas internas.
    """
    from datetime import datetime, timezone
    from app.modules.personal.models import Empleado

    if not aprobacion.aprobar:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Desde la confirmación de RH solo se puede aprobar. Para rechazar use la vista del jefe directo."
        )
    if not aprobacion.acepto:
        raise HTTPException(status_code=400, detail="Debes confirmar la aceptación para el registro formal de RH.")
    if not (aprobacion.password or "").strip():
        raise HTTPException(status_code=400, detail="Indica tu contraseña para confirmar el registro de RH.")
    aprobador_id = int(current["user_id"])
    firmante = db.query(Empleado).filter(Empleado.id == aprobador_id).first()
    if not firmante or not verify_empleado_password(firmante, aprobacion.password):
        raise HTTPException(status_code=400, detail="Contraseña incorrecta.")
    try:
        result = service.VacacionesService.confirmar_rh(
            db,
            solicitud_id,
            aprobador_id,
            aprobacion.aprobar,
            aprobacion.comentarios,
            aceptacion_rh_at=datetime.now(timezone.utc),
            aceptacion_rh_ip=(_client_ip(request) or None),
        )
        if result:
            _set_jefe_aprobador_nombre(result)
            # Notificar al empleado que RH confirmó sus vacaciones
            try:
                noti_service.crear_notificacion(
                    db,
                    empleado_id=result.empleado_id,
                    titulo="Constancia RH — vacaciones",
                    mensaje="Recursos Humanos registró la confirmación formal de tus vacaciones (el saldo ya había quedado aplicado al aprobar tu jefe).",
                    tipo="solicitud_aprobada",
                    referencia_id=result.id,
                )
            except Exception:
                pass
            solicitante = db.query(Empleado).filter(Empleado.id == result.empleado_id).first()
            num_solicitante = (solicitante.numero_empleado if solicitante else None) or str(result.empleado_id)
            registrar_negocio(
                db,
                empleado_id=aprobador_id,
                mensaje=f"Solicitud vacaciones confirmada por RH id={solicitud_id}; No. empleado {num_solicitante}",
                contexto={
                    "solicitud_id": solicitud_id,
                    "accion": "confirmar_rh_fes",
                    "empleado_solicitante_id": result.empleado_id,
                    "empleado_solicitante_numero": num_solicitante,
                    "aceptacion_at": getattr(result, "aceptacion_rh_at", None),
                    "aceptacion_ip": getattr(result, "aceptacion_rh_ip", None),
                },
            )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception:
        logger.exception("Error al confirmar solicitud de vacaciones (RH)")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al confirmar la solicitud. Intenta de nuevo o contacta a soporte."
        )


@router.get("/solicitudes-pendientes-rh", response_model=List[schemas.SolicitudVacacionesResponse])
def get_solicitudes_pendientes_rh(
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
    db: Session = Depends(get_db),
    _current: dict = Depends(get_current_user),
):
    """
    Solicitudes aprobadas por jefe pendientes de registro formal RH (saldo ya descontado).
    Incluye quién aprobó y si era jefe directo.
    """
    from .models import EstadoSolicitud
    from app.modules.vacaciones import models as vac_models
    from sqlalchemy.orm import joinedload
    from app.modules.personal.models import Empleado as EmpModel

    result = (
        db.query(vac_models.SolicitudVacaciones)
        .options(
            joinedload(vac_models.SolicitudVacaciones.jefe_aprobador).joinedload(
                EmpModel.puesto_rel
            ),
            joinedload(vac_models.SolicitudVacaciones.empleado).joinedload(EmpModel.puesto_rel),
            joinedload(vac_models.SolicitudVacaciones.empleado).joinedload(EmpModel.departamento_rel),
        )
        .filter(vac_models.SolicitudVacaciones.estado == EstadoSolicitud.APROBADA_JEFE)
        .order_by(vac_models.SolicitudVacaciones.fecha_aprobacion)
        .offset(skip)
        .limit(limit)
        .all()
    )
    for s in result:
        _set_jefe_aprobador_nombre(s)
    return result


@router.get("/mi-balance", response_model=schemas.BalanceConPeriodosResponse)
def get_mi_balance(
    año: Optional[int] = Query(None, description="Año del balance (por defecto año actual)"),
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Balance de vacaciones con periodo actual y periodo anterior (por vencer). Requiere autenticación."""
    empleado_id = int(current["user_id"])
    año_val = año or dt.now().year
    data = service.VacacionesService.get_balance_con_periodos(db, empleado_id, año_val)
    return _balance_con_periodos_schema(data)


@router.get("/balance/{empleado_id}", response_model=schemas.BalanceConPeriodosResponse)
def get_balance(
    empleado_id: int,
    año: Optional[int] = Query(None, description="Año del balance (por defecto año actual)"),
    _ctx: dict = Depends(require_superuser_or_rh),
    db: Session = Depends(get_db),
):
    """Balance de vacaciones con periodo actual y periodo anterior (por vencer). Días por LFT México; goce antes de 18 meses tras aniversario."""
    año_val = año or dt.now().year
    data = service.VacacionesService.get_balance_con_periodos(db, empleado_id, año_val)
    return _balance_con_periodos_schema(data)


@router.get("/dias-por-antiguedad/{empleado_id}")
def get_dias_por_antiguedad(
    empleado_id: int,
    año: Optional[int] = Query(None, description="Año de referencia (por defecto año actual)"),
    _ctx: dict = Depends(require_superuser_or_rh),
    db: Session = Depends(get_db),
):
    """
    Días de vacaciones que corresponden al empleado por antigüedad según LFT México.
    Tras 1 año = 12 días; +2 por año hasta 20; luego +2 cada 5 años.
    """
    return service.VacacionesService.dias_derecho_empleado(db, empleado_id, año)


@router.put("/balance/{empleado_id}/dias-disponibles", response_model=schemas.BalanceVacacionesResponse)
def actualizar_dias_disponibles(
    empleado_id: int,
    dias: float,
    año: Optional[int] = Query(None),
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """Actualizar días disponibles en el balance (balance anual clásico). Solo administrador."""
    from decimal import Decimal
    return service.VacacionesService.actualizar_dias_disponibles(
        db,
        empleado_id,
        Decimal(str(dias)),
        año
    )


@router.put("/admin/empleado/{empleado_id}/saldo-lft-neto", response_model=schemas.BalanceConPeriodosResponse)
def admin_actualizar_saldo_lft_neto(
    empleado_id: int,
    body: schemas.SaldoLftNetoAdminBody,
    request: Request,
    current: dict = Depends(require_superuser_or_rh),
    db: Session = Depends(get_db),
):
    """Ajusta el saldo LFT neto del empleado (misma lógica que importación de personal). Admin o RH."""
    año_val = dt.now().year
    prev = service.VacacionesService.get_balance_con_periodos(db, empleado_id, año_val)
    valor_anterior = prev.get("saldo_dias_lft_neto", Decimal("0"))
    try:
        service.VacacionesService.aplicar_saldo_lft_neto_import(
            db, empleado_id, body.saldo_lft_neto, do_commit=True
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    data = service.VacacionesService.get_balance_con_periodos(db, empleado_id, año_val)
    valor_nuevo = data.get("saldo_dias_lft_neto", body.saldo_lft_neto)
    afectado = (
        db.query(personal_models.Empleado)
        .filter(personal_models.Empleado.id == empleado_id)
        .first()
    )
    num = (afectado.numero_empleado if afectado else None) or str(empleado_id)
    _registrar_ajuste_saldo_vacaciones(
        db,
        request=request,
        current=current,
        empleado_id=empleado_id,
        accion="ajuste_saldo_lft_neto",
        mensaje=(
            f"Ajuste saldo LFT neto vacaciones: No. {num} "
            f"de {valor_anterior} a {valor_nuevo} ({_actor_rol(current)})"
        ),
        valor_anterior=valor_anterior,
        valor_nuevo=valor_nuevo,
        ruta=f"{settings.API_V1_PREFIX}/vacaciones/admin/empleado/{empleado_id}/saldo-lft-neto",
    )
    return _balance_con_periodos_schema(data)


@router.put(
    "/admin/empleado/{empleado_id}/saldo-migracion-vacaciones",
    response_model=schemas.BalanceConPeriodosResponse,
)
def admin_actualizar_saldo_migracion_vacaciones(
    empleado_id: int,
    body: schemas.SaldoMigracionVacacionesAdminBody,
    request: Request,
    current: dict = Depends(require_superuser_or_rh),
    db: Session = Depends(get_db),
):
    """
    Fija el saldo de migración (días fuera de la tabla LFT). Admin o RH.
    Los nuevos periodos por aniversario siguen calculándose solo con la LFT.
    """
    afectado_prev = (
        db.query(personal_models.Empleado)
        .filter(personal_models.Empleado.id == empleado_id)
        .first()
    )
    valor_anterior = Decimal(
        str(afectado_prev.dias_saldo_migracion_vacaciones or 0) if afectado_prev else 0
    )
    try:
        service.VacacionesService.aplicar_saldo_migracion_vacaciones_admin(
            db, empleado_id, body.dias_saldo_migracion_vacaciones, do_commit=True
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    año_val = dt.now().year
    data = service.VacacionesService.get_balance_con_periodos(db, empleado_id, año_val)
    valor_nuevo = data.get("dias_saldo_migracion_vacaciones", body.dias_saldo_migracion_vacaciones)
    num = (afectado_prev.numero_empleado if afectado_prev else None) or str(empleado_id)
    _registrar_ajuste_saldo_vacaciones(
        db,
        request=request,
        current=current,
        empleado_id=empleado_id,
        accion="ajuste_saldo_migracion_vacaciones",
        mensaje=(
            f"Ajuste bolsa vacaciones (migración): No. {num} "
            f"de {valor_anterior} a {valor_nuevo} ({_actor_rol(current)})"
        ),
        valor_anterior=valor_anterior,
        valor_nuevo=valor_nuevo,
        ruta=(
            f"{settings.API_V1_PREFIX}/vacaciones/admin/empleado/"
            f"{empleado_id}/saldo-migracion-vacaciones"
        ),
    )
    return _balance_con_periodos_schema(data)


@router.get("/generales", response_model=List[schemas.VacacionGeneralResponse])
def listar_vacaciones_generales(
    solo_activos: bool = Query(False),
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    _require_superuser_vacaciones_generales(current)
    items = service.VacacionesService.listar_vacaciones_generales(db, solo_activos=solo_activos)
    ids = [v.id for v in items]
    counts = service.VacacionesService.conteos_aplicaciones_vacaciones_generales(db, ids)
    out: List[schemas.VacacionGeneralResponse] = []
    for v in items:
        n = counts.get(v.id, 0)
        row = schemas.VacacionGeneralResponse.model_validate(v, from_attributes=True)
        out.append(
            row.model_copy(update={"aplicado": n > 0, "empleados_aplicados": n})
        )
    return out


@router.post("/generales", response_model=schemas.VacacionGeneralResponse, status_code=status.HTTP_201_CREATED)
def crear_vacacion_general(
    body: schemas.VacacionGeneralCreate,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    _require_superuser_vacaciones_generales(current)
    try:
        return service.VacacionesService.crear_vacacion_general(db, body)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/generales/{vacacion_id}/aplicar", response_model=schemas.AplicarVacacionGeneralResultado)
def aplicar_vacacion_general(
    vacacion_id: int,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """Descuenta días LFT y registra días regalo para empleados del alcance (idempotente por empleado)."""
    _require_superuser_vacaciones_generales(current)
    try:
        return service.VacacionesService.aplicar_vacacion_general(db, vacacion_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
