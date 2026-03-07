"""add horario_sabado_id to empleados

Revision ID: t1u2v3w4x5y6
Revises: s0t1u2v3w4x5
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa

revision = 't1u2v3w4x5y6'
down_revision = 's0t1u2v3w4x5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'empleados',
        sa.Column('horario_sabado_id', sa.Integer(), sa.ForeignKey('horarios.id'), nullable=True)
    )


def downgrade():
    op.drop_constraint('empleados_ibfk_horario_sabado', 'empleados', type_='foreignkey')
    op.drop_column('empleados', 'horario_sabado_id')
