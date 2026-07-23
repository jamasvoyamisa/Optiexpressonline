from decimal import Decimal

from pydantic import BaseModel, EmailStr, field_validator, Field
from typing import Optional, List, Literal, Any
from datetime import datetime
from .models import EstadoEmpleado
from .regimen_fiscal_sat import is_valid_regimen_fiscal


# ---- Schemas para Empresa ----

class EmpresaBase(BaseModel):
    nombre: str
    siglas: Optional[str] = None
    rfc: Optional[str] = None
    direccion: Optional[str] = None
    capital_social: Optional[Decimal] = None
    codigo_postal: Optional[str] = None
    domicilio: Optional[str] = None
    numero_exterior: Optional[str] = None
    numero_interior: Optional[str] = None
    colonia: Optional[str] = None
    municipio: Optional[str] = None
    estado: Optional[str] = None
    regimen_fiscal: Optional[str] = None
    telefono: Optional[str] = None
    dias_laborales: Literal["lun-sab", "lun-dom"] = "lun-sab"
    trabaja_festivos: bool = False

    @field_validator(
        "rfc",
        "direccion",
        "codigo_postal",
        "domicilio",
        "numero_exterior",
        "numero_interior",
        "colonia",
        "municipio",
        "estado",
        "regimen_fiscal",
        "telefono",
        mode="before",
    )
    @classmethod
    def empty_str_to_none(cls, v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @field_validator("codigo_postal")
    @classmethod
    def validar_cp(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        if len(s) != 5 or not s.isdigit():
            raise ValueError("El código postal debe tener 5 dígitos")
        return s

    @field_validator("regimen_fiscal")
    @classmethod
    def validar_regimen_sat(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        if len(s) != 3 or not s.isdigit():
            raise ValueError("El régimen fiscal debe ser un código de 3 dígitos (catálogo SAT)")
        if not is_valid_regimen_fiscal(s):
            raise ValueError("Código de régimen fiscal no válido en el catálogo SAT")
        return s


class EmpresaCreate(EmpresaBase):
    checadas_remotas: bool = False


class EmpresaUpdate(BaseModel):
    nombre: Optional[str] = None
    siglas: Optional[str] = None
    rfc: Optional[str] = None
    direccion: Optional[str] = None
    capital_social: Optional[Decimal] = None
    codigo_postal: Optional[str] = None
    domicilio: Optional[str] = None
    numero_exterior: Optional[str] = None
    numero_interior: Optional[str] = None
    colonia: Optional[str] = None
    municipio: Optional[str] = None
    estado: Optional[str] = None
    regimen_fiscal: Optional[str] = None
    telefono: Optional[str] = None
    activo: Optional[bool] = None
    checadas_remotas: Optional[bool] = None
    dias_laborales: Optional[Literal["lun-sab", "lun-dom"]] = None
    trabaja_festivos: Optional[bool] = None

    @field_validator(
        "rfc",
        "direccion",
        "codigo_postal",
        "domicilio",
        "numero_exterior",
        "numero_interior",
        "colonia",
        "municipio",
        "estado",
        "regimen_fiscal",
        "telefono",
        mode="before",
    )
    @classmethod
    def empty_str_to_none_u(cls, v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @field_validator("codigo_postal")
    @classmethod
    def validar_cp_u(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        if len(s) != 5 or not s.isdigit():
            raise ValueError("El código postal debe tener 5 dígitos")
        return s

    @field_validator("regimen_fiscal")
    @classmethod
    def validar_regimen_sat_u(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        if len(s) != 3 or not s.isdigit():
            raise ValueError("El régimen fiscal debe ser un código de 3 dígitos (catálogo SAT)")
        if not is_valid_regimen_fiscal(s):
            raise ValueError("Código de régimen fiscal no válido en el catálogo SAT")
        return s


class EmpresaResponse(EmpresaBase):
    id: int
    activo: bool
    checadas_remotas: bool = False
    dias_laborales: Literal["lun-sab", "lun-dom"] = "lun-sab"
    trabaja_festivos: bool = False
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

TIPOS_HIJO_DEPTO = ("subdepartamento", "sucursal")


class DepartamentoBase(BaseModel):
    nombre: str
    empresa_id: int
    jefe_id: Optional[int] = None
    padre_id: Optional[int] = None
    tipo: Optional[str] = None  # subdepartamento | sucursal (solo hijos)
    encargados_ids: Optional[List[int]] = None


class DepartamentoCreate(DepartamentoBase):
    pass


class DepartamentoUpdate(BaseModel):
    nombre: Optional[str] = None
    empresa_id: Optional[int] = None
    jefe_id: Optional[int] = None
    padre_id: Optional[int] = None
    tipo: Optional[str] = None
    activo: Optional[bool] = None
    encargados_ids: Optional[List[int]] = None


class DepartamentoResponse(BaseModel):
    id: int
    nombre: str
    empresa_id: int
    jefe_id: Optional[int] = None
    padre_id: Optional[int] = None
    tipo: Optional[str] = None
    activo: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    empresa: Optional[EmpresaResponse] = None
    jefe_nombre: Optional[str] = None
    padre_nombre: Optional[str] = None
    encargados_ids: Optional[List[int]] = None
    encargados_nombres: Optional[List[str]] = None

    class Config:
        from_attributes = True


# ---- Schemas para Puesto ----

class PuestoResponse(BaseModel):
    id: int
    nombre: str
    orden: int
    activo: bool
    empresa_id: Optional[int] = None
    departamento_id: Optional[int] = None
    empresa_nombre: Optional[str] = None
    departamento_nombre: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PuestoCreate(BaseModel):
    empresa_id: int
    departamento_id: int
    nombre: str
    orden: int = 0
    activo: bool = True


class PuestoUpdate(BaseModel):
    nombre: Optional[str] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None


# ---- Schemas para Empleado ----

class EmpleadoBase(BaseModel):
    numero_empleado: str
    nombre: str
    apellido_paterno: Optional[str] = None
    apellido_materno: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    telefono_empresa_asignado: Optional[str] = None
    username: Optional[str] = None
    empresa_id: Optional[int] = None
    departamento_id: Optional[int] = None
    puesto_id: Optional[int] = None
    exento_incidencias: Optional[bool] = False
    puede_checar_remoto: Optional[bool] = False
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
    # Director / Subdirector / Gerente General: empresas donde aparece en organigrama.
    empresas_supervision_ids: Optional[List[int]] = None


class UsuarioEspecialCreate(BaseModel):
    """Alta simplificada para usuarios especiales (exentos de incidencias)."""
    nombre: str
    apellido_paterno: Optional[str] = None
    apellido_materno: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    empresa_id: int
    departamento_id: int
    puesto_id: int
    fecha_ingreso: Optional[datetime] = None
    # Aplica si el puesto es Director, Subdirector o Gerente General: empresas adicionales que supervisas/gerencia.
    empresas_supervision_ids: Optional[List[int]] = None


class EmpleadoUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido_paterno: Optional[str] = None
    apellido_materno: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    telefono_empresa_asignado: Optional[str] = None
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
    horario_id: Optional[int] = None        # Horario L-V a asignar
    horario_sabado_id: Optional[int] = None  # None = no labora sábados; enviar explícitamente para cambiar
    estado: Optional[EstadoEmpleado] = None
    exento_incidencias: Optional[bool] = None  # Usuario especial: no genera incidencias automáticas
    puede_checar_remoto: Optional[bool] = None  # Permiso para checar desde portal web remoto
    fecha_ingreso: Optional[datetime] = None
    fecha_baja: Optional[datetime] = None
    password: Optional[str] = None
    # Director, Subdirector o Gerente General: reemplaza el alcance multi-empresa.
    empresas_supervision_ids: Optional[List[int]] = None


class PermisosEspecialesUpdate(BaseModel):
    exento_incidencias: Optional[bool] = None
    puede_checar_remoto: Optional[bool] = None


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
    horario_id: Optional[int] = None      # Horario L-V activo (empleado_horario)
    horario_sabado_id: Optional[int] = None  # Horario sábado (None = no labora sábados)
    exento_incidencias: bool = False
    puede_checar_remoto: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    rol: Optional[RolResponse] = None
    jefe: Optional[EmpleadoJefeResponse] = None
    empresa: Optional[EmpresaResponse] = None
    departamento: Optional[DepartamentoResponse] = None
    puesto: Optional[PuestoResponse] = None
    empresas_supervisadas_ids: Optional[List[int]] = None

    @field_validator("estado", mode="before")
    @classmethod
    def _estado_null_como_activo(cls, v: Any) -> Any:
        if v is None:
            return EstadoEmpleado.ACTIVO
        return v

    class Config:
        from_attributes = True


class EmpleadosConteosResponse(BaseModel):
    """Contadores livianos para tarjetas del listado de personal (sin payload de empleados)."""
    total: int = 0
    activos: int = 0
    inactivos: int = 0
    bajas: int = 0


class MiAreaAusenciasDelDiaRequest(BaseModel):
    """IDs de empleados ya listados en Mi área; el servidor filtra al alcance del usuario."""
    empleado_ids: List[int] = Field(default_factory=list, max_length=900)


class MiAreaAusenciasDelDiaItem(BaseModel):
    empleado_id: int
    en_incapacidad: bool
    en_vacaciones: bool
