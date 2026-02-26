"""add_ultima_llamada_getrequest

Revision ID: d4e5f6a7b8c9
Revises: c1d2e3f4a5b6
Create Date: 2026-01-26

"""
from alembic import op
import sqlalchemy as sa


revision = 'd4e5f6a7b8c9'
down_revision = 'c1d2e3f4a5b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('dispositivos', sa.Column('ultima_llamada_getrequest', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('dispositivos', 'ultima_llamada_getrequest')
