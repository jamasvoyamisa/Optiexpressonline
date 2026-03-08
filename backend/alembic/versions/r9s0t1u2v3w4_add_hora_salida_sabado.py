"""add hora_salida_sabado to horarios

Revision ID: r9s0t1u2v3w4
Revises: q8r9s0t1u2v3
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text  # noqa: F401 – usado a través de sa.text

revision = 'r9s0t1u2v3w4'
down_revision = 'q8r9s0t1u2v3'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    cols = [row[0] for row in conn.execute(sa.text("SHOW COLUMNS FROM horarios")).fetchall()]
    if 'hora_salida_sabado' not in cols:
        op.add_column('horarios', sa.Column('hora_salida_sabado', sa.String(10), nullable=True))


def downgrade():
    op.drop_column('horarios', 'hora_salida_sabado')
