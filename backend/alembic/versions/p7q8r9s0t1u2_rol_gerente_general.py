"""Insertar rol Gerente General (aprueba vacaciones solo de gerentes y supervisores)

Revision ID: p7q8r9s0t1u2
Revises: o6p7q8r9s0t1
Create Date: 2026-03-07

"""
from alembic import op
from sqlalchemy import text

revision = 'p7q8r9s0t1u2'
down_revision = 'o6p7q8r9s0t1'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    r = conn.execute(text("SELECT id FROM roles WHERE nombre = 'Gerente General'")).fetchone()
    if not r:
        conn.execute(text(
            "INSERT INTO roles (nombre, descripcion, activo) VALUES "
            "('Gerente General', 'Puede aprobar vacaciones únicamente de gerentes y supervisores', 1)"
        ))


def downgrade():
    conn = op.get_bind()
    conn.execute(text("DELETE FROM roles WHERE nombre = 'Gerente General'"))
