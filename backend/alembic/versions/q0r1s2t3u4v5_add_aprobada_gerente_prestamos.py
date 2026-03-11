"""add aprobada_gerente to prestamos enum

Revision ID: q0r1s2t3u4v5
Revises: p9q0r1s2t3u4
Create Date: 2026-03-07

"""
from alembic import op


revision = 'q0r1s2t3u4v5'
down_revision = 'p9q0r1s2t3u4'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE solicitudes_prestamos MODIFY COLUMN estado "
        "ENUM('pendiente', 'aprobada_gerente', 'aprobada', 'rechazada', 'cancelada') NOT NULL"
    )


def downgrade():
    op.execute(
        "ALTER TABLE solicitudes_prestamos MODIFY COLUMN estado "
        "ENUM('pendiente', 'aprobada', 'rechazada', 'cancelada') NOT NULL"
    )
