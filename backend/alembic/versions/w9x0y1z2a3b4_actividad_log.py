"""Crear tabla actividad_log

Revision ID: w9x0y1z2a3b4
Revises: v5w6x7y8z9a0
Create Date: 2026-04-05
"""
from alembic import op
import sqlalchemy as sa


revision = "w9x0y1z2a3b4"
down_revision = "v5w6x7y8z9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "actividad_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("nivel", sa.String(length=20), nullable=False),
        sa.Column("categoria", sa.String(length=40), nullable=False),
        sa.Column("mensaje", sa.Text(), nullable=False),
        sa.Column("contexto", sa.Text(), nullable=True),
        sa.Column("empleado_id", sa.Integer(), sa.ForeignKey("empleados.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ip_cliente", sa.String(length=45), nullable=True),
        sa.Column("metodo_http", sa.String(length=12), nullable=True),
        sa.Column("ruta", sa.String(length=500), nullable=True),
        sa.Column("codigo_http", sa.Integer(), nullable=True),
        sa.Column("duracion_ms", sa.Integer(), nullable=True),
    )
    op.create_index("ix_actividad_log_created_at", "actividad_log", ["created_at"])
    op.create_index("ix_actividad_log_nivel", "actividad_log", ["nivel"])
    op.create_index("ix_actividad_log_categoria", "actividad_log", ["categoria"])
    op.create_index("ix_actividad_log_empleado_id", "actividad_log", ["empleado_id"])
    op.create_index("ix_actividad_log_codigo_http", "actividad_log", ["codigo_http"])
    op.create_index("ix_actividad_log_created_nivel", "actividad_log", ["created_at", "nivel"])


def downgrade() -> None:
    op.drop_index("ix_actividad_log_created_nivel", table_name="actividad_log")
    op.drop_index("ix_actividad_log_codigo_http", table_name="actividad_log")
    op.drop_index("ix_actividad_log_empleado_id", table_name="actividad_log")
    op.drop_index("ix_actividad_log_categoria", table_name="actividad_log")
    op.drop_index("ix_actividad_log_nivel", table_name="actividad_log")
    op.drop_index("ix_actividad_log_created_at", table_name="actividad_log")
    op.drop_table("actividad_log")
