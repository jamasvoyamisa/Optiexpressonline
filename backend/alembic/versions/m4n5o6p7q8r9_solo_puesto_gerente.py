"""Eliminar solo puestos que referencian 'gerente' (Subgerente, etc.); dejar Gerente y el resto.
Si solo queda Gerente, restaurar puestos habituales (Operador, Vendedor, etc.).

Revision ID: m4n5o6p7q8r9
Revises: l3m4n5o6p7q8
Create Date: 2026-03-05

"""
from alembic import op
from sqlalchemy import text

revision = 'm4n5o6p7q8r9'
down_revision = 'l3m4n5o6p7q8'
branch_labels = None
depends_on = None

# Puestos que referencian "gerente" (eliminar estos, dejar solo "Gerente")
# Cualquier nombre que contenga 'gerente' pero no sea exactamente 'Gerente'
# Se hace por condición SQL: LOWER(nombre) LIKE '%gerente%' AND LOWER(TRIM(nombre)) != 'gerente'

# Puestos habituales a restaurar si la tabla quedó solo con Gerente (no referencian gerente)
PUESTOS_RESTAURAR = [
    ("Operador", 10),
    ("Vendedor", 20),
    ("Administrativo", 30),
    ("Contador", 40),
    ("Auxiliar", 50),
    ("Supervisor", 60),
    ("Coordinador", 70),
]


def upgrade():
    conn = op.get_bind()
    # Asegurar que existe el puesto "Gerente"
    r = conn.execute(text("SELECT id FROM puestos WHERE LOWER(TRIM(nombre)) = 'gerente' LIMIT 1")).fetchone()
    gerente_id = r[0] if r else None
    if not gerente_id:
        conn.execute(text("INSERT INTO puestos (nombre, orden, activo) VALUES ('Gerente', 0, 1)"))
        gerente_id = conn.execute(text("SELECT LAST_INSERT_ID()")).scalar()

    # IDs de puestos que referencian "gerente" pero no son "Gerente" (ej. Subgerente)
    ids_a_borrar = conn.execute(
        text("SELECT id FROM puestos WHERE LOWER(nombre) LIKE '%gerente%' AND LOWER(TRIM(nombre)) != 'gerente'")
    ).fetchall()
    id_list = [row[0] for row in ids_a_borrar]
    if id_list:
        # Reasignar empleados con esos puestos al puesto Gerente
        placeholders = ", ".join(str(i) for i in id_list)
        conn.execute(text(f"UPDATE empleados SET puesto_id = {gerente_id} WHERE puesto_id IN ({placeholders})"))
        for pid in id_list:
            conn.execute(text("DELETE FROM puestos WHERE id = :id"), {"id": pid})

    # Restaurar puestos habituales si solo queda Gerente (caso en que antes se borraron todos)
    count = conn.execute(text("SELECT COUNT(*) FROM puestos")).scalar()
    if count <= 1:
        for nombre, orden in PUESTOS_RESTAURAR:
            existing = conn.execute(text("SELECT id FROM puestos WHERE TRIM(nombre) = :n"), {"n": nombre}).fetchone()
            if not existing:
                conn.execute(
                    text("INSERT INTO puestos (nombre, orden, activo) VALUES (:nombre, :orden, 1)"),
                    {"nombre": nombre, "orden": orden},
                )


def downgrade():
    pass
