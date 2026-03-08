from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Notificacion(Base):
    __tablename__ = "notificaciones"

    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False, index=True)
    titulo = Column(String(255), nullable=False)
    mensaje = Column(Text, nullable=True)
    tipo = Column(String(60), nullable=False)          # solicitud_aprobada_jefe | solicitud_aprobada | solicitud_rechazada | nueva_solicitud | solicitud_pendiente_rh
    referencia_id = Column(Integer, nullable=True)     # id de la solicitud_vacaciones relacionada
    leida = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    empleado = relationship("Empleado", foreign_keys=[empleado_id])
