"""soporte_tickets: motivo al cerrar/resolver

Revision ID: v8w9x0y1z2a3
Revises: u2v3w4x5y6z7
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa


revision = "v8w9x0y1z2a3"
down_revision = "u2v3w4x5y6z7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "soporte_tickets",
        sa.Column("motivo_cierre", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("soporte_tickets", "motivo_cierre")
