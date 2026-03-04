from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import List, Optional
from . import models, schemas


class PersonalService:

    # ========== EMPRESAS ==========

    @staticmethod
    def create_empresa(db: Session, empresa: schemas.EmpresaCreate) -> models.Empresa:
        db_empresa = models.Empresa(**empresa.dict())
        db.add(db_empresa)
        db.commit()
        db.refresh(db_empresa)
        return db_empresa

    @staticmethod
    def get_empresa(db: Session, empresa_id: int) -> Optional[models.Empresa]:
        return db.query(models.Empresa).filter(models.Empresa.id == empresa_id).first()

    @staticmethod
    def get_empresas(db: Session, skip: int = 0, limit: int = 100, activo: Optional[bool] = None) -> List[models.Empresa]:
        query = db.query(models.Empresa)
        if activo is not None:
            query = query.filter(models.Empresa.activo == activo)
        return query.offset(skip).limit(limit).all()

    @staticmethod
    def update_empresa(db: Session, empresa_id: int, empresa: schemas.EmpresaUpdate) -> Optional[models.Empresa]:
        db_empresa = db.query(models.Empresa).filter(models.Empresa.id == empresa_id).first()
        if not db_empresa:
            return None
        for field, value in empresa.dict(exclude_unset=True).items():
            setattr(db_empresa, field, value)
        db.commit()
        db.refresh(db_empresa)
        return db_empresa

    @staticmethod
    def delete_empresa(db: Session, empresa_id: int) -> bool:
        db_empresa = db.query(models.Empresa).filter(models.Empresa.id == empresa_id).first()
        if not db_empresa:
            return False
        db_empresa.activo = False
        db.commit()
        return True

    # ========== DEPARTAMENTOS ==========

    @staticmethod
    def create_departamento(db: Session, depto: schemas.DepartamentoCreate) -> models.Departamento:
        db_depto = models.Departamento(**depto.dict())
        db.add(db_depto)
        db.commit()
        db.refresh(db_depto)
        return db_depto

    @staticmethod
    def get_departamento(db: Session, depto_id: int) -> Optional[models.Departamento]:
        return db.query(models.Departamento).options(
            joinedload(models.Departamento.empresa),
            joinedload(models.Departamento.jefe),
        ).filter(models.Departamento.id == depto_id).first()

    @staticmethod
    def get_departamentos(
        db: Session, skip: int = 0, limit: int = 100,
        empresa_id: Optional[int] = None, activo: Optional[bool] = None
    ) -> List[models.Departamento]:
        query = db.query(models.Departamento).options(
            joinedload(models.Departamento.empresa),
            joinedload(models.Departamento.jefe),
        )
        if empresa_id is not None:
            query = query.filter(models.Departamento.empresa_id == empresa_id)
        if activo is not None:
            query = query.filter(models.Departamento.activo == activo)
        return query.offset(skip).limit(limit).all()

    @staticmethod
    def update_departamento(db: Session, depto_id: int, depto: schemas.DepartamentoUpdate) -> Optional[models.Departamento]:
        db_depto = db.query(models.Departamento).filter(models.Departamento.id == depto_id).first()
        if not db_depto:
            return None
        for field, value in depto.dict(exclude_unset=True).items():
            setattr(db_depto, field, value)
        db.commit()
        db.refresh(db_depto)
        return db_depto

    @staticmethod
    def delete_departamento(db: Session, depto_id: int) -> bool:
        db_depto = db.query(models.Departamento).filter(models.Departamento.id == depto_id).first()
        if not db_depto:
            return False
        db_depto.activo = False
        db.commit()
        return True

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
        data = empleado.dict(exclude={"registrar_en_checador", "dispositivo_ids"})
        db_empleado = models.Empleado(**data)
        db.add(db_empleado)
        db.commit()
        db.refresh(db_empleado)
        return db_empleado
    
    @staticmethod
    def get_empleado(db: Session, empleado_id: int) -> Optional[models.Empleado]:
        """Obtener empleado por ID"""
        return db.query(models.Empleado).options(
            joinedload(models.Empleado.empresa),
            joinedload(models.Empleado.departamento_rel).joinedload(models.Departamento.empresa),
        ).filter(models.Empleado.id == empleado_id).first()
    
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
        query = db.query(models.Empleado).options(
            joinedload(models.Empleado.empresa),
            joinedload(models.Empleado.departamento_rel),
        )
        
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
        """Eliminar empleado (cambiar estado a baja) y encolar eliminacion en dispositivos"""
        db_empleado = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
        if not db_empleado:
            return False
        
        db_empleado.estado = models.EstadoEmpleado.BAJA
        from datetime import datetime
        db_empleado.fecha_baja = datetime.utcnow()

        from app.modules.asistencia import models as asist_models
        enviados = db.query(asist_models.UsuarioPendienteDispositivo).filter(
            asist_models.UsuarioPendienteDispositivo.numero_empleado == db_empleado.numero_empleado,
            asist_models.UsuarioPendienteDispositivo.enviado == True,
        ).all()
        for env in enviados:
            existing = db.query(asist_models.PendingDelete).filter(
                asist_models.PendingDelete.dispositivo_id == env.dispositivo_id,
                asist_models.PendingDelete.numero_empleado == db_empleado.numero_empleado,
                asist_models.PendingDelete.procesado == False,
            ).first()
            if not existing:
                pd = asist_models.PendingDelete(
                    dispositivo_id=env.dispositivo_id,
                    numero_empleado=db_empleado.numero_empleado,
                )
                db.add(pd)

        db.commit()
        return True
    
    @staticmethod
    def get_subordinados(db: Session, jefe_id: int) -> List[models.Empleado]:
        """Obtener subordinados de un jefe"""
        return db.query(models.Empleado).filter(models.Empleado.jefe_id == jefe_id).all()
