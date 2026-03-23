"""prestamos: fecha_confirmacion_rh (confirmación RH post-depósito)

Revision ID: e5f6g7h8i9j0
Revises: c3d4e5f6g7h8
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa


revision = 'e5f6g7h8i9j0'
down_revision = 'c3d4e5f6g7h8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'solicitudes_prestamos',
        sa.Column('fecha_confirmacion_rh', sa.DateTime(timezone=True), nullable=True),
    )
    # Préstamos ya depositados: considerarlos confirmados por RH (evita cola retroactiva)
    op.execute(
        "UPDATE solicitudes_prestamos SET fecha_confirmacion_rh = COALESCE(fecha_deposito, fecha_aprobacion, created_at) "
        "WHERE estado = 'depositado' AND fecha_confirmacion_rh IS NULL"
    )


def downgrade():
    op.drop_column('solicitudes_prestamos', 'fecha_confirmacion_rh')
