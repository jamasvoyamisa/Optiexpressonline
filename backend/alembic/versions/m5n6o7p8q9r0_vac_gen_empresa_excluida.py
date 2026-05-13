"""vacaciones_generales: empresa_excluida_id (excluir empresa del alcance)

Revision ID: m5n6o7p8q9r0
Revises: k4l5m6n7o8p9
Create Date: 2026-03-24

"""
from alembic import op
import sqlalchemy as sa


revision = "m5n6o7p8q9r0"
down_revision = "k4l5m6n7o8p9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "vacaciones_generales",
        sa.Column("empresa_excluida_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_vac_gen_empresa_excluida",
        "vacaciones_generales",
        "empresas",
        ["empresa_excluida_id"],
        ["id"],
    )


def downgrade():
    op.drop_constraint("fk_vac_gen_empresa_excluida", "vacaciones_generales", type_="foreignkey")
    op.drop_column("vacaciones_generales", "empresa_excluida_id")
