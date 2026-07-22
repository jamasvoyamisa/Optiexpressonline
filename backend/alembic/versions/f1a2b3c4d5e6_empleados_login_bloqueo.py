"""empleados: login_fallos_consecutivos + login_bloqueado_hasta (bloqueo anti-fuerza bruta)

Revision ID: f1a2b3c4d5e6
Revises: c3d4e5f6a7b8
Create Date: 2026-07-22
"""
import sqlalchemy as sa
from alembic import op

revision = "f1a2b3c4d5e6"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("empleados")} if inspector.has_table("empleados") else set()
    if "login_fallos_consecutivos" not in cols:
        op.add_column(
            "empleados",
            sa.Column("login_fallos_consecutivos", sa.Integer(), nullable=False, server_default="0"),
        )
    if "login_bloqueado_hasta" not in cols:
        op.add_column(
            "empleados",
            sa.Column("login_bloqueado_hasta", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("empleados")} if inspector.has_table("empleados") else set()
    if "login_bloqueado_hasta" in cols:
        op.drop_column("empleados", "login_bloqueado_hasta")
    if "login_fallos_consecutivos" in cols:
        op.drop_column("empleados", "login_fallos_consecutivos")
