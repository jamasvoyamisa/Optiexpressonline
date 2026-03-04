"""add empresas table and empresa_id to empleados

Revision ID: a1b2c3d4e5f6
Revises: e5f6a7b8c9d0
Create Date: 2026-01-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = 'a1b2c3d4e5f6'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'empresas' not in existing_tables:
        op.create_table(
            'empresas',
            sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
            sa.Column('nombre', sa.String(200), nullable=False),
            sa.Column('rfc', sa.String(13), nullable=True),
            sa.Column('direccion', sa.String(500), nullable=True),
            sa.Column('telefono', sa.String(20), nullable=True),
            sa.Column('activo', sa.Boolean(), server_default=sa.text('1'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_empresas_id'), 'empresas', ['id'], unique=False)

    existing_cols = [c['name'] for c in inspector.get_columns('empleados')]
    if 'empresa_id' not in existing_cols:
        op.add_column('empleados', sa.Column('empresa_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_empleados_empresa_id', 'empleados', 'empresas', ['empresa_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_empleados_empresa_id', 'empleados', type_='foreignkey')
    op.drop_column('empleados', 'empresa_id')
    op.drop_index(op.f('ix_empresas_id'), table_name='empresas')
    op.drop_table('empresas')
