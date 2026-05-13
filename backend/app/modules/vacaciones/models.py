from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum, Numeric, Text, Date, UniqueConstraint, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class EstadoSolicitud(str, enum.Enum):
    PENDIENTE = "pendiente"
    APROBADA_JEFE = "aprobada_jefe"  # Aprobada por jefe; saldo descontado; RH es registro formal o auto 24h antes
    APROBADA = "aprobada"
    RECHAZADA = "rechazada"
    CANCELADA = "cancelada"


class SolicitudVacaciones(Base):
    __tablename__ = "solicitudes_vacaciones"
    
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False)
    fecha_inicio = Column(DateTime(timezone=True), nullable=False)
    fecha_fin = Column(DateTime(timezone=True), nullable=False)
    dias_solicitados = Column(Integer, nullable=False)
    motivo = Column(Text)
    estado = Column(Enum(EstadoSolicitud), default=EstadoSolicitud.PENDIENTE)
    
    # Aprobación
    jefe_aprobador_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    fecha_aprobacion = Column(DateTime(timezone=True), nullable=True)
    comentarios_aprobacion = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relaciones
    empleado = relationship("Empleado", foreign_keys=[empleado_id], backref="solicitudes_vacaciones")
    jefe_aprobador = relationship("Empleado", foreign_keys=[jefe_aprobador_id])


class BalanceVacaciones(Base):
    __tablename__ = "balance_vacaciones"
    
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False, unique=True)
    año = Column(Integer, nullable=False)
    dias_disponibles = Column(Numeric(5, 2), default=0)
    dias_tomados = Column(Numeric(5, 2), default=0)
    dias_pendientes = Column(Numeric(5, 2), default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relación
    empleado = relationship("Empleado", backref="balance_vacaciones")


class BalancePeriodoVacaciones(Base):
    """
    Un periodo = derecho por un aniversario (ej. 12 días al cumplir 1 año, goce antes de aniversario+18 meses).
    Permite distinguir periodo actual vs anterior (por vencer).
    """
    __tablename__ = "balance_periodo_vacaciones"
    __table_args__ = (UniqueConstraint("empleado_id", "anios_antiguedad", name="uq_empleado_anios"),)

    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False)
    anios_antiguedad = Column(Integer, nullable=False)  # 1, 2, 3... (año de servicio cumplido)
    fecha_aniversario = Column(Date, nullable=False)
    fecha_limite_goce = Column(Date, nullable=False)  # aniversario + 18 meses
    dias_derecho = Column(Integer, nullable=False)  # según LFT
    dias_tomados = Column(Numeric(5, 2), default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empleado = relationship("Empleado", backref="balance_periodos_vacaciones")


class VacacionGeneral(Base):
    """
    Periodo de vacaciones general (ej. Semana Santa): días que descuentan del balance LFT
    y/o días regalo por la empresa. Alcance: todos, una empresa o un departamento.
    """
    __tablename__ = "vacaciones_generales"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    alcance = Column(String(20), nullable=False)  # global, empresa, departamento
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=True)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"), nullable=True)
    # Si se define, los empleados de esta empresa no entran en el alcance (p. ej. global menos una empresa).
    empresa_excluida_id = Column(Integer, ForeignKey("empresas.id"), nullable=True)
    dias_cuenta_ley = Column(Numeric(5, 2), nullable=False)
    dias_regalo_empresa = Column(Numeric(5, 2), nullable=False, default=0)
    activo = Column(Boolean, default=True, nullable=False)
    notas = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class VacacionGeneralAplicacion(Base):
    """Registro por empleado de una vacación general ya aplicada (idempotente)."""
    __tablename__ = "vacacion_general_aplicaciones"
    __table_args__ = (UniqueConstraint("vacacion_general_id", "empleado_id", name="uq_vac_gen_empleado"),)

    id = Column(Integer, primary_key=True, index=True)
    vacacion_general_id = Column(Integer, ForeignKey("vacaciones_generales.id", ondelete="CASCADE"), nullable=False)
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="CASCADE"), nullable=False)
    dias_ley_descontados = Column(Numeric(5, 2), nullable=False)
    dias_regalo = Column(Numeric(5, 2), nullable=False, default=0)
    aplicado_at = Column(DateTime(timezone=True), server_default=func.now())

    vacacion_general = relationship("VacacionGeneral", backref="aplicaciones")
    empleado = relationship("Empleado", backref="vacaciones_generales_aplicadas")
