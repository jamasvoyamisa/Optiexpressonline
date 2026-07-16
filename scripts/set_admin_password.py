#!/usr/bin/env python3
"""
Establece la contraseña del usuario administrador de sistema (email admin@admin.com).

Uso (desde la raíz del repo):
  cd backend && ADMIN_PASSWORD='TuNuevaClave' ../scripts/set_admin_password.py
  cd backend && ../scripts/set_admin_password.py 'TuNuevaClave'

En el VPS (ajusta la ruta si hace falta):
  cd /opt/optiexpress/backend && ADMIN_PASSWORD='TuNuevaClave' ./venv/bin/python3 /opt/optiexpress/scripts/set_admin_password.py

Requiere backend/.env con DATABASE_URL válido.
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


def _password() -> str:
    if len(sys.argv) >= 2 and sys.argv[1].strip():
        return sys.argv[1].strip()
    p = os.environ.get("ADMIN_PASSWORD", "").strip()
    if p:
        return p
    print(
        "Indica la nueva contraseña:\n"
        "  ADMIN_PASSWORD='...' python3 scripts/set_admin_password.py\n"
        "  python3 scripts/set_admin_password.py '...'",
        file=sys.stderr,
    )
    sys.exit(1)


def main() -> None:
    from sqlalchemy import text

    from app.core.database import SessionLocal
    from app.core.security import get_password_hash

    pwd = _password()
    if len(pwd) < 6:
        print("La contraseña debe tener al menos 6 caracteres.", file=sys.stderr)
        sys.exit(1)

    admin_email = "admin@admin.com"
    ph = get_password_hash(pwd)

    db = SessionLocal()
    try:
        r = db.execute(
            text("UPDATE empleados SET password_hash = :ph WHERE email = :em"),
            {"ph": ph, "em": admin_email},
        )
        db.commit()
        if getattr(r, "rowcount", None) == 0:
            print(f"No se actualizó ningún registro (¿existe {admin_email}?).", file=sys.stderr)
            sys.exit(1)
        print(f"Contraseña actualizada para {admin_email} (usuario típico: admin).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
