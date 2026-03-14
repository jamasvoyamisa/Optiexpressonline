"""add numero_solicitud to solicitudes_prestamos

Revision ID: a1b2c3d4e5f6
Revises: z6a7b8c9d0e1
Create Date: 2026-03-11

"""
from alembic import op
import sqlalchemy as sa

revision = 'b7c8d9e0f1a2'
down_revision = 's1t2u3v4w5x6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'solicitudes_prestamos',
        sa.Column('numero_solicitud', sa.String(20), nullable=True)
    )
    op.create_unique_constraint('uq_solicitudes_prestamos_numero', 'solicitudes_prestamos', ['numero_solicitud'])
    op.create_index('ix_solicitudes_prestamos_numero_solicitud', 'solicitudes_prestamos', ['numero_solicitud'])

    # Generar numero_solicitud para registros existentes: PRE-{año}-{id:06d}
    op.execute("""
        UPDATE solicitudes_prestamos
        SET numero_solicitud = CONCAT('PRE-', YEAR(created_at), '-', LPAD(id, 6, '0'))
        WHERE numero_solicitud IS NULL
    """)


def downgrade():
    op.drop_index('ix_solicitudes_prestamos_numero_solicitud', table_name='solicitudes_prestamos')
    op.drop_constraint('uq_solicitudes_prestamos_numero', 'solicitudes_prestamos', type_='unique')
    op.drop_column('solicitudes_prestamos', 'numero_solicitud')
