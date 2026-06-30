#!/usr/bin/env python3
"""
Carga datos de nómina para empleados activos del departamento Almacén
(DISTRIBUIDORA EUROPEA DE ARTICULOS OPTICOS, empresa_id=1).

Uso (solo base local):
  cd backend && ../scripts/seed_nomina_almacen_distribuidora.py
  # o: python3 scripts/seed_nomina_almacen_distribuidora.py --yes
"""
from __future__ import annotations

import argparse
import os
import sys
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
load_dotenv(BACKEND / ".env")

EMPRESA_ID = 1
DEPTO_ALMACEN_NOMBRE = "Almacen"
CP_EMPLEADO = "44100"

# Salario mensual bruto ilustrativo por número de empleado
SALARIOS: dict[str, Decimal] = {
    "045": Decimal("22000.0000"),  # Gerente
    "176": Decimal("15000.0000"),  # Supervisor
    "161": Decimal("12000.0000"),  # Surtidor
    "101": Decimal("9500.0000"),
    "146": Decimal("9500.0000"),
    "179": Decimal("9500.0000"),
    "202": Decimal("9500.0000"),
    "219": Decimal("9500.0000"),
}


def _require_local() -> None:
    url = os.environ.get("DATABASE_URL", "")
    if not any(x in url for x in ("@localhost:", "@127.0.0.1:")):
        raise RuntimeError("Solo se permite ejecutar contra MySQL local.")


def _sdi_mensual(salario_mensual: Decimal) -> Decimal:
    diario = salario_mensual / Decimal("30.4")
    return (diario * Decimal("1.0484")).quantize(Decimal("0.0001"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="Confirmar ejecución")
    args = parser.parse_args()
    if not args.yes:
        print("Añade --yes para aplicar datos de nómina en Almacén / Distribuidora.")
        sys.exit(1)

    _require_local()

    import app.main  # noqa: F401
    from app.core.database import SessionLocal
    from app.modules.nomina.models import EmpleadoNomina, EmpresaNominaConfig
    from app.modules.nomina.service import NominaService
    from app.modules.personal import models as pm

    db = SessionLocal()
    try:
        empresa = db.query(pm.Empresa).filter(pm.Empresa.id == EMPRESA_ID).first()
        if not empresa:
            raise RuntimeError(f"Empresa id={EMPRESA_ID} no encontrada.")

        depto = (
            db.query(pm.Departamento)
            .filter(
                pm.Departamento.empresa_id == EMPRESA_ID,
                pm.Departamento.nombre == DEPTO_ALMACEN_NOMBRE,
            )
            .first()
        )
        if not depto:
            raise RuntimeError(f"Departamento «{DEPTO_ALMACEN_NOMBRE}» no encontrado.")

        cfg = NominaService.get_config_empresa(db, EMPRESA_ID)
        if cfg is None:
            cfg = NominaService.upsert_config_empresa(db, EMPRESA_ID, {
                "registro_patronal": "D4410000000",
                "regimen_fiscal_sat": "601",
                "codigo_postal_expedicion": empresa.codigo_postal or CP_EMPLEADO,
                "periodicidad_defecto": "04",
            })
            print(f"Config nómina empresa creada (id={cfg.id}).")
        elif not cfg.registro_patronal or not cfg.codigo_postal_expedicion:
            NominaService.upsert_config_empresa(db, EMPRESA_ID, {
                "registro_patronal": cfg.registro_patronal or "D4410000000",
                "codigo_postal_expedicion": cfg.codigo_postal_expedicion or empresa.codigo_postal or CP_EMPLEADO,
                "regimen_fiscal_sat": cfg.regimen_fiscal_sat or "601",
                "periodicidad_defecto": cfg.periodicidad_defecto or "04",
            })
            print("Config nómina empresa completada.")

        empleados = (
            db.query(pm.Empleado)
            .filter(
                pm.Empleado.departamento_id == depto.id,
                pm.Empleado.estado == "activo",
            )
            .order_by(pm.Empleado.numero_empleado)
            .all()
        )
        if not empleados:
            print("No hay empleados activos en Almacén.")
            return

        actualizados = 0
        for emp in empleados:
            num = str(emp.numero_empleado or "").strip()
            salario = SALARIOS.get(num)
            if salario is None:
                salario = Decimal("9500.0000")
                print(f"  AVISO #{num}: salario por defecto $9,500")

            if not (emp.cp or "").strip():
                emp.cp = CP_EMPLEADO

            payload = {
                "salario_base": salario,
                "salario_diario_integrado": _sdi_mensual(salario),
                "tipo_contrato": "01",
                "regimen_tipo": "02",
                "periodicidad_pago": "04",
                "tipo_jornada": "01",
                "riesgo_puesto": "2",
                "entidad_federativa": "JC",
                "sindicalizado": False,
                "activo": True,
            }
            NominaService.upsert_datos_empleado(db, emp.id, payload)
            actualizados += 1
            print(
                f"  ✓ #{num} {emp.nombre} {emp.apellido_paterno} — "
                f"salario ${salario:,.2f} / SDI {payload['salario_diario_integrado']}"
            )

        db.commit()
        print(f"\nListo: {actualizados} empleados de Almacén con datos de nómina.")
        print(f"Empresa: {empresa.nombre}")
        print("Revise registro patronal real en Configuración → Empresa si va a timbrar.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
