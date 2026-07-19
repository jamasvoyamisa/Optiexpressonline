"""empleados: asignar contraseña temporal a quienes tenían password_hash NULL

Antes de esta migración, un empleado sin password_hash podía entrar con su
numero_empleado o con la contraseña fija "admin123" (backdoor eliminado del
código en este mismo cambio). Esta migración cierra esa puerta de forma
segura: a cada empleado con password_hash NULL se le asigna una contraseña
temporal aleatoria (bcrypt) y must_change_password=True, para que puedan
seguir entrando (con la temporal, que RH debe comunicarles) y de inmediato
se les exija cambiarla.

Los números de empleado afectados y su contraseña temporal se imprimen en
la salida de `alembic upgrade head` para que puedan comunicarse a RH/TI.
No falla si no hay filas afectadas (caso esperado en instalaciones donde
todos los altas ya pasan por create_empleado, que siempre asigna hash).

Revision ID: c3d4e5f6a7b8
Revises: a8b9c0d1e2f3
Create Date: 2026-07-17
"""
import secrets

import bcrypt
import sqlalchemy as sa
from alembic import op

revision = "c3d4e5f6a7b8"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def upgrade() -> None:
    bind = op.get_bind()
    empleados_tbl = sa.table(
        "empleados",
        sa.column("id", sa.Integer),
        sa.column("numero_empleado", sa.String),
        sa.column("password_hash", sa.String),
        sa.column("must_change_password", sa.Boolean),
    )

    rows = bind.execute(
        sa.select(empleados_tbl.c.id, empleados_tbl.c.numero_empleado).where(
            empleados_tbl.c.password_hash.is_(None)
        )
    ).fetchall()

    if not rows:
        print("[c3d4e5f6a7b8] No hay empleados con password_hash NULL. Nada que migrar.")
        return

    print(f"[c3d4e5f6a7b8] Asignando contraseña temporal a {len(rows)} empleado(s) sin password_hash:")
    for row in rows:
        temporal = secrets.token_urlsafe(9)  # ~12 chars legibles
        hashed = _hash_password(temporal)
        bind.execute(
            empleados_tbl.update()
            .where(empleados_tbl.c.id == row.id)
            .values(password_hash=hashed, must_change_password=True)
        )
        print(f"  - numero_empleado={row.numero_empleado!r} (id={row.id}) -> temporal: {temporal}")

    print(
        "[c3d4e5f6a7b8] IMPORTANTE: comunica estas contraseñas temporales a RH/TI "
        "de forma segura (no quedan en ningún otro log). Cada usuario deberá "
        "cambiarla en su primer login."
    )


def downgrade() -> None:
    # No reversible de forma segura (no se puede recuperar "NULL" sin perder el acceso
    # ya migrado). Downgrade intencionalmente no-op.
    pass
