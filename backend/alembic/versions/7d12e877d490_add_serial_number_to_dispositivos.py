"""add_serial_number_to_dispositivos

Revision ID: 7d12e877d490
Revises: 49f9f4d212f9
Create Date: 2026-02-25 11:28:19.573632

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7d12e877d490'
down_revision = '49f9f4d212f9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('dispositivos', sa.Column('serial_number', sa.String(100), nullable=True))
    op.create_index(op.f('ix_dispositivos_serial_number'), 'dispositivos', ['serial_number'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_dispositivos_serial_number'), table_name='dispositivos')
    op.drop_column('dispositivos', 'serial_number')
