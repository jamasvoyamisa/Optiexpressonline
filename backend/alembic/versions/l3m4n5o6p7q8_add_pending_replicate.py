"""add pending_replicate table for replicate fingerprint queue

Revision ID: l3m4n5o6p7q8
Revises: k2l3m4n5o6p7
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = 'l3m4n5o6p7q8'
down_revision = 'k2l3m4n5o6p7'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    # Idempotente: crear tabla solo si no existe (p. ej. ya existía por modelo previo)
    r = conn.execute(text("SHOW TABLES LIKE 'pending_replicate'")).fetchone()
    if not r:
        op.create_table(
            'pending_replicate',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('dispositivo_id', sa.Integer(), nullable=False),
            sa.Column('numero_empleado', sa.String(50), nullable=False),
            sa.Column('procesado', sa.Boolean(), server_default=sa.false(), nullable=True),
            sa.Column('procesado_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.ForeignKeyConstraint(['dispositivo_id'], ['dispositivos.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('dispositivo_id', 'numero_empleado', name='uq_pending_replicate_device_num'),
        )
        op.create_index(op.f('ix_pending_replicate_id'), 'pending_replicate', ['id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_pending_replicate_id'), table_name='pending_replicate')
    op.drop_table('pending_replicate')
