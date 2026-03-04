from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class EstadoEmpleado(str, enum.Enum):
    ACTIVO = "activo"
    INACTIVO = "inactivo"
    BAJA = "baja"


class Empresa(Base):
    __tablename__ = "empresas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    rfc = Column(String(13), nullable=True)
    direccion = Column(String(500), nullable=True)
    telefono = Column(String(20), nullable=True)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empleados = relationship("Empleado", back_populates="empresa")


class Rol(Base):
    __tablename__ = "roles"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)
    descripcion = Column(String(255))
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    empleados = relationship("Empleado", back_populates="rol")


class Departamento(Base):
    __tablename__ = "departamentos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False)
    jefe_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empresa = relationship("Empresa", backref="departamentos")
    jefe = relationship("Empleado", foreign_keys=[jefe_id], backref="departamento_a_cargo")
    empleados = relationship("Empleado", back_populates="departamento_rel", foreign_keys="Empleado.departamento_id")


class Empleado(Base):
    __tablename__ = "empleados"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=True)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"), nullable=True)
    numero_empleado = Column(String(50), unique=True, nullable=False, index=True)
    nombre = Column(String(100), nullable=False)
    apellido_paterno = Column(String(100))
    apellido_materno = Column(String(100))
    email = Column(String(255), unique=True, index=True)
    telefono = Column(String(20))
    password_hash = Column(String(255), nullable=True)

    puesto = Column(String(100), nullable=True)
    curp = Column(String(18), nullable=True)
    rfc = Column(String(13), nullable=True)
    nss = Column(String(11), nullable=True)
    direccion = Column(String(500), nullable=True)
    fecha_nacimiento = Column(DateTime(timezone=True), nullable=True)
    contacto_emergencia = Column(String(200), nullable=True)
    telefono_emergencia = Column(String(20), nullable=True)

    rol_id = Column(Integer, ForeignKey("roles.id"))
    jefe_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)

    estado = Column(Enum(EstadoEmpleado), default=EstadoEmpleado.ACTIVO)
    fecha_ingreso = Column(DateTime(timezone=True))
    fecha_baja = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empresa = relationship("Empresa", back_populates="empleados")
    departamento_rel = relationship("Departamento", back_populates="empleados", foreign_keys=[departamento_id])
    rol = relationship("Rol", back_populates="empleados")
    jefe = relationship("Empleado", remote_side=[id], foreign_keys=[jefe_id], backref="subordinados")

    @property
    def departamento(self):
        return self.departamento_rel
