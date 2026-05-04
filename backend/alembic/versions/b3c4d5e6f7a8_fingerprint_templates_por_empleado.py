"""fingerprint_templates: identificar por empleado_id para evitar colisiones entre empresas

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-04-29
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = "b3c4d5e6f7a8"
down_revision = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1) Nueva columna empleado_id (nullable para backfill progresivo)
    op.add_column("fingerprint_templates", sa.Column("empleado_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_fingerprint_templates_empleado_id"), "fingerprint_templates", ["empleado_id"], unique=False)
    op.create_foreign_key(
        "fk_fingerprint_templates_empleado_id_empleados",
        "fingerprint_templates",
        "empleados",
        ["empleado_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # 2) Backfill seguro:
    #    - Si numero_empleado existe una sola vez en empleados -> asignar empleado_id
    #    - Si está duplicado entre empresas, se deja NULL para resolverlo por flujo nuevo.
    conn.execute(text("""
        UPDATE fingerprint_templates ft
        JOIN (
            SELECT numero_empleado, MIN(id) AS empleado_id
            FROM empleados
            GROUP BY numero_empleado
            HAVING COUNT(*) = 1
        ) u ON u.numero_empleado = ft.numero_empleado
        SET ft.empleado_id = u.empleado_id
        WHERE ft.empleado_id IS NULL
    """))

    # 3) Reemplazar unique viejo por unique nuevo
    conn.execute(text("""
        SET @has_old_uq := (
          SELECT COUNT(*)
          FROM information_schema.table_constraints
          WHERE table_schema = DATABASE()
            AND table_name = 'fingerprint_templates'
            AND constraint_type = 'UNIQUE'
            AND constraint_name = 'uq_emp_finger'
        )
    """))
    conn.execute(text("""
        SET @sql_drop_old_uq := IF(@has_old_uq > 0,
          'ALTER TABLE fingerprint_templates DROP INDEX uq_emp_finger',
          'SELECT 1'
        )
    """))
    conn.execute(text("PREPARE stmt_drop_old_uq FROM @sql_drop_old_uq"))
    conn.execute(text("EXECUTE stmt_drop_old_uq"))
    conn.execute(text("DEALLOCATE PREPARE stmt_drop_old_uq"))

    conn.execute(text("""
        SET @has_new_uq := (
          SELECT COUNT(*)
          FROM information_schema.statistics
          WHERE table_schema = DATABASE()
            AND table_name = 'fingerprint_templates'
            AND index_name = 'uq_empid_finger'
        )
    """))
    conn.execute(text("""
        SET @sql_add_new_uq := IF(@has_new_uq = 0,
          'ALTER TABLE fingerprint_templates ADD CONSTRAINT uq_empid_finger UNIQUE (empleado_id, finger_index)',
          'SELECT 1'
        )
    """))
    conn.execute(text("PREPARE stmt_add_new_uq FROM @sql_add_new_uq"))
    conn.execute(text("EXECUTE stmt_add_new_uq"))
    conn.execute(text("DEALLOCATE PREPARE stmt_add_new_uq"))


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(text("""
        SET @has_new_uq := (
          SELECT COUNT(*)
          FROM information_schema.statistics
          WHERE table_schema = DATABASE()
            AND table_name = 'fingerprint_templates'
            AND index_name = 'uq_empid_finger'
        )
    """))
    conn.execute(text("""
        SET @sql_drop_new_uq := IF(@has_new_uq > 0,
          'ALTER TABLE fingerprint_templates DROP INDEX uq_empid_finger',
          'SELECT 1'
        )
    """))
    conn.execute(text("PREPARE stmt_drop_new_uq FROM @sql_drop_new_uq"))
    conn.execute(text("EXECUTE stmt_drop_new_uq"))
    conn.execute(text("DEALLOCATE PREPARE stmt_drop_new_uq"))

    conn.execute(text("""
        SET @has_old_uq := (
          SELECT COUNT(*)
          FROM information_schema.statistics
          WHERE table_schema = DATABASE()
            AND table_name = 'fingerprint_templates'
            AND index_name = 'uq_emp_finger'
        )
    """))
    conn.execute(text("""
        SET @sql_add_old_uq := IF(@has_old_uq = 0,
          'ALTER TABLE fingerprint_templates ADD CONSTRAINT uq_emp_finger UNIQUE (numero_empleado, finger_index)',
          'SELECT 1'
        )
    """))
    conn.execute(text("PREPARE stmt_add_old_uq FROM @sql_add_old_uq"))
    conn.execute(text("EXECUTE stmt_add_old_uq"))
    conn.execute(text("DEALLOCATE PREPARE stmt_add_old_uq"))

    op.drop_constraint("fk_fingerprint_templates_empleado_id_empleados", "fingerprint_templates", type_="foreignkey")
    op.drop_index(op.f("ix_fingerprint_templates_empleado_id"), table_name="fingerprint_templates")
    op.drop_column("fingerprint_templates", "empleado_id")
