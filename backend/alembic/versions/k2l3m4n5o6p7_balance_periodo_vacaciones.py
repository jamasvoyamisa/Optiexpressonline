"""balance_periodo_vacaciones: periodo actual y anterior por aniversario

Revision ID: k2l3m4n5o6p7
Revises: i0j1k2l3m4n5
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa

revision = 'k2l3m4n5o6p7'
down_revision = 'j1k2l3m4n5o6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'balance_periodo_vacaciones',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('empleado_id', sa.Integer(), nullable=False),
        sa.Column('anios_antiguedad', sa.Integer(), nullable=False),
        sa.Column('fecha_aniversario', sa.Date(), nullable=False),
        sa.Column('fecha_limite_goce', sa.Date(), nullable=False),
        sa.Column('dias_derecho', sa.Integer(), nullable=False),
        sa.Column('dias_tomados', sa.Numeric(5, 2), nullable=True, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['empleado_id'], ['empleados.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('empleado_id', 'anios_antiguedad', name='uq_empleado_anios'),
    )
    op.create_index(op.f('ix_balance_periodo_vacaciones_id'), 'balance_periodo_vacaciones', ['id'], unique=False)
    op.create_index(op.f('ix_balance_periodo_vacaciones_empleado_id'), 'balance_periodo_vacaciones', ['empleado_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_balance_periodo_vacaciones_empleado_id'), table_name='balance_periodo_vacaciones')
    op.drop_index(op.f('ix_balance_periodo_vacaciones_id'), table_name='balance_periodo_vacaciones')
    op.drop_table('balance_periodo_vacaciones')
