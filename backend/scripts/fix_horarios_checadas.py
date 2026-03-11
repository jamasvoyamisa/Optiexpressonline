#!/usr/bin/env python3
"""
Script para corregir timestamps de checadas almacenados con zona horaria incorrecta.

Problema: Antes del fix de timezone, el dispositivo enviaba hora local (México)
y se guardaba como naive. PostgreSQL/MySQL lo interpretaba como UTC, por lo que
las horas se muestran 6 horas antes (ej: 9:15 guardado como 9:15 UTC → se ve 3:15 México).

Solución: Sumar 6 horas a cada timestamp para convertirlo al UTC correcto
(9:15 México = 15:15 UTC).

Uso (desde la carpeta backend, con el mismo entorno donde corre uvicorn):
  python -m scripts.fix_horarios_checadas --dry-run           # Solo mostrar qué se cambiaría
  python -m scripts.fix_horarios_checadas                     # Aplicar correcciones
  python -m scripts.fix_horarios_checadas --fecha-antes 2025-03-10  # Solo registros antes de esa fecha
  python -m scripts.fix_horarios_checadas --offset -6          # Usar otro offset (por defecto +6)
"""
import argparse
import sys
from datetime import timedelta, timezone
from pathlib import Path
from typing import Optional

# Agregar el directorio backend al path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.modules.asistencia import models as asistencia_models


# Offset en horas: sumar 6 convierte "Mexico local interpretado como UTC" a UTC real
OFFSET_HORAS_DEFAULT = 6


def fix_horarios(
    db: Session,
    dry_run: bool = True,
    fecha_antes: Optional[str] = None,
    offset_horas: int = OFFSET_HORAS_DEFAULT,
) -> int:
    """
    Corrige registros de asistencias.
    Retorna el número de registros modificados.
    """
    query = db.query(asistencia_models.Asistencia).order_by(
        asistencia_models.Asistencia.timestamp
    )

    if fecha_antes:
        try:
            from datetime import datetime
            fecha_limite = datetime.strptime(fecha_antes, "%Y-%m-%d").date()
            # Filtrar registros con timestamp antes de esa fecha (medianoche UTC)
            from datetime import datetime as dt
            dt_limite = dt.combine(fecha_limite, dt.min.time())
            if hasattr(dt_limite, 'replace'):
                dt_limite = dt_limite.replace(tzinfo=timezone.utc)
            query = query.filter(asistencia_models.Asistencia.timestamp < dt_limite)
        except ValueError:
            print(f"Error: fecha_antes debe ser YYYY-MM-DD.")
            return 0

    registros = query.all()
    offset = timedelta(hours=offset_horas)
    modificados = 0

    for a in registros:
        ts_old = a.timestamp
        ts_new = ts_old + offset

        # Asegurar que el resultado sea timezone-aware para UTC
        if ts_new.tzinfo is None:
            ts_new = ts_new.replace(tzinfo=timezone.utc)

        if dry_run:
            print(
                f"  [DRY-RUN] id={a.id} empleado={a.empleado_id} "
                f"{ts_old} → {ts_new}"
            )
        else:
            a.timestamp = ts_new

        modificados += 1

    if not dry_run and modificados > 0:
        db.commit()
        print(f"  Commit: {modificados} registros actualizados.")

    return modificados


def main():
    parser = argparse.ArgumentParser(
        description="Corregir timestamps de checadas con zona horaria incorrecta."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Solo mostrar qué se cambiaría, sin modificar la BD.",
    )
    parser.add_argument(
        "--fecha-antes",
        type=str,
        metavar="YYYY-MM-DD",
        help="Solo corregir registros con timestamp antes de esta fecha.",
    )
    parser.add_argument(
        "--offset",
        type=int,
        default=OFFSET_HORAS_DEFAULT,
        help=f"Horas a sumar al timestamp (default: {OFFSET_HORAS_DEFAULT}, México = +6).",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        total = db.query(asistencia_models.Asistencia).count()
        if args.fecha_antes:
            from datetime import datetime
            try:
                fl = datetime.strptime(args.fecha_antes, "%Y-%m-%d").date()
                from datetime import datetime as dt
                dt_lim = dt.combine(fl, dt.min.time()).replace(tzinfo=timezone.utc)
                cnt = db.query(asistencia_models.Asistencia).filter(
                    asistencia_models.Asistencia.timestamp < dt_lim
                ).count()
            except ValueError:
                cnt = 0
        else:
            cnt = total

        print(f"Registros en asistencias: {total}")
        if args.fecha_antes:
            print(f"Registros a procesar (antes de {args.fecha_antes}): {cnt}")
        else:
            print(f"Registros a procesar: {cnt}")

        if cnt == 0:
            print("No hay registros para corregir.")
            return 0

        modo = "DRY-RUN (sin cambios)" if args.dry_run else "APLICAR"
        print(f"\nModo: {modo} | Offset: +{args.offset} horas\n")

        n = fix_horarios(
            db,
            dry_run=args.dry_run,
            fecha_antes=args.fecha_antes,
            offset_horas=args.offset,
        )

        print(f"\nTotal procesados: {n}")
        if args.dry_run and n > 0:
            print("Ejecuta sin --dry-run para aplicar los cambios.")

        return 0
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
