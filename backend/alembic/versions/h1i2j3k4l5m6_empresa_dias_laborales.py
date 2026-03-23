"""empresa dias_laborales (lun-sab / lun-dom)

Revision ID: h1i2j3k4l5m6
Revises: g7h8i9j0k1l2
Create Date: 2026-03-07
"""
from alembic import op
import sqlalchemy as sa


revision = "h1i2j3k4l5m6"
down_revision = "g7h8i9j0k1l2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "empresas",
        sa.Column("dias_laborales", sa.String(length=20), nullable=False, server_default="lun-sab"),
    )


def downgrade():
    op.drop_column("empresas", "dias_laborales")

