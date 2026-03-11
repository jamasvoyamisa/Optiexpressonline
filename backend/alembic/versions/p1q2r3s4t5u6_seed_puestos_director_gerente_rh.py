"""Crear puestos Director, Gerente General y RH (solo Administrador los asigna y edita)

Revision ID: p1q2r3s4t5u6
Revises: z6a7b8c9d0e1
Create Date: 2026-03-07

"""
from alembic import op
from sqlalchemy import text

revision = 'p1q2r3s4t5u6'
down_revision = 'z6a7b8c9d0e1'
branch_labels = None
depends_on = None

PUESTOS_SISTEMA = [
    ("Director", 1),
    ("Gerente General", 2),
    ("RH", 3),
]


def upgrade():
    conn = op.get_bind()
    for nombre, orden in PUESTOS_SISTEMA:
        r = conn.execute(
            text("SELECT id FROM puestos WHERE LOWER(TRIM(nombre)) = :n"),
            {"n": nombre.lower()}
        ).fetchone()
        if not r:
            conn.execute(
                text("INSERT INTO puestos (nombre, orden, activo) VALUES (:nombre, :orden, 1)"),
                {"nombre": nombre, "orden": orden},
            )


def downgrade():
    conn = op.get_bind()
    for nombre, _ in PUESTOS_SISTEMA:
        conn.execute(
            text("DELETE FROM puestos WHERE LOWER(TRIM(nombre)) = :n"),
            {"n": nombre.lower()},
        )
