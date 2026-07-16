"""departamentos: padre_id (subdepartamentos)

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-07-16
"""
from alembic import op
import sqlalchemy as sa


revision = "f7a8b9c0d1e2"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("departamentos")} if inspector.has_table("departamentos") else set()
    if "padre_id" not in cols:
        op.add_column("departamentos", sa.Column("padre_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_departamentos_padre_id",
            "departamentos",
            "departamentos",
            ["padre_id"],
            ["id"],
        )
        op.create_index("ix_departamentos_padre_id", "departamentos", ["padre_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("departamentos")} if inspector.has_table("departamentos") else set()
    if "padre_id" in cols:
        op.drop_index("ix_departamentos_padre_id", table_name="departamentos")
        op.drop_constraint("fk_departamentos_padre_id", "departamentos", type_="foreignkey")
        op.drop_column("departamentos", "padre_id")
