"""PDF firmado en solicitudes de préstamo + flag admin

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-08-20
"""
from alembic import op
import sqlalchemy as sa


revision = "j5k6l7m8n9o0"
down_revision = "i4j5k6l7m8n9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("solicitudes_prestamos")}
    with op.batch_alter_table("solicitudes_prestamos") as batch:
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
    # Flag apagado por defecto (Admin lo activa). INSERT IGNORE = MySQL.
    op.execute(
        sa.text(
            "INSERT IGNORE INTO sistema_flags (clave, valor) VALUES ('prestamos_pdf_firmado', '0')"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM sistema_flags WHERE clave = 'prestamos_pdf_firmado'"))
    with op.batch_alter_table("solicitudes_prestamos") as batch:
        batch.drop_column("documento_firmado_por_id")
        batch.drop_column("documento_firmado_at")
        batch.drop_column("documento_firmado_nombre")
        batch.drop_column("documento_firmado_ruta")
