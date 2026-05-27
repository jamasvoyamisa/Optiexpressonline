"""prestamos: estado finalizado (préstamo liquidado)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-05-27
"""
from alembic import op

revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE solicitudes_prestamos MODIFY COLUMN estado "
        "ENUM('pendiente', 'aprobada_departamento', 'depositado', 'finalizado', 'rechazada', 'cancelada') "
        "NOT NULL"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE solicitudes_prestamos SET estado = 'depositado' WHERE estado = 'finalizado'"
    )
    op.execute(
        "ALTER TABLE solicitudes_prestamos MODIFY COLUMN estado "
        "ENUM('pendiente', 'aprobada_departamento', 'depositado', 'rechazada', 'cancelada') "
        "NOT NULL"
    )
