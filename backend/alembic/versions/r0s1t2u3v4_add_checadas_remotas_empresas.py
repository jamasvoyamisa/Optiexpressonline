"""Add checadas_remotas to empresas

Revision ID: r0s1t2u3v4
Revises: p8q9r0s1t2u3
Create Date: 2026-03-10

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = 'r0s1t2u3v4'
down_revision = 'p8q9r0s1t2u3'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    r = conn.execute(text("SHOW COLUMNS FROM empresas LIKE 'checadas_remotas'")).fetchone()
    if r is None:
        op.add_column('empresas', sa.Column('checadas_remotas', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    conn = op.get_bind()
    r = conn.execute(text("SHOW COLUMNS FROM empresas LIKE 'checadas_remotas'")).fetchone()
    if r is not None:
        op.drop_column('empresas', 'checadas_remotas')
