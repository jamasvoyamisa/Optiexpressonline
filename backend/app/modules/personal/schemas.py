from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from .models import EstadoEmpleado


# ---- Schemas para Empresa ----

class EmpresaBase(BaseModel):
    nombre: str
    rfc: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None


class EmpresaCreate(EmpresaBase):
    pass


class EmpresaUpdate(BaseModel):
    nombre: Optional[str] = None
    rfc: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    activo: Optional[bool] = None


class EmpresaResponse(EmpresaBase):
    id: int
    activo: bool
    rango_inicio: Optional[int] = None
    rango_fin: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---- Schemas para Rol ----

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


# ---- Schemas para Departamento ----

class DepartamentoBase(BaseModel):
    nombre: str
    empresa_id: int
    jefe_id: Optional[int] = None


class DepartamentoCreate(DepartamentoBase):
    pass


class DepartamentoUpdate(BaseModel):
    nombre: Optional[str] = None
    empresa_id: Optional[int] = None
    jefe_id: Optional[int] = None
    activo: Optional[bool] = None


class DepartamentoResponse(DepartamentoBase):
    id: int
    activo: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    empresa: Optional[EmpresaResponse] = None
    jefe_nombre: Optional[str] = None

    class Config:
        from_attributes = True


# ---- Schemas para Puesto ----

class PuestoResponse(BaseModel):
    id: int
    nombre: str
    orden: int
    activo: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---- Schemas para Empleado ----

class EmpleadoBase(BaseModel):
    numero_empleado: str
    nombre: str
    apellido_paterno: Optional[str] = None
    apellido_materno: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    username: Optional[str] = None
    empresa_id: Optional[int] = None
    departamento_id: Optional[int] = None
    puesto_id: Optional[int] = None
    curp: Optional[str] = None
    rfc: Optional[str] = None
    nss: Optional[str] = None
    direccion: Optional[str] = None
    colonia: Optional[str] = None
    cp: Optional[str] = None
    ciudad: Optional[str] = None
    fecha_nacimiento: Optional[datetime] = None
    contacto_emergencia: Optional[str] = None
    telefono_emergencia: Optional[str] = None
    rol_id: Optional[int] = None
    jefe_id: Optional[int] = None
    fecha_ingreso: Optional[datetime] = None


class EmpleadoCreate(EmpleadoBase):
    estado: EstadoEmpleado = EstadoEmpleado.ACTIVO
    registrar_en_checador: Optional[bool] = False
    dispositivo_ids: Optional[list] = None
    password: Optional[str] = None
    horario_id: Optional[int] = None        # Horario L-V a asignar al crear el empleado
    horario_sabado_id: Optional[int] = None  # Horario sábado (None = no labora sábados)


class EmpleadoUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido_paterno: Optional[str] = None
    apellido_materno: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    username: Optional[str] = None
    empresa_id: Optional[int] = None
    departamento_id: Optional[int] = None
    puesto_id: Optional[int] = None
    curp: Optional[str] = None
    rfc: Optional[str] = None
    nss: Optional[str] = None
    direccion: Optional[str] = None
    colonia: Optional[str] = None
    cp: Optional[str] = None
    ciudad: Optional[str] = None
    fecha_nacimiento: Optional[datetime] = None
    contacto_emergencia: Optional[str] = None
    telefono_emergencia: Optional[str] = None
    rol_id: Optional[int] = None
    jefe_id: Optional[int] = None
    horario_sabado_id: Optional[int] = None  # None = no labora sábados; enviar explícitamente para cambiar
    estado: Optional[EstadoEmpleado] = None
    fecha_ingreso: Optional[datetime] = None
    fecha_baja: Optional[datetime] = None
    password: Optional[str] = None


class EmpleadoJefeResponse(BaseModel):
    """Schema plano para el jefe directo, sin anidar otro jefe (evita recursión infinita)."""
    id: int
    numero_empleado: str
    nombre: str
    apellido_paterno: Optional[str] = None
    apellido_materno: Optional[str] = None
    email: Optional[str] = None
    puesto_id: Optional[int] = None
    puesto: Optional[PuestoResponse] = None

    class Config:
        from_attributes = True


class EmpleadoResponse(EmpleadoBase):
    id: int
    estado: EstadoEmpleado
    pin_checador: Optional[str] = None
    fecha_baja: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    rol: Optional[RolResponse] = None
    jefe: Optional[EmpleadoJefeResponse] = None
    empresa: Optional[EmpresaResponse] = None
    departamento: Optional[DepartamentoResponse] = None
    puesto: Optional[PuestoResponse] = None

    class Config:
        from_attributes = True
