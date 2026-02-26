"""add_ultima_ip_conexion

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-01-26

"""
from alembic import op
import sqlalchemy as sa


revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('dispositivos', sa.Column('ultima_ip_conexion', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('dispositivos', 'ultima_ip_conexion')
