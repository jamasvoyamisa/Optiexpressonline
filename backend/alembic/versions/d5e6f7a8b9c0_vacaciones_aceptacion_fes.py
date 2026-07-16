"""solicitudes_vacaciones: aceptación electrónica FES (Fase B)

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-07-16
"""
from alembic import op
import sqlalchemy as sa


revision = "d5e6f7a8b9c0"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None

COLS = [
    ("aceptacion_solicitante_at", sa.DateTime(timezone=True)),
    ("aceptacion_solicitante_ip", sa.String(64)),
    ("aceptacion_solicitante_texto", sa.Text()),
    ("aceptacion_jefe_at", sa.DateTime(timezone=True)),
    ("aceptacion_jefe_ip", sa.String(64)),
    ("aceptacion_rh_at", sa.DateTime(timezone=True)),
    ("aceptacion_rh_ip", sa.String(64)),
    ("rh_confirmador_id", sa.Integer()),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("solicitudes_vacaciones"):
        return
    existing = {c["name"] for c in inspector.get_columns("solicitudes_vacaciones")}
    for name, col_type in COLS:
        if name not in existing:
            op.add_column("solicitudes_vacaciones", sa.Column(name, col_type, nullable=True))
    existing = {c["name"] for c in inspector.get_columns("solicitudes_vacaciones")}
    fks = {fk.get("name") for fk in inspector.get_foreign_keys("solicitudes_vacaciones")}
    if "rh_confirmador_id" in existing and "fk_solicitudes_vacaciones_rh_confirmador_id" not in fks:
        try:
            op.create_foreign_key(
                "fk_solicitudes_vacaciones_rh_confirmador_id",
                "solicitudes_vacaciones",
                "empleados",
                ["rh_confirmador_id"],
                ["id"],
            )
        except Exception:
            pass


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("solicitudes_vacaciones"):
        return
    existing = {c["name"] for c in inspector.get_columns("solicitudes_vacaciones")}
    try:
        op.drop_constraint("fk_solicitudes_vacaciones_rh_confirmador_id", "solicitudes_vacaciones", type_="foreignkey")
    except Exception:
        pass
    for name, _ in reversed(COLS):
        if name in existing:
            op.drop_column("solicitudes_vacaciones", name)
