from sqlalchemy.orm import Session
from typing import List, Optional
from . import models, schemas


class RHService:
    
    # ========== EXPEDIENTES ==========
    
    @staticmethod
    def create_expediente(db: Session, expediente: schemas.ExpedienteCreate) -> models.Expediente:
        """Crear nuevo expediente"""
        # Verificar que el empleado no tenga ya un expediente
        existing = db.query(models.Expediente).filter(
            models.Expediente.empleado_id == expediente.empleado_id
        ).first()
        if existing:
            raise ValueError("El empleado ya tiene un expediente")
        
        db_expediente = models.Expediente(**expediente.dict())
        db.add(db_expediente)
        db.commit()
        db.refresh(db_expediente)
        return db_expediente
    
    @staticmethod
    def get_expediente(db: Session, expediente_id: int) -> Optional[models.Expediente]:
        """Obtener expediente por ID"""
        return db.query(models.Expediente).filter(models.Expediente.id == expediente_id).first()
    
    @staticmethod
    def get_expediente_by_empleado(db: Session, empleado_id: int) -> Optional[models.Expediente]:
        """Obtener expediente por empleado"""
        return db.query(models.Expediente).filter(
            models.Expediente.empleado_id == empleado_id
        ).first()
    
    @staticmethod
    def update_expediente(db: Session, expediente_id: int, expediente: schemas.ExpedienteUpdate) -> Optional[models.Expediente]:
        """Actualizar expediente"""
        db_expediente = db.query(models.Expediente).filter(models.Expediente.id == expediente_id).first()
        if not db_expediente:
            return None
        
        update_data = expediente.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_expediente, field, value)
        
        db.commit()
        db.refresh(db_expediente)
        return db_expediente
    
    # ========== TIPOS DE DOCUMENTO ==========
    
    @staticmethod
    def create_tipo_documento(db: Session, tipo: schemas.TipoDocumentoCreate) -> models.TipoDocumento:
        """Crear nuevo tipo de documento"""
        db_tipo = models.TipoDocumento(**tipo.dict())
        db.add(db_tipo)
        db.commit()
        db.refresh(db_tipo)
        return db_tipo
    
    @staticmethod
    def get_tipos_documento(db: Session) -> List[models.TipoDocumento]:
        """Listar tipos de documento"""
        return db.query(models.TipoDocumento).all()
    
    # ========== DOCUMENTOS ==========
    
    @staticmethod
    def create_documento(db: Session, documento: schemas.DocumentoCreate) -> models.Documento:
        """Crear nuevo documento"""
        db_documento = models.Documento(**documento.dict())
        db.add(db_documento)
        db.commit()
        db.refresh(db_documento)
        return db_documento
    
    @staticmethod
    def get_documento(db: Session, documento_id: int) -> Optional[models.Documento]:
        """Obtener documento por ID"""
        return db.query(models.Documento).filter(models.Documento.id == documento_id).first()
    
    @staticmethod
    def get_documentos_by_expediente(db: Session, expediente_id: int) -> List[models.Documento]:
        """Listar documentos de un expediente"""
        return db.query(models.Documento).filter(
            models.Documento.expediente_id == expediente_id
        ).all()
    
    @staticmethod
    def update_documento(db: Session, documento_id: int, documento: schemas.DocumentoUpdate) -> Optional[models.Documento]:
        """Actualizar documento"""
        db_documento = db.query(models.Documento).filter(models.Documento.id == documento_id).first()
        if not db_documento:
            return None
        
        update_data = documento.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_documento, field, value)
        
        db.commit()
        db.refresh(db_documento)
        return db_documento
    
    @staticmethod
    def delete_documento(db: Session, documento_id: int) -> bool:
        """Eliminar documento"""
        db_documento = db.query(models.Documento).filter(models.Documento.id == documento_id).first()
        if not db_documento:
            return False
        
        db.delete(db_documento)
        db.commit()
        return True
    
    # ========== EVALUACIONES ==========
    
    @staticmethod
    def create_evaluacion(db: Session, evaluacion: schemas.EvaluacionCreate) -> models.Evaluacion:
        """Crear nueva evaluación"""
        db_evaluacion = models.Evaluacion(**evaluacion.dict())
        db.add(db_evaluacion)
        db.commit()
        db.refresh(db_evaluacion)
        return db_evaluacion
    
    @staticmethod
    def get_evaluacion(db: Session, evaluacion_id: int) -> Optional[models.Evaluacion]:
        """Obtener evaluación por ID"""
        return db.query(models.Evaluacion).filter(models.Evaluacion.id == evaluacion_id).first()
    
    @staticmethod
    def get_evaluaciones_by_expediente(db: Session, expediente_id: int) -> List[models.Evaluacion]:
        """Listar evaluaciones de un expediente"""
        return db.query(models.Evaluacion).filter(
            models.Evaluacion.expediente_id == expediente_id
        ).order_by(models.Evaluacion.fecha_evaluacion.desc()).all()
    
    @staticmethod
    def update_evaluacion(db: Session, evaluacion_id: int, evaluacion: schemas.EvaluacionUpdate) -> Optional[models.Evaluacion]:
        """Actualizar evaluación"""
        db_evaluacion = db.query(models.Evaluacion).filter(models.Evaluacion.id == evaluacion_id).first()
        if not db_evaluacion:
            return None
        
        update_data = evaluacion.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_evaluacion, field, value)
        
        db.commit()
        db.refresh(db_evaluacion)
        return db_evaluacion
    
    @staticmethod
    def delete_evaluacion(db: Session, evaluacion_id: int) -> bool:
        """Eliminar evaluación"""
        db_evaluacion = db.query(models.Evaluacion).filter(models.Evaluacion.id == evaluacion_id).first()
        if not db_evaluacion:
            return False
        
        db.delete(db_evaluacion)
        db.commit()
        return True
    
    # ========== CAPACITACIONES ==========
    
    @staticmethod
    def create_capacitacion(db: Session, capacitacion: schemas.CapacitacionCreate) -> models.Capacitacion:
        """Crear nueva capacitación"""
        db_capacitacion = models.Capacitacion(**capacitacion.dict())
        db.add(db_capacitacion)
        db.commit()
        db.refresh(db_capacitacion)
        return db_capacitacion
    
    @staticmethod
    def get_capacitacion(db: Session, capacitacion_id: int) -> Optional[models.Capacitacion]:
        """Obtener capacitación por ID"""
        return db.query(models.Capacitacion).filter(models.Capacitacion.id == capacitacion_id).first()
    
    @staticmethod
    def get_capacitaciones_by_empleado(db: Session, empleado_id: int) -> List[models.Capacitacion]:
        """Listar capacitaciones de un empleado"""
        return db.query(models.Capacitacion).filter(
            models.Capacitacion.empleado_id == empleado_id
        ).order_by(models.Capacitacion.fecha_inicio.desc()).all()
    
    @staticmethod
    def update_capacitacion(db: Session, capacitacion_id: int, capacitacion: schemas.CapacitacionUpdate) -> Optional[models.Capacitacion]:
        """Actualizar capacitación"""
        db_capacitacion = db.query(models.Capacitacion).filter(models.Capacitacion.id == capacitacion_id).first()
        if not db_capacitacion:
            return None
        
        update_data = capacitacion.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_capacitacion, field, value)
        
        db.commit()
        db.refresh(db_capacitacion)
        return db_capacitacion
    
    @staticmethod
    def delete_capacitacion(db: Session, capacitacion_id: int) -> bool:
        """Eliminar capacitación"""
        db_capacitacion = db.query(models.Capacitacion).filter(models.Capacitacion.id == capacitacion_id).first()
        if not db_capacitacion:
            return False
        
        db.delete(db_capacitacion)
        db.commit()
        return True
