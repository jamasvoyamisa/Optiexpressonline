#!/usr/bin/env python3
"""
Vacía la base de datos (MySQL) y deja SOLO:
- 1 empresa con configuración fiscal básica y de nómina
- 10 empleados activos con datos personales completos + empleado_nomina completo
- Horario, dispositivo demo, departamentos, puestos, empleado_horario

Solo ejecuta si DATABASE_URL apunta a localhost/127.0.0.1.
Uso:
  python3 scripts/reset_local_nomina_demo.py --yes

Login sugerido tras el reset:
  admin@nomina.local / Admin123!
  (colaboradores: nomina2@local.test … nomina10@local.test — mismo password)

  Obligatorio: cerrar sesión en el navegador y volver a entrar tras ejecutar el script.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
load_dotenv(BACKEND / ".env")


def _require_local_database_url() -> None:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL no definido en backend/.env")
    if not any(x in url for x in ("@localhost:", "@127.0.0.1:")):
        raise RuntimeError(
            "Abortado: este script solo puede ejecutarse contra MySQL local (localhost/127.0.0.1)."
        )


def _truncate_all(engine) -> None:
    import app.main  # noqa: F401 - registra todos los modelos en Base
    from app.core.database import Base
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(text(f"TRUNCATE TABLE `{table.name}`"))
        conn.execute(text("SET FOREIGN_KEY_CHECKS=1"))


def _sdi_from_monthly(salario_mensual: Decimal) -> Decimal:
    """SDI ilustrativo: factor ~1.0484 sobre salario diario (solo demo)."""
    diario = salario_mensual / Decimal("30.4")
    return (diario * Decimal("1.0484")).quantize(Decimal("0.0001"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset local DB → 1 empresa, 10 empleados + nómina")
    parser.add_argument("--yes", action="store_true", help="Confirmar ejecución")
    args = parser.parse_args()
    if not args.yes:
        print("Añade --yes para vaciar la base y cargar el demo de nómina.")
        sys.exit(1)

    _require_local_database_url()

    import app.main  # noqa: F401
    from app.core.database import SessionLocal, engine
    from app.core.security import get_password_hash
    from app.modules.asistencia import models as am
    from app.modules.nomina import models as nm
    from app.modules.personal import models as pm

    print("Truncando tablas…")
    _truncate_all(engine)

    db = SessionLocal()
    try:
        tz = timezone.utc

        rol_admin = pm.Rol(nombre="Administrador", descripcion="Acceso total", activo=True)
        rol_colab = pm.Rol(nombre="Colaborador", descripcion="Usuario estándar", activo=True)
        db.add_all([rol_admin, rol_colab])
        db.commit()
        db.refresh(rol_admin)
        db.refresh(rol_colab)

        empresa = pm.Empresa(
            nombre="Óptica Demo Nómina S.A. de C.V.",
            rfc="ODN200101ABC",
            activo=True,
            dias_laborales="lun-dom",
            trabaja_festivos=True,
            domicilio="Av. Universidad 1200",
            numero_exterior="1200",
            colonia="Centro",
            municipio="San Luis Potosí",
            estado="San Luis Potosí",
            codigo_postal="78000",
            telefono="4441234567",
            regimen_fiscal="601",
        )
        db.add(empresa)
        db.commit()
        db.refresh(empresa)

        cfg = nm.EmpresaNominaConfig(
            empresa_id=empresa.id,
            registro_patronal="A1234567890",
            regimen_fiscal_sat="601",
            codigo_postal_expedicion="78000",
            periodicidad_defecto="04",
            activo=True,
        )
        db.add(cfg)

        depto_adm = pm.Departamento(nombre="Administración", empresa_id=empresa.id, activo=True)
        depto_ven = pm.Departamento(nombre="Ventas y Mostrador", empresa_id=empresa.id, activo=True)
        db.add_all([depto_adm, depto_ven])
        db.commit()
        db.refresh(depto_adm)
        db.refresh(depto_ven)

        p_dir = pm.Puesto(
            nombre="Director General",
            empresa_id=empresa.id,
            departamento_id=depto_adm.id,
            orden=1,
            activo=True,
        )
        p_rh = pm.Puesto(
            nombre="RH",
            empresa_id=empresa.id,
            departamento_id=depto_adm.id,
            orden=2,
            activo=True,
        )
        p_ven = pm.Puesto(
            nombre="Vendedor",
            empresa_id=empresa.id,
            departamento_id=depto_ven.id,
            orden=10,
            activo=True,
        )
        p_aux = pm.Puesto(
            nombre="Auxiliar administrativo",
            empresa_id=empresa.id,
            departamento_id=depto_adm.id,
            orden=5,
            activo=True,
        )
        db.add_all([p_dir, p_rh, p_ven, p_aux])
        db.commit()
        db.refresh(p_dir)
        db.refresh(p_rh)
        db.refresh(p_ven)
        db.refresh(p_aux)

        horario = am.Horario(
            nombre="Comercial L-D",
            hora_entrada="09:00",
            hora_salida="19:00",
            hora_salida_sabado="15:00",
            dias_semana="1,2,3,4,5,6,7",
            tolerancia_minutos=10,
            activo=True,
        )
        dispositivo = am.Dispositivo(
            nombre="Reloj demo nómina",
            ip_local="127.0.0.1",
            ubicacion="Local",
            api_key="local-nomina-demo-device-key",
            activo=True,
        )
        db.add_all([horario, dispositivo])
        db.commit()
        db.refresh(horario)
        db.refresh(dispositivo)

        # (num, nombres, ap_pat, ap_mat, dept, puesto, salario, curp_base unique, infonavit?, fonacot?)
        plantilla = [
            ("001", "Marco", "DÍAZ", "RIVERA", depto_adm, p_dir, Decimal("28000.0000"), "DIRA850115HSPZRR09", None, None),
            ("002", "Ana", "GARCÍA", "LÓPEZ", depto_adm, p_rh, Decimal("18500.0000"), "GALA920320MSPNNN08", Decimal("450.00"), None),
            ("003", "Luis", "HERNÁNDEZ", "RUIZ", depto_ven, p_ven, Decimal("9500.0000"), "HERL880910HSPRRS07", None, None),
            ("004", "María", "MARTÍNEZ", "SOTO", depto_ven, p_ven, Decimal("10200.0000"), "MASM910505MSPRSR04", None, Decimal("200.00")),
            ("005", "Jorge", "LÓPEZ", "CASTRO", depto_ven, p_ven, Decimal("11000.0000"), "LOCJ870812HSPPSR01", None, None),
            ("006", "Patricia", "SÁNCHEZ", "MORA", depto_adm, p_aux, Decimal("12500.0000"), "SAMP900618MSPRCR09", None, None),
            ("007", "Roberto", "FLORES", "NÚÑEZ", depto_ven, p_ven, Decimal("13200.0000"), "FONR860101HSPRLB05", Decimal("320.50"), None),
            ("008", "Laura", "REYES", "ORTIZ", depto_adm, p_aux, Decimal("11800.0000"), "REOL930214MSPYSR08", None, None),
            ("009", "Daniel", "CRUZ", "VÁZQUEZ", depto_ven, p_ven, Decimal("14500.0000"), "CUVD910930HSPZRN00", None, None),
            ("010", "Gabriela", "MORALES", "IBARRA", depto_ven, p_ven, Decimal("15200.0000"), "MOIG890722MSPBRB03", None, None),
        ]

        empleados_creados: list[pm.Empleado] = []
        pwd = get_password_hash("Admin123!")

        for i, row in enumerate(plantilla):
            num, nom, ap1, ap2, depto, puesto, salario, curp, infon, fonac = row
            email = f"nomina{int(num)}@local.test"
            emp = pm.Empleado(
                empresa_id=empresa.id,
                departamento_id=depto.id,
                numero_empleado=num,
                pin_checador=f"51{num}",
                nombre=nom,
                apellido_paterno=ap1,
                apellido_materno=ap2,
                email=email,
                telefono=f"444200{i:04d}",
                username=f"user{num}",
                password_hash=pwd,
                puesto_id=puesto.id,
                curp=curp,
                rfc=(curp[:4] + "850101" + f"{i:03d}")[:13].ljust(13, "X"),
                nss=f"{(10000000000 + i * 111111):011d}"[:11],
                direccion=f"Calle Demo {i} #{100 + i}",
                colonia="Del Valle",
                cp="78200",
                ciudad="San Luis Potosí",
                fecha_nacimiento=datetime(1990 + (i % 5), 3 + (i % 9), 5 + (i % 20), tzinfo=tz),
                contacto_emergencia="Familiar Demo",
                telefono_emergencia=f"444300{i:04d}",
                rol_id=rol_admin.id if num == "001" else rol_colab.id,
                estado=pm.EstadoEmpleado.ACTIVO,
                fecha_ingreso=datetime(2022, 1, 10 + i, tzinfo=tz),
                exento_incidencias=False,
                puede_checar_remoto=True,
            )
            db.add(emp)
            empleados_creados.append(emp)

        db.commit()
        for e in empleados_creados:
            db.refresh(e)

        # Primer empleado: login admin dedicado
        admin = empleados_creados[0]
        admin.email = "admin@nomina.local"
        admin.username = "admin"
        db.commit()

        depto_adm.jefe_id = empleados_creados[0].id
        depto_ven.jefe_id = empleados_creados[2].id
        empleados_creados[1].jefe_id = empleados_creados[0].id
        for idx in (2, 3, 4, 6, 9):
            empleados_creados[idx].jefe_id = empleados_creados[2].id
        for idx in (5, 7):
            empleados_creados[idx].jefe_id = empleados_creados[0].id
        db.commit()

        cuentas_base = [
            ("012", "405012345678901234", "012345678901234567"),
            ("014", "014012345678901234", "014012345678901234"),
            ("072", "072012345678901234", "072012345678901234"),
        ]

        for i, emp in enumerate(empleados_creados):
            eh = am.EmpleadoHorario(
                empleado_id=emp.id,
                horario_id=horario.id,
                activo=True,
            )
            db.add(eh)
            banco, cuenta, clabe = cuentas_base[i % len(cuentas_base)]
            row_data = plantilla[i]
            sal_mens = row_data[6]
            infon = row_data[8]
            fonac = row_data[9]
            en = nm.EmpleadoNomina(
                empleado_id=emp.id,
                salario_base=sal_mens,
                salario_diario_integrado=_sdi_from_monthly(sal_mens),
                tipo_contrato="01",
                regimen_tipo="02",
                periodicidad_pago="04",
                banco_clave=banco,
                cuenta_bancaria=cuenta,
                clabe_interbancaria=clabe,
                entidad_federativa="SP",
                riesgo_puesto="1",
                tipo_jornada="01",
                sindicalizado=False,
                descuento_infonavit=infon,
                descuento_infonacot=fonac,
                numero_credito_infonavit=("123456789012" if infon else None),
                numero_credito_infonacot=("987654321098" if fonac else None),
                activo=True,
            )
            db.add(en)

        db.commit()
        print("Listo.")
        print(f"  Empresa ID {empresa.id}: {empresa.nombre}")
        print("  Empleados: 10 — admin@nomina.local / Admin123! (resto: nomina2@local.test … nomina10@local.test, mismo password)")
        print("  Nómina: salarios, SDI, banco, INFONAVIT/Fonacot donde aplica.")
        print("")
        print("  >>> Cierra sesión en el navegador y vuelve a entrar; el JWT anterior apunta a IDs que ya no existen.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
