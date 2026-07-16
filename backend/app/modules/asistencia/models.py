from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Enum, Text, Float, LargeBinary, UniqueConstraint, Date, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class TipoChecada(str, enum.Enum):
    ENTRADA = "entrada"
    SALIDA_COMER = "salida_comer"
    REGRESO_COMER = "regreso_comer"
    SALIDA = "salida"


class TipoIncidencia(str, enum.Enum):
    RETARDO = "retardo"
    FALTA = "falta"
    INCOMPLETA = "incompleta"  # Asistió pero faltan checadas (ej: solo entrada, faltan salida_comer, regreso_comer, salida)
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
    ultima_llamada_getrequest = Column(DateTime(timezone=True), nullable=True)
    ultima_ip_conexion = Column(String(50), nullable=True)
    ultima_sync_agente = Column(DateTime(timezone=True), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relaciones – cascade delete para poder eliminar dispositivos sin error de FK
    agentes = relationship("Agente", back_populates="dispositivo", cascade="all, delete-orphan", passive_deletes=True)
    checadas = relationship("Asistencia", back_populates="dispositivo", cascade="all, delete-orphan", passive_deletes=True)
    usuarios_pendientes = relationship("UsuarioPendienteDispositivo", back_populates="dispositivo", cascade="all, delete-orphan", passive_deletes=True)
    pending_enrolls = relationship("PendingEnroll", back_populates="dispositivo", cascade="all, delete-orphan", passive_deletes=True)
    pending_deletes = relationship("PendingDelete", back_populates="dispositivo", cascade="all, delete-orphan", passive_deletes=True)
    pending_replicates = relationship("PendingReplicate", back_populates="dispositivo", cascade="all, delete-orphan", passive_deletes=True)
    fingerprint_templates = relationship("FingerprintTemplate", back_populates="source_device", cascade="all, delete-orphan", passive_deletes=True)


class UsuarioPendienteDispositivo(Base):
    """Cola de usuarios pendientes de enviar al dispositivo (alta remota)"""
    __tablename__ = "usuarios_pendientes_dispositivo"

    id = Column(Integer, primary_key=True, index=True)
    dispositivo_id = Column(Integer, ForeignKey("dispositivos.id", ondelete="CASCADE"), nullable=False)
    numero_empleado = Column(String(50), nullable=False)
    pin_checador = Column(String(20), nullable=True)
    nombre = Column(String(255), nullable=False)
    enviado = Column(Boolean, default=False)
    enviado_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    dispositivo = relationship("Dispositivo", back_populates="usuarios_pendientes")


class PendingEnroll(Base):
    """Cola de usuarios pendientes de registrar huella en el dispositivo"""
    __tablename__ = "pending_enroll"

    id = Column(Integer, primary_key=True, index=True)
    dispositivo_id = Column(Integer, ForeignKey("dispositivos.id", ondelete="CASCADE"), nullable=False)
    numero_empleado = Column(String(50), nullable=False)
    pin_checador = Column(String(20), nullable=True)
    nombre = Column(String(120), nullable=True)
    status = Column(String(20), default="pending")  # pending, completed, failed
    completed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    dispositivo = relationship("Dispositivo", back_populates="pending_enrolls")


class PendingDelete(Base):
    """Cola de usuarios pendientes de eliminar del dispositivo"""
    __tablename__ = "pending_delete"

    id = Column(Integer, primary_key=True, index=True)
    dispositivo_id = Column(Integer, ForeignKey("dispositivos.id", ondelete="CASCADE"), nullable=False)
    numero_empleado = Column(String(50), nullable=False)
    procesado = Column(Boolean, default=False)
    procesado_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    dispositivo = relationship("Dispositivo", back_populates="pending_deletes")


class PendingReplicate(Base):
    """Cola de huellas pendientes de replicar a un dispositivo destino"""
    __tablename__ = "pending_replicate"
    __table_args__ = (
        UniqueConstraint('dispositivo_id', 'numero_empleado', name='uq_pending_replicate_device_num'),
    )

    id = Column(Integer, primary_key=True, index=True)
    dispositivo_id = Column(Integer, ForeignKey("dispositivos.id", ondelete="CASCADE"), nullable=False)
    numero_empleado = Column(String(50), nullable=False)
    procesado = Column(Boolean, default=False)
    procesado_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    dispositivo = relationship("Dispositivo", back_populates="pending_replicates")


class FingerprintTemplate(Base):
    """Almacena templates de huellas digitales para replicacion entre dispositivos"""
    __tablename__ = "fingerprint_templates"
    __table_args__ = (
        UniqueConstraint('empleado_id', 'finger_index', name='uq_empid_finger'),
    )

    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="CASCADE"), nullable=True, index=True)
    numero_empleado = Column(String(50), nullable=False, index=True)
    finger_index = Column(Integer, default=0)
    template_data = Column(Text, nullable=False)
    source_device_id = Column(Integer, ForeignKey("dispositivos.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    source_device = relationship("Dispositivo", back_populates="fingerprint_templates")
    empleado = relationship("Empleado", backref="fingerprint_templates")


class Agente(Base):
    __tablename__ = "agentes"
    
    id = Column(Integer, primary_key=True, index=True)
    dispositivo_id = Column(Integer, ForeignKey("dispositivos.id", ondelete="CASCADE"), nullable=False)
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
    hora_salida = Column(String(10), nullable=False)   # Formato HH:MM (lunes–viernes)
    # Sábado: si es NULL el empleado NO trabaja sábados y no se generan incidencias ese día
    hora_salida_sabado = Column(String(10), nullable=True)
    dias_semana = Column(String(50))  # Ej: "1,2,3,4,5" para lunes a viernes
    tolerancia_minutos = Column(Integer, default=15)  # Minutos de tolerancia para retardo y salida anticipada
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
    # Override por empleado: si es NULL usa el valor del horario base
    # Si es "" (string vacío) significa que explícitamente NO trabaja sábados
    hora_salida_sabado = Column(String(10), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relaciones
    empleado = relationship("Empleado", backref="horarios_asignados")
    horario = relationship("Horario", back_populates="empleados")


class Asistencia(Base):
    __tablename__ = "asistencias"

    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id"), nullable=False, index=True)
    dispositivo_id = Column(Integer, ForeignKey("dispositivos.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    tipo = Column(Enum(TipoChecada), nullable=False)
    es_tiempo_extra = Column(Boolean, default=False)
    sincronizado = Column(Boolean, default=True)
    # Fase D — portal remoto: motivo + punto de ubicación al checar (no rastreo continuo)
    motivo_remoto = Column(String(20), nullable=True)  # HO | TFO | OTRO
    motivo_remoto_detalle = Column(String(255), nullable=True)
    latitud = Column(Float, nullable=True)
    longitud = Column(Float, nullable=True)
    geo_precision_m = Column(Float, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    empleado = relationship("Empleado", backref="asistencias")
    dispositivo = relationship("Dispositivo", back_populates="checadas")
    incidencias = relationship("Incidencia", back_populates="asistencia", cascade="all, delete-orphan")


class DiaFestivo(Base):
    """Días de asueto/festivos. Los días marcados como activos no generan incidencias."""
    __tablename__ = "dias_festivos"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(Date, nullable=False, unique=True, index=True)
    nombre = Column(String(150), nullable=False)
    tipo = Column(String(20), nullable=False, default="LFT")  # LFT | adicional
    activo = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ChecadaEspecial(Base):
    """
    Reglas de horario y tolerancia para fechas concretas (medio día, jornadas especiales, sábado distinto).
    Alcance: global, empresa o departamento. Si varias aplican, gana la más específica (depto > empresa > global).
    """

    __tablename__ = "checadas_especiales"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    notas = Column(Text, nullable=True)
    activo = Column(Boolean, default=True, nullable=False)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    alcance = Column(String(20), nullable=False)  # global | empresa | departamento
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=True)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"), nullable=True)
    hora_entrada = Column(String(10), nullable=True)
    hora_salida = Column(String(10), nullable=True)
    hora_entrada_sabado = Column(String(10), nullable=True)
    hora_salida_sabado = Column(String(10), nullable=True)
    tolerancia_minutos = Column(Integer, nullable=True)
    # Si True, lunes a viernes solo se esperan 2 checadas (entrada + salida), como medio día.
    jornada_reducida_lv = Column(Boolean, default=False, nullable=False)
    # Si está definido (2 o 4), tiene prioridad sobre jornada_reducida_lv para L–V.
    checadas_requeridas = Column(Integer, nullable=True)
    # Listas de IDs de empresa (JSON). None = reglas antiguas por alcance.
    # [] en incluidas = aplica a todas las empresas (salvo excluidas).
    empresas_incluidas = Column(JSON, nullable=True)
    empresas_excluidas = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


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
    justificado_por_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)  # empleado que justificó
    origen = Column(String(20), nullable=True, default="manual")  # "automatico" | "manual"
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relaciones
    empleado = relationship("Empleado", backref="incidencias", foreign_keys=[empleado_id])
    justificado_por = relationship("Empleado", foreign_keys=[justificado_por_id])
    asistencia = relationship("Asistencia", back_populates="incidencias")
