"""empleado: dias_deuda_vacaciones_ley (adeudo por vac. generales sin periodo)

Revision ID: k4l5m6n7o8p9
Revises: 5bea81a2b7b7
Create Date: 2026-03-24

"""
from alembic import op
import sqlalchemy as sa


revision = "k4l5m6n7o8p9"
down_revision = "5bea81a2b7b7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "empleados",
        sa.Column(
            "dias_deuda_vacaciones_ley",
            sa.Numeric(10, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade():
    op.drop_column("empleados", "dias_deuda_vacaciones_ley")
