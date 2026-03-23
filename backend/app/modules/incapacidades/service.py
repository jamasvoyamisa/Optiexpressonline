from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta

from . import models, schemas
from app.modules.personal import models as pm
from app.core.timezone_utils import ZONE_MEXICO


def _fecha_hoy_mexico() -> date:
    """Fecha calendario actual en México (misma lógica que asistencia)."""
    return datetime.now(ZONE_MEXICO).date()


def finalizar_incapacidades_vencidas(db: Session) -> int:
    """
    Pasa a 'finalizada' las incapacidades que siguen en 'activa' pero cuya fecha_fin
    ya pasó (según calendario México). Idempotente; hace commit solo si hubo cambios.
    """
    hoy = _fecha_hoy_mexico()
    n = (
        db.query(models.Incapacidad)
        .filter(
            models.Incapacidad.estado == models.EstadoIncapacidad.ACTIVA,
            models.Incapacidad.fecha_fin < hoy,
        )
        .update({models.Incapacidad.estado: models.EstadoIncapacidad.FINALIZADA}, synchronize_session=False)
    )
    if n:
        db.commit()
    return n


def _calcular_dias(fecha_inicio: date, fecha_fin: date) -> int:
    """Días calendario entre inicio y fin, inclusive."""
    return (fecha_fin - fecha_inicio).days + 1


def _limpiar_incidencias_periodo(
    db: Session,
    empleado_id: int,
    fecha_inicio: date,
    fecha_fin: date,
) -> tuple[int, list[str]]:
    """
    Elimina incidencias automáticas del empleado en [fecha_inicio, fecha_fin] (calendario México).
    Misma ventana UTC por día que usa procesar_dia / sync (mexico_date_to_utc_range), para que
    al registrar una incapacidad días después se quiten bien las faltas/incompletas/retardos/etc.
    generadas antes. No borra incidencias manuales (origen != automatico).
    """
    from app.modules.asistencia import models as asist_models
    from app.core.timezone_utils import mexico_date_to_utc_range

    detalle: list[str] = []
    total = 0
    n_dias = (fecha_fin - fecha_inicio).days + 1
    for i in range(n_dias):
        d = fecha_inicio + timedelta(days=i)
        dia_inicio_utc, dia_fin_utc = mexico_date_to_utc_range(d)
        incidencias = (
            db.query(asist_models.Incidencia)
            .filter(
                asist_models.Incidencia.empleado_id == empleado_id,
                asist_models.Incidencia.origen == "automatico",
                asist_models.Incidencia.fecha >= dia_inicio_utc,
                asist_models.Incidencia.fecha < dia_fin_utc,
            )
            .all()
        )
        for inc in incidencias:
            fecha_str = inc.fecha.strftime("%d/%m/%Y") if inc.fecha else "?"
            tipo_str = inc.tipo.value if hasattr(inc.tipo, "value") else str(inc.tipo)
            detalle.append(f"{tipo_str.capitalize()} del {fecha_str}: {inc.descripcion or '—'}")
            db.delete(inc)
        total += len(incidencias)

    db.flush()
    return total, detalle


def crear_incapacidad(
    db: Session,
    data: schemas.IncapacidadCreate,
    registrado_por: int,
) -> Dict[str, Any]:
    """
    Crea la incapacidad y elimina las incidencias automáticas (faltas, incompletas,
    retardos, salidas anticipadas del proceso diario o sync) ya generadas en ese período,
    aunque el alta sea días después — sustituyen el criterio de falta por el registro de incapacidad.
    Devuelve 'incapacidad', 'incidencias_eliminadas' y 'detalle_incidencias'.
    """
    dias = _calcular_dias(data.fecha_inicio, data.fecha_fin)
    hoy = _fecha_hoy_mexico()
    # Si el periodo ya terminó (todo en el pasado), queda finalizada desde el alta
    estado_inicial = (
        models.EstadoIncapacidad.FINALIZADA
        if data.fecha_fin < hoy
        else models.EstadoIncapacidad.ACTIVA
    )
    inc = models.Incapacidad(
        empleado_id=data.empleado_id,
        tipo=models.TipoIncapacidad(data.tipo),
        fecha_inicio=data.fecha_inicio,
        fecha_fin=data.fecha_fin,
        dias=dias,
        folio_imss=data.folio_imss,
        descripcion=data.descripcion,
        registrado_por=registrado_por,
        estado=estado_inicial,
    )
    db.add(inc)
    db.flush()  # obtiene inc.id sin commit todavía

    # Limpiar incidencias automáticas del período
    eliminadas, detalle = _limpiar_incidencias_periodo(
        db, data.empleado_id, data.fecha_inicio, data.fecha_fin
    )

    db.commit()
    db.refresh(inc)
    incapacidad_obj = _con_relaciones(db, inc.id)

    return {
        "incapacidad": incapacidad_obj,
        "incidencias_eliminadas": eliminadas,
        "detalle_incidencias": detalle,
    }


def listar_incapacidades(
    db: Session,
    empleado_id: Optional[int] = None,
    estado: Optional[str] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    skip: int = 0,
    limit: int = 200,
) -> List[models.Incapacidad]:
    finalizar_incapacidades_vencidas(db)
    q = db.query(models.Incapacidad).options(
        joinedload(models.Incapacidad.empleado).joinedload(pm.Empleado.empresa),
        joinedload(models.Incapacidad.empleado).joinedload(pm.Empleado.departamento_rel),
        joinedload(models.Incapacidad.registrador),
    )
    if empleado_id:
        q = q.filter(models.Incapacidad.empleado_id == empleado_id)
    if estado:
        q = q.filter(models.Incapacidad.estado == models.EstadoIncapacidad(estado))
    if fecha_desde:
        q = q.filter(models.Incapacidad.fecha_fin >= fecha_desde)
    if fecha_hasta:
        q = q.filter(models.Incapacidad.fecha_inicio <= fecha_hasta)
    return q.order_by(models.Incapacidad.fecha_inicio.desc()).offset(skip).limit(limit).all()


def get_incapacidad(db: Session, incapacidad_id: int) -> Optional[models.Incapacidad]:
    finalizar_incapacidades_vencidas(db)
    return _con_relaciones(db, incapacidad_id)


def actualizar_incapacidad(
    db: Session,
    incapacidad_id: int,
    data: schemas.IncapacidadUpdate,
) -> Optional[models.Incapacidad]:
    inc = db.query(models.Incapacidad).filter(models.Incapacidad.id == incapacidad_id).first()
    if not inc:
        return None
    if data.tipo is not None:
        inc.tipo = models.TipoIncapacidad(data.tipo)
    if data.fecha_inicio is not None:
        inc.fecha_inicio = data.fecha_inicio
    if data.fecha_fin is not None:
        inc.fecha_fin = data.fecha_fin
    if data.fecha_inicio is not None or data.fecha_fin is not None:
        inc.dias = _calcular_dias(inc.fecha_inicio, inc.fecha_fin)
    if data.folio_imss is not None:
        inc.folio_imss = data.folio_imss
    if data.descripcion is not None:
        inc.descripcion = data.descripcion
    if data.estado is not None:
        inc.estado = models.EstadoIncapacidad(data.estado)
    # Si quedó activa pero la fecha fin ya pasó, cerrar automáticamente
    hoy = _fecha_hoy_mexico()
    if inc.estado == models.EstadoIncapacidad.ACTIVA and inc.fecha_fin < hoy:
        inc.estado = models.EstadoIncapacidad.FINALIZADA
    # Misma lógica que en alta: limpiar automáticas del periodo (p. ej. ampliaron fechas después)
    _limpiar_incidencias_periodo(db, inc.empleado_id, inc.fecha_inicio, inc.fecha_fin)
    db.commit()
    return _con_relaciones(db, inc.id)


def cancelar_incapacidad(db: Session, incapacidad_id: int) -> Optional[models.Incapacidad]:
    inc = db.query(models.Incapacidad).filter(models.Incapacidad.id == incapacidad_id).first()
    if not inc:
        return None
    inc.estado = models.EstadoIncapacidad.CANCELADA
    db.commit()
    return _con_relaciones(db, inc.id)


def empleado_tiene_incapacidad_activa(db: Session, empleado_id: int, fecha: date) -> bool:
    """
    True si el empleado tiene incapacidad que cubre la fecha (no cancelada).
    Incluye finalizadas: sirve para días pasados y para no volver a generar faltas
    si se reprocesa un día. Solo excluye canceladas.
    """
    return db.query(models.Incapacidad).filter(
        models.Incapacidad.empleado_id == empleado_id,
        models.Incapacidad.estado != models.EstadoIncapacidad.CANCELADA,
        models.Incapacidad.fecha_inicio <= fecha,
        models.Incapacidad.fecha_fin >= fecha,
    ).first() is not None


def _con_relaciones(db: Session, incapacidad_id: int) -> Optional[models.Incapacidad]:
    return db.query(models.Incapacidad).options(
        joinedload(models.Incapacidad.empleado).joinedload(pm.Empleado.empresa),
        joinedload(models.Incapacidad.empleado).joinedload(pm.Empleado.departamento_rel),
        joinedload(models.Incapacidad.registrador),
    ).filter(models.Incapacidad.id == incapacidad_id).first()
