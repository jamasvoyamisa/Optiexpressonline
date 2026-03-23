"""prestamos: aprobada_departamento, depositado, referencia bancaria

Revision ID: c3d4e5f6g7h8
Revises: b7c8d9e0f1a2
Create Date: 2026-03-07

Flujo: pendiente → aprobada_departamento (gerente depto) → depositado (GG + ref. bancaria).
Migra datos: aprobada_gerente → aprobada_departamento; aprobada → depositado.
"""
from alembic import op
import sqlalchemy as sa


revision = 'c3d4e5f6g7h8'
down_revision = 'b7c8d9e0f1a2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'solicitudes_prestamos',
        sa.Column('referencia_bancaria', sa.String(120), nullable=True),
    )
    op.add_column(
        'solicitudes_prestamos',
        sa.Column('fecha_deposito', sa.DateTime(timezone=True), nullable=True),
    )

    # Ampliar ENUM con valores nuevos y antiguos para migrar datos
    op.execute(
        "ALTER TABLE solicitudes_prestamos MODIFY COLUMN estado "
        "ENUM("
        "'pendiente', 'aprobada_gerente', 'aprobada', "
        "'aprobada_departamento', 'depositado', "
        "'rechazada', 'cancelada'"
        ") NOT NULL"
    )

    op.execute(
        "UPDATE solicitudes_prestamos SET estado = 'aprobada_departamento' "
        "WHERE estado = 'aprobada_gerente'"
    )
    op.execute(
        "UPDATE solicitudes_prestamos SET estado = 'depositado' "
        "WHERE estado = 'aprobada'"
    )
    # Préstamos ya “activos”: usar fecha de aprobación como fecha de depósito si falta
    op.execute(
        "UPDATE solicitudes_prestamos SET fecha_deposito = fecha_aprobacion "
        "WHERE estado = 'depositado' AND fecha_deposito IS NULL AND fecha_aprobacion IS NOT NULL"
    )

    # ENUM final (sin valores legacy)
    op.execute(
        "ALTER TABLE solicitudes_prestamos MODIFY COLUMN estado "
        "ENUM('pendiente', 'aprobada_departamento', 'depositado', 'rechazada', 'cancelada') "
        "NOT NULL"
    )


def downgrade():
    op.execute(
        "ALTER TABLE solicitudes_prestamos MODIFY COLUMN estado "
        "ENUM("
        "'pendiente', 'aprobada_gerente', 'aprobada', "
        "'aprobada_departamento', 'depositado', "
        "'rechazada', 'cancelada'"
        ") NOT NULL"
    )
    op.execute(
        "UPDATE solicitudes_prestamos SET estado = 'aprobada_gerente' "
        "WHERE estado = 'aprobada_departamento'"
    )
    op.execute(
        "UPDATE solicitudes_prestamos SET estado = 'aprobada' "
        "WHERE estado = 'depositado'"
    )
    op.execute(
        "ALTER TABLE solicitudes_prestamos MODIFY COLUMN estado "
        "ENUM('pendiente', 'aprobada_gerente', 'aprobada', 'rechazada', 'cancelada') NOT NULL"
    )
    op.drop_column('solicitudes_prestamos', 'fecha_deposito')
    op.drop_column('solicitudes_prestamos', 'referencia_bancaria')
