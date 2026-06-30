#!/usr/bin/env python3
"""
Carga datos de nómina para empleados activos del departamento Ventas Mostrador
(DISTRIBUIDORA EUROPEA DE ARTICULOS OPTICOS, empresa_id=1).

Uso (solo base local):
  cd backend && ../scripts/seed_nomina_ventas_mostrador_distribuidora.py --yes
  # o: python3 scripts/seed_nomina_ventas_mostrador_distribuidora.py --yes
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
DEPTO_VENTAS_NOMBRE = "Ventas Mostrador"
CP_EMPLEADO = "44100"

# Salario mensual bruto por puesto (fallback si no hay override por número)
SALARIO_POR_PUESTO: dict[int, Decimal] = {
    1: Decimal("28000.0000"),   # Director
    4: Decimal("22000.0000"),   # Gerente
    8: Decimal("12000.0000"),   # Atención a clientes
    12: Decimal("10500.0000"),  # Atención foráneos
    13: Decimal("11500.0000"),  # Lente de contacto
    14: Decimal("10000.0000"),  # Entregas
    15: Decimal("9500.0000"),    # Ventas mostrador
}

# Ajustes puntuales por número de empleado
SALARIOS: dict[str, Decimal] = {
    "038": Decimal("22000.0000"),  # Gerente mostrador
    "185": Decimal("13500.0000"),  # Atención a clientes (referente)
    "126": Decimal("10200.0000"),  # Entregas
    "135": Decimal("10800.0000"),  # Foráneos
}


def _require_local() -> None:
    url = os.environ.get("DATABASE_URL", "")
    if not any(x in url for x in ("@localhost:", "@127.0.0.1:")):
        raise RuntimeError("Solo se permite ejecutar contra MySQL local.")


def _sdi_mensual(salario_mensual: Decimal) -> Decimal:
    diario = salario_mensual / Decimal("30.4")
    return (diario * Decimal("1.0484")).quantize(Decimal("0.0001"))


def _salario_empleado(num: str, puesto_id: int | None) -> Decimal:
    if num in SALARIOS:
        return SALARIOS[num]
    if puesto_id and puesto_id in SALARIO_POR_PUESTO:
        return SALARIO_POR_PUESTO[puesto_id]
    return Decimal("9500.0000")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="Confirmar ejecución")
    args = parser.parse_args()
    if not args.yes:
        print("Añade --yes para aplicar datos de nómina en Ventas Mostrador / Distribuidora.")
        sys.exit(1)

    _require_local()

    import app.main  # noqa: F401
    from app.core.database import SessionLocal
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
                pm.Departamento.nombre == DEPTO_VENTAS_NOMBRE,
            )
            .first()
        )
        if not depto:
            raise RuntimeError(f"Departamento «{DEPTO_VENTAS_NOMBRE}» no encontrado.")

        cfg = NominaService.get_config_empresa(db, EMPRESA_ID)
        if cfg is None:
            NominaService.upsert_config_empresa(db, EMPRESA_ID, {
                "registro_patronal": "D4410000000",
                "regimen_fiscal_sat": "601",
                "codigo_postal_expedicion": empresa.codigo_postal or CP_EMPLEADO,
                "periodicidad_defecto": "04",
            })
            print("Config nómina empresa creada.")
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
            print("No hay empleados activos en Ventas Mostrador.")
            return

        actualizados = 0
        omitidos = 0
        for emp in empleados:
            num = str(emp.numero_empleado or "").strip()
            if not (emp.rfc or "").strip() or not (emp.curp or "").strip():
                print(f"  OMITIR #{num} {emp.nombre}: sin RFC/CURP (complete expediente antes de timbrar)")
                omitidos += 1
                continue

            salario = _salario_empleado(num, emp.puesto_id)
            if num not in SALARIOS and emp.puesto_id not in SALARIO_POR_PUESTO:
                print(f"  AVISO #{num}: salario por defecto $9,500")

            if not (emp.cp or "").strip():
                emp.cp = CP_EMPLEADO

            if not (emp.nss or "").strip():
                print(f"  AVISO #{num}: sin NSS (requerido para IMSS/timbrado)")

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
            puesto = (
                db.query(pm.Puesto).filter(pm.Puesto.id == emp.puesto_id).first()
                if emp.puesto_id else None
            )
            puesto_nombre = puesto.nombre if puesto else "—"
            print(
                f"  ✓ #{num} {emp.nombre} {emp.apellido_paterno} ({puesto_nombre}) — "
                f"${salario:,.2f} / SDI {payload['salario_diario_integrado']}"
            )

        db.commit()
        print(f"\nListo: {actualizados} empleados de Ventas Mostrador con datos de nómina.")
        if omitidos:
            print(f"Omitidos: {omitidos} (datos fiscales incompletos).")
        print(f"Empresa: {empresa.nombre}")
        print("Revise registro patronal real en Configuración → Empresa si va a timbrar.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
