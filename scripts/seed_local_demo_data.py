#!/usr/bin/env python3
"""
Genera datos de prueba SOLO en entorno local (localhost/127.0.0.1).

Incluye:
- Estructura base (empresa, departamentos, puestos, horario, dispositivo)
- Empleados operativos + 1 usuario especial
- Checadas de asistencia desde el 1 de enero del año actual hasta hoy
"""
from __future__ import annotations

import os
import random
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
load_dotenv(BACKEND / ".env")


def _require_local_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL no definido en backend/.env")
    allowed = ("@localhost:", "@127.0.0.1:")
    if not any(x in url for x in allowed):
        raise RuntimeError(
            "Abortado: este script solo se ejecuta en BD local (localhost/127.0.0.1)."
        )
    return url


def _daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def main() -> None:
    _require_local_database_url()
    random.seed(42)

    import app.main  # noqa: F401 - asegura registro de modelos
    from app.core.database import SessionLocal
    from app.core.security import get_password_hash
    from app.modules.asistencia import models as am
    from app.modules.personal import models as pm

    db = SessionLocal()
    try:
        # Roles base
        rol_admin = db.query(pm.Rol).filter(pm.Rol.nombre == "Administrador").first()
        if not rol_admin:
            rol_admin = pm.Rol(nombre="Administrador", descripcion="Acceso total", activo=True)
            db.add(rol_admin)
        rol_rh = db.query(pm.Rol).filter(pm.Rol.nombre == "RH").first()
        if not rol_rh:
            rol_rh = pm.Rol(nombre="RH", descripcion="Recursos Humanos", activo=True)
            db.add(rol_rh)
        db.commit()
        db.refresh(rol_admin)
        db.refresh(rol_rh)

        # Empresa + estructura
        empresa = pm.Empresa(
            nombre="Optiexpress Demo Local",
            rfc="ODE010101AAA",
            activo=True,
            dias_laborales="lun-sab",
            trabaja_festivos=False,
        )
        db.add(empresa)
        db.commit()
        db.refresh(empresa)

        depto_ops = pm.Departamento(nombre="Operaciones", empresa_id=empresa.id, activo=True)
        depto_rh = pm.Departamento(nombre="Recursos Humanos", empresa_id=empresa.id, activo=True)
        db.add_all([depto_ops, depto_rh])
        db.commit()
        db.refresh(depto_ops)
        db.refresh(depto_rh)

        puesto_operador = pm.Puesto(
            nombre="Operador", empresa_id=empresa.id, departamento_id=depto_ops.id, orden=10, activo=True
        )
        puesto_supervisor = pm.Puesto(
            nombre="Supervisor de Área", empresa_id=empresa.id, departamento_id=depto_ops.id, orden=20, activo=True
        )
        puesto_rh = pm.Puesto(
            nombre="RH", empresa_id=None, departamento_id=None, orden=3, activo=True
        )
        db.add_all([puesto_operador, puesto_supervisor, puesto_rh])
        db.commit()
        db.refresh(puesto_operador)
        db.refresh(puesto_supervisor)
        db.refresh(puesto_rh)

        # Horario + dispositivo
        horario = am.Horario(
            nombre="Oficina Demo",
            hora_entrada="09:00",
            hora_salida="18:00",
            hora_salida_sabado="14:00",
            dias_semana="1,2,3,4,5,6",
            tolerancia_minutos=10,
            activo=True,
        )
        dispositivo = am.Dispositivo(
            nombre="Reloj Demo Local",
            ip_local="192.168.1.250",
            ubicacion="Oficina Demo",
            api_key="demo-local-device-key",
            serial_number="DEMO-LOCAL-0001",
            activo=True,
        )
        db.add_all([horario, dispositivo])
        db.commit()
        db.refresh(horario)
        db.refresh(dispositivo)

        # Admin local
        admin = pm.Empleado(
            numero_empleado="admin",
            nombre="Administrador",
            apellido_paterno="Sistema",
            email="admin@admin.com",
            username="admin",
            password_hash=get_password_hash("Admin123!"),
            rol_id=rol_admin.id,
            estado=pm.EstadoEmpleado.ACTIVO,
            exento_incidencias=False,
        )
        db.add(admin)
        db.commit()

        base_fecha_ingreso = datetime(datetime.now().year, 1, 1, 9, 0, 0)
        empleados_data = [
            ("1001", "María", "López", "maria.lopez", puesto_supervisor.id, depto_ops.id, None, False),
            ("1002", "José", "Hernández", "jose.hernandez", puesto_operador.id, depto_ops.id, None, False),
            ("1003", "Ana", "Ramírez", "ana.ramirez", puesto_operador.id, depto_ops.id, None, False),
            ("1004", "Luis", "García", "luis.garcia", puesto_operador.id, depto_ops.id, None, False),
            ("1005", "Carla", "Pérez", "carla.perez", puesto_operador.id, depto_ops.id, None, False),
            ("1006", "Pablo", "Flores", "pablo.flores", puesto_operador.id, depto_ops.id, None, False),
            ("1007", "Rosa", "Mendoza", "rosa.mendoza", puesto_rh.id, depto_rh.id, rol_rh.id, False),
            ("ESP-1-0001", "Alejandro", "Especial", "alejandro.especial", puesto_operador.id, depto_ops.id, None, True),
        ]

        empleados: list[pm.Empleado] = []
        for numero, nombre, ap, user, puesto_id, depto_id, rol_id, exento in empleados_data:
            emp = pm.Empleado(
                numero_empleado=numero,
                pin_checador=numero.replace("ESP-", "9").replace("-", "")[:8],
                nombre=nombre,
                apellido_paterno=ap,
                email=f"{user}@demo.com",
                username=user,
                password_hash=get_password_hash("Demo123!"),
                empresa_id=empresa.id,
                departamento_id=depto_id,
                puesto_id=puesto_id,
                rol_id=rol_id,
                estado=pm.EstadoEmpleado.ACTIVO,
                fecha_ingreso=base_fecha_ingreso,
                exento_incidencias=exento,
                puede_checar_remoto=not exento,
            )
            db.add(emp)
            empleados.append(emp)

        db.commit()
        for e in empleados:
            db.refresh(e)

        # Asignar jefe (la supervisora) al resto de operaciones
        jefe_ops = next(e for e in empleados if e.numero_empleado == "1001")
        for e in empleados:
            if e.id != jefe_ops.id and e.departamento_id == depto_ops.id:
                e.jefe_id = jefe_ops.id
        depto_ops.jefe_id = jefe_ops.id
        db.commit()

        # Asignar horario a todos menos usuario especial
        for e in empleados:
            if e.exento_incidencias:
                continue
            db.add(
                am.EmpleadoHorario(
                    empleado_id=e.id,
                    horario_id=horario.id,
                    fecha_inicio=base_fecha_ingreso,
                    activo=True,
                )
            )
        db.commit()

        # Checadas de prueba desde 1 de enero hasta hoy (L-S, excluye domingos)
        inicio = date(date.today().year, 1, 1)
        fin = date.today()
        total_checadas = 0
        operativos = [e for e in empleados if not e.exento_incidencias]

        for dia in _daterange(inicio, fin):
            if dia.weekday() == 6:  # domingo
                continue
            es_sabado = dia.weekday() == 5

            for emp in operativos:
                # Variación ligera para simular realidad
                atraso = random.randint(-7, 14)
                entrada = datetime.combine(dia, time(9, 0)) + timedelta(minutes=atraso)

                if es_sabado:
                    salida = datetime.combine(dia, time(14, 0)) + timedelta(minutes=random.randint(-12, 8))
                    registros = [
                        (am.TipoChecada.ENTRADA, entrada),
                        (am.TipoChecada.SALIDA, salida),
                    ]
                else:
                    salida_comer = datetime.combine(dia, time(14, 0)) + timedelta(minutes=random.randint(-6, 10))
                    regreso_comer = datetime.combine(dia, time(15, 0)) + timedelta(minutes=random.randint(-5, 8))
                    salida = datetime.combine(dia, time(18, 0)) + timedelta(minutes=random.randint(-12, 15))
                    registros = [
                        (am.TipoChecada.ENTRADA, entrada),
                        (am.TipoChecada.SALIDA_COMER, salida_comer),
                        (am.TipoChecada.REGRESO_COMER, regreso_comer),
                        (am.TipoChecada.SALIDA, salida),
                    ]

                for tipo, ts in registros:
                    db.add(
                        am.Asistencia(
                            empleado_id=emp.id,
                            dispositivo_id=dispositivo.id,
                            timestamp=ts,
                            tipo=tipo,
                            sincronizado=True,
                            es_tiempo_extra=False,
                        )
                    )
                    total_checadas += 1

        db.commit()

        print("Seed local completado.")
        print(f"Empresa: {empresa.nombre} (id={empresa.id})")
        print(f"Empleados creados: {len(empleados)} (+ admin sistema)")
        print(f"Checadas generadas: {total_checadas}")
        print(f"Rango: {inicio.isoformat()} -> {fin.isoformat()}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
