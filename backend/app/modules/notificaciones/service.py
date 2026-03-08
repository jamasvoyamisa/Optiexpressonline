from sqlalchemy.orm import Session
from typing import List, Optional
from . import models


def crear_notificacion(
    db: Session,
    empleado_id: int,
    titulo: str,
    tipo: str,
    mensaje: Optional[str] = None,
    referencia_id: Optional[int] = None,
) -> models.Notificacion:
    noti = models.Notificacion(
        empleado_id=empleado_id,
        titulo=titulo,
        mensaje=mensaje,
        tipo=tipo,
        referencia_id=referencia_id,
    )
    db.add(noti)
    db.commit()
    db.refresh(noti)
    return noti


def get_mis_notificaciones(
    db: Session,
    empleado_id: int,
    solo_no_leidas: bool = False,
    limit: int = 50,
) -> List[models.Notificacion]:
    q = db.query(models.Notificacion).filter(
        models.Notificacion.empleado_id == empleado_id
    )
    if solo_no_leidas:
        q = q.filter(models.Notificacion.leida == False)
    return q.order_by(models.Notificacion.created_at.desc()).limit(limit).all()


def marcar_leida(db: Session, notificacion_id: int, empleado_id: int) -> bool:
    noti = db.query(models.Notificacion).filter(
        models.Notificacion.id == notificacion_id,
        models.Notificacion.empleado_id == empleado_id,
    ).first()
    if not noti:
        return False
    noti.leida = True
    db.commit()
    return True


def marcar_todas_leidas(db: Session, empleado_id: int) -> int:
    count = db.query(models.Notificacion).filter(
        models.Notificacion.empleado_id == empleado_id,
        models.Notificacion.leida == False,
    ).update({"leida": True})
    db.commit()
    return count


def contar_no_leidas(db: Session, empleado_id: int) -> int:
    return db.query(models.Notificacion).filter(
        models.Notificacion.empleado_id == empleado_id,
        models.Notificacion.leida == False,
    ).count()
