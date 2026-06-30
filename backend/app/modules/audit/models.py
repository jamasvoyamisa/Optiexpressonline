"""Registro de actividad y errores del sistema."""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.sql import func
from app.core.database import Base


class ActividadLog(Base):
    __tablename__ = "actividad_log"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    nivel = Column(String(20), nullable=False, index=True)  # info, warning, error
    categoria = Column(String(40), nullable=False, index=True)  # auth, sistema, negocio, checador
    mensaje = Column(Text, nullable=False)
    contexto = Column(Text, nullable=True)  # JSON opcional
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="SET NULL"), nullable=True, index=True)
    ip_cliente = Column(String(45), nullable=True)
    metodo_http = Column(String(12), nullable=True)
    ruta = Column(String(500), nullable=True)
    codigo_http = Column(Integer, nullable=True, index=True)
    duracion_ms = Column(Integer, nullable=True)

    __table_args__ = (Index("ix_actividad_log_created_nivel", "created_at", "nivel"),)

