"""Agregar adjuntos a tickets de soporte

Revision ID: t1u2v3w4x5y7
Revises: s9t0u1v2w3x4
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa


revision = "t1u2v3w4x5y7"
down_revision = "s9t0u1v2w3x4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("soporte_ticket_adjuntos"):
        op.create_table(
            "soporte_ticket_adjuntos",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("soporte_tickets.id"), nullable=False),
            sa.Column("nombre_original", sa.String(length=255), nullable=False),
            sa.Column("nombre_guardado", sa.String(length=255), nullable=False),
            sa.Column("ruta_relativa", sa.String(length=500), nullable=False),
            sa.Column("mime_type", sa.String(length=120), nullable=True),
            sa.Column("tamano_bytes", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        )

    existing_indexes = {ix["name"] for ix in inspector.get_indexes("soporte_ticket_adjuntos")}
    if "ix_soporte_ticket_adjuntos_id" not in existing_indexes:
        op.create_index("ix_soporte_ticket_adjuntos_id", "soporte_ticket_adjuntos", ["id"])
    if "ix_soporte_ticket_adjuntos_ticket_id" not in existing_indexes:
        op.create_index("ix_soporte_ticket_adjuntos_ticket_id", "soporte_ticket_adjuntos", ["ticket_id"])


def downgrade() -> None:
    op.drop_index("ix_soporte_ticket_adjuntos_ticket_id", table_name="soporte_ticket_adjuntos")
    op.drop_index("ix_soporte_ticket_adjuntos_id", table_name="soporte_ticket_adjuntos")
    op.drop_table("soporte_ticket_adjuntos")
