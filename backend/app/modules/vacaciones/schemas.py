from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from decimal import Decimal
from .models import EstadoSolicitud


# Schemas para SolicitudVacaciones
class SolicitudVacacionesBase(BaseModel):
    fecha_inicio: datetime
    fecha_fin: datetime
    motivo: Optional[str] = None


class SolicitudVacacionesCreate(SolicitudVacacionesBase):
    empleado_id: int


class SolicitudVacacionesUpdate(BaseModel):
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    motivo: Optional[str] = None
    estado: Optional[EstadoSolicitud] = None


class SolicitudVacacionesAprobar(BaseModel):
    aprobar: bool
    comentarios: Optional[str] = None


class SolicitudVacacionesResponse(SolicitudVacacionesBase):
    id: int
    empleado_id: int
    dias_solicitados: int
    estado: EstadoSolicitud
    jefe_aprobador_id: Optional[int] = None
    fecha_aprobacion: Optional[datetime] = None
    comentarios_aprobacion: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Schemas para BalanceVacaciones
class BalanceVacacionesBase(BaseModel):
    año: int
    dias_disponibles: Decimal
    dias_tomados: Decimal
    dias_pendientes: Decimal


class BalanceVacacionesCreate(BaseModel):
    empleado_id: int
    año: int
    dias_disponibles: Decimal = Decimal("0")


class BalanceVacacionesUpdate(BaseModel):
    dias_disponibles: Optional[Decimal] = None
    dias_tomados: Optional[Decimal] = None
    dias_pendientes: Optional[Decimal] = None


class BalanceVacacionesResponse(BalanceVacacionesBase):
    id: int
    empleado_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
