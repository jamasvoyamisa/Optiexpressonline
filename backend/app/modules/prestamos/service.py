from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from decimal import Decimal, ROUND_HALF_UP

from . import models, schemas


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
        NOMBRES_PUESTO = ("gerente general", "director")

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
        pass  # No interrumpir el flujo principal si falla la notificación


def _calcular_descuento_quincenal(monto: Decimal, plazo_meses: int) -> Decimal:
    """Calcula el descuento quincenal: monto / (plazo_meses * 2 quincenas por mes)."""
    if plazo_meses <= 0:
        return Decimal("0")
    quincenas = plazo_meses * 2
    return (monto / quincenas).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def listar_solicitudes(
    db: Session,
    empleado_id: Optional[int] = None,
    estado: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
) -> List[models.SolicitudPrestamo]:
    q = db.query(models.SolicitudPrestamo).options(
        joinedload(models.SolicitudPrestamo.empleado),
        joinedload(models.SolicitudPrestamo.aprobador),
    )
    if empleado_id:
        q = q.filter(models.SolicitudPrestamo.empleado_id == empleado_id)
    if estado:
        q = q.filter(models.SolicitudPrestamo.estado == models.EstadoSolicitudPrestamo(estado))
    return q.order_by(models.SolicitudPrestamo.created_at.desc()).offset(skip).limit(limit).all()


def crear_solicitud(
    db: Session,
    data: schemas.SolicitudPrestamoCreate,
    empleado_id: int,
) -> models.SolicitudPrestamo:
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
    resultado = _con_relaciones(db, sol.id)
    # Notificar a gerentes de la nueva solicitud
    nombre_emp = ""
    if resultado and resultado.empleado:
        nombre_emp = f"{resultado.empleado.nombre} {resultado.empleado.apellido_paterno or ''}".strip()
    monto_fmt = f"${float(data.monto):,.2f}"
    _notificar_gerentes(
        db,
        titulo=f"Nueva solicitud de préstamo — {nombre_emp}",
        mensaje=f"Monto: {monto_fmt} · Plazo: {data.plazo_meses} meses",
        tipo="nueva_solicitud",
        referencia_id=sol.id,
    )
    return resultado


def crear_solicitud_rh(
    db: Session,
    data: schemas.SolicitudPrestamoCreateRH,
) -> models.SolicitudPrestamo:
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
    resultado = _con_relaciones(db, sol.id)
    # Notificar a gerentes de la nueva solicitud
    nombre_emp = ""
    if resultado and resultado.empleado:
        nombre_emp = f"{resultado.empleado.nombre} {resultado.empleado.apellido_paterno or ''}".strip()
    monto_fmt = f"${float(data.monto):,.2f}"
    _notificar_gerentes(
        db,
        titulo=f"Nueva solicitud de préstamo — {nombre_emp}",
        mensaje=f"Monto: {monto_fmt} · Plazo: {data.plazo_meses} meses",
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
    # Recalcular descuento quincenal en base a monto y plazo
    sol.descuento_quincenal = _calcular_descuento_quincenal(sol.monto, sol.plazo_meses)
    db.commit()
    return _con_relaciones(db, sol.id)


def aprobar_gerente(
    db: Session,
    solicitud_id: int,
    aprobado: bool,
    aprobador_id: int,
    comentarios: Optional[str] = None,
) -> Optional[models.SolicitudPrestamo]:
    """Gerente General/Director/Admin aprueba o rechaza. Aprobado → aprobada_gerente (pendiente RH)."""
    from datetime import datetime, timezone
    sol = db.query(models.SolicitudPrestamo).filter(models.SolicitudPrestamo.id == solicitud_id).first()
    if not sol:
        return None
    if sol.estado != models.EstadoSolicitudPrestamo.PENDIENTE:
        return None
    sol.estado = models.EstadoSolicitudPrestamo.APROBADA_GERENTE if aprobado else models.EstadoSolicitudPrestamo.RECHAZADA
    sol.aprobado_por_id = aprobador_id
    sol.fecha_aprobacion = datetime.now(timezone.utc)
    sol.comentarios_aprobacion = comentarios
    db.commit()
    resultado = _con_relaciones(db, sol.id)
    # Notificar al empleado
    try:
        from app.modules.notificaciones import service as noti_service
        monto_fmt = f"${float(sol.monto):,.2f}"
        if aprobado:
            noti_service.crear_notificacion(
                db, sol.empleado_id,
                titulo="Tu solicitud de préstamo fue aprobada",
                mensaje=f"Monto: {monto_fmt} · Pendiente de confirmación por RH",
                tipo="solicitud_aprobada_jefe",
                referencia_id=sol.id,
            )
        else:
            noti_service.crear_notificacion(
                db, sol.empleado_id,
                titulo="Tu solicitud de préstamo fue rechazada",
                mensaje=comentarios or f"Monto: {monto_fmt}",
                tipo="solicitud_rechazada",
                referencia_id=sol.id,
            )
    except Exception:
        pass
    return resultado


def confirmar_rh(
    db: Session,
    solicitud_id: int,
    comentarios: Optional[str] = None,
) -> Optional[models.SolicitudPrestamo]:
    """RH confirma una solicitud ya aprobada por el gerente. aprobada_gerente → aprobada."""
    sol = db.query(models.SolicitudPrestamo).filter(models.SolicitudPrestamo.id == solicitud_id).first()
    if not sol:
        return None
    if sol.estado != models.EstadoSolicitudPrestamo.APROBADA_GERENTE:
        return None
    sol.estado = models.EstadoSolicitudPrestamo.APROBADA
    if comentarios:
        prev = sol.comentarios_aprobacion or ""
        sol.comentarios_aprobacion = (prev + f"\n[RH] {comentarios}").strip() if prev else f"[RH] {comentarios}"
    db.commit()
    resultado = _con_relaciones(db, sol.id)
    # Notificar al empleado que RH confirmó
    try:
        from app.modules.notificaciones import service as noti_service
        monto_fmt = f"${float(sol.monto):,.2f}"
        noti_service.crear_notificacion(
            db, sol.empleado_id,
            titulo="Tu solicitud de préstamo fue confirmada por RH",
            mensaje=f"Monto: {monto_fmt} · {sol.plazo_meses} meses",
            tipo="solicitud_aprobada",
            referencia_id=sol.id,
        )
    except Exception:
        pass
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
        joinedload(models.SolicitudPrestamo.empleado),
        joinedload(models.SolicitudPrestamo.aprobador),
    ).filter(models.SolicitudPrestamo.id == solicitud_id).first()
