from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Enum, UniqueConstraint
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
    rango_inicio = Column(Integer, nullable=True)
    rango_fin = Column(Integer, nullable=True)
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


class Puesto(Base):
    """Catálogo de puestos en orden jerárquico."""
    __tablename__ = "puestos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    orden = Column(Integer, nullable=False, default=0)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empleados = relationship("Empleado", back_populates="puesto_rel")


class Empleado(Base):
    __tablename__ = "empleados"
    __table_args__ = (
        UniqueConstraint('empresa_id', 'numero_empleado', name='uq_empresa_numero_empleado'),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=True)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"), nullable=True)
    numero_empleado = Column(String(50), nullable=False, index=True)
    pin_checador = Column(String(20), unique=True, nullable=True, index=True)
    nombre = Column(String(100), nullable=False)
    apellido_paterno = Column(String(100))
    apellido_materno = Column(String(100))
    email = Column(String(255), unique=True, index=True)
    telefono = Column(String(20))
    username = Column(String(100), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=True)

    puesto_id = Column(Integer, ForeignKey("puestos.id"), nullable=True)
    curp = Column(String(18), nullable=True)
    rfc = Column(String(13), nullable=True)
    nss = Column(String(11), nullable=True)
    direccion = Column(String(500), nullable=True)
    colonia = Column(String(200), nullable=True)
    cp = Column(String(10), nullable=True)
    ciudad = Column(String(200), nullable=True)
    fecha_nacimiento = Column(DateTime(timezone=True), nullable=True)
    contacto_emergencia = Column(String(200), nullable=True)
    telefono_emergencia = Column(String(20), nullable=True)

    rol_id = Column(Integer, ForeignKey("roles.id"))
    jefe_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    # Horario sabatino: si es NULL el empleado no labora los sábados
    horario_sabado_id = Column(Integer, ForeignKey("horarios.id"), nullable=True)

    estado = Column(Enum(EstadoEmpleado), default=EstadoEmpleado.ACTIVO)
    fecha_ingreso = Column(DateTime(timezone=True))
    fecha_baja = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empresa = relationship("Empresa", back_populates="empleados")
    departamento_rel = relationship("Departamento", back_populates="empleados", foreign_keys=[departamento_id])
    puesto_rel = relationship("Puesto", back_populates="empleados")
    rol = relationship("Rol", back_populates="empleados")
    jefe = relationship("Empleado", remote_side=[id], foreign_keys=[jefe_id], backref="subordinados")
    horario_sabado = relationship("Horario", foreign_keys=[horario_sabado_id])

    @property
    def departamento(self):
        return self.departamento_rel

    @property
    def puesto(self):
        return self.puesto_rel
