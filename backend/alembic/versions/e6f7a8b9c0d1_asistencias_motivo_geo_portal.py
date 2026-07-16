"""asistencias: motivo remoto + geo portal (Fase D)

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-07-16
"""
from alembic import op
import sqlalchemy as sa


revision = "e6f7a8b9c0d1"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("asistencias")} if inspector.has_table("asistencias") else set()
    if "motivo_remoto" not in cols:
        op.add_column("asistencias", sa.Column("motivo_remoto", sa.String(length=20), nullable=True))
    if "motivo_remoto_detalle" not in cols:
        op.add_column("asistencias", sa.Column("motivo_remoto_detalle", sa.String(length=255), nullable=True))
    if "latitud" not in cols:
        op.add_column("asistencias", sa.Column("latitud", sa.Float(), nullable=True))
    if "longitud" not in cols:
        op.add_column("asistencias", sa.Column("longitud", sa.Float(), nullable=True))
    if "geo_precision_m" not in cols:
        op.add_column("asistencias", sa.Column("geo_precision_m", sa.Float(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("asistencias")} if inspector.has_table("asistencias") else set()
    for col in ("geo_precision_m", "longitud", "latitud", "motivo_remoto_detalle", "motivo_remoto"):
        if col in cols:
            op.drop_column("asistencias", col)
