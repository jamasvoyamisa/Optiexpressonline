"""Add missing columns to empleados (departamento_id, curp, rfc, nss, direccion, etc.)

Revision ID: u1v2w3x4y5z6
Revises: t1u2v3w4x5y6
Create Date: 2026-03-08

"""
from alembic import op
import sqlalchemy as sa

revision = 'u1v2w3x4y5z6'
down_revision = 't1u2v3w4x5y6'
branch_labels = None
depends_on = None


def _existing_cols(conn, table):
    return [row[0] for row in conn.execute(sa.text(f"SHOW COLUMNS FROM `{table}`")).fetchall()]


def upgrade():
    conn = op.get_bind()
    cols = _existing_cols(conn, 'empleados')

    if 'departamento_id' not in cols:
        op.add_column('empleados', sa.Column('departamento_id', sa.Integer(), nullable=True))
        op.create_foreign_key(
            'fk_empleados_departamento_id', 'empleados', 'departamentos',
            ['departamento_id'], ['id']
        )

    for col_name, col_type in [
        ('curp',                 sa.String(18)),
        ('rfc',                  sa.String(13)),
        ('nss',                  sa.String(11)),
        ('direccion',            sa.String(500)),
        ('fecha_nacimiento',     sa.DateTime(timezone=True)),
        ('contacto_emergencia',  sa.String(200)),
        ('telefono_emergencia',  sa.String(20)),
    ]:
        if col_name not in cols:
            op.add_column('empleados', sa.Column(col_name, col_type, nullable=True))


def downgrade():
    conn = op.get_bind()
    cols = _existing_cols(conn, 'empleados')

    for col_name in ['contacto_emergencia', 'telefono_emergencia', 'fecha_nacimiento',
                     'direccion', 'nss', 'rfc', 'curp']:
        if col_name in cols:
            op.drop_column('empleados', col_name)

    if 'departamento_id' in cols:
        op.drop_constraint('fk_empleados_departamento_id', 'empleados', type_='foreignkey')
        op.drop_column('empleados', 'departamento_id')
