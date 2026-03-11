"""Add justificado_por_id to incidencias

Revision ID: y5z6a7b8c9d0
Revises: x4y5z6a7b8c9
Create Date: 2026-03-09

"""
from alembic import op
import sqlalchemy as sa

revision = 'y5z6a7b8c9d0'
down_revision = 'x4y5z6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('incidencias', sa.Column('justificado_por_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_incidencias_justificado_por',
        'incidencias', 'empleados',
        ['justificado_por_id'], ['id']
    )


def downgrade():
    op.drop_constraint('fk_incidencias_justificado_por', 'incidencias', type_='foreignkey')
    op.drop_column('incidencias', 'justificado_por_id')
