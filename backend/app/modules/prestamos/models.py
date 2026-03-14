import enum
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import TypeDecorator, String
from app.core.database import Base


class EstadoSolicitudPrestamo(str, enum.Enum):
    PENDIENTE = "pendiente"
    APROBADA_GERENTE = "aprobada_gerente"  # Aprobada por GG/Director, pendiente confirmación RH
    APROBADA = "aprobada"
    RECHAZADA = "rechazada"
    CANCELADA = "cancelada"


class EstadoPrestamoType(TypeDecorator):
    """Almacena estado como string; convierte a enum al leer (compatible con MySQL ENUM en minúsculas)."""
    impl = String(50)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, EstadoSolicitudPrestamo):
            return value.value
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, EstadoSolicitudPrestamo):
            return value
        return EstadoSolicitudPrestamo(value)


class SolicitudPrestamo(Base):
    """Solicitud de préstamo por parte de un empleado."""
    __tablename__ = "solicitudes_prestamos"

    id = Column(Integer, primary_key=True, index=True)
    numero_solicitud = Column(String(20), unique=True, nullable=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False, index=True)
    monto = Column(Numeric(12, 2), nullable=False)
    plazo_meses = Column(Integer, nullable=False)
    motivo = Column(Text, nullable=True)
    descuento_quincenal = Column(Numeric(10, 2), nullable=True)  # opcional: monto a descontar por quincena

    estado = Column(
        EstadoPrestamoType,
        nullable=False,
        default=EstadoSolicitudPrestamo.PENDIENTE,
    )

    # Aprobación / rechazo
    aprobado_por_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    fecha_aprobacion = Column(DateTime(timezone=True), nullable=True)
    comentarios_aprobacion = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empleado = relationship("Empleado", foreign_keys=[empleado_id])
    aprobador = relationship("Empleado", foreign_keys=[aprobado_por_id])
