from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
from decimal import Decimal


class SolicitudPrestamoBase(BaseModel):
    monto: Decimal
    plazo_meses: int
    motivo: Optional[str] = None
    # Nota: por compatibilidad, el campo plazo_meses ahora representa QUINCENAS.
    # descuento_quincenal se calcula automáticamente: monto / plazo_meses

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
            raise ValueError("El plazo debe ser al menos 1 quincena")
        return v


class SolicitudPrestamoCreate(SolicitudPrestamoBase):
    pass


class SolicitudPrestamoCreateRH(SolicitudPrestamoBase):
    """Crear solicitud en nombre de un empleado (RH)."""
    empleado_id: int
    es_excepcion: bool = False
    """Si es True, solo Gerente General, Director o Administrador; permite superar $6,000 y 8 quincenas."""


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


class DepositarPrestamo(BaseModel):
    """Gerente General registra el depósito y la referencia bancaria."""
    referencia_bancaria: str
    comentarios: Optional[str] = None

    @field_validator("referencia_bancaria")
    @classmethod
    def ref_no_vacia(cls, v: str) -> str:
        s = (v or "").strip()
        if len(s) < 3:
            raise ValueError("La referencia bancaria debe tener al menos 3 caracteres")
        return s


class EmpresaMini(BaseModel):
    id: int
    nombre: str

    class Config:
        from_attributes = True


class DepartamentoMini(BaseModel):
    id: int
    nombre: str

    class Config:
        from_attributes = True


class EmpleadoResumen(BaseModel):
    id: int
    nombre: str
    apellido_paterno: Optional[str] = None
    apellido_materno: Optional[str] = None
    numero_empleado: str
    empresa: Optional[EmpresaMini] = None
    departamento: Optional[DepartamentoMini] = None

    class Config:
        from_attributes = True


class SolicitudPrestamoResponse(BaseModel):
    id: int
    numero_solicitud: Optional[str] = None
    empleado_id: int
    monto: Decimal
    plazo_meses: int
    motivo: Optional[str] = None
    descuento_quincenal: Optional[Decimal] = None
    estado: str
    aprobado_por_id: Optional[int] = None
    fecha_aprobacion: Optional[datetime] = None
    comentarios_aprobacion: Optional[str] = None
    referencia_bancaria: Optional[str] = None
    fecha_deposito: Optional[datetime] = None
    fecha_confirmacion_rh: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    empleado: Optional[EmpleadoResumen] = None
    aprobador: Optional[EmpleadoResumen] = None
    saldo_restante: Optional[Decimal] = None  # calculado en backend (quincenas día 15 y fin de mes)

    class Config:
        from_attributes = True
