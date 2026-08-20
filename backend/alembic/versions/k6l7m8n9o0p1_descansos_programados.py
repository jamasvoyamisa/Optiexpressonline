"""Empresa gestiona_descansos_rotativos + tabla descansos_programados

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-08-20
"""
from alembic import op
import sqlalchemy as sa


revision = "k6l7m8n9o0p1"
down_revision = "j5k6l7m8n9o0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    emp_cols = {c["name"] for c in inspector.get_columns("empresas")}
    if "gestiona_descansos_rotativos" not in emp_cols:
        with op.batch_alter_table("empresas") as batch:
            batch.add_column(
                sa.Column(
                    "gestiona_descansos_rotativos",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("0"),
                )
            )

    tables = set(inspector.get_table_names())
    if "descansos_programados" not in tables:
        op.create_table(
            "descansos_programados",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("empleado_id", sa.Integer(), sa.ForeignKey("empleados.id"), nullable=False),
            sa.Column("fecha", sa.Date(), nullable=False),
            sa.Column("nota", sa.String(255), nullable=True),
            sa.Column("creado_por_id", sa.Integer(), sa.ForeignKey("empleados.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("empleado_id", "fecha", name="uq_descanso_empleado_fecha"),
        )
        op.create_index("ix_descansos_programados_fecha", "descansos_programados", ["fecha"])
        op.create_index("ix_descansos_programados_empleado_id", "descansos_programados", ["empleado_id"])


def downgrade() -> None:
    op.drop_table("descansos_programados")
    with op.batch_alter_table("empresas") as batch:
        batch.drop_column("gestiona_descansos_rotativos")
