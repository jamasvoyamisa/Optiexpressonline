from sqlalchemy.orm import Session
from sqlalchemy import and_, extract
from typing import List, Optional
from datetime import datetime, timedelta
from decimal import Decimal
from . import models, schemas
from app.modules.personal import models as personal_models


class VacacionesService:
    
    @staticmethod
    def calcular_dias_entre_fechas(fecha_inicio: datetime, fecha_fin: datetime) -> int:
        """Calcula los días hábiles entre dos fechas (incluyendo ambas)"""
        if fecha_fin < fecha_inicio:
            return 0
        delta = fecha_fin - fecha_inicio
        return delta.days + 1
    
    @staticmethod
    def create_solicitud(db: Session, solicitud: schemas.SolicitudVacacionesCreate) -> models.SolicitudVacaciones:
        """Crear nueva solicitud de vacaciones"""
        # Validar que el empleado existe
        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.id == solicitud.empleado_id
        ).first()
        if not empleado:
            raise ValueError("Empleado no encontrado")
        
        # Calcular días solicitados
        dias_solicitados = VacacionesService.calcular_dias_entre_fechas(
            solicitud.fecha_inicio, 
            solicitud.fecha_fin
        )
        
        # Obtener jefe del empleado
        jefe_id = empleado.jefe_id
        
        # Crear solicitud
        db_solicitud = models.SolicitudVacaciones(
            empleado_id=solicitud.empleado_id,
            fecha_inicio=solicitud.fecha_inicio,
            fecha_fin=solicitud.fecha_fin,
            dias_solicitados=dias_solicitados,
            motivo=solicitud.motivo,
            jefe_aprobador_id=jefe_id,
            estado=models.EstadoSolicitud.PENDIENTE
        )
        
        db.add(db_solicitud)
        db.commit()
        db.refresh(db_solicitud)
        
        # Actualizar balance (días pendientes)
        VacacionesService._actualizar_balance_pendientes(db, solicitud.empleado_id)
        
        return db_solicitud
    
    @staticmethod
    def get_solicitud(db: Session, solicitud_id: int) -> Optional[models.SolicitudVacaciones]:
        """Obtener solicitud por ID"""
        return db.query(models.SolicitudVacaciones).filter(
            models.SolicitudVacaciones.id == solicitud_id
        ).first()
    
    @staticmethod
    def get_solicitudes(
        db: Session,
        skip: int = 0,
        limit: int = 100,
        empleado_id: Optional[int] = None,
        estado: Optional[str] = None,
        jefe_id: Optional[int] = None
    ) -> List[models.SolicitudVacaciones]:
        """Listar solicitudes con filtros"""
        query = db.query(models.SolicitudVacaciones)
        
        if empleado_id:
            query = query.filter(models.SolicitudVacaciones.empleado_id == empleado_id)
        if estado:
            query = query.filter(models.SolicitudVacaciones.estado == estado)
        if jefe_id:
            # Solicitudes pendientes de aprobación por este jefe
            query = query.filter(
                and_(
                    models.SolicitudVacaciones.jefe_aprobador_id == jefe_id,
                    models.SolicitudVacaciones.estado == models.EstadoSolicitud.PENDIENTE
                )
            )
        
        return query.order_by(models.SolicitudVacaciones.created_at.desc()).offset(skip).limit(limit).all()
    
    @staticmethod
    def aprobar_solicitud(
        db: Session,
        solicitud_id: int,
        jefe_id: int,
        aprobar: bool,
        comentarios: Optional[str] = None
    ) -> Optional[models.SolicitudVacaciones]:
        """Aprobar o rechazar solicitud de vacaciones"""
        solicitud = db.query(models.SolicitudVacaciones).filter(
            models.SolicitudVacaciones.id == solicitud_id
        ).first()
        
        if not solicitud:
            return None
        
        # Verificar que el jefe es el aprobador
        if solicitud.jefe_aprobador_id != jefe_id:
            raise ValueError("No tienes permisos para aprobar esta solicitud")
        
        # Verificar que está pendiente
        if solicitud.estado != models.EstadoSolicitud.PENDIENTE:
            raise ValueError("La solicitud ya fue procesada")
        
        # Actualizar estado
        if aprobar:
            solicitud.estado = models.EstadoSolicitud.APROBADA
            # Actualizar balance: mover días de pendientes a tomados
            balance = VacacionesService.get_or_create_balance(db, solicitud.empleado_id)
            balance.dias_pendientes -= Decimal(str(solicitud.dias_solicitados))
            balance.dias_tomados += Decimal(str(solicitud.dias_solicitados))
        else:
            solicitud.estado = models.EstadoSolicitud.RECHAZADA
            # Eliminar días pendientes
            balance = VacacionesService.get_or_create_balance(db, solicitud.empleado_id)
            balance.dias_pendientes -= Decimal(str(solicitud.dias_solicitados))
        
        solicitud.fecha_aprobacion = datetime.utcnow()
        solicitud.comentarios_aprobacion = comentarios
        
        db.commit()
        db.refresh(solicitud)
        return solicitud
    
    @staticmethod
    def _actualizar_balance_pendientes(db: Session, empleado_id: int):
        """Actualizar días pendientes en el balance"""
        balance = VacacionesService.get_or_create_balance(db, empleado_id)
        
        # Sumar todas las solicitudes pendientes
        solicitudes_pendientes = db.query(models.SolicitudVacaciones).filter(
            and_(
                models.SolicitudVacaciones.empleado_id == empleado_id,
                models.SolicitudVacaciones.estado == models.EstadoSolicitud.PENDIENTE
            )
        ).all()
        
        total_pendientes = sum(s.dias_solicitados for s in solicitudes_pendientes)
        balance.dias_pendientes = Decimal(str(total_pendientes))
        db.commit()
    
    @staticmethod
    def get_or_create_balance(db: Session, empleado_id: int, año: Optional[int] = None) -> models.BalanceVacaciones:
        """Obtener o crear balance de vacaciones para un empleado"""
        if año is None:
            año = datetime.now().year
        
        balance = db.query(models.BalanceVacaciones).filter(
            and_(
                models.BalanceVacaciones.empleado_id == empleado_id,
                models.BalanceVacaciones.año == año
            )
        ).first()
        
        if not balance:
            balance = models.BalanceVacaciones(
                empleado_id=empleado_id,
                año=año,
                dias_disponibles=Decimal("0"),
                dias_tomados=Decimal("0"),
                dias_pendientes=Decimal("0")
            )
            db.add(balance)
            db.commit()
            db.refresh(balance)
        
        return balance
    
    @staticmethod
    def get_balance(db: Session, empleado_id: int, año: Optional[int] = None) -> Optional[models.BalanceVacaciones]:
        """Obtener balance de vacaciones"""
        if año is None:
            año = datetime.now().year
        
        return db.query(models.BalanceVacaciones).filter(
            and_(
                models.BalanceVacaciones.empleado_id == empleado_id,
                models.BalanceVacaciones.año == año
            )
        ).first()
    
    @staticmethod
    def actualizar_dias_disponibles(db: Session, empleado_id: int, dias: Decimal, año: Optional[int] = None):
        """Actualizar días disponibles en el balance"""
        balance = VacacionesService.get_or_create_balance(db, empleado_id, año)
        balance.dias_disponibles = dias
        db.commit()
        db.refresh(balance)
        return balance
