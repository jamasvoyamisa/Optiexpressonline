from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta

from . import models, schemas


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
    Elimina las incidencias automáticas (FALTA / SALIDA_ANTICIPADA) del empleado
    en el rango [fecha_inicio, fecha_fin] y devuelve (cantidad, descripciones).
    Solo se borran las de origen='automatico' para no tocar incidencias manuales.
    """
    from app.modules.asistencia import models as asist_models

    # Construimos el rango como datetimes (inicio del día y fin del día + 1)
    dt_inicio = datetime.combine(fecha_inicio, datetime.min.time())
    dt_fin = datetime.combine(fecha_fin + timedelta(days=1), datetime.min.time())

    incidencias = db.query(asist_models.Incidencia).filter(
        asist_models.Incidencia.empleado_id == empleado_id,
        asist_models.Incidencia.origen == "automatico",
        asist_models.Incidencia.fecha >= dt_inicio,
        asist_models.Incidencia.fecha < dt_fin,
    ).all()

    detalle: list[str] = []
    for inc in incidencias:
        fecha_str = inc.fecha.strftime("%d/%m/%Y") if inc.fecha else "?"
        tipo_str = inc.tipo.value if hasattr(inc.tipo, "value") else str(inc.tipo)
        detalle.append(f"{tipo_str.capitalize()} del {fecha_str}: {inc.descripcion or '—'}")
        db.delete(inc)

    db.flush()
    return len(incidencias), detalle


def crear_incapacidad(
    db: Session,
    data: schemas.IncapacidadCreate,
    registrado_por: int,
) -> Dict[str, Any]:
    """
    Crea la incapacidad y elimina las incidencias automáticas ya generadas
    para el empleado en ese período.
    Devuelve un dict con 'incapacidad', 'incidencias_eliminadas' y 'detalle_incidencias'.
    """
    dias = _calcular_dias(data.fecha_inicio, data.fecha_fin)
    inc = models.Incapacidad(
        empleado_id=data.empleado_id,
        tipo=models.TipoIncapacidad(data.tipo),
        fecha_inicio=data.fecha_inicio,
        fecha_fin=data.fecha_fin,
        dias=dias,
        folio_imss=data.folio_imss,
        descripcion=data.descripcion,
        registrado_por=registrado_por,
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
    q = db.query(models.Incapacidad).options(
        joinedload(models.Incapacidad.empleado),
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
    Devuelve True si el empleado tiene una incapacidad ACTIVA que cubre la fecha dada.
    Usado por el servicio de incidencias para omitir la generación de faltas.
    """
    return db.query(models.Incapacidad).filter(
        models.Incapacidad.empleado_id == empleado_id,
        models.Incapacidad.estado == models.EstadoIncapacidad.ACTIVA,
        models.Incapacidad.fecha_inicio <= fecha,
        models.Incapacidad.fecha_fin >= fecha,
    ).first() is not None


def _con_relaciones(db: Session, incapacidad_id: int) -> Optional[models.Incapacidad]:
    return db.query(models.Incapacidad).options(
        joinedload(models.Incapacidad.empleado),
        joinedload(models.Incapacidad.registrador),
    ).filter(models.Incapacidad.id == incapacidad_id).first()
