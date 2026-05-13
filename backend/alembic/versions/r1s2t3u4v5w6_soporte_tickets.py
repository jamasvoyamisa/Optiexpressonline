"""Crear tabla soporte_tickets

Revision ID: r1s2t3u4v5w6
Revises: p2q3r4s5t6u7
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa


revision = "r1s2t3u4v5w6"
down_revision = "p2q3r4s5t6u7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "soporte_tickets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("folio", sa.String(length=30), nullable=False),
        sa.Column("origen", sa.String(length=20), nullable=False, server_default="portal"),
        sa.Column("estado", sa.Enum("ABIERTO", "EN_PROCESO", "RESUELTO", "CERRADO", name="ticketestado"), nullable=False, server_default="ABIERTO"),
        sa.Column("prioridad", sa.Enum("BAJA", "MEDIA", "ALTA", "CRITICA", name="ticketprioridad"), nullable=False, server_default="MEDIA"),
        sa.Column("titulo", sa.String(length=180), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=False),
        sa.Column("nombre_solicitante", sa.String(length=180), nullable=False),
        sa.Column("email_solicitante", sa.String(length=255), nullable=True),
        sa.Column("telefono_solicitante", sa.String(length=30), nullable=True),
        sa.Column("empresa_nombre", sa.String(length=180), nullable=True),
        sa.Column("departamento_nombre", sa.String(length=180), nullable=True),
        sa.Column("empleado_id", sa.Integer(), sa.ForeignKey("empleados.id"), nullable=True),
        sa.Column("asignado_a_id", sa.Integer(), sa.ForeignKey("empleados.id"), nullable=True),
        sa.Column("nota_resolucion", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_soporte_tickets_id", "soporte_tickets", ["id"])
    op.create_index("ix_soporte_tickets_folio", "soporte_tickets", ["folio"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_soporte_tickets_folio", table_name="soporte_tickets")
    op.drop_index("ix_soporte_tickets_id", table_name="soporte_tickets")
    op.drop_table("soporte_tickets")
