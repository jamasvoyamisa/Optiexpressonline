"""Add puede_checar_remoto to empleados and enable all companies

Revision ID: s1t2u3v4w5x6
Revises: r0s1t2u3v4
Create Date: 2026-03-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = 's1t2u3v4w5x6'
down_revision = 'f6a7b17b3107'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # Agregar puede_checar_remoto a empleados (solo si no existe)
    r = conn.execute(text("SHOW COLUMNS FROM empleados LIKE 'puede_checar_remoto'")).fetchone()
    if r is None:
        op.add_column(
            'empleados',
            sa.Column('puede_checar_remoto', sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    # Habilitar checadas_remotas en TODAS las empresas existentes
    conn.execute(text("UPDATE empresas SET checadas_remotas = 1 WHERE activo = 1"))


def downgrade():
    conn = op.get_bind()
    r = conn.execute(text("SHOW COLUMNS FROM empleados LIKE 'puede_checar_remoto'")).fetchone()
    if r is not None:
        op.drop_column('empleados', 'puede_checar_remoto')
    conn.execute(text("UPDATE empresas SET checadas_remotas = 0"))
