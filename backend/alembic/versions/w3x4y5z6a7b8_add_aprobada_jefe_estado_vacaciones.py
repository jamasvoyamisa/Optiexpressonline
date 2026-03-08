"""add aprobada_jefe to estado solicitudes_vacaciones

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
Create Date: 2026-03-08

"""
from alembic import op
import sqlalchemy as sa

revision = 'w3x4y5z6a7b8'
down_revision = 'v2w3x4y5z6a7'
branch_labels = None
depends_on = None


def upgrade():
    # La migración original creó el ENUM con MAYÚSCULAS (así lo genera SQLAlchemy usando .name).
    # Agregamos APROBADA_JEFE manteniendo mayúsculas para que el lookup de SQLAlchemy funcione.
    op.execute("""
        ALTER TABLE solicitudes_vacaciones
        MODIFY COLUMN estado ENUM('PENDIENTE','APROBADA_JEFE','APROBADA','RECHAZADA','CANCELADA')
        NOT NULL DEFAULT 'PENDIENTE'
    """)


def downgrade():
    # Revertir al ENUM original (primero actualizar filas con APROBADA_JEFE)
    op.execute("""
        UPDATE solicitudes_vacaciones SET estado = 'PENDIENTE' WHERE estado = 'APROBADA_JEFE'
    """)
    op.execute("""
        ALTER TABLE solicitudes_vacaciones
        MODIFY COLUMN estado ENUM('PENDIENTE','APROBADA','RECHAZADA','CANCELADA')
        NOT NULL DEFAULT 'PENDIENTE'
    """)
