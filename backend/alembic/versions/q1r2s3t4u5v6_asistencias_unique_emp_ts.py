"""asistencias unique empleado_id timestamp

Revision ID: q1r2s3t4u5v6
Revises: o8p9q0r1s2t3
Create Date: 2026-04-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'q1r2s3t4u5v6'
down_revision = 'c7d8e9f0a1b2'
branch_labels = None
depends_on = None


def upgrade():
    # Eliminar duplicados que pudieran existir antes de crear la restricción
    op.execute("""
        DELETE a1
        FROM asistencias a1
        INNER JOIN asistencias a2
            ON a1.empleado_id = a2.empleado_id
            AND a1.timestamp  = a2.timestamp
            AND a1.id > a2.id
    """)
    op.create_index(
        'uq_asistencias_empleado_timestamp',
        'asistencias',
        ['empleado_id', 'timestamp'],
        unique=True,
    )


def downgrade():
    op.drop_index('uq_asistencias_empleado_timestamp', table_name='asistencias')
