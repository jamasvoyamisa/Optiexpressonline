"""empleados: dias_saldo_migracion_vacaciones (bolsa única fuera de LFT)

Revision ID: a2b3c4d5e6f7
Revises: r5s6t7u8v9w0
Create Date: 2026-04-23

"""
from alembic import op
import sqlalchemy as sa


revision = "a2b3c4d5e6f7"
down_revision = "r5s6t7u8v9w0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "empleados",
        sa.Column(
            "dias_saldo_migracion_vacaciones",
            sa.Numeric(10, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade():
    op.drop_column("empleados", "dias_saldo_migracion_vacaciones")
