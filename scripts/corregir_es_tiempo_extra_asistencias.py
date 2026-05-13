#!/usr/bin/env python3
"""
Recalcula es_tiempo_extra en asistencias acorde a la lógica vigente del checador:
- Dom + empresa lun-dom → no es tiempo extra.
- Festivo + empresa con trabaja_festivos → no es tiempo extra.

Por defecto solo corrige filas donde hoy está True y debería ser False (error histórico).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.orm import joinedload

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
load_dotenv(BACKEND / ".env")

from app.core.database import SessionLocal  # noqa: E402
from app.core.timezone_utils import to_mexico  # noqa: E402
from app.modules.asistencia import models as asistencia_models  # noqa: E402
from app.modules.personal import models as personal_models  # noqa: E402
from app.modules.asistencia.service import AsistenciaService  # noqa: E402


def _calcular_es_tiempo_extra(db, empleado: personal_models.Empleado | None, dia_mex) -> bool:
    es_domingo = dia_mex.weekday() == 6
    if empleado and empleado.empresa:
        emp = empleado.empresa
        dias_lab = (emp.dias_laborales or "lun-sab").strip().lower()
        trabaja_fest = bool(getattr(emp, "trabaja_festivos", False))
    else:
        dias_lab = "lun-sab"
        trabaja_fest = False

    if es_domingo and dias_lab != "lun-dom":
        return True
    if AsistenciaService.es_dia_festivo(db, dia_mex) and not trabaja_fest:
        return True
    return False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Escribir cambios en BD (sin esto solo muestra conteos)",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Recalcular todas las asistencias (True/False); por defecto solo True→False",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        q = db.query(asistencia_models.Asistencia).options(
            joinedload(asistencia_models.Asistencia.empleado).joinedload(
                personal_models.Empleado.empresa
            )
        )
        if not args.full:
            q = q.filter(asistencia_models.Asistencia.es_tiempo_extra.is_(True))

        total = 0
        to_false = 0
        to_true = 0
        batch = 0

        for a in q.yield_per(500):
            total += 1
            ts = a.timestamp
            dia_mex = (to_mexico(ts) or ts).date()
            correct = _calcular_es_tiempo_extra(db, a.empleado, dia_mex)

            if args.full:
                if a.es_tiempo_extra != correct:
                    if correct:
                        to_true += 1
                    else:
                        to_false += 1
                    if args.apply:
                        a.es_tiempo_extra = correct
                        batch += 1
            else:
                if a.es_tiempo_extra and not correct:
                    to_false += 1
                    if args.apply:
                        a.es_tiempo_extra = False
                        batch += 1

            if args.apply and batch >= 500:
                db.commit()
                batch = 0

        if args.apply:
            db.commit()

        mode = "APLICADO" if args.apply else "simulación"
        print(f"[{mode}] Filas revisadas: {total}")
        if args.full:
            print(f"  Cambios a True: {to_true}, a False: {to_false}")
        else:
            print(f"  Marcas 'extra' a corregir (True→False): {to_false}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
