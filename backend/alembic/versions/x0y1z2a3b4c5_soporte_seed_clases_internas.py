"""Seed categorías internas Mantenimiento y Ventanas (solo TI)

Revision ID: x0y1z2a3b4c5
Revises: v8w9x0y1z2a3
Create Date: 2026-05-19
"""
from alembic import op
from sqlalchemy import text

revision = "x0y1z2a3b4c5"
down_revision = "v8w9x0y1z2a3"
branch_labels = None
depends_on = None

# Nombres deben incluir «mantenimiento» o «ventana(s)» para el filtro portal/interno.
CLASES_INTERNAS = {
    "Mantenimiento": [
        "Equipo de cómputo",
        "Red y conectividad",
        "Impresora / periféricos",
        "Otro (mantenimiento)",
    ],
    "Ventanas": [
        "Instalación de Windows",
        "Actualización y parches",
        "Activación / licencia",
        "Falla del sistema",
        "Otro (Windows)",
    ],
}


def _clase_id(conn, nombre: str) -> int:
    row = conn.execute(
        text(
            "SELECT id FROM soporte_ticket_clases "
            "WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(:n)) LIMIT 1"
        ),
        {"n": nombre},
    ).fetchone()
    if row:
        conn.execute(
            text("UPDATE soporte_ticket_clases SET activo = 1 WHERE id = :id"),
            {"id": int(row[0])},
        )
        return int(row[0])
    conn.execute(
        text("INSERT INTO soporte_ticket_clases (nombre, activo) VALUES (:n, 1)"),
        {"n": nombre},
    )
    row = conn.execute(
        text("SELECT id FROM soporte_ticket_clases WHERE nombre = :n LIMIT 1"),
        {"n": nombre},
    ).fetchone()
    return int(row[0])


def _ensure_tipo(conn, nombre: str, clase_id: int) -> None:
    row = conn.execute(
        text(
            "SELECT id FROM soporte_ticket_tipos "
            "WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(:n)) LIMIT 1"
        ),
        {"n": nombre},
    ).fetchone()
    if row:
        conn.execute(
            text(
                "UPDATE soporte_ticket_tipos "
                "SET clase_id = :cid, activo = 1 WHERE id = :id"
            ),
            {"cid": clase_id, "id": int(row[0])},
        )
        return
    conn.execute(
        text(
            "INSERT INTO soporte_ticket_tipos (nombre, clase_id, activo) "
            "VALUES (:n, :cid, 1)"
        ),
        {"n": nombre, "cid": clase_id},
    )


def upgrade() -> None:
    conn = op.get_bind()
    for clase_nombre, tipos in CLASES_INTERNAS.items():
        clase_id = _clase_id(conn, clase_nombre)
        for tipo_nombre in tipos:
            _ensure_tipo(conn, tipo_nombre, clase_id)


def downgrade() -> None:
    conn = op.get_bind()
    for clase_nombre, tipos in CLASES_INTERNAS.items():
        for tipo_nombre in tipos:
            conn.execute(
                text(
                    "DELETE FROM soporte_ticket_tipos "
                    "WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(:n))"
                ),
                {"n": tipo_nombre},
            )
        conn.execute(
            text(
                "DELETE FROM soporte_ticket_clases "
                "WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(:n))"
            ),
            {"n": clase_nombre},
        )
