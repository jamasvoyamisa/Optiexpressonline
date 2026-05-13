"""Schemas Pydantic para el módulo de Nómina."""
from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
import enum as py_enum

from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict


# ─────────────────────────── EmpresaNominaConfig ───────────────────────────

class EmpresaNominaConfigBase(BaseModel):
    registro_patronal: Optional[str] = Field(None, max_length=20)
    regimen_fiscal_sat: Optional[str] = Field(None, max_length=4)
    codigo_postal_expedicion: Optional[str] = Field(None, max_length=5)
    periodicidad_defecto: Optional[str] = Field(None, max_length=2)
    facturama_user: Optional[str] = Field(None, max_length=200)
    facturama_password_encrypted: Optional[str] = None
    notas: Optional[str] = None


class EmpresaNominaConfigCreate(EmpresaNominaConfigBase):
    empresa_id: int


class EmpresaNominaConfigUpdate(EmpresaNominaConfigBase):
    pass


class EmpresaNominaConfigResponse(EmpresaNominaConfigBase):
    id: int
    empresa_id: int
    activo: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─────────────────────────── EmpleadoNomina ────────────────────────────────

class EmpleadoNominaBase(BaseModel):
    salario_base: Optional[Decimal] = Field(None, ge=0, decimal_places=4)
    salario_diario_integrado: Optional[Decimal] = Field(None, ge=0, decimal_places=4)
    tipo_contrato: Optional[str] = Field(None, max_length=2)
    regimen_tipo: Optional[str] = Field(None, max_length=2)
    periodicidad_pago: Optional[str] = Field(None, max_length=2)
    banco_clave: Optional[str] = Field(None, max_length=3)
    cuenta_bancaria: Optional[str] = Field(None, max_length=30)
    clabe_interbancaria: Optional[str] = Field(None, max_length=18)
    entidad_federativa: Optional[str] = Field(None, max_length=2)
    riesgo_puesto: Optional[str] = Field(None, max_length=1)
    tipo_jornada: Optional[str] = Field(None, max_length=2)
    sindicalizado: Optional[bool] = False
    numero_credito_infonavit: Optional[str] = Field(None, max_length=30)
    descuento_infonavit: Optional[Decimal] = Field(None, ge=0)
    numero_credito_infonacot: Optional[str] = Field(None, max_length=30)
    descuento_infonacot: Optional[Decimal] = Field(None, ge=0)


class EmpleadoNominaCreate(EmpleadoNominaBase):
    empleado_id: int


class EmpleadoNominaUpdate(EmpleadoNominaBase):
    pass


class EmpleadoNominaResponse(EmpleadoNominaBase):
    id: int
    empleado_id: int
    activo: bool
    created_at: datetime
    fecha_actualizacion: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─────────────────────────── PeriodoNomina ────────────────────────────────

class PeriodoNominaCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    empresa_id: int = Field(..., ge=1)
    fecha_inicio: datetime
    fecha_fin: datetime
    tipo: str = "O"
    periodicidad: Optional[str] = Field(None, max_length=2)
    notas: Optional[str] = None

    @field_validator("periodicidad", mode="before")
    @classmethod
    def vacio_a_none(cls, v):
        if v == "":
            return None
        return v

    @field_validator("notas", mode="before")
    @classmethod
    def notas_vacio(cls, v):
        if v == "":
            return None
        return v

    @model_validator(mode="after")
    def fechas_coherentes(self):
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("fecha_fin debe ser mayor o igual a fecha_inicio")
        return self


class PeriodoNominaUpdate(BaseModel):
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    tipo: Optional[str] = None
    periodicidad: Optional[str] = None
    estado: Optional[str] = None
    notas: Optional[str] = None


class PeriodoNominaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    fecha_inicio: datetime
    fecha_fin: datetime
    tipo: str
    periodicidad: Optional[str] = None
    estado: str
    total_percepciones: Optional[Decimal] = None
    total_deducciones: Optional[Decimal] = None
    total_neto: Optional[Decimal] = None
    notas: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    @field_validator("tipo", "estado", mode="before")
    @classmethod
    def enum_a_str(cls, v):
        if isinstance(v, py_enum.Enum):
            return v.value
        return v


class PeriodoNominaListResponse(BaseModel):
    items: List[PeriodoNominaResponse]
    total: int


# ─────────────────────────── DetalleNominaEmpleado ────────────────────────

class DetalleNominaCreate(BaseModel):
    empleado_id: int
    dias_pagados: Optional[Decimal] = Field(Decimal("15"), ge=0)
    dias_laborados: Optional[Decimal] = Field(None, ge=0)
    dias_descuento: Optional[Decimal] = Field(Decimal("0"), ge=0)


class DetalleNominaResponse(BaseModel):
    id: int
    periodo_nomina_id: int
    empleado_id: int
    dias_pagados: Optional[Decimal] = None
    dias_laborados: Optional[Decimal] = None
    dias_descuento: Optional[Decimal] = None
    total_percepciones: Optional[Decimal] = None
    total_gravado: Optional[Decimal] = None
    total_exento: Optional[Decimal] = None
    total_deducciones: Optional[Decimal] = None
    total_neto: Optional[Decimal] = None
    subsidio_causado: Optional[Decimal] = None
    percepciones_json: Optional[str] = None
    deducciones_json: Optional[str] = None
    cfdi_uuid: Optional[str] = None
    cfdi_xml_url: Optional[str] = None
    cfdi_pdf_url: Optional[str] = None
    cfdi_error: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─────────────────────────── Catálogos ─────────────────────────────────────

class CatalogoItem(BaseModel):
    clave: str
    descripcion: str


class CatalogosResponse(BaseModel):
    tipos_contrato: List[CatalogoItem]
    tipos_regimen: List[CatalogoItem]
    tipos_percepcion: List[CatalogoItem]
    tipos_deduccion: List[CatalogoItem]
    bancos: List[CatalogoItem]
    entidades_federativas: List[CatalogoItem]
    riesgos_puesto: List[CatalogoItem]
    tipos_jornada: List[CatalogoItem]
    periodicidad_pago: List[CatalogoItem]
