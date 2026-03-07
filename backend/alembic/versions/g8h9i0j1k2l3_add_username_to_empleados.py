"""Add username to empleados

Revision ID: g8h9i0j1k2l3
Revises: f7g8h9i0j1k2
Create Date: 2026-01-26

"""
from alembic import op
import sqlalchemy as sa


revision = 'g8h9i0j1k2l3'
down_revision = 'f7g8h9i0j1k2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('empleados', sa.Column('username', sa.String(length=100), nullable=True))
    op.create_index(op.f('ix_empleados_username'), 'empleados', ['username'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_empleados_username'), table_name='empleados')
    op.drop_column('empleados', 'username')
