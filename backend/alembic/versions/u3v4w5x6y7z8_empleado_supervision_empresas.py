"""Director: empresas supervisadas (múltiples)

Revision ID: u3v4w5x6y7z8
Revises: t1u2v3w4x5y7
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa


revision = "u3v4w5x6y7z8"
down_revision = "t1u2v3w4x5y7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("empleado_supervision_empresas"):
        return
    op.create_table(
        "empleado_supervision_empresas",
        sa.Column("empleado_id", sa.Integer(), sa.ForeignKey("empleados.id", ondelete="CASCADE"), nullable=False),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False),
        sa.PrimaryKeyConstraint("empleado_id", "empresa_id"),
    )
    op.create_index(
        "ix_empleado_supervision_empresas_empresa_id",
        "empleado_supervision_empresas",
        ["empresa_id"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("empleado_supervision_empresas"):
        op.drop_table("empleado_supervision_empresas")
