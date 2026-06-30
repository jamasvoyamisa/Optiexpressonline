from pydantic import BaseModel, field_serializer, Field, field_validator
from typing import Optional, List, Literal
from datetime import datetime, date
from .models import TipoChecada, TipoIncidencia


# Schemas para Dispositivo
class DispositivoBase(BaseModel):
    nombre: str
    ip_local: Optional[str] = None
    ubicacion: Optional[str] = None
    serial_number: Optional[str] = None  # Opcional; el agente no lo requiere


class DispositivoCreate(DispositivoBase):
    pass


class DispositivoUpdate(BaseModel):
    nombre: Optional[str] = None
    ip_local: Optional[str] = None
    ubicacion: Optional[str] = None
    serial_number: Optional[str] = None
    activo: Optional[bool] = None


class TestConnectionResponse(BaseModel):
    success: bool
    message: str
    test_checada_id: Optional[int] = None


class EnqueueUserRequest(BaseModel):
    """Usuario a agregar a la cola para alta remota en dispositivo"""
    numero_empleado: str
    nombre: str
    empleado_id: Optional[int] = None
    empresa_id: Optional[int] = None


class UsuarioPendienteResponse(BaseModel):
    id: int
    dispositivo_id: int
    numero_empleado: str
    pin_checador: Optional[str] = None
    nombre: str
    enviado: bool
    enviado_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PendingEnrollResponse(BaseModel):
    id: int
    dispositivo_id: int
    numero_empleado: str
    pin_checador: Optional[str] = None
    nombre: Optional[str] = None
    status: str
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class StartEnrollRequest(BaseModel):
    numero_empleado: str
    empleado_id: Optional[int] = None
    empresa_id: Optional[int] = None


class MarkSentRequest(BaseModel):
    ids: List[int]


class MarkEnrollDoneRequest(BaseModel):
    success: bool = True


class UploadTemplateRequest(BaseModel):
    numero_empleado: str
    empleado_id: Optional[int] = None
    pin_checador: Optional[str] = None
    finger_index: int = 0
    template_data: str


class EnqueueReplicateRequest(BaseModel):
    numero_empleado: str


class QueueDeleteRequest(BaseModel):
    """Solicitud para encolar borrado de un usuario en un dispositivo."""
    empleado_id: Optional[int] = None
    numero_empleado: Optional[str] = None


class DeviceUserItem(BaseModel):
    """Un usuario tal como vive en el reloj (user_id = PIN del aparato, nombre del reloj)."""
    pin: str
    nombre: Optional[str] = None


class SyncDeviceUsersRequest(BaseModel):
    """Lista de usuarios leídos del reloj por el agente."""
    usuarios: List[DeviceUserItem]


class SyncDeviceUsersResponse(BaseModel):
    """Resultado de la reconciliación reloj <-> sistema."""
    total_en_reloj: int
    reconocidos: int
    sin_mapeo: int
    desconocidos: List[DeviceUserItem]


class EmpleadoDispositivoEstado(BaseModel):
    """Estado de un empleado en cada dispositivo activo (para ficha del empleado)."""
    dispositivo_id: int
    dispositivo_nombre: str
    dispositivo_ubicacion: Optional[str] = None
    enviado: bool = False
    enviado_at: Optional[datetime] = None
    pending_user_id: Optional[int] = None
    pending_enroll_id: Optional[int] = None
    pending_delete_id: Optional[int] = None
    # Plantilla capturada en ESTE checador (source_device_id coincide).
    tiene_huella_en_bd: bool = False
    finger_indices: List[int] = []
    # Huella almacenada en servidor (puede haberse capturado en otro checador).
    huella_en_servidor: bool = False
    finger_indices_servidor: List[int] = []
    huella_origen_dispositivo_id: Optional[int] = None
    huella_origen_dispositivo_nombre: Optional[str] = None
    replicacion_pendiente: bool = False
    replicacion_completada: bool = False
    presente_en_checador: bool = False
    checadas_total: int = 0
    ultima_checada: Optional[datetime] = None


class PendingReplicateResponse(BaseModel):
    id: int
    dispositivo_id: int
    numero_empleado: str
    procesado: bool
    procesado_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class FingerprintTemplateResponse(BaseModel):
    id: int
    empleado_id: Optional[int] = None
    numero_empleado: str
    finger_index: int
    source_device_id: Optional[int] = None
    source_device_nombre: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DispositivoResponse(DispositivoBase):
    id: int
    api_key: str
    activo: bool
    ultima_sync_agente: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Schemas para Agente
class AgenteBase(BaseModel):
    version: Optional[str] = None
    estado: Optional[str] = None


class AgenteResponse(AgenteBase):
    id: int
    dispositivo_id: int
    ultima_sincronizacion: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Schemas para Horario
class HorarioBase(BaseModel):
    nombre: str
    hora_entrada: str
    hora_salida: str
    hora_salida_sabado: Optional[str] = None  # None = no trabaja sábados
    dias_semana: Optional[str] = None
    tolerancia_minutos: int = 15


class HorarioCreate(HorarioBase):
    pass


class HorarioUpdate(BaseModel):
    nombre: Optional[str] = None
    hora_entrada: Optional[str] = None
    hora_salida: Optional[str] = None
    hora_salida_sabado: Optional[str] = None
    dias_semana: Optional[str] = None
    tolerancia_minutos: Optional[int] = None
    activo: Optional[bool] = None


class HorarioResponse(HorarioBase):
    id: int
    activo: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EmpleadoHorarioResponse(BaseModel):
    id: int
    empleado_id: int
    horario_id: int
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    activo: bool
    hora_salida_sabado: Optional[str] = None
    created_at: datetime
    horario: Optional[HorarioResponse] = None

    class Config:
        from_attributes = True


class AsignarHorarioRequest(BaseModel):
    horario_id: int


# Schemas para Asistencia (Checada)
class AsistenciaBase(BaseModel):
    timestamp: datetime
    tipo: TipoChecada


class AsistenciaCreate(AsistenciaBase):
    empleado_id: int
    device_id: str  # ID del dispositivo desde el agente


class AsistenciaSync(BaseModel):
    """Schema para recibir datos del agente local"""
    user_id: str  # ID del usuario en el dispositivo
    timestamp: str  # Timestamp en formato ISO
    device_id: str  # Identificador del dispositivo
    tipo: Optional[str] = "checada"  # el sistema auto-asigna el tipo


class AsistenciaResponse(AsistenciaBase):
    id: int
    empleado_id: int
    dispositivo_id: int
    es_tiempo_extra: bool = False
    sincronizado: bool
    created_at: datetime
    empleado_nombre: Optional[str] = None
    empleado_numero: Optional[str] = None
    # Desde empleado en BD (p. ej. administradores excluidos del listado /personal/empleados)
    empresa_nombre: Optional[str] = None
    departamento_nombre: Optional[str] = None

    @field_serializer("timestamp", "created_at")
    def serialize_datetime_mexico(self, dt: datetime):
        """Serializa datetime en hora México para que el frontend muestre correctamente."""
        if dt is None:
            return None
        from app.core.timezone_utils import to_mexico
        ts_mex = to_mexico(dt) or dt
        return ts_mex.isoformat()

    class Config:
        from_attributes = True


class ResumenAsistenciaEmpleadoResponse(BaseModel):
    """Resumen de asistencia/puntualidad de un empleado en un periodo (portal o RH)."""
    empleado_id: int
    total_dias_periodo: int
    dias_periodo_evaluados: int
    periodo_en_curso: bool
    dias_asistio: int
    dias_completos: int
    faltas: int
    faltas_justificadas: int
    incompletas: int = 0
    retardos: int
    salidas_anticipadas: int
    dias_incapacidad: int
    dias_vacaciones: int
    puntualidad_pct: float


class DiaContextoLaboralResponse(BaseModel):
    """Por cada día: tipo (incapacidad, vacaciones, festivo, jornada, etc.) y si aplica checar."""
    fecha: str
    tipo_dia: str
    etiqueta: str
    requiere_checadas: bool
    checadas_requeridas: int
    motivo: str


class ReconciliarFaltasContextoDetalleItem(BaseModel):
    incidencia_id: int
    empleado_id: int
    fecha: str
    motivo_contexto: str


class ReconciliarFaltasContextoResponse(BaseModel):
    fecha_inicio: str
    fecha_fin: str
    revisadas: int
    justificadas: int
    omitidas_sin_empleado_o_fecha: int
    detalle: List[ReconciliarFaltasContextoDetalleItem]


# Schemas para Incidencia
class IncidenciaBase(BaseModel):
    fecha: datetime
    tipo: TipoIncidencia
    descripcion: Optional[str] = None
    justificada: bool = False
    comentarios: Optional[str] = None


class IncidenciaCreate(IncidenciaBase):
    empleado_id: int
    asistencia_id: Optional[int] = None


class IncidenciaUpdate(BaseModel):
    tipo: Optional[TipoIncidencia] = None
    descripcion: Optional[str] = None
    justificada: Optional[bool] = None
    comentarios: Optional[str] = None


class IncidenciaResponse(IncidenciaBase):
    id: int
    empleado_id: int
    asistencia_id: Optional[int] = None
    empleado_nombre: Optional[str] = None
    origen: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Schemas para DiaFestivo
class DiaFestivoCreate(BaseModel):
    fecha: date
    nombre: str
    tipo: str = "LFT"
    activo: bool = True


class DiaFestivoUpdate(BaseModel):
    nombre: Optional[str] = None
    tipo: Optional[str] = None
    activo: Optional[bool] = None


class DiaFestivoResponse(BaseModel):
    id: int
    fecha: date
    nombre: str
    tipo: str
    activo: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Checadas especiales (un día, horario, checadas, alcance + exclusiones) ---
AlcanceChecadaEspecial = Literal["global", "empresa", "departamento"]


class ChecadaEspecialCreate(BaseModel):
    nombre: str
    fecha: date
    hora_entrada: Optional[str] = None
    hora_salida: Optional[str] = None
    tolerancia_minutos: Optional[int] = None
    checadas_requeridas: int = 4
    alcance: AlcanceChecadaEspecial = "global"
    empresa_id: Optional[int] = None
    departamento_id: Optional[int] = None
    empresas_excluidas: List[int] = Field(default_factory=list)
    notas: Optional[str] = None
    activo: bool = True

    @field_validator("checadas_requeridas")
    @classmethod
    def _solo_2_o_4(cls, v: int) -> int:
        if v not in (2, 4):
            raise ValueError("checadas_requeridas debe ser 2 o 4")
        return v


class ChecadaEspecialUpdate(BaseModel):
    nombre: Optional[str] = None
    fecha: Optional[date] = None
    hora_entrada: Optional[str] = None
    hora_salida: Optional[str] = None
    tolerancia_minutos: Optional[int] = None
    checadas_requeridas: Optional[int] = None
    alcance: Optional[AlcanceChecadaEspecial] = None
    empresa_id: Optional[int] = None
    departamento_id: Optional[int] = None
    empresas_excluidas: Optional[List[int]] = None
    notas: Optional[str] = None
    activo: Optional[bool] = None

    @field_validator("checadas_requeridas")
    @classmethod
    def _solo_2_o_4_opt(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return v
        if v not in (2, 4):
            raise ValueError("checadas_requeridas debe ser 2 o 4")
        return v


class ChecadaEspecialResponse(BaseModel):
    id: int
    nombre: str
    fecha: date
    fecha_fin: Optional[date] = None
    hora_entrada: Optional[str] = None
    hora_salida: Optional[str] = None
    tolerancia_minutos: Optional[int] = None
    checadas_requeridas: int
    alcance: str
    empresa_id: Optional[int] = None
    departamento_id: Optional[int] = None
    empresas_incluidas: List[int] = Field(default_factory=list)
    empresas_excluidas: List[int] = Field(default_factory=list)
    notas: Optional[str] = None
    activo: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    # Solo reglas muy antiguas sin columnas JSON coherentes
    alcance_legacy: Optional[str] = None
    empresa_id_legacy: Optional[int] = None
    departamento_id_legacy: Optional[int] = None

    class Config:
        from_attributes = True
