import logging
from calendar import monthrange
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from . import models, schemas
from app.modules.personal import models as pm
from app.modules.vacaciones.service import _anios_antiguedad
from app.core.timezone_utils import hoy_mexico

logger = logging.getLogger(__name__)

# Política estándar (empleados y RH sin excepción): solicitud desde la app / RH.
PRESTAMO_MONTO_MAX_ESTANDAR = Decimal("6000.00")
PRESTAMO_PLAZO_MAX_QUINCENAS = 8
PRESTAMO_ANTIGUEDAD_MINIMA_ANIOS = 1


ESTADOS_PRESTAMO_ACTIVO = (
    models.EstadoSolicitudPrestamo.PENDIENTE,
    models.EstadoSolicitudPrestamo.APROBADA_DEPARTAMENTO,
    models.EstadoSolicitudPrestamo.DEPOSITADO,
)


def _empleado_tiene_prestamo_activo(db: Session, empleado_id: int) -> bool:
    """Un solo préstamo/solicitud activa: pendiente, autorizada por departamento o depositada (en curso)."""
    return (
        db.query(models.SolicitudPrestamo.id)
        .filter(
            models.SolicitudPrestamo.empleado_id == empleado_id,
            models.SolicitudPrestamo.estado.in_(ESTADOS_PRESTAMO_ACTIVO),
        )
        .first()
        is not None
    )


def _validar_limites_prestamo(monto: Decimal, plazo_quincenas: int, permitir_excepcion: bool) -> None:
    """
    Monto máximo $6,000 y plazo máximo 8 quincenas, salvo excepción
    autorizada (Gerente General, Director, Administrador al crear desde RH).
    """
    if permitir_excepcion:
        return
    if monto > PRESTAMO_MONTO_MAX_ESTANDAR:
        raise ValueError(
            f"El monto máximo permitido es ${PRESTAMO_MONTO_MAX_ESTANDAR:,.2f} MXN. "
            "Para montos mayores, un Gerente General, Director o Administrador puede registrar la solicitud "
            "desde Recursos Humanos marcando «excepción a la política»."
        )
    if plazo_quincenas > PRESTAMO_PLAZO_MAX_QUINCENAS:
        raise ValueError(
            f"El plazo máximo es {PRESTAMO_PLAZO_MAX_QUINCENAS} quincenas. "
            "Para plazos mayores, use una excepción autorizada (Gerente General, Director o Administrador) en el módulo RH."
        )


def _validar_antiguedad_minima_prestamo(emp: pm.Empleado) -> None:
    """Regla de negocio: el empleado debe tener al menos 1 año completo de antigüedad."""
    anios = _anios_antiguedad(getattr(emp, "fecha_ingreso", None), hoy_mexico())
    if anios < PRESTAMO_ANTIGUEDAD_MINIMA_ANIOS:
        raise ValueError(
            "No puedes solicitar préstamos hasta cumplir al menos 1 año en la empresa."
        )


def _notificar_jefe_departamento_solicitud(
    db: Session,
    empleado_solicitante_id: int,
    titulo: str,
    mensaje: str,
    tipo: str,
    referencia_id: int,
) -> None:
    """Notifica al jefe del departamento del solicitante; si no hay jefe, avisa a GG/Director/Admin."""
    try:
        from app.modules.notificaciones import service as noti_service
        from app.modules.personal.models import Empleado, Departamento

        emp = db.query(Empleado).filter(Empleado.id == empleado_solicitante_id).first()
        if emp and emp.departamento_id:
            dept = (
                db.query(Departamento)
                .filter(Departamento.id == emp.departamento_id)
                .first()
            )
            if dept and dept.jefe_id:
                noti_service.crear_notificacion(
                    db,
                    dept.jefe_id,
                    titulo=titulo,
                    tipo=tipo,
                    mensaje=mensaje,
                    referencia_id=referencia_id,
                )
                return
        _notificar_gerentes(db, titulo, mensaje, tipo, referencia_id)
    except Exception:
        logger.exception(
            "Notificación préstamo (jefe/GG) no enviada: referencia_id=%s", referencia_id
        )


def _notificar_empleado_prestamo(
    db: Session,
    empleado_id: int,
    *,
    titulo: str,
    mensaje: str,
    tipo: str,
    referencia_id: int,
) -> None:
    """Crea notificación para el empleado; registra error en log si falla."""
    try:
        from app.modules.notificaciones import service as noti_service

        noti_service.crear_notificacion(
            db,
            empleado_id,
            titulo=titulo,
            tipo=tipo,
            mensaje=mensaje,
            referencia_id=referencia_id,
        )
    except Exception:
        logger.exception(
            "Notificación al empleado no enviada: empleado_id=%s tipo=%s solicitud_id=%s",
            empleado_id,
            tipo,
            referencia_id,
        )


def _notificar_gerentes(
    db: Session,
    titulo: str,
    mensaje: str,
    tipo: str,
    referencia_id: int,
) -> None:
    """Envía notificación a todos los empleados con rol o puesto de Gerente General/Director/Admin."""
    try:
        from app.modules.notificaciones import service as noti_service
        from app.modules.personal.models import Empleado, Rol, Puesto

        NOMBRES_ROL = ("Administrador", "Superuser", "Gerente General", "Gerente general", "Director")
        NOMBRES_PUESTO = (
            "gerente general",
            "gerente administrativo y operaciones",
            "director",
            "director general",
        )

        ids_a_notificar: set[int] = set()

        # Por rol
        roles = db.query(Rol).filter(Rol.nombre.in_(NOMBRES_ROL)).all()
        if roles:
            rol_ids = [r.id for r in roles]
            emps_rol = db.query(Empleado.id).filter(
                Empleado.rol_id.in_(rol_ids),
                Empleado.activo == True,
            ).all()
            for (eid,) in emps_rol:
                ids_a_notificar.add(eid)

        # Por puesto (independientemente del rol asignado)
        puestos = db.query(Puesto).all()
        puesto_ids = [p.id for p in puestos if p.nombre and p.nombre.strip().lower() in NOMBRES_PUESTO]
        if puesto_ids:
            emps_puesto = db.query(Empleado.id).filter(
                Empleado.puesto_id.in_(puesto_ids),
                Empleado.activo == True,
            ).all()
            for (eid,) in emps_puesto:
                ids_a_notificar.add(eid)

        for emp_id in ids_a_notificar:
            noti_service.crear_notificacion(
                db, emp_id, titulo=titulo, tipo=tipo,
                mensaje=mensaje, referencia_id=referencia_id,
            )
    except Exception:
        logger.exception(
            "Notificación a gerentes no enviada: referencia_id=%s", referencia_id
        )


def _calcular_descuento_quincenal(monto: Decimal, plazo_quincenas: int) -> Decimal:
    """Calcula el descuento quincenal: monto / plazo_quincenas."""
    if plazo_quincenas <= 0:
        return Decimal("0")
    return (monto / plazo_quincenas).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _contar_quincenas_calendario_utc(desde: datetime) -> int:
    """Cuenta quincenas de calendario (día 15 y fin de mes) ya pasadas desde desde hasta hoy, en UTC."""
    if desde.tzinfo is None:
        desde = desde.replace(tzinfo=timezone.utc)
    d = desde.astimezone(timezone.utc).date()
    hoy = datetime.now(timezone.utc).date()
    ay, am, ad = d.year, d.month - 1, d.day
    ty, tm, td = hoy.year, hoy.month - 1, hoy.day
    if ay > ty or (ay == ty and am > tm) or (ay == ty and am == tm and ad > td):
        return 0
    count = 0
    for y in range(ay, ty + 1):
        start_m = am if y == ay else 0
        end_m = tm if y == ty else 11
        for m in range(start_m, end_m + 1):
            last_day = monthrange(y, m + 1)[1]
            q15_ok = (y > ay or (y == ay and m > am) or (y == ay and m == am and 15 >= ad)) and (
                y < ty or (y == ty and m < tm) or (y == ty and m == tm and td >= 15)
            )
            if q15_ok:
                count += 1
            if last_day != 15:
                qfin_ok = (y > ay or (y == ay and m > am) or (y == ay and m == am and last_day >= ad)) and (
                    y < ty or (y == ty and m < tm) or (y == ty and m == tm and td >= last_day)
                )
                if qfin_ok:
                    count += 1
    return count


def calcular_saldo_restante(sol: models.SolicitudPrestamo) -> Optional[Decimal]:
    """Saldo restante para préstamos depositados: monto - (quincenas pasadas * descuento_quincenal). None si no aplica."""
    if sol.estado == models.EstadoSolicitudPrestamo.FINALIZADO:
        return Decimal("0")
    if sol.estado != models.EstadoSolicitudPrestamo.DEPOSITADO:
        return None
    fecha_base = sol.fecha_deposito or sol.fecha_aprobacion
    if not fecha_base:
        return None
    monto = sol.monto
    desc = sol.descuento_quincenal or Decimal("0")
    if desc <= 0:
        return None
    n = _contar_quincenas_calendario_utc(fecha_base)
    saldo = monto - (n * desc)
    return max(Decimal("0"), saldo)


def sincronizar_estado_liquidado(db: Session, sol: models.SolicitudPrestamo) -> models.SolicitudPrestamo:
    """Si el préstamo depositado ya no tiene saldo, pasa a finalizado."""
    if sol.estado != models.EstadoSolicitudPrestamo.DEPOSITADO:
        return sol
    saldo = calcular_saldo_restante(sol)
    if saldo is not None and saldo <= Decimal("0"):
        sol.estado = models.EstadoSolicitudPrestamo.FINALIZADO
        db.commit()
        db.refresh(sol)
    return sol


def saldo_restante_para_respuesta(db: Session, sol: models.SolicitudPrestamo) -> Optional[Decimal]:
    """Calcula saldo y, si aplica, actualiza el estado a finalizado."""
    if sol.estado == models.EstadoSolicitudPrestamo.FINALIZADO:
        return Decimal("0")
    sol = sincronizar_estado_liquidado(db, sol)
    if sol.estado == models.EstadoSolicitudPrestamo.FINALIZADO:
        return Decimal("0")
    return calcular_saldo_restante(sol)


def to_response(db: Session, sol: models.SolicitudPrestamo) -> schemas.SolicitudPrestamoResponse:
    saldo = saldo_restante_para_respuesta(db, sol)
    return schemas.SolicitudPrestamoResponse.model_validate(sol).model_copy(update={"saldo_restante": saldo})


def listar_solicitudes(
    db: Session,
    empleado_id: Optional[int] = None,
    estado: Optional[str] = None,
    include_canceladas: bool = False,
    skip: int = 0,
    limit: int = 200,
) -> List[models.SolicitudPrestamo]:
    q = db.query(models.SolicitudPrestamo).options(
        joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.empresa),
        joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.departamento_rel),
        joinedload(models.SolicitudPrestamo.aprobador),
    )
    if empleado_id:
        q = q.filter(models.SolicitudPrestamo.empleado_id == empleado_id)
    if estado:
        q = q.filter(models.SolicitudPrestamo.estado == models.EstadoSolicitudPrestamo(estado))
    if not include_canceladas:
        q = q.filter(models.SolicitudPrestamo.estado != models.EstadoSolicitudPrestamo.CANCELADA)
    return q.order_by(models.SolicitudPrestamo.created_at.desc()).offset(skip).limit(limit).all()


def _asignar_numero_solicitud(db: Session, sol: models.SolicitudPrestamo) -> None:
    """Genera y persiste el número de solicitud único: PRE-{año}-{id:06d}."""
    año = sol.created_at.year if sol.created_at else __import__('datetime').datetime.utcnow().year
    sol.numero_solicitud = f"PRE-{año}-{sol.id:06d}"
    db.commit()


def crear_solicitud(
    db: Session,
    data: schemas.SolicitudPrestamoCreate,
    empleado_id: int,
) -> models.SolicitudPrestamo:
    emp = db.query(pm.Empleado).filter(pm.Empleado.id == empleado_id).first()
    if not emp:
        raise ValueError("Empleado no encontrado")
    if getattr(emp, "exento_incidencias", False):
        raise ValueError("Los usuarios especiales no pueden solicitar préstamos.")
    _validar_antiguedad_minima_prestamo(emp)
    _validar_limites_prestamo(data.monto, data.plazo_meses, permitir_excepcion=False)
    if _empleado_tiene_prestamo_activo(db, empleado_id):
        raise ValueError(
            "Ya tiene un préstamo o solicitud activa (pendiente, en aprobación o aprobado). "
            "No puede solicitar otro hasta cancelar la solicitud pendiente o cuando el préstamo actual deje de estar vigente."
        )
    descuento = _calcular_descuento_quincenal(data.monto, data.plazo_meses)
    sol = models.SolicitudPrestamo(
        empleado_id=empleado_id,
        monto=data.monto,
        plazo_meses=data.plazo_meses,
        motivo=data.motivo,
        descuento_quincenal=descuento,
    )
    db.add(sol)
    db.commit()
    db.refresh(sol)
    _asignar_numero_solicitud(db, sol)
    resultado = _con_relaciones(db, sol.id)
    # Notificar al jefe del departamento (o GG si no hay jefe)
    nombre_emp = ""
    if resultado and resultado.empleado:
        nombre_emp = f"{resultado.empleado.nombre} {resultado.empleado.apellido_paterno or ''}".strip()
    monto_fmt = f"${float(data.monto):,.2f}"
    _notificar_jefe_departamento_solicitud(
        db,
        empleado_id,
        titulo=f"Nueva solicitud de préstamo — {nombre_emp}",
        mensaje=f"Monto: {monto_fmt} · Plazo: {data.plazo_meses} quincenas",
        tipo="nueva_solicitud",
        referencia_id=sol.id,
    )
    return resultado


def crear_solicitud_rh(
    db: Session,
    data: schemas.SolicitudPrestamoCreateRH,
    permitir_excepcion: bool = False,
) -> models.SolicitudPrestamo:
    emp = db.query(pm.Empleado).filter(pm.Empleado.id == data.empleado_id).first()
    if not emp:
        raise ValueError("Empleado no encontrado")
    _validar_antiguedad_minima_prestamo(emp)
    _validar_limites_prestamo(data.monto, data.plazo_meses, permitir_excepcion=permitir_excepcion)
    if _empleado_tiene_prestamo_activo(db, data.empleado_id):
        raise ValueError(
            "Este empleado ya tiene un préstamo o solicitud activa. No se puede registrar otra hasta finalizar o cancelar la actual."
        )
    descuento = _calcular_descuento_quincenal(data.monto, data.plazo_meses)
    sol = models.SolicitudPrestamo(
        empleado_id=data.empleado_id,
        monto=data.monto,
        plazo_meses=data.plazo_meses,
        motivo=data.motivo,
        descuento_quincenal=descuento,
    )
    db.add(sol)
    db.commit()
    db.refresh(sol)
    _asignar_numero_solicitud(db, sol)
    resultado = _con_relaciones(db, sol.id)
    # Notificar a gerentes de la nueva solicitud
    nombre_emp = ""
    if resultado and resultado.empleado:
        nombre_emp = f"{resultado.empleado.nombre} {resultado.empleado.apellido_paterno or ''}".strip()
    monto_fmt = f"${float(data.monto):,.2f}"
    _notificar_jefe_departamento_solicitud(
        db,
        data.empleado_id,
        titulo=f"Nueva solicitud de préstamo — {nombre_emp}",
        mensaje=f"Monto: {monto_fmt} · Plazo: {data.plazo_meses} quincenas",
        tipo="nueva_solicitud",
        referencia_id=sol.id,
    )
    return resultado


def get_solicitud(db: Session, solicitud_id: int) -> Optional[models.SolicitudPrestamo]:
    return _con_relaciones(db, solicitud_id)


def actualizar_solicitud(
    db: Session,
    solicitud_id: int,
    data: schemas.SolicitudPrestamoUpdate,
) -> Optional[models.SolicitudPrestamo]:
    sol = db.query(models.SolicitudPrestamo).filter(models.SolicitudPrestamo.id == solicitud_id).first()
    if not sol:
        return None
    if sol.estado != models.EstadoSolicitudPrestamo.PENDIENTE:
        return None  # Solo se puede editar si está pendiente
    if data.monto is not None:
        sol.monto = data.monto
    if data.plazo_meses is not None:
        sol.plazo_meses = data.plazo_meses
    if data.motivo is not None:
        sol.motivo = data.motivo
    # Empleado editando su solicitud: siempre límites estándar
    _validar_limites_prestamo(sol.monto, sol.plazo_meses, permitir_excepcion=False)
    # Recalcular descuento quincenal en base a monto y plazo
    sol.descuento_quincenal = _calcular_descuento_quincenal(sol.monto, sol.plazo_meses)
    db.commit()
    return _con_relaciones(db, sol.id)


def _empleado_es_jefe_departamento_del_solicitante(
    db: Session, jefe_id: int, solicitante_empleado_id: int
) -> bool:
    emp = db.query(pm.Empleado).filter(pm.Empleado.id == solicitante_empleado_id).first()
    if not emp or not emp.departamento_id:
        return False
    dept = (
        db.query(pm.Departamento)
        .filter(pm.Departamento.id == emp.departamento_id)
        .first()
    )
    if not dept or not dept.jefe_id:
        return False
    return dept.jefe_id == jefe_id


def listar_pendientes_departamento(
    db: Session, jefe_id: int, skip: int = 0, limit: int = 200
) -> List[models.SolicitudPrestamo]:
    """Solicitudes pendientes donde el solicitante pertenece a un departamento cuyo jefe es jefe_id."""
    q = (
        db.query(models.SolicitudPrestamo)
        .join(pm.Empleado, models.SolicitudPrestamo.empleado_id == pm.Empleado.id)
        .join(pm.Departamento, pm.Empleado.departamento_id == pm.Departamento.id)
        .filter(
            pm.Departamento.jefe_id == jefe_id,
            models.SolicitudPrestamo.estado == models.EstadoSolicitudPrestamo.PENDIENTE,
        )
        .options(
            joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.empresa),
            joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.departamento_rel),
            joinedload(models.SolicitudPrestamo.aprobador),
        )
    )
    return q.order_by(models.SolicitudPrestamo.created_at.desc()).offset(skip).limit(limit).all()


def listar_pendientes_gerente_general(
    db: Session, skip: int = 0, limit: int = 200
) -> List[models.SolicitudPrestamo]:
    """Solicitudes pendientes cuyo solicitante tiene puesto GG (legado o nombre actual)."""
    from sqlalchemy import func

    q = (
        db.query(models.SolicitudPrestamo)
        .join(pm.Empleado, models.SolicitudPrestamo.empleado_id == pm.Empleado.id)
        .join(pm.Puesto, pm.Empleado.puesto_id == pm.Puesto.id)
        .filter(
            models.SolicitudPrestamo.estado == models.EstadoSolicitudPrestamo.PENDIENTE,
            func.lower(func.trim(pm.Puesto.nombre)).in_(
                ("gerente general", "gerente administrativo y operaciones")
            ),
        )
        .options(
            joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.empresa),
            joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.departamento_rel),
            joinedload(models.SolicitudPrestamo.aprobador),
        )
    )
    return q.order_by(models.SolicitudPrestamo.created_at.desc()).offset(skip).limit(limit).all()


def empleado_es_gerente_general(db: Session, empleado_id: int) -> bool:
    """Valida si el empleado tiene el puesto de liderazgo GG (legado o actual)."""
    from app.modules.personal.service import PersonalService

    emp = db.query(pm.Empleado).options(joinedload(pm.Empleado.puesto_rel)).filter(pm.Empleado.id == empleado_id).first()
    if not emp or not emp.puesto_rel:
        return False
    return PersonalService._nombre_es_gerente_general(emp.puesto_rel.nombre)


def listar_solicitudes_mi_area(
    db: Session,
    departamento_ids: List[int],
    estado: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
) -> List[models.SolicitudPrestamo]:
    """Solicitudes de préstamo del personal de los departamentos administrados por el usuario."""
    if not departamento_ids:
        return []
    q = (
        db.query(models.SolicitudPrestamo)
        .join(pm.Empleado, models.SolicitudPrestamo.empleado_id == pm.Empleado.id)
        .filter(pm.Empleado.departamento_id.in_(departamento_ids))
        .options(
            joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.empresa),
            joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.departamento_rel),
            joinedload(models.SolicitudPrestamo.aprobador),
        )
    )
    if estado:
        q = q.filter(models.SolicitudPrestamo.estado == estado)
    else:
        q = q.filter(models.SolicitudPrestamo.estado != models.EstadoSolicitudPrestamo.CANCELADA)
    return q.order_by(models.SolicitudPrestamo.created_at.desc()).offset(skip).limit(limit).all()


def listar_pendientes_deposito(
    db: Session, skip: int = 0, limit: int = 200
) -> List[models.SolicitudPrestamo]:
    """Aprobadas por gerente de departamento; pendientes de depósito por Gerente General."""
    q = db.query(models.SolicitudPrestamo).options(
        joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.empresa),
        joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.departamento_rel),
        joinedload(models.SolicitudPrestamo.aprobador),
    ).filter(
        models.SolicitudPrestamo.estado == models.EstadoSolicitudPrestamo.APROBADA_DEPARTAMENTO,
    )
    return q.order_by(models.SolicitudPrestamo.created_at.desc()).offset(skip).limit(limit).all()


def aprobar_departamento(
    db: Session,
    solicitud_id: int,
    aprobado: bool,
    aprobador_id: int,
    comentarios: Optional[str] = None,
    es_superuser: bool = False,
    es_director: bool = False,
) -> Optional[models.SolicitudPrestamo]:
    """Gerente del departamento del solicitante aprueba o rechaza. Aprobado → aprobada_departamento (pendiente depósito GG)."""
    sol = db.query(models.SolicitudPrestamo).filter(models.SolicitudPrestamo.id == solicitud_id).first()
    if not sol:
        return None
    if sol.estado != models.EstadoSolicitudPrestamo.PENDIENTE:
        return None
    # Regla especial: si el solicitante es Gerente General, solo Director o Admin pueden autorizar.
    if empleado_es_gerente_general(db, sol.empleado_id) and not (es_superuser or es_director):
        raise ValueError("Las solicitudes del Gerente General solo pueden ser autorizadas por Director o Administrador.")
    if not es_superuser and not _empleado_es_jefe_departamento_del_solicitante(
        db, aprobador_id, sol.empleado_id
    ):
        raise ValueError(
            "Solo el gerente del departamento del solicitante puede autorizar esta solicitud."
        )
    sol.estado = (
        models.EstadoSolicitudPrestamo.APROBADA_DEPARTAMENTO
        if aprobado
        else models.EstadoSolicitudPrestamo.RECHAZADA
    )
    sol.aprobado_por_id = aprobador_id
    sol.fecha_aprobacion = datetime.now(timezone.utc)
    sol.comentarios_aprobacion = comentarios
    db.commit()
    resultado = _con_relaciones(db, sol.id)
    monto_fmt = f"${float(sol.monto):,.2f}"
    if aprobado:
        _notificar_empleado_prestamo(
            db,
            sol.empleado_id,
            titulo="Tu préstamo fue aprobado",
            mensaje=f"Tu departamento autorizó la solicitud. Monto: {monto_fmt} · Plazo: {sol.plazo_meses} quincenas. "
            "Siguiente paso: depósito por Gerencia General.",
            tipo="prestamo_aprobado_departamento",
            referencia_id=sol.id,
        )
        _notificar_gerentes(
            db,
            titulo=f"Préstamo aprobado por departamento — solicitud #{sol.id}",
            mensaje=f"Monto: {monto_fmt} · Pendiente registrar depósito y referencia bancaria",
            tipo="prestamo_pendiente_deposito",
            referencia_id=sol.id,
        )
    else:
        _notificar_empleado_prestamo(
            db,
            sol.empleado_id,
            titulo="Tu solicitud de préstamo fue rechazada",
            mensaje=comentarios or f"Monto: {monto_fmt}",
            tipo="solicitud_rechazada",
            referencia_id=sol.id,
        )
    return resultado


def marcar_depositado(
    db: Session,
    solicitud_id: int,
    referencia_bancaria: str,
    _depositador_id: int,
    comentarios: Optional[str] = None,
) -> Optional[models.SolicitudPrestamo]:
    """Gerente General registra depósito: aprobada_departamento → depositado."""
    ref = (referencia_bancaria or "").strip()
    if len(ref) < 3:
        raise ValueError("La referencia bancaria es obligatoria (mínimo 3 caracteres).")

    sol = db.query(models.SolicitudPrestamo).filter(models.SolicitudPrestamo.id == solicitud_id).first()
    if not sol:
        return None
    if sol.estado != models.EstadoSolicitudPrestamo.APROBADA_DEPARTAMENTO:
        return None
    sol.estado = models.EstadoSolicitudPrestamo.DEPOSITADO
    sol.referencia_bancaria = ref
    sol.fecha_deposito = datetime.now(timezone.utc)
    if comentarios:
        prev = sol.comentarios_aprobacion or ""
        sol.comentarios_aprobacion = (
            (prev + f"\n[Depósito] {comentarios}").strip() if prev else f"[Depósito] {comentarios}"
        )
    db.commit()
    resultado = _con_relaciones(db, sol.id)
    monto_fmt = f"${float(sol.monto):,.2f}"
    _notificar_empleado_prestamo(
        db,
        sol.empleado_id,
        titulo="Tu préstamo fue depositado",
        mensaje=f"Gerencia General registró el depósito. Monto: {monto_fmt} · Ref. bancaria: {ref} · "
        "Recursos Humanos confirmará el registro en nómina.",
        tipo="prestamo_depositado",
        referencia_id=sol.id,
    )
    return resultado


def listar_pendientes_confirmacion_rh(
    db: Session, skip: int = 0, limit: int = 200
) -> List[models.SolicitudPrestamo]:
    """Préstamos depositados pendientes de confirmación por RH (registro en nómina)."""
    q = db.query(models.SolicitudPrestamo).options(
        joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.empresa),
        joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.departamento_rel),
        joinedload(models.SolicitudPrestamo.aprobador),
    ).filter(
        models.SolicitudPrestamo.estado == models.EstadoSolicitudPrestamo.DEPOSITADO,
        models.SolicitudPrestamo.fecha_confirmacion_rh.is_(None),
    )
    return q.order_by(models.SolicitudPrestamo.fecha_deposito.desc()).offset(skip).limit(limit).all()


def confirmar_rh(
    db: Session,
    solicitud_id: int,
    comentarios: Optional[str] = None,
) -> Optional[models.SolicitudPrestamo]:
    """
    RH confirma el registro en nómina del préstamo ya depositado.
    Envía notificación al empleado (antes el endpoint estaba obsoleto y no notificaba).
    """
    sol = db.query(models.SolicitudPrestamo).filter(models.SolicitudPrestamo.id == solicitud_id).first()
    if not sol:
        return None
    if sol.estado != models.EstadoSolicitudPrestamo.DEPOSITADO:
        return None
    if sol.fecha_confirmacion_rh is not None:
        return _con_relaciones(db, solicitud_id)

    sol.fecha_confirmacion_rh = datetime.now(timezone.utc)
    if comentarios:
        prev = sol.comentarios_aprobacion or ""
        sol.comentarios_aprobacion = (
            (prev + f"\n[RH] {comentarios}").strip() if prev else f"[RH] {comentarios}"
        )
    db.commit()
    resultado = _con_relaciones(db, sol.id)
    monto_fmt = f"${float(sol.monto):,.2f}"
    ref = sol.referencia_bancaria or "—"
    msg = (
        f"Tu préstamo quedó registrado en nómina. Monto: {monto_fmt} · Ref. bancaria: {ref} · "
        f"{sol.plazo_meses} quincenas de descuento."
    )
    if comentarios:
        msg += f" Comentario RH: {comentarios}"
    _notificar_empleado_prestamo(
        db,
        sol.empleado_id,
        titulo="RH confirmó tu préstamo",
        mensaje=msg,
        tipo="prestamo_confirmado_rh",
        referencia_id=sol.id,
    )
    return resultado


def cancelar_solicitud(db: Session, solicitud_id: int) -> Optional[models.SolicitudPrestamo]:
    sol = db.query(models.SolicitudPrestamo).filter(models.SolicitudPrestamo.id == solicitud_id).first()
    if not sol:
        return None
    if sol.estado != models.EstadoSolicitudPrestamo.PENDIENTE:
        return None
    sol.estado = models.EstadoSolicitudPrestamo.CANCELADA
    db.commit()
    return _con_relaciones(db, sol.id)


def _con_relaciones(db: Session, solicitud_id: int) -> Optional[models.SolicitudPrestamo]:
    return db.query(models.SolicitudPrestamo).options(
        joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.empresa),
        joinedload(models.SolicitudPrestamo.empleado).joinedload(pm.Empleado.departamento_rel),
        joinedload(models.SolicitudPrestamo.aprobador),
    ).filter(models.SolicitudPrestamo.id == solicitud_id).first()


# ── Documento PDF firmado (solo se guarda el PDF; nunca la imagen de firma) ──

MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB


def resolve_firmados_base_dir():
    from pathlib import Path
    from app.core.config import settings

    preferred = Path(settings.PRESTAMOS_FIRMADOS_DIR).resolve()
    try:
        preferred.mkdir(parents=True, exist_ok=True)
        return preferred
    except (PermissionError, FileNotFoundError, OSError):
        local = Path(__file__).resolve().parents[3] / "storage" / "prestamos" / "firmados"
        local.mkdir(parents=True, exist_ok=True)
        return local


def _estado_permite_documento_firmado(solicitud: models.SolicitudPrestamo) -> bool:
    est = getattr(solicitud.estado, "value", str(solicitud.estado)).lower()
    return est in (
        models.EstadoSolicitudPrestamo.PENDIENTE.value,
        models.EstadoSolicitudPrestamo.APROBADA_DEPARTAMENTO.value,
        models.EstadoSolicitudPrestamo.DEPOSITADO.value,
    )


def puede_gestionar_documento_firmado(
    db: Session,
    solicitud: models.SolicitudPrestamo,
    current: dict,
) -> bool:
    """Empleado dueño, jefe de área / director / GG, RH o Admin."""
    uid = int(current["user_id"])
    if current.get("is_superuser") or current.get("is_rh"):
        return True
    if solicitud.empleado_id == uid:
        return True
    if current.get("is_director") or current.get("is_gerente_general"):
        return True
    emp = solicitud.empleado
    if not emp:
        emp = (
            db.query(pm.Empleado)
            .options(joinedload(pm.Empleado.departamento_rel))
            .filter(pm.Empleado.id == solicitud.empleado_id)
            .first()
        )
    if emp and getattr(emp, "jefe_id", None) == uid:
        return True
    if (
        emp
        and getattr(emp, "departamento_rel", None)
        and getattr(emp.departamento_rel, "jefe_id", None) == uid
    ):
        return True
    depto_ids = current.get("departamento_ids_que_administro") or []
    if emp and emp.departamento_id and emp.departamento_id in depto_ids:
        return True
    return False


def guardar_documento_firmado(
    db: Session,
    solicitud_id: int,
    uploader_id: int,
    filename: str,
    raw_bytes: bytes,
) -> models.SolicitudPrestamo:
    from pathlib import Path

    sol = get_solicitud(db, solicitud_id)
    if not sol:
        raise ValueError("Solicitud no encontrada")
    if not _estado_permite_documento_firmado(sol):
        raise ValueError(
            "Solo se puede subir el PDF firmado en solicitudes pendientes, "
            "autorizadas por departamento o depositadas."
        )
    original = (filename or "").strip()
    if not original.lower().endswith(".pdf"):
        raise ValueError("Solo se permiten archivos PDF.")
    if not raw_bytes:
        raise ValueError("Archivo vacío.")
    if len(raw_bytes) > MAX_PDF_BYTES:
        raise ValueError("El PDF no puede superar 10 MB.")
    if not raw_bytes[:5].startswith(b"%PDF-"):
        raise ValueError("El archivo no es un PDF válido.")

    base = resolve_firmados_base_dir()
    emp_dir = base / str(int(sol.empleado_id))
    emp_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{int(sol.id)}.pdf"
    abs_path = emp_dir / stored_name
    abs_path.write_bytes(raw_bytes)
    try:
        ruta_rel = str(abs_path.relative_to(base)).replace("\\", "/")
    except ValueError:
        ruta_rel = f"{sol.empleado_id}/{stored_name}"

    sol.documento_firmado_ruta = ruta_rel
    sol.documento_firmado_nombre = Path(original).name[:255]
    sol.documento_firmado_at = datetime.now(timezone.utc)
    sol.documento_firmado_por_id = uploader_id
    db.commit()
    refreshed = _con_relaciones(db, sol.id)
    return refreshed or sol


def documento_firmado_abs_path(solicitud: models.SolicitudPrestamo):
    from pathlib import Path

    rel = (solicitud.documento_firmado_ruta or "").strip().replace("\\", "/")
    if not rel or ".." in rel.split("/"):
        raise ValueError("No hay documento firmado.")
    base = resolve_firmados_base_dir()
    safe = (base / rel).resolve()
    try:
        safe.relative_to(base)
    except ValueError:
        raise ValueError("Ruta de documento inválida.")
    if not safe.is_file():
        raise ValueError("Archivo de documento firmado no encontrado.")
    return safe
