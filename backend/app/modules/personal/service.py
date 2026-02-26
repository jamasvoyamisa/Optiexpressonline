from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from . import models, schemas


class PersonalService:
    
    # ========== ROLES ==========
    
    @staticmethod
    def create_rol(db: Session, rol: schemas.RolCreate) -> models.Rol:
        """Crear nuevo rol"""
        db_rol = models.Rol(**rol.dict())
        db.add(db_rol)
        db.commit()
        db.refresh(db_rol)
        return db_rol
    
    @staticmethod
    def get_rol(db: Session, rol_id: int) -> Optional[models.Rol]:
        """Obtener rol por ID"""
        return db.query(models.Rol).filter(models.Rol.id == rol_id).first()
    
    @staticmethod
    def get_roles(db: Session, skip: int = 0, limit: int = 100, activo: Optional[bool] = None) -> List[models.Rol]:
        """Listar roles"""
        query = db.query(models.Rol)
        if activo is not None:
            query = query.filter(models.Rol.activo == activo)
        return query.offset(skip).limit(limit).all()
    
    @staticmethod
    def update_rol(db: Session, rol_id: int, rol: schemas.RolUpdate) -> Optional[models.Rol]:
        """Actualizar rol"""
        db_rol = db.query(models.Rol).filter(models.Rol.id == rol_id).first()
        if not db_rol:
            return None
        
        update_data = rol.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_rol, field, value)
        
        db.commit()
        db.refresh(db_rol)
        return db_rol
    
    @staticmethod
    def delete_rol(db: Session, rol_id: int) -> bool:
        """Eliminar rol (soft delete)"""
        db_rol = db.query(models.Rol).filter(models.Rol.id == rol_id).first()
        if not db_rol:
            return False
        
        db_rol.activo = False
        db.commit()
        return True
    
    # ========== EMPLEADOS ==========
    
    @staticmethod
    def create_empleado(db: Session, empleado: schemas.EmpleadoCreate) -> models.Empleado:
        """Crear nuevo empleado"""
        db_empleado = models.Empleado(**empleado.dict())
        db.add(db_empleado)
        db.commit()
        db.refresh(db_empleado)
        return db_empleado
    
    @staticmethod
    def get_empleado(db: Session, empleado_id: int) -> Optional[models.Empleado]:
        """Obtener empleado por ID"""
        return db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
    
    @staticmethod
    def get_empleado_by_numero(db: Session, numero_empleado: str) -> Optional[models.Empleado]:
        """Obtener empleado por número de empleado"""
        return db.query(models.Empleado).filter(models.Empleado.numero_empleado == numero_empleado).first()
    
    @staticmethod
    def get_empleados(
        db: Session, 
        skip: int = 0, 
        limit: int = 100,
        estado: Optional[str] = None,
        rol_id: Optional[int] = None,
        jefe_id: Optional[int] = None,
        search: Optional[str] = None
    ) -> List[models.Empleado]:
        """Listar empleados con filtros"""
        query = db.query(models.Empleado)
        
        if estado:
            query = query.filter(models.Empleado.estado == estado)
        if rol_id:
            query = query.filter(models.Empleado.rol_id == rol_id)
        if jefe_id:
            query = query.filter(models.Empleado.jefe_id == jefe_id)
        if search:
            search_filter = or_(
                models.Empleado.nombre.ilike(f"%{search}%"),
                models.Empleado.apellido_paterno.ilike(f"%{search}%"),
                models.Empleado.apellido_materno.ilike(f"%{search}%"),
                models.Empleado.numero_empleado.ilike(f"%{search}%"),
                models.Empleado.email.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)
        
        return query.offset(skip).limit(limit).all()
    
    @staticmethod
    def update_empleado(db: Session, empleado_id: int, empleado: schemas.EmpleadoUpdate) -> Optional[models.Empleado]:
        """Actualizar empleado"""
        db_empleado = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
        if not db_empleado:
            return None
        
        update_data = empleado.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_empleado, field, value)
        
        db.commit()
        db.refresh(db_empleado)
        return db_empleado
    
    @staticmethod
    def delete_empleado(db: Session, empleado_id: int) -> bool:
        """Eliminar empleado (cambiar estado a baja)"""
        db_empleado = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
        if not db_empleado:
            return False
        
        db_empleado.estado = models.EstadoEmpleado.BAJA
        from datetime import datetime
        db_empleado.fecha_baja = datetime.utcnow()
        db.commit()
        return True
    
    @staticmethod
    def get_subordinados(db: Session, jefe_id: int) -> List[models.Empleado]:
        """Obtener subordinados de un jefe"""
        return db.query(models.Empleado).filter(models.Empleado.jefe_id == jefe_id).all()
