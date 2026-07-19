#!/usr/bin/env python3
"""
Pre-chequeo de solo lectura antes de desplegar los fixes de seguridad al VPS.

No modifica ningún dato. Solo hace SELECTs para medir el impacto real de:
- Lote 1: empleados con password_hash NULL o aún en SHA-256 legacy (64 hex).
- Lote 2/3: cuántos empleados quedarían fuera de los endpoints que ahora
  exigen Administrador/Superuser o RH (require_superuser / require_superuser_or_rh).
- Estado de migraciones Alembic (¿está la BD al día con la última revisión local?).
- Línea base de errores 401/403 recientes en actividad_log, para comparar
  antes/después de cada lote (ver paso 6 del plan de despliegue).

Uso (desde la raíz del repo):
  cd backend && ../scripts/precheck_seguridad_deploy.py

En el VPS (antes de desplegar, con el .env de producción):
  cd /opt/optiexpress/backend && ./venv/bin/python3 /opt/optiexpress/scripts/precheck_seguridad_deploy.py

Requiere backend/.env con DATABASE_URL válido. Solo lee; es seguro ejecutarlo
en producción cuantas veces se quiera.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Windows (cp1252) no puede imprimir ✅/⚠️ directamente; en Linux (VPS) esto es un no-op.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
import os

os.chdir(BACKEND)

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")


def _line(titulo: str) -> None:
    print(f"\n=== {titulo} ===")


def main() -> None:
    import logging

    from sqlalchemy import text

    # Importar app.main primero para que todos los modelos queden registrados
    # (evita InvalidRequestError por mappers incompletos al usar SessionLocal solo).
    import app.main  # noqa: F401
    from app.core.database import SessionLocal, engine
    from app.core.deps import RH_ROL_NAMES, SUPERUSER_ROL_NAMES

    # Reporte de solo lectura: silenciar el eco de SQL (settings.DEBUG=true lo activa
    # con create_engine(echo=True), que fija el logger en INFO al importar app.main
    # arriba) para que la salida sea legible independientemente del .env usado.
    engine.echo = False
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine.Engine").setLevel(logging.WARNING)

    db = SessionLocal()
    hallazgos: list[str] = []
    try:
        _line("Lote 1 — Contraseñas")
        sin_hash = db.execute(
            text("SELECT COUNT(*) FROM empleados WHERE password_hash IS NULL")
        ).scalar()
        print(f"Empleados con password_hash NULL: {sin_hash}")
        if sin_hash:
            hallazgos.append(
                f"{sin_hash} empleado(s) sin password_hash: correr la migración "
                "c3d4e5f6a7b8 (alembic upgrade head) ANTES de desplegar el resto de Lote 1, "
                "y avisarles su contraseña temporal (must_change_password quedará en 1)."
            )

        sha256_legacy = db.execute(
            text("SELECT COUNT(*) FROM empleados WHERE LENGTH(password_hash) = 64")
        ).scalar()
        print(f"Empleados aún en hash SHA-256 legado (64 chars, se migran a bcrypt al loguear): {sha256_legacy}")

        total_empleados = db.execute(text("SELECT COUNT(*) FROM empleados")).scalar()
        print(f"Total de empleados: {total_empleados}")

        _line("Lote 2/3 — Impacto de exigir Administrador/Superuser o RH")
        roles_superuser = ", ".join(f"'{r}'" for r in SUPERUSER_ROL_NAMES)
        roles_rh = ", ".join(f"'{r}'" for r in RH_ROL_NAMES)

        con_rol_superuser = db.execute(
            text(
                f"SELECT COUNT(DISTINCT e.id) FROM empleados e "
                f"JOIN roles r ON r.id = e.rol_id WHERE r.nombre IN ({roles_superuser})"
            )
        ).scalar()
        con_rol_rh = db.execute(
            text(
                f"SELECT COUNT(DISTINCT e.id) FROM empleados e "
                f"JOIN roles r ON r.id = e.rol_id WHERE r.nombre IN ({roles_rh})"
            )
        ).scalar()
        print(f"Empleados con rol Administrador/Superuser: {con_rol_superuser}")
        print(f"Empleados con rol RH: {con_rol_rh}")
        print(
            "(Estos son quienes seguirán pudiendo usar RH completo, dispositivos biométricos, "
            "roles/empresas y reportes de asistencia tras el despliegue. Cualquier otro empleado "
            "que hoy use esas pantallas sin ese rol se quedará sin acceso: confirmar con TI/RH "
            "antes de desplegar Lote 2.)"
        )
        if not con_rol_superuser:
            hallazgos.append(
                "No hay ningún empleado con rol Administrador/Superuser: revisar antes de "
                "desplegar, o nadie podrá usar los endpoints protegidos con require_superuser."
            )

        _line("Estado de Alembic")
        try:
            alembic_actual = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
            print(f"Revisión actual en BD: {alembic_actual}")
        except Exception as e:  # noqa: BLE001
            print(f"No se pudo leer alembic_version: {e}")
            hallazgos.append("No se pudo leer la tabla alembic_version; revisar manualmente antes del deploy.")

        _line("Línea base de errores recientes (actividad_log, últimas 24h)")
        try:
            base_401_403 = db.execute(
                text(
                    "SELECT codigo_http, COUNT(*) FROM actividad_log "
                    "WHERE created_at >= NOW() - INTERVAL 1 DAY AND codigo_http IN (401, 403) "
                    "GROUP BY codigo_http"
                )
            ).all()
            if base_401_403:
                for codigo, cuenta in base_401_403:
                    print(f"  HTTP {codigo}: {cuenta} en las últimas 24h (antes del deploy)")
            else:
                print("  Sin 401/403 registrados en las últimas 24h (línea base limpia).")
            print(
                "  Guarda este número: después de cada lote, vuelve a correr este script y "
                "compara. Un salto grande de 401/403 = algo se rompió (ver paso 6 del plan)."
            )
        except Exception as e:  # noqa: BLE001
            print(f"No se pudo leer actividad_log: {e}")

        _line("Resumen")
        if hallazgos:
            print("⚠️  Puntos a resolver antes de desplegar:")
            for h in hallazgos:
                print(f"  - {h}")
            sys.exit(1)
        print("✅ Sin bloqueantes detectados. Puedes continuar con el backup y el despliegue por lotes.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
