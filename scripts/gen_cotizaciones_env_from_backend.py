#!/usr/bin/env python3
"""
Genera líneas para cotizaciones-web/.env a partir de backend/.env (DATABASE_URL).
Uso en el VPS:
  /opt/optiexpress/backend/venv/bin/python3 scripts/gen_cotizaciones_env_from_backend.py /opt/optiexpress/backend/.env
"""
from __future__ import annotations

import secrets
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) < 2:
        print("Uso: gen_cotizaciones_env_from_backend.py /ruta/backend/.env", file=sys.stderr)
        sys.exit(1)
    p = Path(sys.argv[1])
    if not p.is_file():
        print(f"No existe {p}", file=sys.stderr)
        sys.exit(1)
    try:
        from sqlalchemy.engine.url import make_url
    except ImportError:
        print("Instala SQLAlchemy o ejecuta con el venv del backend.", file=sys.stderr)
        sys.exit(1)

    raw = p.read_text(encoding="utf-8", errors="replace")
    database_url = None
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("DATABASE_URL="):
            database_url = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
    if not database_url:
        print("No se encontró DATABASE_URL", file=sys.stderr)
        sys.exit(1)

    u = make_url(database_url)
    session_secret = secrets.token_hex(32)
    port = u.port or 3306
    db = (u.database or "").replace("\\", "")
    user = (u.username or "").replace("\\", "")
    password = u.password or ""

    print(f"""# Generado desde {p} — revisar SESSION_SECRET si ya tenías uno fijo
MYSQL_HOST={u.host or "127.0.0.1"}
MYSQL_PORT={port}
MYSQL_USER={user}
MYSQL_PASSWORD={password}
MYSQL_DATABASE={db}
MYSQL_SSL=false

NODE_ENV=production
PORT=3080
HOST=127.0.0.1

SESSION_SECRET={session_secret}
SESSION_COOKIE_SECURE=true
""")


if __name__ == "__main__":
    main()
