"""Eliminar solo puestos que referencian 'gerente' (Subgerente, etc.); dejar Gerente y el resto.
Si solo queda Gerente, restaurar puestos habituales (Operador, Vendedor, etc.).

Revision ID: m4n5o6p7q8r9
Revises: l3m4n5o6p7q8
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = 'm4n5o6p7q8r9'
down_revision = 'l3m4n5o6p7q8'
branch_labels = None
depends_on = None

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

    # Crear tabla puestos si no existe
    r = conn.execute(text("SHOW TABLES LIKE 'puestos'")).fetchone()
    if not r:
        op.create_table(
            'puestos',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('nombre', sa.String(150), nullable=False),
            sa.Column('orden', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('activo', sa.Boolean(), server_default=sa.true(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_puestos_id'), 'puestos', ['id'], unique=False)

    # Agregar columna puesto_id a empleados si no existe
    cols = [row[0] for row in conn.execute(text("SHOW COLUMNS FROM empleados")).fetchall()]
    if 'puesto_id' not in cols:
        op.add_column('empleados', sa.Column('puesto_id', sa.Integer(), nullable=True))
        op.create_foreign_key(None, 'empleados', 'puestos', ['puesto_id'], ['id'])
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
