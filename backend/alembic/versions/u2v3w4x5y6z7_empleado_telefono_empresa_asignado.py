"""empleados: teléfono asignado por la empresa (WhatsApp tickets soporte)

Revision ID: u2v3w4x5y6z7
Revises: t4u5v6w7x8y9
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa


revision = "u2v3w4x5y6z7"
down_revision = "t4u5v6w7x8y9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "empleados",
        sa.Column("telefono_empresa_asignado", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("empleados", "telefono_empresa_asignado")
