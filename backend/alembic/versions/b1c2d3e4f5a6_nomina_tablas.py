"""Crear tablas del módulo de Nómina (Fase 1)

Revision ID: b1c2d3e4f5a6
Revises: a3b4c5d6e7f8
Create Date: 2026-04-05
"""
from alembic import op
import sqlalchemy as sa

revision = "b1c2d3e4f5a6"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "empresa_nomina_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("registro_patronal", sa.String(20), nullable=True),
        sa.Column("regimen_fiscal_sat", sa.String(4), nullable=True),
        sa.Column("codigo_postal_expedicion", sa.String(5), nullable=True),
        sa.Column("periodicidad_defecto", sa.String(2), nullable=True, server_default="04"),
        sa.Column("facturama_user", sa.String(200), nullable=True),
        sa.Column("facturama_password_encrypted", sa.Text(), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_empresa_nomina_config_empresa_id", "empresa_nomina_config", ["empresa_id"])

    op.create_table(
        "empleado_nomina",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("empleado_id", sa.Integer(), sa.ForeignKey("empleados.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("salario_base", sa.Numeric(14, 4), nullable=True),
        sa.Column("salario_diario_integrado", sa.Numeric(14, 4), nullable=True),
        sa.Column("tipo_contrato", sa.String(2), nullable=True),
        sa.Column("regimen_tipo", sa.String(2), nullable=True),
        sa.Column("periodicidad_pago", sa.String(2), nullable=True),
        sa.Column("banco_clave", sa.String(3), nullable=True),
        sa.Column("cuenta_bancaria", sa.String(30), nullable=True),
        sa.Column("clabe_interbancaria", sa.String(18), nullable=True),
        sa.Column("entidad_federativa", sa.String(2), nullable=True),
        sa.Column("riesgo_puesto", sa.String(1), nullable=True),
        sa.Column("tipo_jornada", sa.String(2), nullable=True),
        sa.Column("sindicalizado", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("numero_credito_infonavit", sa.String(30), nullable=True),
        sa.Column("descuento_infonavit", sa.Numeric(10, 4), nullable=True),
        sa.Column("numero_credito_infonacot", sa.String(30), nullable=True),
        sa.Column("descuento_infonacot", sa.Numeric(10, 4), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("fecha_actualizacion", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("empleado_id", name="uq_empleado_nomina_empleado"),
    )
    op.create_index("ix_empleado_nomina_empleado_id", "empleado_nomina", ["empleado_id"])

    op.create_table(
        "periodo_nomina",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fecha_inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fecha_fin", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "tipo",
            sa.Enum("O", "E", name="periodotipo"),
            nullable=False,
            server_default="O",
        ),
        sa.Column("periodicidad", sa.String(2), nullable=True),
        sa.Column(
            "estado",
            sa.Enum("borrador", "calculada", "timbrada", "pagada", name="periodoestado"),
            nullable=False,
            server_default="borrador",
        ),
        sa.Column("total_percepciones", sa.Numeric(16, 4), nullable=True),
        sa.Column("total_deducciones", sa.Numeric(16, 4), nullable=True),
        sa.Column("total_neto", sa.Numeric(16, 4), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("empleados.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_periodo_nomina_empresa_id", "periodo_nomina", ["empresa_id"])

    op.create_table(
        "detalle_nomina_empleado",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("periodo_nomina_id", sa.Integer(), sa.ForeignKey("periodo_nomina.id", ondelete="CASCADE"), nullable=False),
        sa.Column("empleado_id", sa.Integer(), sa.ForeignKey("empleados.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dias_pagados", sa.Numeric(5, 2), nullable=True),
        sa.Column("dias_laborados", sa.Numeric(5, 2), nullable=True),
        sa.Column("dias_descuento", sa.Numeric(5, 2), nullable=True),
        sa.Column("total_percepciones", sa.Numeric(14, 4), nullable=True),
        sa.Column("total_gravado", sa.Numeric(14, 4), nullable=True),
        sa.Column("total_exento", sa.Numeric(14, 4), nullable=True),
        sa.Column("total_deducciones", sa.Numeric(14, 4), nullable=True),
        sa.Column("total_neto", sa.Numeric(14, 4), nullable=True),
        sa.Column("subsidio_causado", sa.Numeric(14, 4), nullable=True),
        sa.Column("percepciones_json", sa.Text(), nullable=True),
        sa.Column("deducciones_json", sa.Text(), nullable=True),
        sa.Column("cfdi_uuid", sa.String(36), nullable=True),
        sa.Column("cfdi_xml_url", sa.String(500), nullable=True),
        sa.Column("cfdi_pdf_url", sa.String(500), nullable=True),
        sa.Column("cfdi_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("periodo_nomina_id", "empleado_id", name="uq_detalle_nomina_periodo_empleado"),
    )
    op.create_index("ix_detalle_nomina_periodo_id", "detalle_nomina_empleado", ["periodo_nomina_id"])
    op.create_index("ix_detalle_nomina_empleado_id", "detalle_nomina_empleado", ["empleado_id"])
    op.create_index("ix_detalle_nomina_cfdi_uuid", "detalle_nomina_empleado", ["cfdi_uuid"])


def downgrade() -> None:
    op.drop_table("detalle_nomina_empleado")
    op.drop_table("periodo_nomina")
    op.drop_table("empleado_nomina")
    op.drop_table("empresa_nomina_config")
    op.execute("DROP TYPE IF EXISTS periodoestado")
    op.execute("DROP TYPE IF EXISTS periodotipo")
