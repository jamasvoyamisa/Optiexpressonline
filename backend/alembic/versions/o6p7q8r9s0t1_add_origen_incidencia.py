"""Add origen column to incidencias

Revision ID: o6p7q8r9s0t1
Revises: n5o6p7q8r9s0
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = 'o6p7q8r9s0t1'
down_revision = 'n5o6p7q8r9s0'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    cols = [row[0] for row in conn.execute(text("SHOW COLUMNS FROM incidencias")).fetchall()]
    if 'origen' not in cols:
        op.add_column('incidencias', sa.Column('origen', sa.String(20), nullable=True, server_default='manual'))


def downgrade():
    op.drop_column('incidencias', 'origen')
