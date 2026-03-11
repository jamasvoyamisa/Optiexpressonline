"""drop pending_replicate table (cola de replicación eliminada)

Revision ID: z6a7b8c9d0e1
Revises: y5z6a7b8c9d0
Create Date: 2026-03-09

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = 'z6a7b8c9d0e1'
down_revision = 'y5z6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    r = conn.execute(text("SHOW TABLES LIKE 'pending_replicate'")).fetchone()
    if r:
        op.drop_table('pending_replicate')


def downgrade():
    op.create_table(
        'pending_replicate',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('dispositivo_id', sa.Integer(), nullable=False),
        sa.Column('numero_empleado', sa.String(50), nullable=False),
        sa.Column('procesado', sa.Boolean(), server_default=sa.false(), nullable=True),
        sa.Column('procesado_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['dispositivo_id'], ['dispositivos.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('dispositivo_id', 'numero_empleado', name='uq_pending_replicate_device_num'),
    )
    op.create_index(op.f('ix_pending_replicate_id'), 'pending_replicate', ['id'], unique=False)
