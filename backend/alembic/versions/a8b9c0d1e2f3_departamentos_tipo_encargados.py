"""departamentos.tipo + departamento_encargados

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-07-17
"""
from alembic import op
import sqlalchemy as sa


revision = "a8b9c0d1e2f3"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("departamentos")} if inspector.has_table("departamentos") else set()
    if "tipo" not in cols:
        op.add_column("departamentos", sa.Column("tipo", sa.String(20), nullable=True))

    tables = set(inspector.get_table_names())
    if "departamento_encargados" not in tables:
        op.create_table(
            "departamento_encargados",
            sa.Column("departamento_id", sa.Integer(), nullable=False),
            sa.Column("empleado_id", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["departamento_id"], ["departamentos.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["empleado_id"], ["empleados.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("departamento_id", "empleado_id"),
        )
        op.create_index(
            "ix_departamento_encargados_empleado_id",
            "departamento_encargados",
            ["empleado_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "departamento_encargados" in tables:
        op.drop_index("ix_departamento_encargados_empleado_id", table_name="departamento_encargados")
        op.drop_table("departamento_encargados")
    cols = {c["name"] for c in inspector.get_columns("departamentos")} if inspector.has_table("departamentos") else set()
    if "tipo" in cols:
        op.drop_column("departamentos", "tipo")
