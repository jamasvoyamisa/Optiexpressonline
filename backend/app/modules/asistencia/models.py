from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Enum, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class TipoChecada(str, enum.Enum):
    ENTRADA = "entrada"
    SALIDA = "salida"


class TipoIncidencia(str, enum.Enum):
    RETARDO = "retardo"
    FALTA = "falta"
    HORAS_EXTRA = "horas_extra"
    SALIDA_ANTICIPADA = "salida_anticipada"


class Dispositivo(Base):
    __tablename__ = "dispositivos"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    ip_local = Column(String(50))
    ubicacion = Column(String(255))
    api_key = Column(String(255), unique=True, nullable=False, index=True)
    serial_number = Column(String(100), unique=True, nullable=True, index=True)  # SN para ADMS/iClock
    activo = Column(Boolean, default=True)
    ultima_llamada_getrequest = Column(DateTime(timezone=True), nullable=True)  # Cuándo llamó el dispositivo por última vez
    ultima_ip_conexion = Column(String(50), nullable=True)  # IP desde la que conectó (getrequest/cdata)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relaciones
    agentes = relationship("Agente", back_populates="dispositivo")
    checadas = relationship("Asistencia", back_populates="dispositivo")
    usuarios_pendientes = relationship("UsuarioPendienteDispositivo", back_populates="dispositivo")
    pending_enrolls = relationship("PendingEnroll", back_populates="dispositivo")


class UsuarioPendienteDispositivo(Base):
    """Cola de usuarios pendientes de enviar al dispositivo (alta remota)"""
    __tablename__ = "usuarios_pendientes_dispositivo"

    id = Column(Integer, primary_key=True, index=True)
    dispositivo_id = Column(Integer, ForeignKey("dispositivos.id"), nullable=False)
    numero_empleado = Column(String(50), nullable=False)
    nombre = Column(String(255), nullable=False)
    enviado = Column(Boolean, default=False)
    enviado_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    dispositivo = relationship("Dispositivo", back_populates="usuarios_pendientes")


class PendingEnroll(Base):
    """Cola de usuarios pendientes de registrar huella en el dispositivo"""
    __tablename__ = "pending_enroll"

    id = Column(Integer, primary_key=True, index=True)
    dispositivo_id = Column(Integer, ForeignKey("dispositivos.id"), nullable=False)
    numero_empleado = Column(String(50), nullable=False)
    status = Column(String(20), default="pending")  # pending, completed, failed
    completed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    dispositivo = relationship("Dispositivo", back_populates="pending_enrolls")


class Agente(Base):
    __tablename__ = "agentes"
    
    id = Column(Integer, primary_key=True, index=True)
    dispositivo_id = Column(Integer, ForeignKey("dispositivos.id"), nullable=False)
    version = Column(String(50))
    ultima_sincronizacion = Column(DateTime(timezone=True))
    estado = Column(String(50), default="activo")  # activo, inactivo, error
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relación
    dispositivo = relationship("Dispositivo", back_populates="agentes")


class Horario(Base):
    __tablename__ = "horarios"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    hora_entrada = Column(String(10), nullable=False)  # Formato HH:MM
    hora_salida = Column(String(10), nullable=False)  # Formato HH:MM
    dias_semana = Column(String(50))  # Ej: "1,2,3,4,5" para lunes a viernes
    tolerancia_minutos = Column(Integer, default=15)  # Minutos de tolerancia para retardo
    activo = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relación
    empleados = relationship("EmpleadoHorario", back_populates="horario")


class EmpleadoHorario(Base):
    __tablename__ = "empleado_horario"
    
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False)
    horario_id = Column(Integer, ForeignKey("horarios.id"), nullable=False)
    fecha_inicio = Column(DateTime(timezone=True))
    fecha_fin = Column(DateTime(timezone=True), nullable=True)
    activo = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relaciones
    empleado = relationship("Empleado", backref="horarios_asignados")
    horario = relationship("Horario", back_populates="empleados")


class Asistencia(Base):
    __tablename__ = "asistencias"
    
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False, index=True)
    dispositivo_id = Column(Integer, ForeignKey("dispositivos.id"), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    tipo = Column(Enum(TipoChecada), nullable=False)
    sincronizado = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relaciones
    empleado = relationship("Empleado", backref="asistencias")
    dispositivo = relationship("Dispositivo", back_populates="checadas")
    incidencias = relationship("Incidencia", back_populates="asistencia", cascade="all, delete-orphan")


class Incidencia(Base):
    __tablename__ = "incidencias"
    
    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False)
    asistencia_id = Column(Integer, ForeignKey("asistencias.id"), nullable=True)
    fecha = Column(DateTime(timezone=True), nullable=False)
    tipo = Column(Enum(TipoIncidencia), nullable=False)
    descripcion = Column(Text)
    justificada = Column(Boolean, default=False)
    comentarios = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relaciones
    empleado = relationship("Empleado", backref="incidencias")
    asistencia = relationship("Asistencia", back_populates="incidencias")
