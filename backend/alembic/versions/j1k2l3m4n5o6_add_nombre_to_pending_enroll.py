"""add nombre to pending_enroll

Revision ID: j1k2l3m4n5o6
Revises: i0j1k2l3m4n5
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = 'j1k2l3m4n5o6'
down_revision = 'i0j1k2l3m4n5'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    cols = [row[0] for row in conn.execute(text("SHOW COLUMNS FROM pending_enroll")).fetchall()]
    if 'nombre' not in cols:
        op.add_column('pending_enroll', sa.Column('nombre', sa.String(120), nullable=True))

    # Rellenar nombre en registros existentes desde la tabla empleados
    conn.execute(text("""
        UPDATE pending_enroll pe
        JOIN empleados e ON e.numero_empleado = pe.numero_empleado
        SET pe.nombre = TRIM(CONCAT(e.nombre, ' ', COALESCE(e.apellido_paterno, '')))
        WHERE pe.nombre IS NULL
    """))


def downgrade():
    op.drop_column('pending_enroll', 'nombre')
