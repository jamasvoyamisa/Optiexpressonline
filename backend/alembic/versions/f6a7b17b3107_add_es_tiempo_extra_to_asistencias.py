"""add es_tiempo_extra to asistencias

Revision ID: f6a7b17b3107
Revises: q0r1s2t3u4v5
Create Date: 2026-03-10 20:46:20.051153

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f6a7b17b3107'
down_revision = 'q0r1s2t3u4v5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('asistencias', sa.Column('es_tiempo_extra', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('asistencias', 'es_tiempo_extra')
