"""Add ultima_sync_agente to dispositivos

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
Create Date: 2026-03-08

"""
from alembic import op
import sqlalchemy as sa

revision = 'v2w3x4y5z6a7'
down_revision = 'u1v2w3x4y5z6'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    cols = [row[0] for row in conn.execute(sa.text("SHOW COLUMNS FROM dispositivos")).fetchall()]
    if 'ultima_sync_agente' not in cols:
        op.add_column('dispositivos', sa.Column('ultima_sync_agente', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('dispositivos', 'ultima_sync_agente')
