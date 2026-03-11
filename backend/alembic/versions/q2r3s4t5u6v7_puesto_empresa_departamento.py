"""Agregar empresa_id y departamento_id a puestos (puestos por empresa y departamento)

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = 'q2r3s4t5u6v7'
down_revision = 'p1q2r3s4t5u6'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    cols = [row[0] for row in conn.execute(text("SHOW COLUMNS FROM puestos")).fetchall()]
    if 'empresa_id' not in cols:
        op.add_column('puestos', sa.Column('empresa_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_puestos_empresa', 'puestos', 'empresas', ['empresa_id'], ['id'])
    if 'departamento_id' not in cols:
        op.add_column('puestos', sa.Column('departamento_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_puestos_departamento', 'puestos', 'departamentos', ['departamento_id'], ['id'])
    # Índices para búsquedas por empresa/departamento
    try:
        op.create_index('ix_puestos_empresa_id', 'puestos', ['empresa_id'])
    except Exception:
        pass
    try:
        op.create_index('ix_puestos_departamento_id', 'puestos', ['departamento_id'])
    except Exception:
        pass


def downgrade():
    op.drop_index('ix_puestos_departamento_id', 'puestos', if_exists=True)
    op.drop_index('ix_puestos_empresa_id', 'puestos', if_exists=True)
    op.drop_constraint('fk_puestos_departamento', 'puestos', type_='foreignkey')
    op.drop_constraint('fk_puestos_empresa', 'puestos', type_='foreignkey')
    op.drop_column('puestos', 'departamento_id')
    op.drop_column('puestos', 'empresa_id')
