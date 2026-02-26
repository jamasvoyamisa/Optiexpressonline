from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from decimal import Decimal


# Schemas para Expediente
class ExpedienteBase(BaseModel):
    numero_expediente: str
    notas: Optional[str] = None


class ExpedienteCreate(ExpedienteBase):
    empleado_id: int


class ExpedienteUpdate(BaseModel):
    numero_expediente: Optional[str] = None
    notas: Optional[str] = None


class ExpedienteResponse(ExpedienteBase):
    id: int
    empleado_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Schemas para TipoDocumento
class TipoDocumentoBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None


class TipoDocumentoCreate(TipoDocumentoBase):
    pass


class TipoDocumentoResponse(TipoDocumentoBase):
    id: int
    
    class Config:
        from_attributes = True


# Schemas para Documento
class DocumentoBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    ruta_archivo: Optional[str] = None
    fecha_documento: Optional[datetime] = None


class DocumentoCreate(DocumentoBase):
    expediente_id: int
    tipo_documento_id: int


class DocumentoUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    ruta_archivo: Optional[str] = None
    fecha_documento: Optional[datetime] = None
    tipo_documento_id: Optional[int] = None


class DocumentoResponse(DocumentoBase):
    id: int
    expediente_id: int
    tipo_documento_id: int
    tipo: Optional[TipoDocumentoResponse] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Schemas para Evaluacion
class EvaluacionBase(BaseModel):
    fecha_evaluacion: datetime
    periodo: Optional[str] = None
    calificacion: Optional[Decimal] = None
    comentarios: Optional[str] = None


class EvaluacionCreate(EvaluacionBase):
    expediente_id: int
    evaluador_id: Optional[int] = None


class EvaluacionUpdate(BaseModel):
    fecha_evaluacion: Optional[datetime] = None
    periodo: Optional[str] = None
    calificacion: Optional[Decimal] = None
    comentarios: Optional[str] = None
    evaluador_id: Optional[int] = None


class EvaluacionResponse(EvaluacionBase):
    id: int
    expediente_id: int
    evaluador_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Schemas para Capacitacion
class CapacitacionBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    horas: Optional[Decimal] = None
    certificado: Optional[str] = None
    estado: Optional[str] = None


class CapacitacionCreate(CapacitacionBase):
    empleado_id: int


class CapacitacionUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    horas: Optional[Decimal] = None
    certificado: Optional[str] = None
    estado: Optional[str] = None


class CapacitacionResponse(CapacitacionBase):
    id: int
    empleado_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
