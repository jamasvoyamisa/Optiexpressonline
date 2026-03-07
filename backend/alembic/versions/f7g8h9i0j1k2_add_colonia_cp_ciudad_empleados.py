"""Add colonia, cp, ciudad to empleados

Revision ID: f7g8h9i0j1k2
Revises: a1b2c3d4e5f6
Create Date: 2026-01-26

"""
from alembic import op
import sqlalchemy as sa


revision = 'f7g8h9i0j1k2'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('empleados', sa.Column('colonia', sa.String(length=200), nullable=True))
    op.add_column('empleados', sa.Column('cp', sa.String(length=10), nullable=True))
    op.add_column('empleados', sa.Column('ciudad', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('empleados', 'ciudad')
    op.drop_column('empleados', 'cp')
    op.drop_column('empleados', 'colonia')
