"""empresa trabaja_festivos

Revision ID: i2j3k4l5m6n7
Revises: h1i2j3k4l5m6
Create Date: 2026-03-07
"""
from alembic import op
import sqlalchemy as sa


revision = "i2j3k4l5m6n7"
down_revision = "h1i2j3k4l5m6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "empresas",
        sa.Column("trabaja_festivos", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )


def downgrade():
    op.drop_column("empresas", "trabaja_festivos")

