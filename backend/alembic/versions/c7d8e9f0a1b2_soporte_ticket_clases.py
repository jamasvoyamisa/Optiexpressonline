"""soporte_ticket_clases: nueva tabla y FK en tipos

Revision ID: c7d8e9f0a1b2
Revises: z6a7b8c9d0e1
Create Date: 2026-04-11
"""
from alembic import op
import sqlalchemy as sa

revision = 'c7d8e9f0a1b2'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'soporte_ticket_clases',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('nombre', sa.String(120), nullable=False, unique=True),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now(), nullable=True),
    )
    op.create_index('ix_soporte_ticket_clases_nombre', 'soporte_ticket_clases', ['nombre'])

    op.add_column(
        'soporte_ticket_tipos',
        sa.Column('clase_id', sa.Integer(), sa.ForeignKey('soporte_ticket_clases.id'), nullable=True),
    )


def downgrade():
    op.drop_column('soporte_ticket_tipos', 'clase_id')
    op.drop_index('ix_soporte_ticket_clases_nombre', table_name='soporte_ticket_clases')
    op.drop_table('soporte_ticket_clases')
