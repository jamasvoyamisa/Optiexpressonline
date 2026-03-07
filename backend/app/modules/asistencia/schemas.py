from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from .models import TipoChecada, TipoIncidencia


# Schemas para Dispositivo
class DispositivoBase(BaseModel):
    nombre: str
    ip_local: Optional[str] = None
    ubicacion: Optional[str] = None
    serial_number: Optional[str] = None  # SN del dispositivo (ZKTeco ADMS)


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


class MarkSentRequest(BaseModel):
    ids: List[int]


class MarkEnrollDoneRequest(BaseModel):
    success: bool = True


class UploadTemplateRequest(BaseModel):
    numero_empleado: str
    finger_index: int = 0
    template_data: str


class FingerprintTemplateResponse(BaseModel):
    id: int
    numero_empleado: str
    finger_index: int
    source_device_id: Optional[int] = None
    source_device_nombre: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MarkReplicateDoneRequest(BaseModel):
    numero_empleado: str


class ReplicateRequest(BaseModel):
    numero_empleado: str
    dispositivo_ids: List[int]


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
    dias_semana: Optional[str] = None
    tolerancia_minutos: int = 15


class HorarioCreate(HorarioBase):
    pass


class HorarioUpdate(BaseModel):
    nombre: Optional[str] = None
    hora_entrada: Optional[str] = None
    hora_salida: Optional[str] = None
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

    class Config:
        from_attributes = True


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
