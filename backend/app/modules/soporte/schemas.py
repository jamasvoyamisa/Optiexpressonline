from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

from .models import TicketEstado, TicketPrioridad


class SoporteTicketPortalCreate(BaseModel):
    """Alta desde portal público: empresa + usuario del sistema + contraseña."""

    empresa_id: int
    usuario: str
    password: str
    titulo: str
    descripcion: str
    prioridad: TicketPrioridad = TicketPrioridad.MEDIA
    tipo_ticket_id: Optional[int] = None


class SoporteTicketInternoCreate(BaseModel):
    """Alta desde app de soporte (TI/Admin): mantenimiento y ventanas."""

    empresa_id: int
    empleado_id: int
    tipo_ticket_id: int
    titulo: str
    descripcion: str
    prioridad: TicketPrioridad = TicketPrioridad.MEDIA


class SoporteInternoEmpresaItem(BaseModel):
    id: int
    nombre: str


class SoporteInternoEmpleadoItem(BaseModel):
    id: int
    nombre_completo: str


class SoporteTicketClaseCreate(BaseModel):
    nombre: str
    activo: bool = True


class SoporteTicketClaseUpdate(BaseModel):
    nombre: Optional[str] = None
    activo: Optional[bool] = None


class SoporteTicketClaseResponse(BaseModel):
    id: int
    nombre: str
    activo: bool

    class Config:
        from_attributes = True


class SoporteTicketTipoCreate(BaseModel):
    nombre: str
    clase_id: Optional[int] = None
    activo: bool = True


class SoporteTicketTipoUpdate(BaseModel):
    nombre: Optional[str] = None
    clase_id: Optional[int] = None
    activo: Optional[bool] = None


class SoporteTicketTipoResponse(BaseModel):
    id: int
    nombre: str
    clase_id: Optional[int] = None
    clase_nombre: Optional[str] = None
    activo: bool

    class Config:
        from_attributes = True


class SoporteInternoCatalogoResponse(BaseModel):
    empresas: List[SoporteInternoEmpresaItem]
    clases: List[SoporteTicketClaseResponse]
    tipos: List[SoporteTicketTipoResponse]


class SoporteTicketUpdate(BaseModel):
    estado: Optional[TicketEstado] = None
    prioridad: Optional[TicketPrioridad] = None
    asignado_a_id: Optional[int] = None
    motivo_cierre: Optional[str] = None
    nota_resolucion: Optional[str] = None


class SoporteTicketResponse(BaseModel):
    id: int
    folio: str
    origen: str
    estado: TicketEstado
    prioridad: TicketPrioridad
    titulo: str
    descripcion: str
    nombre_solicitante: str
    email_solicitante: Optional[str] = None
    telefono_solicitante: Optional[str] = None
    empresa_nombre: Optional[str] = None
    departamento_nombre: Optional[str] = None
    tipo_ticket_id: Optional[int] = None
    tipo_ticket_nombre: Optional[str] = None
    adjuntos_count: int = 0
    empleado_id: Optional[int] = None
    asignado_a_id: Optional[int] = None
    motivo_cierre: Optional[str] = None
    nota_resolucion: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SoporteTicketListResponse(BaseModel):
    items: List[SoporteTicketResponse]
    total: int


class SoporteTicketAdjuntoResponse(BaseModel):
    id: int
    ticket_id: int
    nombre_original: str
    mime_type: Optional[str] = None
    tamano_bytes: int
    created_at: datetime

    class Config:
        from_attributes = True
