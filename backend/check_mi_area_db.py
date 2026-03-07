#!/usr/bin/env python3
"""
Revisa en la base de datos: departamentos, empleados por departamento (especialmente Diseño)
y qué departamentos administra cada empleado (para Mi Área / checadas).
"""
import sys
import os

# Cargar .env desde backend
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.modules.personal import models as pm
from app.modules.personal.service import PersonalService
from sqlalchemy.orm import joinedload

def main():
    db = SessionLocal()
    try:
        print("=== DEPARTAMENTOS ===\n")
        deptos = db.query(pm.Departamento).order_by(pm.Departamento.nombre).all()
        for d in deptos:
            jefe_nombre = "—"
            if d.jefe_id:
                jefe = db.query(pm.Empleado).filter(pm.Empleado.id == d.jefe_id).first()
                if jefe:
                    jefe_nombre = f"{jefe.nombre} {jefe.apellido_paterno or ''} (id={jefe.id})"
            print(f"  id={d.id}  nombre={d.nombre!r}  jefe_id={d.jefe_id}  jefe={jefe_nombre}")

        print("\n=== EMPLEADOS POR DEPARTAMENTO (departamento_id, puesto) ===\n")
        empleados = (
            db.query(pm.Empleado)
            .options(
                joinedload(pm.Empleado.departamento_rel),
                joinedload(pm.Empleado.puesto_rel),
            )
            .order_by(pm.Empleado.departamento_id, pm.Empleado.nombre)
            .all()
        )
        by_dept = {}
        sin_dept = []
        for e in empleados:
            dept_name = (e.departamento_rel.nombre if e.departamento_rel else None) or "—"
            puesto_name = (e.puesto_rel.nombre if e.puesto_rel else None) or "—"
            row = f"  id={e.id}  numero={e.numero_empleado!r}  {e.nombre} {e.apellido_paterno or ''}  puesto={puesto_name!r}  dept_id={e.departamento_id}"
            if e.departamento_id is not None:
                by_dept.setdefault(dept_name, []).append(row)
            else:
                sin_dept.append(row)

        for dept_name in sorted(by_dept.keys()):
            print(f"  --- {dept_name} ---")
            for row in by_dept[dept_name]:
                print(row)
            print()
        if sin_dept:
            print("  --- SIN DEPARTAMENTO (departamento_id NULL) ---")
            for row in sin_dept:
                print(row)
            print()

        print("=== DEPARTAMENTOS QUE ADMINISTRA CADA EMPLEADO (get_departamento_ids_que_administro) ===\n")
        for e in empleados:
            dept_ids = PersonalService.get_departamento_ids_que_administro(db, e.id)
            if not dept_ids:
                continue
            dept_names = []
            for did in dept_ids:
                d = db.query(pm.Departamento).filter(pm.Departamento.id == did).first()
                dept_names.append(d.nombre if d else str(did))
            puesto_n = (e.puesto_rel.nombre or "").strip().lower() if e.puesto_rel else ""
            print(f"  {e.nombre} {e.apellido_paterno or ''} (id={e.id})  puesto={e.puesto_rel.nombre if e.puesto_rel else '—'}  administra: {dept_names}")

        # Contar asistencias por empleado (últimos días)
        from datetime import datetime, timedelta, timezone
        from app.modules.asistencia import models as am
        print("\n=== CHECADAS RECIENTES (últimos 7 días) POR EMPLEADO ===\n")
        hace_7 = datetime.now(timezone.utc) - timedelta(days=7)
        for e in empleados:
            count = db.query(am.Asistencia).filter(
                am.Asistencia.empleado_id == e.id,
                am.Asistencia.timestamp >= hace_7,
            ).count()
            if count > 0:
                dept_name = (e.departamento_rel.nombre if e.departamento_rel else None) or "sin dept"
                print(f"  {e.nombre} {e.apellido_paterno or ''}  dept={dept_name}  checadas={count}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
