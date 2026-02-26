"""add_pending_enroll

Revision ID: c1d2e3f4a5b6
Revises: b8627dc0b497
Create Date: 2026-01-26

"""
from alembic import op
import sqlalchemy as sa


revision = 'c1d2e3f4a5b6'
down_revision = 'b8627dc0b497'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'pending_enroll',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('dispositivo_id', sa.Integer(), nullable=False),
        sa.Column('numero_empleado', sa.String(50), nullable=False),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['dispositivo_id'], ['dispositivos.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pending_enroll_id'), 'pending_enroll', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_pending_enroll_id'), table_name='pending_enroll')
    op.drop_table('pending_enroll')
