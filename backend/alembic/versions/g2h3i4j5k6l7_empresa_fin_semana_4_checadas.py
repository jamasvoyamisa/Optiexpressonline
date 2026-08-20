"""empresa fin_semana_4_checadas

Revision ID: g2h3i4j5k6l7
Revises: f1a2b3c4d5e6
Create Date: 2026-07-29

Si True, sáb/dom laborables de esa empresa exigen 4 checadas (con comida).
Default False = jornada corta (entrada + salida), sin cambiar comportamiento actual.
"""
from alembic import op
import sqlalchemy as sa


revision = "g2h3i4j5k6l7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("empresas")} if inspector.has_table("empresas") else set()
    if "fin_semana_4_checadas" not in cols:
        op.add_column(
            "empresas",
            sa.Column(
                "fin_semana_4_checadas",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("empresas")} if inspector.has_table("empresas") else set()
    if "fin_semana_4_checadas" in cols:
        op.drop_column("empresas", "fin_semana_4_checadas")
