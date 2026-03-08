"""add_dias_festivos

Revision ID: q8r9s0t1u2v3
Revises: p7q8r9s0t1u2
Create Date: 2026-03-07

"""
from alembic import op
import sqlalchemy as sa
from datetime import date, timedelta


revision = 'q8r9s0t1u2v3'
down_revision = 'p7q8r9s0t1u2'
branch_labels = None
depends_on = None


def _primer_lunes(year, month):
    d = date(year, month, 1)
    offset = (7 - d.weekday()) % 7
    return d + timedelta(days=offset)


def _tercer_lunes(year, month):
    return _primer_lunes(year, month) + timedelta(weeks=2)


def _semana_santa(year):
    a = year % 19
    b = year // 100; c = year % 100
    d = b // 4; e = b % 4
    f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4; k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month_ = (h + l - 7 * m + 114) // 31
    day_ = ((h + l - 7 * m + 114) % 31) + 1
    pascua = date(year, month_, day_)
    return pascua - timedelta(days=3), pascua - timedelta(days=2)


def festivos_lft(year):
    rows = [
        (date(year, 1, 1),  "Año Nuevo",                        "LFT"),
        (date(year, 5, 1),  "Día del Trabajo",                  "LFT"),
        (date(year, 9, 16), "Independencia de México",           "LFT"),
        (date(year, 12, 25),"Navidad",                           "LFT"),
        (_primer_lunes(year, 2),  "Aniversario de la Constitución", "LFT"),
        (_tercer_lunes(year, 3),  "Natalicio de Benito Juárez",     "LFT"),
        (_tercer_lunes(year, 11), "Revolución Mexicana",            "LFT"),
    ]
    j, v = _semana_santa(year)
    rows.append((j, "Jueves Santo",  "adicional"))
    rows.append((v, "Viernes Santo", "adicional"))
    return rows


def upgrade():
    conn = op.get_bind()
    if not conn.execute(sa.text("SHOW TABLES LIKE 'dias_festivos'")).fetchone():
        op.create_table(
            'dias_festivos',
            sa.Column('id',         sa.Integer(), nullable=False),
            sa.Column('fecha',      sa.Date(),    nullable=False),
            sa.Column('nombre',     sa.String(150), nullable=False),
            sa.Column('tipo',       sa.String(20),  nullable=False, server_default='LFT'),
            sa.Column('activo',     sa.Boolean(),   nullable=False, server_default=sa.true()),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('fecha', name='uq_dias_festivos_fecha'),
        )
        op.create_index('ix_dias_festivos_fecha', 'dias_festivos', ['fecha'])
        op.create_index('ix_dias_festivos_id',    'dias_festivos', ['id'])

    # Insertar festivos para 2025 y 2026
    seen = set()
    for year in (2025, 2026):
        for fecha, nombre, tipo in festivos_lft(year):
            if fecha in seen:
                continue
            seen.add(fecha)
            conn.execute(
                sa.text(
                    "INSERT IGNORE INTO dias_festivos (fecha, nombre, tipo, activo) "
                    "VALUES (:fecha, :nombre, :tipo, 1)"
                ),
                {"fecha": fecha.isoformat(), "nombre": nombre, "tipo": tipo},
            )


def downgrade():
    op.drop_index('ix_dias_festivos_fecha', table_name='dias_festivos')
    op.drop_index('ix_dias_festivos_id',    table_name='dias_festivos')
    op.drop_table('dias_festivos')
