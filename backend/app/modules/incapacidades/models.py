import enum
from sqlalchemy import Column, Integer, String, Date, Text, ForeignKey, DateTime, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class TipoIncapacidad(str, enum.Enum):
    IMSS = "imss"                          # Incapacidad por el IMSS (enfermedad/accidente)
    MATERNIDAD = "maternidad"              # Licencia de maternidad
    PATERNIDAD = "paternidad"              # Licencia de paternidad
    ENFERMEDAD_GENERAL = "enfermedad_general"   # Enfermedad no cubierta por IMSS
    ACCIDENTE_TRABAJO = "accidente_trabajo"     # Accidente de trabajo
    OTRO = "otro"


class EstadoIncapacidad(str, enum.Enum):
    ACTIVA = "activa"
    FINALIZADA = "finalizada"
    CANCELADA = "cancelada"


class Incapacidad(Base):
    __tablename__ = "incapacidades"

    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False, index=True)
    tipo = Column(SAEnum(TipoIncapacidad), nullable=False, default=TipoIncapacidad.IMSS)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    dias = Column(Integer, nullable=False)            # días calendario cubiertos
    folio_imss = Column(String(60), nullable=True)    # número de folio IMSS / documento
    descripcion = Column(Text, nullable=True)
    estado = Column(SAEnum(EstadoIncapacidad), nullable=False, default=EstadoIncapacidad.ACTIVA)
    registrado_por = Column(Integer, ForeignKey("empleados.id"), nullable=True)  # RH que lo capturó
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empleado = relationship("Empleado", foreign_keys=[empleado_id])
    registrador = relationship("Empleado", foreign_keys=[registrado_por])
