from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Expediente(Base):
    __tablename__ = "expedientes"
    
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False, unique=True)
    numero_expediente = Column(String(50), unique=True, nullable=False)
    notas = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relaciones
    empleado = relationship("Empleado", backref="expediente")
    documentos = relationship("Documento", back_populates="expediente", cascade="all, delete-orphan")
    evaluaciones = relationship("Evaluacion", back_populates="expediente", cascade="all, delete-orphan")


class TipoDocumento(Base):
    __tablename__ = "tipos_documento"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)
    descripcion = Column(Text)
    
    documentos = relationship("Documento", back_populates="tipo")


class Documento(Base):
    __tablename__ = "documentos"
    
    id = Column(Integer, primary_key=True, index=True)
    expediente_id = Column(Integer, ForeignKey("expedientes.id"), nullable=False)
    tipo_documento_id = Column(Integer, ForeignKey("tipos_documento.id"), nullable=False)
    nombre = Column(String(255), nullable=False)
    descripcion = Column(Text)
    ruta_archivo = Column(String(500))
    fecha_documento = Column(DateTime(timezone=True))
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relaciones
    expediente = relationship("Expediente", back_populates="documentos")
    tipo = relationship("TipoDocumento", back_populates="documentos")


class Evaluacion(Base):
    __tablename__ = "evaluaciones"
    
    id = Column(Integer, primary_key=True, index=True)
    expediente_id = Column(Integer, ForeignKey("expedientes.id"), nullable=False)
    fecha_evaluacion = Column(DateTime(timezone=True), nullable=False)
    periodo = Column(String(50))  # Ej: "2024-Q1", "2024"
    calificacion = Column(Numeric(5, 2))
    comentarios = Column(Text)
    evaluador_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relaciones
    expediente = relationship("Expediente", back_populates="evaluaciones")
    evaluador = relationship("Empleado", foreign_keys=[evaluador_id])


class Capacitacion(Base):
    __tablename__ = "capacitaciones"
    
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False)
    nombre = Column(String(255), nullable=False)
    descripcion = Column(Text)
    fecha_inicio = Column(DateTime(timezone=True))
    fecha_fin = Column(DateTime(timezone=True))
    horas = Column(Numeric(5, 2))
    certificado = Column(String(500))
    estado = Column(String(50), default="completada")  # completada, en_proceso, cancelada
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relación
    empleado = relationship("Empleado", backref="capacitaciones")
