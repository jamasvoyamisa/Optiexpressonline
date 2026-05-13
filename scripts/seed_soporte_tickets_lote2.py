#!/usr/bin/env python3
"""
Segundo lote de tickets TI para demo local: ~60% abiertos/en proceso, más prioridad alta/crítica.

Solo ejecutar con DATABASE_URL apuntando a localhost/127.0.0.1.
"""
from __future__ import annotations

import os
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
load_dotenv(BACKEND / ".env")

CANTIDAD = 100
# 30% abierto, 30% en_proceso, 22% resuelto, 18% cerrado → 60% activos
ESTADOS_PESO = (
    ["abierto"] * 30
    + ["en_proceso"] * 30
    + ["resuelto"] * 22
    + ["cerrado"] * 18
)
# Sesgo hacia urgencia: pocos bajos/medios, muchos alta/crítica
PRIORIDAD_PESO = (
    ["baja"] * 8
    + ["media"] * 17
    + ["alta"] * 40
    + ["critica"] * 35
)

TEMPLATES = [
    ("VPN caída en sucursal", "No podemos entrar al ERP desde la VPN; error de túnel."),
    ("Impresora fiscal no responde", "La caja no imprime ticket; reinicio no corrige."),
    ("Outlook sincronización lenta", "Bandeja tarda más de 10 min en actualizar."),
    ("Acceso a carpeta compartida", "Usuario reporta acceso denegado en \\servidor\\ventas."),
    ("Actualización de antivirus pendiente", "Endpoints con definiciones desactualizadas."),
    ("WiFi área almacén inestable", "Cortes intermitentes cerca del rack."),
    ("Licencia Office por expirar", "Aviso de activación en 3 equipos de contabilidad."),
    ("Backup nocturno falló", "Job reportó error en volumen D: del NAS."),
    ("Monitor sin señal", "HDMI verificado; posible fallo de cable o puerto."),
    ("Teléfono IP sin registro", "Extensión no registra en PBX tras cambio de VLAN."),
    ("Portal checador lento", "Tarda en cargar en hora pico; solo móvil."),
    ("Error 500 en reporte RH", "Al exportar nómina mensual desde intranet."),
    ("Teclado numérico no funciona", "Bloq Num activo; hardware sospechoso."),
    ("Solicitud nuevo usuario AD", "Alta para temporal de 2 meses en logística."),
    ("Firewall bloquea actualización", "Windows Update no completa desde ayer."),
]


def _require_local_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL no definido en backend/.env")
    allowed = ("@localhost:", "@127.0.0.1:")
    if not any(x in url for x in allowed):
        raise RuntimeError("Abortado: solo BD local (localhost/127.0.0.1).")
    return url


def main() -> None:
    _require_local_database_url()
    random.seed(20260327)

    import app.main  # noqa: F401

    from app.core.database import SessionLocal
    from app.modules.personal import models as pm
    from app.modules.soporte import models as sm
    from app.modules.soporte.service import SoporteService

    db = SessionLocal()
    try:
        empleados = (
            db.query(pm.Empleado)
            .filter(pm.Empleado.empresa_id.isnot(None))
            .order_by(pm.Empleado.id)
            .all()
        )
        if not empleados:
            raise RuntimeError("No hay empleados con empresa; ejecuta antes seed_local_demo_data.")

        tipos = db.query(sm.SoporteTicketTipo).filter(sm.SoporteTicketTipo.activo.is_(True)).all()
        tipo_ids = [t.id for t in tipos] if tipos else [None]

        ahora = datetime.now(timezone.utc)
        creados = 0
        por_estado: dict[str, int] = {}
        por_prioridad: dict[str, int] = {}

        for i in range(CANTIDAD):
            emp = random.choice(empleados)
            empresa = db.query(pm.Empresa).filter(pm.Empresa.id == emp.empresa_id).first()
            depto = None
            if emp.departamento_id:
                depto = db.query(pm.Departamento).filter(pm.Departamento.id == emp.departamento_id).first()

            estado_str = random.choice(ESTADOS_PESO)
            prioridad_str = random.choice(PRIORIDAD_PESO)
            estado = sm.TicketEstado(estado_str)
            prioridad = sm.TicketPrioridad(prioridad_str)

            titulo_base, desc_base = random.choice(TEMPLATES)
            titulo = f"{titulo_base} (lote2 #{i + 1})"
            descripcion = f"{desc_base}\n\nRef. interna demo lote operación."

            # Fechas: últimos 45 días, más recientes para abiertos/en_proceso
            if estado in (sm.TicketEstado.ABIERTO, sm.TicketEstado.EN_PROCESO):
                dias_atras = random.randint(0, 14)
            else:
                dias_atras = random.randint(10, 45)
            created = ahora - timedelta(days=dias_atras, hours=random.randint(0, 23))

            folio = SoporteService._next_folio(db)
            tipo_id = random.choice(tipo_ids)

            otros = [e for e in empleados if e.id != emp.id]
            asignado = random.choice(otros) if otros and random.random() < 0.55 else None

            nombre_completo = f"{emp.nombre} {emp.apellido_paterno or ''} {emp.apellido_materno or ''}".strip()
            ticket = sm.SoporteTicket(
                folio=folio,
                origen=random.choice(["portal", "portal", "interno"]),
                estado=estado,
                prioridad=prioridad,
                titulo=titulo[:180],
                descripcion=descripcion,
                nombre_solicitante=(nombre_completo or emp.nombre or f"Empleado {emp.id}")[:180],
                email_solicitante=(emp.email or "").strip() or None,
                telefono_solicitante=(getattr(emp, "telefono", None) or "")[:30] or None,
                empresa_nombre=(empresa.nombre if empresa else None),
                departamento_nombre=(depto.nombre if depto else None),
                tipo_ticket_id=tipo_id,
                empleado_id=emp.id,
                asignado_a_id=asignado.id if asignado else None,
                nota_resolucion=None,
                created_at=created,
            )

            if estado in (sm.TicketEstado.RESUELTO, sm.TicketEstado.CERRADO):
                cierre_delta = timedelta(
                    hours=random.randint(2, 96 if estado == sm.TicketEstado.RESUELTO else 120)
                )
                closed = created + cierre_delta
                if closed > ahora:
                    closed = ahora - timedelta(hours=1)
                ticket.closed_at = closed
                ticket.nota_resolucion = (
                    "Cierre demo: verificado con usuario / aplicado parche / reemplazo hardware."
                    if estado == sm.TicketEstado.CERRADO
                    else "Marcado resuelto: workaround o fix desplegado; pendiente confirmación."
                )

            db.add(ticket)
            db.commit()
            creados += 1
            por_estado[estado_str] = por_estado.get(estado_str, 0) + 1
            por_prioridad[prioridad_str] = por_prioridad.get(prioridad_str, 0) + 1

        from sqlalchemy import func

        total_bd = db.query(func.count(sm.SoporteTicket.id)).scalar() or 0
        print(f"Insertados {creados} tickets (lote2). Total tickets en BD: {total_bd}.")
        print("Este lote — por estado:", dict(sorted(por_estado.items())))
        print("Este lote — por prioridad:", dict(sorted(por_prioridad.items())))
    finally:
        db.close()


if __name__ == "__main__":
    main()
