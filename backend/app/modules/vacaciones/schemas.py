from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
from .models import EstadoSolicitud


# Schemas para SolicitudVacaciones
class SolicitudVacacionesBase(BaseModel):
    fecha_inicio: datetime
    fecha_fin: datetime
    motivo: Optional[str] = None


class SolicitudVacacionesCreate(SolicitudVacacionesBase):
    empleado_id: int


class SolicitudVacacionesCreateMine(SolicitudVacacionesBase):
    """Para POST /mis-solicitudes: el empleado_id se toma del token."""
    pass


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
    jefe_aprobador_nombre: Optional[str] = None  # Quien autorizó (llenado en ruta)
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
    fecha_limite_goce: Optional[date] = None  # LFT: disfrute antes de 18 meses tras aniversario; pasado se prescriben
    
    class Config:
        from_attributes = True


class PeriodoVacacionesResponse(BaseModel):
    """Un periodo = derecho por un aniversario (ej. 12 días al cumplir 1 año)."""
    anios_antiguedad: int
    dias_derecho: int
    dias_tomados: float
    dias_disponibles: float
    fecha_aniversario: Optional[str] = None
    fecha_limite_goce: Optional[str] = None  # después de esta fecha se prescriben


class BalanceConPeriodosResponse(BaseModel):
    """Balance con periodo actual (más reciente) y periodo anterior (por vencer/perderse)."""
    empleado_id: int
    año: int
    periodo_actual: Optional[PeriodoVacacionesResponse] = None
    periodo_anterior: Optional[PeriodoVacacionesResponse] = None
    dias_disponibles: Decimal
    dias_tomados: Decimal
    dias_pendientes: Decimal
    fecha_limite_goce: Optional[str] = None  # del periodo que vence primero (anterior)
