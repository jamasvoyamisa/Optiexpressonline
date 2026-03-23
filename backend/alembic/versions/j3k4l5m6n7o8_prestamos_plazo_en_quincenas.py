"""prestamos: plazo_meses ahora representa quincenas

Revision ID: j3k4l5m6n7o8
Revises: e5f6g7h8i9j0
Create Date: 2026-03-07
"""
from alembic import op
import sqlalchemy as sa


revision = "j3k4l5m6n7o8"
down_revision = "e5f6g7h8i9j0"
branch_labels = None
depends_on = None


def upgrade():
    # Antes: plazo_meses guardaba meses. Ahora guardará quincenas.
    # Conversión de datos históricos: meses * 2 => quincenas.
    op.execute(sa.text("UPDATE solicitudes_prestamos SET plazo_meses = plazo_meses * 2"))


def downgrade():
    # Revertir aproximando a meses (división entera).
    op.execute(sa.text("UPDATE solicitudes_prestamos SET plazo_meses = FLOOR(plazo_meses / 2)"))

