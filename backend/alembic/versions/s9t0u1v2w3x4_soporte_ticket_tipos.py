"""Agregar catalogo de tipos de ticket de soporte

Revision ID: s9t0u1v2w3x4
Revises: r1s2t3u4v5w6
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa


revision = "s9t0u1v2w3x4"
down_revision = "r1s2t3u4v5w6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("soporte_ticket_tipos"):
        op.create_table(
            "soporte_ticket_tipos",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("nombre", sa.String(length=120), nullable=False),
            sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )

    existing_indexes = {ix["name"] for ix in inspector.get_indexes("soporte_ticket_tipos")}
    if "ix_soporte_ticket_tipos_id" not in existing_indexes:
        op.create_index("ix_soporte_ticket_tipos_id", "soporte_ticket_tipos", ["id"])
    if "ix_soporte_ticket_tipos_nombre" not in existing_indexes:
        op.create_index("ix_soporte_ticket_tipos_nombre", "soporte_ticket_tipos", ["nombre"], unique=True)

    ticket_cols = {c["name"] for c in inspector.get_columns("soporte_tickets")}
    if "tipo_ticket_id" not in ticket_cols:
        op.add_column("soporte_tickets", sa.Column("tipo_ticket_id", sa.Integer(), nullable=True))

    fk_names = {fk["name"] for fk in inspector.get_foreign_keys("soporte_tickets") if fk.get("name")}
    if "fk_soporte_tickets_tipo_ticket_id" not in fk_names:
        op.create_foreign_key(
            "fk_soporte_tickets_tipo_ticket_id",
            "soporte_tickets",
            "soporte_ticket_tipos",
            ["tipo_ticket_id"],
            ["id"],
        )

    op.execute("INSERT IGNORE INTO soporte_ticket_tipos (nombre, activo) VALUES ('Soporte', 1)")
    op.execute("INSERT IGNORE INTO soporte_ticket_tipos (nombre, activo) VALUES ('Reemplazo', 1)")


def downgrade() -> None:
    op.drop_constraint("fk_soporte_tickets_tipo_ticket_id", "soporte_tickets", type_="foreignkey")
    op.drop_column("soporte_tickets", "tipo_ticket_id")
    op.drop_index("ix_soporte_ticket_tipos_nombre", table_name="soporte_ticket_tipos")
    op.drop_index("ix_soporte_ticket_tipos_id", table_name="soporte_ticket_tipos")
    op.drop_table("soporte_ticket_tipos")
