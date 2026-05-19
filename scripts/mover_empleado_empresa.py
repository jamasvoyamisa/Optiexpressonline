#!/usr/bin/env python3
"""
Mueve un empleado a otra empresa y cambia su número de empleado (producción / VPS).

Uso en el VPS:
  cd /opt/optiexpress/backend && ./venv/bin/python3 /opt/optiexpress/scripts/mover_empleado_empresa.py \\
    --numero-origen 220 --empresa-origen OPTIVISION \\
    --numero-destino 221 --empresa-destino distribuidora \\
    --nombre-contiene "DE LA TORRE" --dry-run

  # Si el preview es correcto:
  ... --apply

Requiere DATABASE_URL en backend/.env del servidor.
"""
from __future__ import annotations

import argparse
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


def _find_empresa(db, patron: str):
    from app.modules.personal import models

    p = (patron or "").strip()
    if not p:
        return None
    row = (
        db.query(models.Empresa)
        .filter(models.Empresa.nombre.ilike(f"%{p}%"))
        .order_by(models.Empresa.id)
        .all()
    )
    if len(row) == 1:
        return row[0]
    if len(row) > 1:
        nombres = ", ".join(f"{e.id}={e.nombre!r}" for e in row)
        raise SystemExit(f"Varias empresas coinciden con {patron!r}: {nombres}. Sé más específico.")
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Mover empleado entre empresas en BD.")
    parser.add_argument("--numero-origen", required=True)
    parser.add_argument("--empresa-origen", required=True, help="Fragmento del nombre de empresa actual")
    parser.add_argument("--numero-destino", required=True)
    parser.add_argument("--empresa-destino", required=True, help="Fragmento del nombre de empresa destino")
    parser.add_argument("--nombre-contiene", default="", help="Filtro extra en nombre/apellidos")
    parser.add_argument("--apply", action="store_true", help="Ejecutar cambios (sin esto solo muestra preview)")
    args = parser.parse_args()
    apply = bool(args.apply)

    from app.core.database import SessionLocal
    from app.modules.personal import models
    from app.modules.personal.service import PersonalService
    from app.modules.asistencia import models as asist_models

    db = SessionLocal()
    try:
        emp_origen = _find_empresa(db, args.empresa_origen)
        emp_dest = _find_empresa(db, args.empresa_destino)
        if not emp_origen:
            raise SystemExit(f"No se encontró empresa origen ({args.empresa_origen!r})")
        if not emp_dest:
            raise SystemExit(f"No se encontró empresa destino ({args.empresa_destino!r})")

        q = db.query(models.Empleado).filter(
            models.Empleado.empresa_id == emp_origen.id,
            models.Empleado.numero_empleado == str(args.numero_origen).strip(),
        )
        filtro = (args.nombre_contiene or "").strip().upper()
        candidatos = q.all()
        if filtro:
            candidatos = [
                e
                for e in candidatos
                if filtro in (e.nombre or "").upper()
                or filtro in (e.apellido_paterno or "").upper()
                or filtro in (e.apellido_materno or "").upper()
            ]
        if len(candidatos) != 1:
            raise SystemExit(
                f"Se esperaba 1 empleado, se encontraron {len(candidatos)} "
                f"(empresa {emp_origen.nombre!r}, no. {args.numero_origen})."
            )
        emp = candidatos[0]

        ocupado = (
            db.query(models.Empleado)
            .filter(
                models.Empleado.empresa_id == emp_dest.id,
                models.Empleado.numero_empleado == str(args.numero_destino).strip(),
            )
            .first()
        )
        if ocupado and ocupado.id != emp.id:
            raise SystemExit(
                f"El número {args.numero_destino} ya está en uso en {emp_dest.nombre!r} "
                f"(empleado id={ocupado.id}, {ocupado.nombre} {ocupado.apellido_paterno})."
            )

        nuevo_pin = PersonalService._next_pin_checador(db, emp_dest.id)
        nombre_completo = f"{emp.nombre} {emp.apellido_paterno or ''} {emp.apellido_materno or ''}".strip()

        print("=== Preview ===")
        print(f"Empleado id={emp.id}: {nombre_completo}")
        print(f"  Empresa: {emp_origen.nombre!r} (id={emp_origen.id}) -> {emp_dest.nombre!r} (id={emp_dest.id})")
        print(f"  Número: {emp.numero_empleado!r} -> {args.numero_destino!r}")
        print(f"  PIN checador: {emp.pin_checador!r} -> {nuevo_pin!r}")

        depto = None
        if emp.departamento_id:
            depto = db.query(models.Departamento).filter(models.Departamento.id == emp.departamento_id).first()
        puesto = None
        if emp.puesto_id:
            puesto = db.query(models.Puesto).filter(models.Puesto.id == emp.puesto_id).first()
        limpiar_depto = depto and depto.empresa_id != emp_dest.id
        limpiar_puesto = puesto and puesto.empresa_id not in (None, emp_dest.id)
        if limpiar_depto:
            print(f"  departamento_id={emp.departamento_id} se pondrá NULL (pertenece a otra empresa)")
        if limpiar_puesto:
            print(f"  puesto_id={emp.puesto_id} se pondrá NULL (pertenece a otra empresa)")

        old_numero = emp.numero_empleado
        old_pin = emp.pin_checador
        q_pend = db.query(asist_models.UsuarioPendienteDispositivo).filter(
            asist_models.UsuarioPendienteDispositivo.numero_empleado == old_numero,
        )
        if old_pin:
            q_pend = q_pend.filter(
                asist_models.UsuarioPendienteDispositivo.pin_checador == old_pin
            )
        pendientes = q_pend.all()
        if pendientes:
            print(f"  Cola checador: {len(pendientes)} fila(s) se actualizarán al nuevo número/PIN")

        if not apply:
            print("\nModo preview. Repite con --apply para guardar.")
            return

        emp.empresa_id = emp_dest.id
        emp.numero_empleado = str(args.numero_destino).strip()
        emp.pin_checador = nuevo_pin
        if limpiar_depto:
            emp.departamento_id = None
        if limpiar_puesto:
            emp.puesto_id = None

        for row in pendientes:
            row.numero_empleado = emp.numero_empleado
            row.pin_checador = nuevo_pin

        db.commit()
        print("\nCambios guardados. Revisa checadores: puede hacer falta borrar el PIN viejo y re-enrollar huella.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
