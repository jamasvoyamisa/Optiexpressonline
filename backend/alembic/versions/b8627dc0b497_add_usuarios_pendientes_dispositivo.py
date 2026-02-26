"""add_usuarios_pendientes_dispositivo

Revision ID: b8627dc0b497
Revises: 7d12e877d490
Create Date: 2026-02-25 11:50:19.105810

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8627dc0b497'
down_revision = '7d12e877d490'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'usuarios_pendientes_dispositivo',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('dispositivo_id', sa.Integer(), nullable=False),
        sa.Column('numero_empleado', sa.String(50), nullable=False),
        sa.Column('nombre', sa.String(255), nullable=False),
        sa.Column('enviado', sa.Boolean(), default=False),
        sa.Column('enviado_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['dispositivo_id'], ['dispositivos.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_usuarios_pendientes_dispositivo_id'), 'usuarios_pendientes_dispositivo', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_usuarios_pendientes_dispositivo_id'), table_name='usuarios_pendientes_dispositivo')
    op.drop_table('usuarios_pendientes_dispositivo')
