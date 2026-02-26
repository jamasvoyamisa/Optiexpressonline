from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from .models import EstadoEmpleado


# Schemas para Rol
class RolBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None


class RolCreate(RolBase):
    pass


class RolUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    activo: Optional[bool] = None


class RolResponse(RolBase):
    id: int
    activo: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Schemas para Empleado
class EmpleadoBase(BaseModel):
    numero_empleado: str
    nombre: str
    apellido_paterno: Optional[str] = None
    apellido_materno: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    rol_id: Optional[int] = None
    jefe_id: Optional[int] = None
    fecha_ingreso: Optional[datetime] = None


class EmpleadoCreate(EmpleadoBase):
    estado: EstadoEmpleado = EstadoEmpleado.ACTIVO


class EmpleadoUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido_paterno: Optional[str] = None
    apellido_materno: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    rol_id: Optional[int] = None
    jefe_id: Optional[int] = None
    estado: Optional[EstadoEmpleado] = None
    fecha_ingreso: Optional[datetime] = None
    fecha_baja: Optional[datetime] = None


class EmpleadoResponse(EmpleadoBase):
    id: int
    estado: EstadoEmpleado
    fecha_baja: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    rol: Optional[RolResponse] = None
    jefe: Optional['EmpleadoResponse'] = None
    
    class Config:
        from_attributes = True


# Actualizar referencia forward
EmpleadoResponse.model_rebuild()
