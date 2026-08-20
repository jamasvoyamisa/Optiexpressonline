"""PDF firmado en solicitudes de vacaciones

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-08-10
"""
from alembic import op
import sqlalchemy as sa


revision = "h3i4j5k6l7m8"
down_revision = "g2h3i4j5k6l7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("solicitudes_vacaciones")}
    with op.batch_alter_table("solicitudes_vacaciones") as batch:
        if "documento_firmado_ruta" not in cols:
            batch.add_column(sa.Column("documento_firmado_ruta", sa.String(500), nullable=True))
        if "documento_firmado_nombre" not in cols:
            batch.add_column(sa.Column("documento_firmado_nombre", sa.String(255), nullable=True))
        if "documento_firmado_at" not in cols:
            batch.add_column(sa.Column("documento_firmado_at", sa.DateTime(timezone=True), nullable=True))
        if "documento_firmado_por_id" not in cols:
            batch.add_column(
                sa.Column(
                    "documento_firmado_por_id",
                    sa.Integer(),
                    sa.ForeignKey("empleados.id"),
                    nullable=True,
                )
            )


def downgrade() -> None:
    with op.batch_alter_table("solicitudes_vacaciones") as batch:
        batch.drop_column("documento_firmado_por_id")
        batch.drop_column("documento_firmado_at")
        batch.drop_column("documento_firmado_nombre")
        batch.drop_column("documento_firmado_ruta")
