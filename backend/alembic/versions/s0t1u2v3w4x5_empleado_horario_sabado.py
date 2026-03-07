"""add hora_salida_sabado override to empleado_horario

Revision ID: s0t1u2v3w4x5
Revises: r9s0t1u2v3w4
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa

revision = 's0t1u2v3w4x5'
down_revision = 'r9s0t1u2v3w4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'empleado_horario',
        sa.Column('hora_salida_sabado', sa.String(10), nullable=True)
    )


def downgrade():
    op.drop_column('empleado_horario', 'hora_salida_sabado')
