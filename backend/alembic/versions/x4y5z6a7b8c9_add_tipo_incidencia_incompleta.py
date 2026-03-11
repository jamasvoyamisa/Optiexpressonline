"""Add INCOMPLETA to tipoincidencia enum

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b8
Create Date: 2026-03-09

"""
from alembic import op
from sqlalchemy import text

revision = 'x4y5z6a7b8c9'
down_revision = 'w3x4y5z6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    # MySQL: agregar valor INCOMPLETA al ENUM tipoincidencia
    conn.execute(text(
        "ALTER TABLE incidencias MODIFY COLUMN tipo "
        "ENUM('RETARDO', 'FALTA', 'HORAS_EXTRA', 'SALIDA_ANTICIPADA', 'INCOMPLETA') NOT NULL"
    ))


def downgrade():
    conn = op.get_bind()
    # Revertir al ENUM sin INCOMPLETA (las incidencias INCOMPLETA quedarían inválidas)
    conn.execute(text(
        "ALTER TABLE incidencias MODIFY COLUMN tipo "
        "ENUM('RETARDO', 'FALTA', 'HORAS_EXTRA', 'SALIDA_ANTICIPADA') NOT NULL"
    ))
