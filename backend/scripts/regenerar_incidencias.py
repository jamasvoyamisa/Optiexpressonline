#!/usr/bin/env python3
"""
Regenera incidencias automáticas (faltas, retardos, salida anticipada) para fechas
donde las checadas ya fueron corregidas de zona horaria.

Elimina incidencias con origen="automatico" en el rango de fechas y vuelve a
ejecutar procesar_dia + detección de retardos por cada checada ENTRADA.

Uso (desde backend, con venv activado):
  python -m scripts.regenerar_incidencias --dry-run                    # Vista previa
  python -m scripts.regenerar_incidencias                              # Aplicar
  python -m scripts.regenerar_incidencias --fecha-inicio 2026-03-05 --fecha-fin 2026-03-09
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.timezone_utils import mexico_date_to_utc_range
from app.modules.asistencia import models as asistencia_models
from app.modules.asistencia.service import AsistenciaService
from app.modules.asistencia.biometric.sync_service import SyncService
from datetime import date, timedelta


def get_fechas_con_checadas(db: Session):
    """Obtiene las fechas únicas que tienen checadas (en hora México)."""
    from sqlalchemy import func
    from app.core.timezone_utils import to_mexico

    rows = (
        db.query(asistencia_models.Asistencia.timestamp)
        .distinct()
        .all()
    )
    fechas = set()
    for (ts,) in rows:
        if ts:
            ts_mex = to_mexico(ts) or ts
            fechas.add(ts_mex.date() if hasattr(ts_mex, "date") else ts.date())
    return sorted(fechas)


def regenerar(
    db: Session,
    fecha_inicio: date,
    fecha_fin: date,
    dry_run: bool = True,
) -> dict:
    """Elimina incidencias automáticas y las regenera para el rango de fechas."""
    creadas_total = 0
    eliminadas_total = 0

    fecha = fecha_inicio
    while fecha <= fecha_fin:
        dia_inicio_utc, dia_fin_utc = mexico_date_to_utc_range(fecha)

        # 1. Eliminar incidencias automáticas de ese día
        to_delete = db.query(asistencia_models.Incidencia).filter(
            asistencia_models.Incidencia.fecha >= dia_inicio_utc,
            asistencia_models.Incidencia.fecha < dia_fin_utc,
            asistencia_models.Incidencia.origen == "automatico",
        ).all()

        if to_delete:
            if dry_run:
                print(f"  [DRY-RUN] {fecha}: eliminaría {len(to_delete)} incidencias")
            else:
                for inc in to_delete:
                    db.delete(inc)
                eliminadas_total += len(to_delete)

        fecha += timedelta(days=1)

    if not dry_run and eliminadas_total > 0:
        db.commit()

    # 2. Regenerar: procesar_dia para cada fecha
    fecha = fecha_inicio
    while fecha <= fecha_fin:
        fecha_str = fecha.isoformat()
        if dry_run:
            print(f"  [DRY-RUN] procesar_dia({fecha_str})")
        else:
            try:
                res = AsistenciaService.procesar_dia(db, fecha_str)
                creadas_total += res.get("incidencias_creadas", 0)
                if res.get("incidencias_creadas", 0) > 0:
                    print(f"  {fecha_str}: {res}")
            except Exception as e:
                print(f"  Error procesar_dia {fecha_str}: {e}")
        fecha += timedelta(days=1)

    # 3. Regenerar retardos: _detectar_incidencia para cada ENTRADA en el rango
    dia_inicio_utc, _ = mexico_date_to_utc_range(fecha_inicio)
    _, ff_utc = mexico_date_to_utc_range(fecha_fin + timedelta(days=1))

    entradas = (
        db.query(asistencia_models.Asistencia)
        .filter(
            asistencia_models.Asistencia.tipo == asistencia_models.TipoChecada.ENTRADA,
            asistencia_models.Asistencia.timestamp >= dia_inicio_utc,
            asistencia_models.Asistencia.timestamp < ff_utc,
        )
        .all()
    )

    for a in entradas:
        if dry_run:
            print(f"  [DRY-RUN] evaluar retardo: asistencia id={a.id} empleado={a.empleado_id}")
        else:
            try:
                SyncService._detectar_incidencia(db, a, a.empleado_id)
            except Exception as e:
                print(f"  Error _detectar_incidencia asistencia {a.id}: {e}")

    return {"eliminadas": eliminadas_total, "creadas": creadas_total}


def main():
    parser = argparse.ArgumentParser(
        description="Regenerar incidencias automáticas tras corrección de checadas."
    )
    parser.add_argument("--dry-run", action="store_true", help="Solo mostrar, no modificar.")
    parser.add_argument(
        "--fecha-inicio",
        type=str,
        metavar="YYYY-MM-DD",
        help="Fecha inicio del rango.",
    )
    parser.add_argument(
        "--fecha-fin",
        type=str,
        metavar="YYYY-MM-DD",
        help="Fecha fin del rango.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.fecha_inicio and args.fecha_fin:
            try:
                fecha_inicio = date.fromisoformat(args.fecha_inicio)
                fecha_fin = date.fromisoformat(args.fecha_fin)
            except ValueError:
                print("Error: fechas en formato YYYY-MM-DD.")
                return 1
        else:
            fechas = get_fechas_con_checadas(db)
            if not fechas:
                print("No hay checadas en la BD.")
                return 0
            fecha_inicio = fechas[0]
            fecha_fin = fechas[-1]
            print(f"Rango detectado por checadas: {fecha_inicio} a {fecha_fin}")

        if fecha_inicio > fecha_fin:
            print("Error: fecha_inicio debe ser <= fecha_fin.")
            return 1

        modo = "DRY-RUN" if args.dry_run else "APLICAR"
        print(f"\nModo: {modo}\n")

        res = regenerar(db, fecha_inicio, fecha_fin, dry_run=args.dry_run)

        print(f"\nEliminadas: {res['eliminadas']}")
        print(f"Regeneradas (aprox.): {res['creadas']}")
        if args.dry_run:
            print("\nEjecuta sin --dry-run para aplicar.")

        return 0
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
