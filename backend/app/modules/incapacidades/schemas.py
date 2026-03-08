from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime


class IncapacidadBase(BaseModel):
    empleado_id: int
    tipo: str
    fecha_inicio: date
    fecha_fin: date
    folio_imss: Optional[str] = None
    descripcion: Optional[str] = None


class IncapacidadCreate(IncapacidadBase):
    @field_validator('fecha_fin')
    @classmethod
    def fin_despues_de_inicio(cls, v, info):
        inicio = info.data.get('fecha_inicio')
        if inicio and v < inicio:
            raise ValueError('La fecha fin debe ser igual o posterior a la fecha inicio')
        return v


class IncapacidadUpdate(BaseModel):
    tipo: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    folio_imss: Optional[str] = None
    descripcion: Optional[str] = None
    estado: Optional[str] = None


class EmpleadoResumen(BaseModel):
    id: int
    nombre: str
    apellido_paterno: Optional[str] = None
    apellido_materno: Optional[str] = None
    numero_empleado: str

    class Config:
        from_attributes = True


class IncapacidadResponse(IncapacidadBase):
    id: int
    dias: int
    estado: str
    registrado_por: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    empleado: Optional[EmpleadoResumen] = None
    registrador: Optional[EmpleadoResumen] = None

    class Config:
        from_attributes = True


class IncapacidadCreateResponse(BaseModel):
    incapacidad: IncapacidadResponse
    incidencias_eliminadas: int
    detalle_incidencias: list[str]   # descripción de cada incidencia borrada
