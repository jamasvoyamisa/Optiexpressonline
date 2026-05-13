"""Empresa: capital social, domicilio fiscal, régimen SAT

Revision ID: p2q3r4s5t6u7
Revises: o8p9q0r1s2t3
Create Date: 2026-03-25

"""
from alembic import op
import sqlalchemy as sa


revision = "p2q3r4s5t6u7"
down_revision = "o8p9q0r1s2t3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("empresas", sa.Column("capital_social", sa.Numeric(20, 2), nullable=True))
    op.add_column("empresas", sa.Column("codigo_postal", sa.String(length=5), nullable=True))
    op.add_column("empresas", sa.Column("domicilio", sa.String(length=200), nullable=True))
    op.add_column("empresas", sa.Column("numero_exterior", sa.String(length=30), nullable=True))
    op.add_column("empresas", sa.Column("numero_interior", sa.String(length=30), nullable=True))
    op.add_column("empresas", sa.Column("colonia", sa.String(length=150), nullable=True))
    op.add_column("empresas", sa.Column("municipio", sa.String(length=150), nullable=True))
    op.add_column("empresas", sa.Column("estado", sa.String(length=100), nullable=True))
    op.add_column("empresas", sa.Column("regimen_fiscal", sa.String(length=3), nullable=True))
    op.execute(
        """
        UPDATE empresas
        SET domicilio = direccion
        WHERE domicilio IS NULL AND direccion IS NOT NULL AND TRIM(direccion) != ''
        """
    )


def downgrade() -> None:
    op.drop_column("empresas", "regimen_fiscal")
    op.drop_column("empresas", "estado")
    op.drop_column("empresas", "municipio")
    op.drop_column("empresas", "colonia")
    op.drop_column("empresas", "numero_interior")
    op.drop_column("empresas", "numero_exterior")
    op.drop_column("empresas", "domicilio")
    op.drop_column("empresas", "codigo_postal")
    op.drop_column("empresas", "capital_social")
