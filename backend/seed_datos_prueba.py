#!/usr/bin/env python3
"""
seed_datos_prueba.py
Crea datos de prueba: 5 empresas, 10 departamentos por empresa,
roles variados y 200 empleados distribuidos aleatoriamente.
"""
import sys, os, random
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from app.core.database import SessionLocal
from app.core.security import get_password_hash
import app.modules.asistencia.models  # necesario para resolver 'Horario' en relationships
from app.modules.personal.models import (
    Empresa, Departamento, Puesto, Rol, Empleado, EstadoEmpleado
)

# ── Catálogos ─────────────────────────────────────────────────────────────────

EMPRESAS = [
    {"nombre": "Óptica Visión Clara S.A.",   "rfc": "OVC200101AB1", "ciudad": "CDMX"},
    {"nombre": "Lentes del Norte S.A.",       "rfc": "LDN190305CD2", "ciudad": "Monterrey"},
    {"nombre": "Óptica Cristal Plus S.A.",    "rfc": "OCP180712EF3", "ciudad": "Guadalajara"},
    {"nombre": "Visión Total Express S.A.",   "rfc": "VTE210830GH4", "ciudad": "Puebla"},
    {"nombre": "Centro Óptico Nacional S.A.", "rfc": "CON220615IJ5", "ciudad": "León"},
]

DEPARTAMENTOS_BASE = [
    "Ventas", "Recursos Humanos", "Contabilidad", "Sistemas",
    "Operaciones", "Marketing", "Logística", "Atención a Clientes",
    "Compras", "Dirección General",
]

ROLES_EXTRA = [
    ("Gerente", "Gerente de área o sucursal"),
    ("Supervisor", "Supervisión de equipos"),
    ("Vendedor", "Fuerza de ventas"),
    ("Cajero", "Manejo de caja y pagos"),
    ("Optometrista", "Revisiones de la vista"),
    ("Auxiliar", "Apoyo operativo general"),
    ("Contador", "Gestión contable"),
    ("Técnico", "Mantenimiento y laboratorio"),
]

PUESTOS = [
    ("Director General",    1),
    ("Gerente de Área",     10),
    ("Supervisor",          20),
    ("Optometrista",        30),
    ("Vendedor",            40),
    ("Cajero",              50),
    ("Técnico de Lentes",   60),
    ("Auxiliar Admvo.",     70),
    ("Contador",            80),
    ("Operador",            90),
]

NOMBRES = [
    "Alejandro","Beatriz","Carlos","Diana","Eduardo","Fernanda","Gustavo",
    "Hilda","Ignacio","Julia","Kevin","Laura","Miguel","Natalia","Oscar",
    "Patricia","Rodrigo","Sofía","Tomás","Valentina","Andrés","Brenda",
    "César","Daniela","Ernesto","Fabiola","Gerardo","Héctor","Isabel",
    "Jorge","Karen","Luis","María","Nicolás","Olga","Pablo","Rebeca",
    "Santiago","Teresa","Ulises","Verónica","Yadira","Zuley","Arturo",
    "Blanca","Cristina","David","Elena","Francisco","Gabriela",
]

APELLIDOS = [
    "García","Martínez","López","González","Hernández","Pérez","Ramírez",
    "Torres","Flores","Rivera","Morales","Cruz","Reyes","Ortiz","Gutiérrez",
    "Mendoza","Jiménez","Ruiz","Álvarez","Díaz","Sánchez","Castillo",
    "Vargas","Ramos","Vega","Romero","Contreras","Medina","Silva","Aguilar",
    "Fuentes","Cano","Delgado","Rojas","Herrera","Guerrero","Castro","Lara",
    "Espinoza","Núñez","Pacheco","Miranda","Soto","Santiago","Maldonado",
]

CIUDADES = ["CDMX", "Monterrey", "Guadalajara", "Puebla", "León",
            "Mérida", "Tijuana", "Querétaro", "San Luis Potosí", "Aguascalientes"]

CALLES = ["Av. Insurgentes", "Blvd. Díaz Ordaz", "Calle Juárez",
          "Calzada Independencia", "Av. Reforma", "Calle 5 de Mayo",
          "Paseo de la Reforma", "Av. Universidad", "Calle Madero"]

# ── Helpers ───────────────────────────────────────────────────────────────────

def rand_fecha_ingreso():
    days = random.randint(30, 2500)
    return datetime.now() - timedelta(days=days)

def rand_fecha_nacimiento():
    days = random.randint(8000, 16000)   # 22–44 años aprox.
    return datetime.now() - timedelta(days=days)

def rand_curp(nombre, ap):
    letras = "BCDFGHJKLMNPQRSTVWXYZ"
    return (
        ap[:2].upper() + nombre[:2].upper()
        + str(random.randint(70, 99))
        + str(random.randint(1, 12)).zfill(2)
        + str(random.randint(1, 28)).zfill(2)
        + random.choice("HM")
        + "MX"
        + "".join(random.choices(letras, k=3))
        + str(random.randint(0, 9))
    )

def rand_nss():
    return "".join([str(random.randint(0, 9)) for _ in range(11)])

def rand_rfc(nombre, ap, am):
    letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    base = (ap[:2] + am[:1] + nombre[:1]).upper()
    anio = str(random.randint(70, 99))
    mes  = str(random.randint(1, 12)).zfill(2)
    dia  = str(random.randint(1, 28)).zfill(2)
    hom  = "".join(random.choices(letras, k=2)) + str(random.randint(0, 9))
    return base + anio + mes + dia + hom

def rand_tel():
    return f"55{random.randint(10000000, 99999999)}"

# ── Main ──────────────────────────────────────────────────────────────────────

def seed():
    db = SessionLocal()
    try:
        print("━" * 55)
        print("  Seeder: Optiexpress – Datos de prueba")
        print("━" * 55)

        # ── Roles ─────────────────────────────────────────────
        print("\n▶ Creando roles...")
        roles_map = {}
        for nombre, desc in ROLES_EXTRA:
            r = db.query(Rol).filter(Rol.nombre == nombre).first()
            if not r:
                r = Rol(nombre=nombre, descripcion=desc, activo=True)
                db.add(r)
                db.flush()
            roles_map[nombre] = r
        # Incluir roles ya existentes
        for r in db.query(Rol).all():
            roles_map[r.nombre] = r
        db.commit()
        print(f"  ✓ {len(roles_map)} roles disponibles")

        # ── Puestos ───────────────────────────────────────────
        print("\n▶ Creando puestos...")
        puestos_list = []
        for nombre, orden in PUESTOS:
            p = db.query(Puesto).filter(Puesto.nombre == nombre).first()
            if not p:
                p = Puesto(nombre=nombre, orden=orden, activo=True)
                db.add(p)
                db.flush()
            puestos_list.append(p)
        db.commit()
        print(f"  ✓ {len(puestos_list)} puestos disponibles")

        # ── Empresas ──────────────────────────────────────────
        print("\n▶ Creando 5 empresas...")
        empresas = []
        inicio = 1000
        for i, e in enumerate(EMPRESAS):
            emp = db.query(Empresa).filter(Empresa.nombre == e["nombre"]).first()
            if not emp:
                emp = Empresa(
                    nombre=e["nombre"],
                    rfc=e["rfc"],
                    direccion=f"{random.choice(CALLES)} #{random.randint(100,999)}, {e['ciudad']}",
                    telefono=rand_tel(),
                    activo=True,
                    rango_inicio=inicio,
                    rango_fin=inicio + 999,
                )
                db.add(emp)
                db.flush()
                inicio += 1000
            empresas.append(emp)
        db.commit()
        print(f"  ✓ {len(empresas)} empresas listas")

        # ── Departamentos (10 por empresa) ────────────────────
        print("\n▶ Creando 10 departamentos por empresa (50 total)...")
        departamentos = []
        for emp in empresas:
            for nombre_dept in DEPARTAMENTOS_BASE:
                d = (db.query(Departamento)
                       .filter(Departamento.nombre == nombre_dept,
                               Departamento.empresa_id == emp.id)
                       .first())
                if not d:
                    d = Departamento(
                        nombre=nombre_dept,
                        empresa_id=emp.id,
                        activo=True,
                    )
                    db.add(d)
                    db.flush()
                departamentos.append(d)
        db.commit()
        print(f"  ✓ {len(departamentos)} departamentos listos")

        # ── Roles candidatos (excluir Administrador para empleados normales) ──
        roles_candidatos = [r for n, r in roles_map.items() if n != "Administrador"]

        # ── Empleados (200) ───────────────────────────────────
        ya_existentes = db.query(Empleado).filter(Empleado.username != 'admin').count()
        faltan = max(0, 200 - ya_existentes)
        print(f"\n▶ Creando empleados de prueba (ya existen {ya_existentes}, faltan {faltan})...")
        creados = 0
        # Contadores por empresa iniciando desde el máximo ya existente
        from sqlalchemy import func as sqlfunc
        contadores_empresa = {}
        for emp in empresas:
            max_num = db.query(sqlfunc.max(Empleado.numero_empleado)).filter(
                Empleado.empresa_id == emp.id
            ).scalar()
            if max_num and max_num.isdigit():
                contadores_empresa[emp.id] = int(max_num) + 1
            else:
                contadores_empresa[emp.id] = 1001

        for i in range(faltan):
            nombre = random.choice(NOMBRES)
            ap = random.choice(APELLIDOS)
            am = random.choice(APELLIDOS)
            empresa = random.choice(empresas)
            depts_empresa = [d for d in departamentos if d.empresa_id == empresa.id]
            dept = random.choice(depts_empresa)
            rol = random.choice(roles_candidatos)
            puesto = random.choice(puestos_list)
            estado = random.choices(
                [EstadoEmpleado.ACTIVO, EstadoEmpleado.INACTIVO, EstadoEmpleado.BAJA],
                weights=[80, 12, 8]
            )[0]

            # Número de empleado único dentro de la empresa
            numero = str(contadores_empresa[empresa.id])
            contadores_empresa[empresa.id] += 1
            username = f"{nombre.lower()[:3]}{ap.lower()[:4]}{numero[-4:]}"

            # Evitar duplicados de username/email
            existing = db.query(Empleado).filter(Empleado.username == username).first()
            if existing:
                username = f"{username}{random.randint(1,99)}"

            email = f"{username}@optiexpress.com"

            emp_obj = Empleado(
                numero_empleado=numero,
                nombre=nombre,
                apellido_paterno=ap,
                apellido_materno=am,
                email=email,
                telefono=rand_tel(),
                username=username,
                password_hash=get_password_hash("Empleado123!"),
                empresa_id=empresa.id,
                departamento_id=dept.id,
                puesto_id=puesto.id,
                rol_id=rol.id,
                curp=rand_curp(nombre, ap),
                nss=rand_nss(),
                direccion=f"{random.choice(CALLES)} #{random.randint(1, 500)}",
                colonia=f"Col. {random.choice(APELLIDOS)}",
                cp=str(random.randint(10000, 99999)),
                ciudad=random.choice(CIUDADES),
                fecha_nacimiento=rand_fecha_nacimiento(),
                fecha_ingreso=rand_fecha_ingreso(),
                estado=estado,
                fecha_baja=datetime.now() if estado == EstadoEmpleado.BAJA else None,
                contacto_emergencia=f"{random.choice(NOMBRES)} {random.choice(APELLIDOS)}",
                telefono_emergencia=rand_tel(),
            )
            db.add(emp_obj)
            creados += 1

            # Commit cada 50 para no saturar
            if creados % 50 == 0:
                db.commit()
                print(f"  … {creados}/200 empleados insertados")

        db.commit()
        print(f"  ✓ {creados} empleados creados")

        # ── Horarios de prueba ────────────────────────────────
        print("\n▶ Creando horarios de prueba...")
        from app.modules.asistencia.models import Horario
        horarios_prueba = [
            ("Turno Mañana",   "08:00", "16:00", "LMXJV", 10),
            ("Turno Tarde",    "14:00", "22:00", "LMXJV", 10),
            ("Turno Completo", "09:00", "18:00", "LMXJV", 15),
            ("Medio Tiempo",   "08:00", "13:00", "LMXJV",  5),
            ("Fin de Semana",  "09:00", "15:00", "SD",     10),
        ]
        horarios_db = []
        for nombre_h, entrada, salida, dias, tol in horarios_prueba:
            h = db.query(Horario).filter(Horario.nombre == nombre_h).first()
            if not h:
                h = Horario(
                    nombre=nombre_h,
                    hora_entrada=entrada,
                    hora_salida=salida,
                    dias_semana=dias,
                    tolerancia_minutos=tol,
                    activo=True,
                )
                db.add(h)
                db.flush()
            horarios_db.append(h)
        db.commit()
        print(f"  ✓ {len(horarios_db)} horarios disponibles")

        # ── Completar campos faltantes en empleados existentes ─
        print("\n▶ Completando datos faltantes en empleados existentes...")
        empleados_todos = db.query(Empleado).filter(Empleado.username != 'admin').all()

        # Empleados activos para asignar como jefes
        jefes_posibles = [e for e in empleados_todos
                          if e.estado == EstadoEmpleado.ACTIVO][:30]

        actualizados = 0
        for emp in empleados_todos:
            cambio = False

            if not emp.rfc:
                emp.rfc = rand_rfc(emp.nombre, emp.apellido_paterno or 'X', emp.apellido_materno or 'X')
                cambio = True
            if not emp.curp:
                emp.curp = rand_curp(emp.nombre, emp.apellido_paterno or 'X')
                cambio = True
            if not emp.nss:
                emp.nss = rand_nss()
                cambio = True
            if not emp.fecha_nacimiento:
                emp.fecha_nacimiento = rand_fecha_nacimiento()
                cambio = True
            if not emp.fecha_ingreso:
                emp.fecha_ingreso = rand_fecha_ingreso()
                cambio = True
            if not emp.direccion:
                emp.direccion = f"{random.choice(CALLES)} #{random.randint(1, 500)}"
                cambio = True
            if not emp.colonia:
                emp.colonia = f"Col. {random.choice(APELLIDOS)}"
                cambio = True
            if not emp.cp:
                emp.cp = str(random.randint(10000, 99999))
                cambio = True
            if not emp.ciudad:
                emp.ciudad = random.choice(CIUDADES)
                cambio = True
            if not emp.contacto_emergencia:
                emp.contacto_emergencia = f"{random.choice(NOMBRES)} {random.choice(APELLIDOS)}"
                cambio = True
            if not emp.telefono_emergencia:
                emp.telefono_emergencia = rand_tel()
                cambio = True
            if not emp.telefono:
                emp.telefono = rand_tel()
                cambio = True
            if not emp.horario_sabado_id and horarios_db:
                # 40% tienen horario sabatino
                if random.random() < 0.4:
                    emp.horario_sabado_id = random.choice(horarios_db).id
                    cambio = True
            if not emp.jefe_id and jefes_posibles:
                # 70% tienen jefe asignado
                if random.random() < 0.7:
                    candidatos = [j for j in jefes_posibles if j.id != emp.id]
                    if candidatos:
                        emp.jefe_id = random.choice(candidatos).id
                        cambio = True

            if cambio:
                actualizados += 1

        db.commit()
        print(f"  ✓ {actualizados} empleados actualizados con datos completos")

        # ── Resumen ───────────────────────────────────────────
        print("\n" + "━" * 55)
        print("  ✓ Seeding completado exitosamente")
        print("━" * 55)
        total_emp = db.query(Empleado).count()
        total_dept = db.query(Departamento).count()
        total_emp_db = db.query(Empresa).count()
        print(f"\n  Empresas    : {total_emp_db}")
        print(f"  Departamentos: {total_dept}")
        print(f"  Empleados   : {total_emp} (total en BD)")
        print(f"\n  Contraseña de empleados de prueba: Empleado123!")
        print()

    except Exception as e:
        db.rollback()
        print(f"\n✗ Error: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
