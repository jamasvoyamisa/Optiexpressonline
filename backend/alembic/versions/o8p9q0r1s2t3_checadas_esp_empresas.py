"""checadas_especiales: empresas_incluidas/excluidas JSON y checadas_requeridas

Revision ID: o8p9q0r1s2t3
Revises: n7o8p9q0r1s2
Create Date: 2026-03-24

"""
from alembic import op
import sqlalchemy as sa


revision = "o8p9q0r1s2t3"
down_revision = "n7o8p9q0r1s2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "checadas_especiales",
        sa.Column("checadas_requeridas", sa.Integer(), nullable=True),
    )
    op.add_column(
        "checadas_especiales",
        sa.Column("empresas_incluidas", sa.JSON(), nullable=True),
    )
    op.add_column(
        "checadas_especiales",
        sa.Column("empresas_excluidas", sa.JSON(), nullable=True),
    )


def downgrade():
    op.drop_column("checadas_especiales", "empresas_excluidas")
    op.drop_column("checadas_especiales", "empresas_incluidas")
    op.drop_column("checadas_especiales", "checadas_requeridas")
