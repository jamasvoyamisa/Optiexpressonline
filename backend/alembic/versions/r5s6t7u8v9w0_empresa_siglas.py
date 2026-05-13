"""empresa siglas

Revision ID: r5s6t7u8v9w0
Revises: q1r2s3t4u5v6
Create Date: 2026-04-18

"""
from alembic import op
import sqlalchemy as sa

revision = 'r5s6t7u8v9w0'
down_revision = 'q1r2s3t4u5v6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('empresas', sa.Column('siglas', sa.String(20), nullable=True))


def downgrade():
    op.drop_column('empresas', 'siglas')
