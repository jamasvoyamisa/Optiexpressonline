"""Add exento_incidencias to empleados (usuarios especiales)

Revision ID: p8q9r0s1t2u3
Revises: z6a7b8c9d0e1
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = 'p8q9r0s1t2u3'
down_revision = 'q2r3s4t5u6v7'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    r = conn.execute(text("SHOW COLUMNS FROM empleados LIKE 'exento_incidencias'")).fetchone()
    if r is None:
        op.add_column('empleados', sa.Column('exento_incidencias', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    conn = op.get_bind()
    r = conn.execute(text("SHOW COLUMNS FROM empleados LIKE 'exento_incidencias'")).fetchone()
    if r is not None:
        op.drop_column('empleados', 'exento_incidencias')
