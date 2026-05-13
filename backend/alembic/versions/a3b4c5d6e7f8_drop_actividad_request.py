"""Eliminar filas actividad_log con categoría request (obsoleta)

Revision ID: a3b4c5d6e7f8
Revises: w9x0y1z2a3b4
Create Date: 2026-04-05
"""
from alembic import op


revision = "a3b4c5d6e7f8"
down_revision = "w9x0y1z2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM actividad_log WHERE categoria = 'request'")


def downgrade() -> None:
    pass
