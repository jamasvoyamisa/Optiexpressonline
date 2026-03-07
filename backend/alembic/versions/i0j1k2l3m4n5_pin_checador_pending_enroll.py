"""add pin_checador to pending_enroll

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-01-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = 'i0j1k2l3m4n5'
down_revision = 'h9i0j1k2l3m4'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # Agregar pin_checador a pending_enroll si no existe
    cols = [row[0] for row in conn.execute(text("SHOW COLUMNS FROM pending_enroll")).fetchall()]
    if 'pin_checador' not in cols:
        op.add_column('pending_enroll', sa.Column('pin_checador', sa.String(20), nullable=True))

    # Rellenar pin_checador en registros existentes usando el pin_checador del empleado
    conn.execute(text("""
        UPDATE pending_enroll pe
        JOIN empleados e ON e.numero_empleado = pe.numero_empleado
        SET pe.pin_checador = e.pin_checador
        WHERE pe.pin_checador IS NULL AND e.pin_checador IS NOT NULL
    """))


def downgrade():
    op.drop_column('pending_enroll', 'pin_checador')
