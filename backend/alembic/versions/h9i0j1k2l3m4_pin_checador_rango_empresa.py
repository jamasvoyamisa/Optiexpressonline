"""Add pin_checador to empleados, rango to empresas, composite unique on (empresa_id, numero_empleado)

Revision ID: h9i0j1k2l3m4
Revises: g8h9i0j1k2l3
Create Date: 2026-01-26

"""
from alembic import op
import sqlalchemy as sa


revision = 'h9i0j1k2l3m4'
down_revision = 'g8h9i0j1k2l3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rangos de empresa
    op.add_column('empresas', sa.Column('rango_inicio', sa.Integer(), nullable=True))
    op.add_column('empresas', sa.Column('rango_fin', sa.Integer(), nullable=True))

    # PIN checador en empleados
    op.add_column('empleados', sa.Column('pin_checador', sa.String(length=20), nullable=True))
    op.create_index(op.f('ix_empleados_pin_checador'), 'empleados', ['pin_checador'], unique=True)

    # PIN checador en cola de usuarios pendientes
    op.add_column('usuarios_pendientes_dispositivo', sa.Column('pin_checador', sa.String(length=20), nullable=True))

    # Quitar unique global de numero_empleado y crear unique compuesto (empresa_id, numero_empleado)
    op.drop_index('ix_empleados_numero_empleado', table_name='empleados')
    op.create_index('ix_empleados_numero_empleado', 'empleados', ['numero_empleado'], unique=False)
    op.create_unique_constraint('uq_empresa_numero_empleado', 'empleados', ['empresa_id', 'numero_empleado'])

    # Asignar rangos a empresas ya existentes (un bloque de 1000 por empresa)
    op.execute("SET @rango = 0")
    op.execute("""
        UPDATE empresas
        SET rango_inicio = (@rango := @rango + 1) * 1000 - 999,
            rango_fin    = (@rango) * 1000
        ORDER BY id
    """)

    # Asignar pin_checador a empleados ya existentes usando su id
    op.execute("UPDATE empleados SET pin_checador = CAST(id AS CHAR) WHERE pin_checador IS NULL")


def downgrade() -> None:
    op.drop_column('usuarios_pendientes_dispositivo', 'pin_checador')
    op.drop_index(op.f('ix_empleados_pin_checador'), table_name='empleados')
    op.drop_column('empleados', 'pin_checador')
    op.drop_constraint('uq_empresa_numero_empleado', 'empleados', type_='unique')
    op.drop_index('ix_empleados_numero_empleado', table_name='empleados')
    op.create_index('ix_empleados_numero_empleado', 'empleados', ['numero_empleado'], unique=True)
    op.drop_column('empresas', 'rango_fin')
    op.drop_column('empresas', 'rango_inicio')
