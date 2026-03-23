"""vacaciones generales y aplicaciones por empresa/departamento/global

Revision ID: g7h8i9j0k1l2
Revises: e5f6g7h8i9j0
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa


revision = 'g7h8i9j0k1l2'
down_revision = 'e5f6g7h8i9j0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'vacaciones_generales',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(200), nullable=False),
        sa.Column('fecha_inicio', sa.Date(), nullable=False),
        sa.Column('fecha_fin', sa.Date(), nullable=False),
        sa.Column('alcance', sa.String(20), nullable=False),
        sa.Column('empresa_id', sa.Integer(), sa.ForeignKey('empresas.id'), nullable=True),
        sa.Column('departamento_id', sa.Integer(), sa.ForeignKey('departamentos.id'), nullable=True),
        sa.Column('dias_cuenta_ley', sa.Numeric(5, 2), nullable=False),
        sa.Column('dias_regalo_empresa', sa.Numeric(5, 2), nullable=False, server_default='0'),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('notas', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_vacaciones_generales_fechas', 'vacaciones_generales', ['fecha_inicio', 'fecha_fin'])
    op.create_index('ix_vacaciones_generales_alcance', 'vacaciones_generales', ['alcance'])

    op.create_table(
        'vacacion_general_aplicaciones',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vacacion_general_id', sa.Integer(), sa.ForeignKey('vacaciones_generales.id', ondelete='CASCADE'), nullable=False),
        sa.Column('empleado_id', sa.Integer(), sa.ForeignKey('empleados.id', ondelete='CASCADE'), nullable=False),
        sa.Column('dias_ley_descontados', sa.Numeric(5, 2), nullable=False),
        sa.Column('dias_regalo', sa.Numeric(5, 2), nullable=False, server_default='0'),
        sa.Column('aplicado_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('vacacion_general_id', 'empleado_id', name='uq_vac_gen_empleado'),
    )
    op.create_index('ix_vac_gen_aplic_empleado', 'vacacion_general_aplicaciones', ['empleado_id'])


def downgrade():
    op.drop_table('vacacion_general_aplicaciones')
    op.drop_table('vacaciones_generales')
