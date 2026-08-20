"""Flag: habilitar subida de PDF firmado en vacaciones

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-08-10
"""
from alembic import op
import sqlalchemy as sa


revision = "i4j5k6l7m8n9"
down_revision = "h3i4j5k6l7m8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "sistema_flags" not in inspector.get_table_names():
        op.create_table(
            "sistema_flags",
            sa.Column("clave", sa.String(64), primary_key=True),
            sa.Column("valor", sa.String(32), nullable=False, server_default="0"),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_by_id", sa.Integer(), sa.ForeignKey("empleados.id"), nullable=True),
        )
    # Apagado por defecto hasta que Admin lo active
    op.execute(
        sa.text(
            "INSERT IGNORE INTO sistema_flags (clave, valor) VALUES ('vacaciones_pdf_firmado', '0')"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM sistema_flags WHERE clave = 'vacaciones_pdf_firmado'"))
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "sistema_flags" in inspector.get_table_names():
        op.drop_table("sistema_flags")
