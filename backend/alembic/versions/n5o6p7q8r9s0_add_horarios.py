"""Add horarios and empleado_horario tables

Revision ID: n5o6p7q8r9s0
Revises: m4n5o6p7q8r9
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = 'n5o6p7q8r9s0'
down_revision = 'm4n5o6p7q8r9'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # Crear tabla horarios si no existe
    r = conn.execute(text("SHOW TABLES LIKE 'horarios'")).fetchone()
    if not r:
        op.create_table(
            'horarios',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('nombre', sa.String(100), nullable=False),
            sa.Column('hora_entrada', sa.String(10), nullable=False),
            sa.Column('hora_salida', sa.String(10), nullable=False),
            sa.Column('dias_semana', sa.String(50), nullable=True),
            sa.Column('tolerancia_minutos', sa.Integer(), server_default='15', nullable=True),
            sa.Column('activo', sa.Boolean(), server_default=sa.true(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_horarios_id'), 'horarios', ['id'], unique=False)

    # Crear tabla empleado_horario si no existe
    r2 = conn.execute(text("SHOW TABLES LIKE 'empleado_horario'")).fetchone()
    if not r2:
        op.create_table(
            'empleado_horario',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('empleado_id', sa.Integer(), nullable=False),
            sa.Column('horario_id', sa.Integer(), nullable=False),
            sa.Column('fecha_inicio', sa.DateTime(timezone=True), nullable=True),
            sa.Column('fecha_fin', sa.DateTime(timezone=True), nullable=True),
            sa.Column('activo', sa.Boolean(), server_default=sa.true(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.ForeignKeyConstraint(['empleado_id'], ['empleados.id'], ),
            sa.ForeignKeyConstraint(['horario_id'], ['horarios.id'], ),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_empleado_horario_id'), 'empleado_horario', ['id'], unique=False)


def downgrade():
    conn = op.get_bind()
    r2 = conn.execute(text("SHOW TABLES LIKE 'empleado_horario'")).fetchone()
    if r2:
        op.drop_index(op.f('ix_empleado_horario_id'), table_name='empleado_horario')
        op.drop_table('empleado_horario')
    r = conn.execute(text("SHOW TABLES LIKE 'horarios'")).fetchone()
    if r:
        op.drop_index(op.f('ix_horarios_id'), table_name='horarios')
        op.drop_table('horarios')
