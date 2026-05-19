from sqlalchemy import Column, Integer, String, Text, DateTime, Enum, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class TicketEstado(str, enum.Enum):
    ABIERTO = "abierto"
    EN_PROCESO = "en_proceso"
    RESUELTO = "resuelto"
    CERRADO = "cerrado"


class TicketPrioridad(str, enum.Enum):
    BAJA = "baja"
    MEDIA = "media"
    ALTA = "alta"
    CRITICA = "critica"


class SoporteTicketClase(Base):
    __tablename__ = "soporte_ticket_clases"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(120), nullable=False, unique=True, index=True)
    activo = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    tipos = relationship("SoporteTicketTipo", back_populates="clase")


class SoporteTicketTipo(Base):
    __tablename__ = "soporte_ticket_tipos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(120), nullable=False, unique=True, index=True)
    clase_id = Column(Integer, ForeignKey("soporte_ticket_clases.id"), nullable=True)
    activo = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    clase = relationship("SoporteTicketClase", back_populates="tipos")

    @property
    def clase_nombre(self):
        return self.clase.nombre if self.clase else None


class SoporteTicket(Base):
    __tablename__ = "soporte_tickets"

    id = Column(Integer, primary_key=True, index=True)
    folio = Column(String(30), unique=True, nullable=False, index=True)
    origen = Column(String(20), nullable=False, default="portal")  # portal | interno
    estado = Column(Enum(TicketEstado), nullable=False, default=TicketEstado.ABIERTO)
    prioridad = Column(Enum(TicketPrioridad), nullable=False, default=TicketPrioridad.MEDIA)

    titulo = Column(String(180), nullable=False)
    descripcion = Column(Text, nullable=False)

    nombre_solicitante = Column(String(180), nullable=False)
    email_solicitante = Column(String(255), nullable=True)
    telefono_solicitante = Column(String(30), nullable=True)
    empresa_nombre = Column(String(180), nullable=True)
    departamento_nombre = Column(String(180), nullable=True)
    tipo_ticket_id = Column(Integer, ForeignKey("soporte_ticket_tipos.id"), nullable=True)

    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    asignado_a_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    motivo_cierre = Column(String(500), nullable=True)
    nota_resolucion = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    closed_at = Column(DateTime(timezone=True), nullable=True)

    empleado = relationship("Empleado", foreign_keys=[empleado_id])
    asignado_a = relationship("Empleado", foreign_keys=[asignado_a_id])
    tipo_ticket = relationship("SoporteTicketTipo", foreign_keys=[tipo_ticket_id])
    adjuntos = relationship("SoporteTicketAdjunto", back_populates="ticket")

    @property
    def tipo_ticket_nombre(self):
        return self.tipo_ticket.nombre if self.tipo_ticket else None

    @property
    def adjuntos_count(self):
        return int(getattr(self, "_adjuntos_count", 0))


class SoporteTicketAdjunto(Base):
    __tablename__ = "soporte_ticket_adjuntos"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("soporte_tickets.id"), nullable=False, index=True)
    nombre_original = Column(String(255), nullable=False)
    nombre_guardado = Column(String(255), nullable=False)
    ruta_relativa = Column(String(500), nullable=False)
    mime_type = Column(String(120), nullable=True)
    tamano_bytes = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    ticket = relationship("SoporteTicket", back_populates="adjuntos")
