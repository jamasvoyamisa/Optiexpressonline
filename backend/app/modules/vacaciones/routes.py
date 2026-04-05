from datetime import datetime as dt
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user
from app.core.deps import get_current_empleado_with_rol

from . import schemas, service


def _require_superuser_vacaciones_generales(current: dict):
    if not current.get("is_superuser"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el administrador puede gestionar vacaciones generales",
        )


from .models import SolicitudVacaciones
from app.modules.notificaciones import service as noti_service

def _set_jefe_aprobador_nombre(solicitud: SolicitudVacaciones) -> None:
    if solicitud.jefe_aprobador:
        solicitud.jefe_aprobador_nombre = (
            f"{solicitud.jefe_aprobador.nombre} {solicitud.jefe_aprobador.apellido_paterno or ''}"
        ).strip()
        # Indicar si el aprobador es el jefe directo registrado del empleado
        # (o si fue otra persona, ej. admin)
        try:
            jefe_directo_id = solicitud.empleado.jefe_id if solicitud.empleado else None
            solicitud.aprobador_es_jefe_directo = (
                jefe_directo_id is not None and solicitud.jefe_aprobador_id == jefe_directo_id
            )
        except Exception:
            solicitud.aprobador_es_jefe_directo = None
    else:
        solicitud.jefe_aprobador_nombre = None
        solicitud.aprobador_es_jefe_directo = None

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/vacaciones", tags=["Vacaciones"])


@router.post("/solicitudes", response_model=schemas.SolicitudVacacionesResponse, status_code=status.HTTP_201_CREATED)
def create_solicitud(solicitud: schemas.SolicitudVacacionesCreate, db: Session = Depends(get_db)):
    """Crear nueva solicitud de vacaciones"""
    try:
        return service.VacacionesService.create_solicitud(db, solicitud)
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
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Crear solicitud de vacaciones del empleado actual. Requiere autenticación."""
    empleado_id = int(current["user_id"])
    solicitud = schemas.SolicitudVacacionesCreate(
        empleado_id=empleado_id,
        fecha_inicio=body.fecha_inicio,
        fecha_fin=body.fecha_fin,
        motivo=body.motivo
    )
    try:
        result = service.VacacionesService.create_solicitud(db, solicitud)
        # Notificar al jefe directo que hay una nueva solicitud pendiente
        try:
            from app.modules.personal.models import Empleado
            emp = db.query(Empleado).filter(Empleado.id == empleado_id).first()
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
    estado_sol = getattr(db_solicitud.estado, "value", str(db_solicitud.estado)).lower()
    if estado_sol == "cancelada" and db_solicitud.empleado_id != empleado_id and not current.get("is_superuser"):
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
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/solicitudes/{solicitud_id}/aprobar", response_model=schemas.SolicitudVacacionesResponse)
def aprobar_solicitud(
    solicitud_id: int,
    aprobacion: schemas.SolicitudVacacionesAprobar,
    jefe_id: int = Query(..., description="ID del jefe que aprueba"),
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Aprobar o rechazar. Gerentes aprueban vacaciones de su área. Las vacaciones de gerentes/supervisores solo las aprueban Admin, Director o Gerente General. RH solo confirma."""
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
            departamento_ids_que_administro=current_extra.get("departamento_ids_que_administro") or []
        )
        if result:
            _set_jefe_aprobador_nombre(result)
            # Notificar al empleado según el resultado
            try:
                if aprobacion.aprobar:
                    noti_service.crear_notificacion(
                        db,
                        empleado_id=result.empleado_id,
                        titulo="Solicitud aprobada por jefe",
                        mensaje="Tu solicitud de vacaciones fue aprobada por tu jefe directo y está pendiente de confirmación por RH.",
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
                                titulo="Solicitud pendiente de confirmación RH",
                                mensaje=f"La solicitud de vacaciones de {nombre_emp} fue aprobada por el jefe y requiere tu confirmación.",
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
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar solicitud: {str(e)}"
        )


@router.put("/solicitudes/{solicitud_id}/confirmar-rh", response_model=schemas.SolicitudVacacionesResponse)
def confirmar_solicitud_rh(
    solicitud_id: int,
    aprobacion: schemas.SolicitudVacacionesAprobar,
    current: dict = Depends(get_current_user),
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """
    Confirmación final de RH sobre una solicitud ya aprobada por el jefe.
    Esta vista es solo de confirmación: nadie puede rechazar desde aquí.
    Si se requiere rechazar, debe hacerse desde la vista del jefe (Mi Área).
    """
    if not aprobacion.aprobar:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Desde la confirmación de RH solo se puede aprobar. Para rechazar use la vista del jefe directo."
        )
    aprobador_id = int(current["user_id"])
    try:
        result = service.VacacionesService.confirmar_rh(
            db,
            solicitud_id,
            aprobador_id,
            aprobacion.aprobar,
            aprobacion.comentarios,
        )
        if result:
            _set_jefe_aprobador_nombre(result)
            # Notificar al empleado que RH confirmó sus vacaciones
            try:
                noti_service.crear_notificacion(
                    db,
                    empleado_id=result.empleado_id,
                    titulo="Vacaciones confirmadas por RH",
                    mensaje="Tu solicitud de vacaciones fue confirmada definitivamente por Recursos Humanos.",
                    tipo="solicitud_aprobada",
                    referencia_id=result.id,
                )
            except Exception:
                pass
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al confirmar solicitud: {str(e)}"
        )


@router.get("/solicitudes-pendientes-rh", response_model=List[schemas.SolicitudVacacionesResponse])
def get_solicitudes_pendientes_rh(
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
    db: Session = Depends(get_db),
    _current: dict = Depends(get_current_user),
):
    """
    Solicitudes aprobadas por el jefe/admin y pendientes de confirmación final por RH.
    Incluye quien dio la primera aprobación y si era el jefe directo del empleado.
    """
    from .models import EstadoSolicitud
    from app.modules.vacaciones import models as vac_models
    from sqlalchemy.orm import joinedload
    result = (
        db.query(vac_models.SolicitudVacaciones)
        .options(
            joinedload(vac_models.SolicitudVacaciones.jefe_aprobador),
            joinedload(vac_models.SolicitudVacaciones.empleado),
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
    return schemas.BalanceConPeriodosResponse(
        empleado_id=data["empleado_id"],
        año=data["año"],
        periodo_actual=schemas.PeriodoVacacionesResponse(**data["periodo_actual"]) if data.get("periodo_actual") else None,
        periodo_anterior=schemas.PeriodoVacacionesResponse(**data["periodo_anterior"]) if data.get("periodo_anterior") else None,
        dias_disponibles=data["dias_disponibles"],
        dias_tomados=data["dias_tomados"],
        dias_pendientes=data["dias_pendientes"],
        fecha_limite_goce=data.get("fecha_limite_goce"),
        dias_deuda_vacaciones_ley=data.get("dias_deuda_vacaciones_ley", Decimal("0")),
        saldo_dias_lft_neto=data["saldo_dias_lft_neto"],
    )


@router.get("/balance/{empleado_id}", response_model=schemas.BalanceConPeriodosResponse)
def get_balance(
    empleado_id: int,
    año: Optional[int] = Query(None, description="Año del balance (por defecto año actual)"),
    db: Session = Depends(get_db)
):
    """Balance de vacaciones con periodo actual y periodo anterior (por vencer). Días por LFT México; goce antes de 18 meses tras aniversario."""
    año_val = año or dt.now().year
    data = service.VacacionesService.get_balance_con_periodos(db, empleado_id, año_val)
    return schemas.BalanceConPeriodosResponse(
        empleado_id=data["empleado_id"],
        año=data["año"],
        periodo_actual=schemas.PeriodoVacacionesResponse(**data["periodo_actual"]) if data.get("periodo_actual") else None,
        periodo_anterior=schemas.PeriodoVacacionesResponse(**data["periodo_anterior"]) if data.get("periodo_anterior") else None,
        dias_disponibles=data["dias_disponibles"],
        dias_tomados=data["dias_tomados"],
        dias_pendientes=data["dias_pendientes"],
        fecha_limite_goce=data.get("fecha_limite_goce"),
        dias_deuda_vacaciones_ley=data.get("dias_deuda_vacaciones_ley", Decimal("0")),
        saldo_dias_lft_neto=data["saldo_dias_lft_neto"],
    )


@router.get("/dias-por-antiguedad/{empleado_id}")
def get_dias_por_antiguedad(
    empleado_id: int,
    año: Optional[int] = Query(None, description="Año de referencia (por defecto año actual)"),
    db: Session = Depends(get_db)
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
    db: Session = Depends(get_db)
):
    """Actualizar días disponibles en el balance"""
    from decimal import Decimal
    return service.VacacionesService.actualizar_dias_disponibles(
        db,
        empleado_id,
        Decimal(str(dias)),
        año
    )


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
