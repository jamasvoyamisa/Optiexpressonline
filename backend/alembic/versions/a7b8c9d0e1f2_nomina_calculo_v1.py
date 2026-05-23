"""Nómina v1: ejercicio fiscal, días asistencia, override manual

Revision ID: a7b8c9d0e1f2
Revises: x0y1z2a3b4c5
Create Date: 2026-05-19
"""
import json

from alembic import op
import sqlalchemy as sa

from app.modules.nomina import fiscal_defaults as fd

revision = "a7b8c9d0e1f2"
down_revision = "x0y1z2a3b4c5"
branch_labels = None
depends_on = None


def _seed_ejercicio(conn, ejercicio: int):
    cfg = fd.EJERCICIOS_DEFAULT[ejercicio]
    conn.execute(
        sa.text(
            """
            INSERT INTO nomina_ejercicio_fiscal
            (ejercicio, uma_diaria, dias_base_mes, tope_uma_sbc,
             isr_quincenal_json, subsidio_quincenal_json, imss_obrero_json, activo)
            VALUES
            (:ejercicio, :uma, :dias_mes, :tope,
             :isr, :sub, :imss, 1)
            """
        ),
        {
            "ejercicio": ejercicio,
            "uma": str(cfg["uma_diaria"]),
            "dias_mes": str(cfg["dias_base_mes"]),
            "tope": cfg["tope_uma_sbc"],
            "isr": json.dumps(fd.tabla_a_json_filas(cfg["isr_quincenal"])),
            "sub": json.dumps(fd.tabla_a_json_filas(cfg["subsidio_quincenal"])),
            "imss": json.dumps(fd.imss_a_json(cfg["imss_obrero"])),
        },
    )


def upgrade() -> None:
    op.create_table(
        "nomina_ejercicio_fiscal",
        sa.Column("ejercicio", sa.Integer(), nullable=False),
        sa.Column("uma_diaria", sa.Numeric(12, 4), nullable=False),
        sa.Column("dias_base_mes", sa.Numeric(6, 2), nullable=False, server_default="30.4"),
        sa.Column("tope_uma_sbc", sa.Integer(), nullable=False, server_default="25"),
        sa.Column("isr_quincenal_json", sa.Text(), nullable=False),
        sa.Column("subsidio_quincenal_json", sa.Text(), nullable=False),
        sa.Column("imss_obrero_json", sa.Text(), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("ejercicio"),
    )
    op.add_column(
        "detalle_nomina_empleado",
        sa.Column("dias_pagados_override", sa.Numeric(5, 2), nullable=True),
    )
    op.add_column(
        "detalle_nomina_empleado",
        sa.Column("dias_fuente", sa.String(20), nullable=True),
    )
    op.add_column(
        "detalle_nomina_empleado",
        sa.Column("calculo_version", sa.Integer(), nullable=True),
    )

    conn = op.get_bind()
    for year in (2025, 2026):
        _seed_ejercicio(conn, year)


def downgrade() -> None:
    op.drop_column("detalle_nomina_empleado", "calculo_version")
    op.drop_column("detalle_nomina_empleado", "dias_fuente")
    op.drop_column("detalle_nomina_empleado", "dias_pagados_override")
    op.drop_table("nomina_ejercicio_fiscal")
