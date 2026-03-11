from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
from decimal import Decimal


class SolicitudPrestamoBase(BaseModel):
    monto: Decimal
    plazo_meses: int
    motivo: Optional[str] = None
    # descuento_quincenal se calcula automáticamente: monto / (plazo_meses * 2)

    @field_validator("monto")
    @classmethod
    def monto_positivo(cls, v):
        if v is not None and v <= 0:
            raise ValueError("El monto debe ser mayor a cero")
        return v

    @field_validator("plazo_meses")
    @classmethod
    def plazo_positivo(cls, v):
        if v is not None and v < 1:
            raise ValueError("El plazo debe ser al menos 1 mes")
        return v


class SolicitudPrestamoCreate(SolicitudPrestamoBase):
    pass


class SolicitudPrestamoCreateRH(SolicitudPrestamoBase):
    """Crear solicitud en nombre de un empleado (RH)."""
    empleado_id: int


class SolicitudPrestamoUpdate(BaseModel):
    monto: Optional[Decimal] = None
    plazo_meses: Optional[int] = None
    motivo: Optional[str] = None
    # descuento_quincenal se recalcula automáticamente al cambiar monto o plazo


class AprobarRechazarPrestamo(BaseModel):
    aprobado: bool
    comentarios: Optional[str] = None


class ConfirmarRHPrestamo(BaseModel):
    comentarios: Optional[str] = None


class EmpleadoResumen(BaseModel):
    id: int
    nombre: str
    apellido_paterno: Optional[str] = None
    apellido_materno: Optional[str] = None
    numero_empleado: str

    class Config:
        from_attributes = True


class SolicitudPrestamoResponse(BaseModel):
    id: int
    empleado_id: int
    monto: Decimal
    plazo_meses: int
    motivo: Optional[str] = None
    descuento_quincenal: Optional[Decimal] = None
    estado: str
    aprobado_por_id: Optional[int] = None
    fecha_aprobacion: Optional[datetime] = None
    comentarios_aprobacion: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    empleado: Optional[EmpleadoResumen] = None
    aprobador: Optional[EmpleadoResumen] = None

    class Config:
        from_attributes = True
