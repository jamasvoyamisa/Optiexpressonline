"""add session_id to empleados for single-session enforcement

Revision ID: v5w6x7y8z9a0
Revises: u3v4w5x6y7z8
Create Date: 2026-04-05
"""
from alembic import op
import sqlalchemy as sa

revision = 'v5w6x7y8z9a0'
down_revision = 'u3v4w5x6y7z8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'empleados',
        sa.Column('session_id', sa.String(64), nullable=True),
    )


def downgrade():
    op.drop_column('empleados', 'session_id')
