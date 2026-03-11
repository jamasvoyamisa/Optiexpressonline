"""add solicitudes_prestamos table

Revision ID: p9q0r1s2t3u4
Revises: z6a7b8c9d0e1
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = 'p9q0r1s2t3u4'
down_revision = 'r0s1t2u3v4'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    if 'solicitudes_prestamos' in inspector.get_table_names():
        return
    op.create_table(
        'solicitudes_prestamos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('empleado_id', sa.Integer(), nullable=False),
        sa.Column('monto', sa.Numeric(12, 2), nullable=False),
        sa.Column('plazo_meses', sa.Integer(), nullable=False),
        sa.Column('motivo', sa.Text(), nullable=True),
        sa.Column('descuento_quincenal', sa.Numeric(10, 2), nullable=True),
        sa.Column('estado', sa.Enum('pendiente', 'aprobada', 'rechazada', 'cancelada', name='estadosolicitudprestamo'), nullable=False),
        sa.Column('aprobado_por_id', sa.Integer(), nullable=True),
        sa.Column('fecha_aprobacion', sa.DateTime(timezone=True), nullable=True),
        sa.Column('comentarios_aprobacion', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['empleado_id'], ['empleados.id'], ),
        sa.ForeignKeyConstraint(['aprobado_por_id'], ['empleados.id'], ),
    )
    op.create_index(op.f('ix_solicitudes_prestamos_id'), 'solicitudes_prestamos', ['id'], unique=False)
    op.create_index(op.f('ix_solicitudes_prestamos_empleado_id'), 'solicitudes_prestamos', ['empleado_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_solicitudes_prestamos_empleado_id'), table_name='solicitudes_prestamos')
    op.drop_index(op.f('ix_solicitudes_prestamos_id'), table_name='solicitudes_prestamos')
    op.drop_table('solicitudes_prestamos')
