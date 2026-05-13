"""Modelos de BD para el módulo de Nómina (Fase 1)."""
from decimal import Decimal
from sqlalchemy import (
    Column, Integer, String, Boolean, Numeric, Text,
    DateTime, ForeignKey, Enum, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class PeriodoEstado(str, enum.Enum):
    BORRADOR = "borrador"
    CALCULADA = "calculada"
    TIMBRADA = "timbrada"
    PAGADA = "pagada"


class PeriodoTipo(str, enum.Enum):
    ORDINARIA = "O"
    EXTRAORDINARIA = "E"


class EmpresaNominaConfig(Base):
    """Configuración de nómina por empresa (registro patronal, PAC, etc.)."""
    __tablename__ = "empresa_nomina_config"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(
        Integer, ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False, unique=True, index=True,
    )
    registro_patronal = Column(String(20), nullable=True)
    # c_RegimenFiscal SAT (emisor); si es null se hereda de la empresa
    regimen_fiscal_sat = Column(String(4), nullable=True)
    # CP del lugar de expedición de CFDI (obligatorio para timbrado)
    codigo_postal_expedicion = Column(String(5), nullable=True)
    # Periodicidad por defecto para nuevos periodos (c_PeriodicidadPago)
    periodicidad_defecto = Column(String(2), nullable=True, default="04")  # 04=Quincenal
    # Credenciales PAC Facturama (guardadas encriptadas o como referencia)
    facturama_user = Column(String(200), nullable=True)
    facturama_password_encrypted = Column(Text, nullable=True)
    # Notas internas
    notas = Column(Text, nullable=True)

    activo = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empresa = relationship("Empresa", backref="nomina_config")


class EmpleadoNomina(Base):
    """Datos de nómina específicos de cada empleado."""
    __tablename__ = "empleado_nomina"
    __table_args__ = (
        UniqueConstraint("empleado_id", name="uq_empleado_nomina_empleado"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empleado_id = Column(
        Integer, ForeignKey("empleados.id", ondelete="CASCADE"),
        nullable=False, unique=True, index=True,
    )
    salario_base = Column(Numeric(14, 4), nullable=True)
    salario_diario_integrado = Column(Numeric(14, 4), nullable=True)
    # Catálogos SAT
    tipo_contrato = Column(String(2), nullable=True, default="01")    # c_TipoContrato
    regimen_tipo = Column(String(2), nullable=True, default="02")     # c_TipoRegimen
    periodicidad_pago = Column(String(2), nullable=True, default="04")  # c_PeriodicidadPago
    banco_clave = Column(String(3), nullable=True)                    # c_Banco
    cuenta_bancaria = Column(String(30), nullable=True)
    clabe_interbancaria = Column(String(18), nullable=True)
    entidad_federativa = Column(String(2), nullable=True)             # c_Estado SAT
    riesgo_puesto = Column(String(1), nullable=True, default="1")     # c_RiesgoPuesto
    tipo_jornada = Column(String(2), nullable=True, default="01")     # c_TipoJornada
    sindicalizado = Column(Boolean, nullable=False, default=False)
    # INFONAVIT / INFONACOT
    numero_credito_infonavit = Column(String(30), nullable=True)
    descuento_infonavit = Column(Numeric(10, 4), nullable=True)       # monto o factor
    numero_credito_infonacot = Column(String(30), nullable=True)
    descuento_infonacot = Column(Numeric(10, 4), nullable=True)

    activo = Column(Boolean, nullable=False, default=True)
    fecha_actualizacion = Column(DateTime(timezone=True), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    empleado = relationship("Empleado", backref="nomina_datos")


class PeriodoNomina(Base):
    """Periodo de nómina (quincenal, mensual, etc.) por empresa."""
    __tablename__ = "periodo_nomina"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(
        Integer, ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    fecha_inicio = Column(DateTime(timezone=True), nullable=False)
    fecha_fin = Column(DateTime(timezone=True), nullable=False)
    # name= debe coincidir con la migración Alembic (MySQL ENUM nativo)
    tipo = Column(
        Enum(PeriodoTipo, name="periodotipo", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=PeriodoTipo.ORDINARIA,
    )
    periodicidad = Column(String(2), nullable=True, default="04")  # c_PeriodicidadPago
    estado = Column(
        Enum(PeriodoEstado, name="periodoestado", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=PeriodoEstado.BORRADOR,
    )

    total_percepciones = Column(Numeric(16, 4), nullable=True)
    total_deducciones = Column(Numeric(16, 4), nullable=True)
    total_neto = Column(Numeric(16, 4), nullable=True)

    notas = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("empleados.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empresa = relationship("Empresa", backref="periodos_nomina")
    detalles = relationship("DetalleNominaEmpleado", back_populates="periodo", cascade="all, delete-orphan")


class DetalleNominaEmpleado(Base):
    """Detalle de recibo de nómina por empleado dentro de un periodo."""
    __tablename__ = "detalle_nomina_empleado"
    __table_args__ = (
        UniqueConstraint("periodo_nomina_id", "empleado_id", name="uq_detalle_nomina_periodo_empleado"),
    )

    id = Column(Integer, primary_key=True, index=True)
    periodo_nomina_id = Column(
        Integer, ForeignKey("periodo_nomina.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    empleado_id = Column(
        Integer, ForeignKey("empleados.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    dias_pagados = Column(Numeric(5, 2), nullable=True, default=Decimal("15"))
    dias_laborados = Column(Numeric(5, 2), nullable=True)
    dias_descuento = Column(Numeric(5, 2), nullable=True, default=Decimal("0"))

    # Importes calculados
    total_percepciones = Column(Numeric(14, 4), nullable=True)
    total_gravado = Column(Numeric(14, 4), nullable=True)
    total_exento = Column(Numeric(14, 4), nullable=True)
    total_deducciones = Column(Numeric(14, 4), nullable=True)
    total_neto = Column(Numeric(14, 4), nullable=True)
    subsidio_causado = Column(Numeric(14, 4), nullable=True)

    # JSON con el detalle de conceptos (lista de {clave, tipo, concepto, importe_gravado, importe_exento})
    percepciones_json = Column(Text, nullable=True)
    deducciones_json = Column(Text, nullable=True)

    # Timbrado (Fase 2+)
    cfdi_uuid = Column(String(36), nullable=True, index=True)
    cfdi_xml_url = Column(String(500), nullable=True)
    cfdi_pdf_url = Column(String(500), nullable=True)
    cfdi_error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    periodo = relationship("PeriodoNomina", back_populates="detalles")
    empleado = relationship("Empleado", backref="detalles_nomina")
