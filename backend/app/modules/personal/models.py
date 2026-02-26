from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class EstadoEmpleado(str, enum.Enum):
    ACTIVO = "activo"
    INACTIVO = "inactivo"
    BAJA = "baja"


class Rol(Base):
    __tablename__ = "roles"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)
    descripcion = Column(String(255))
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    empleados = relationship("Empleado", back_populates="rol")


class Empleado(Base):
    __tablename__ = "empleados"
    
    id = Column(Integer, primary_key=True, index=True)
    numero_empleado = Column(String(50), unique=True, nullable=False, index=True)
    nombre = Column(String(100), nullable=False)
    apellido_paterno = Column(String(100))
    apellido_materno = Column(String(100))
    email = Column(String(255), unique=True, index=True)
    telefono = Column(String(20))
    password_hash = Column(String(255), nullable=True)  # Hash de contraseña para autenticación
    
    # Relaciones
    rol_id = Column(Integer, ForeignKey("roles.id"))
    jefe_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    
    # Estado
    estado = Column(Enum(EstadoEmpleado), default=EstadoEmpleado.ACTIVO)
    fecha_ingreso = Column(DateTime(timezone=True))
    fecha_baja = Column(DateTime(timezone=True), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relaciones
    rol = relationship("Rol", back_populates="empleados")
    jefe = relationship("Empleado", remote_side=[id], backref="subordinados")
