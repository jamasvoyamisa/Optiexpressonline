#!/usr/bin/env python3
"""
Vacía todas las tablas de la base de datos de la aplicación, excepto alembic_version
(mantiene el historial de migraciones).

Peligro: borra TODO el contenido operativo. Hacer respaldo antes.

Uso (desde la raíz del repo, con backend/.env):
  cd backend && CONFIRM_WIPE=1 ../scripts/wipe_app_database.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")


def main() -> None:
    if os.environ.get("CONFIRM_WIPE", "").strip() != "1":
        print(
            "Operación destructiva. Ejecuta con:\n"
            "  CONFIRM_WIPE=1 python3 ../scripts/wipe_app_database.py",
            file=sys.stderr,
        )
        sys.exit(1)

    from sqlalchemy import create_engine, text

    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL no definido en backend/.env", file=sys.stderr)
        sys.exit(1)

    engine = create_engine(url)
    skip = {"alembic_version"}

    with engine.begin() as conn:
        rows = conn.execute(text("SHOW TABLES")).fetchall()
        tables = [r[0] for r in rows if r[0] not in skip]
        if not tables:
            print("No hay tablas que vaciar.")
            return
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        for t in tables:
            conn.execute(text(f"TRUNCATE TABLE `{t}`"))
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        print(f"Tablas vaciadas ({len(tables)}): {', '.join(sorted(tables))}")


if __name__ == "__main__":
    main()
