"""checadas_especiales: horarios y tolerancias por rango de fechas / alcance

Revision ID: n7o8p9q0r1s2
Revises: m5n6o7p8q9r0
Create Date: 2026-03-24

"""
from alembic import op
import sqlalchemy as sa


revision = "n7o8p9q0r1s2"
down_revision = "m5n6o7p8q9r0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "checadas_especiales",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=200), nullable=False),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("fecha_inicio", sa.Date(), nullable=False),
        sa.Column("fecha_fin", sa.Date(), nullable=False),
        sa.Column("alcance", sa.String(length=20), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=True),
        sa.Column("departamento_id", sa.Integer(), nullable=True),
        sa.Column("hora_entrada", sa.String(length=10), nullable=True),
        sa.Column("hora_salida", sa.String(length=10), nullable=True),
        sa.Column("hora_entrada_sabado", sa.String(length=10), nullable=True),
        sa.Column("hora_salida_sabado", sa.String(length=10), nullable=True),
        sa.Column("tolerancia_minutos", sa.Integer(), nullable=True),
        sa.Column(
            "jornada_reducida_lv",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], name="fk_checada_esp_empresa"),
        sa.ForeignKeyConstraint(["departamento_id"], ["departamentos.id"], name="fk_checada_esp_depto"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_checadas_esp_fechas", "checadas_especiales", ["fecha_inicio", "fecha_fin"])
    op.create_index("ix_checadas_esp_activo", "checadas_especiales", ["activo"])


def downgrade():
    op.drop_index("ix_checadas_esp_activo", table_name="checadas_especiales")
    op.drop_index("ix_checadas_esp_fechas", table_name="checadas_especiales")
    op.drop_table("checadas_especiales")
