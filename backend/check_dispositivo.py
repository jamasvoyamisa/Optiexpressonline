#!/usr/bin/env python3
"""
Script para revisar datos de dispositivos en la BD.
Uso: python check_dispositivo.py [nombre_filtro]
Ej: python check_dispositivo.py M2-LR
    python check_dispositivo.py   (lista todos)
"""
import sys
from app.core.database import SessionLocal
from app.modules.asistencia import models


def main():
    filtro = (sys.argv[1].strip() if len(sys.argv) > 1 else "").lower()

    db = SessionLocal()
    try:
        q = db.query(models.Dispositivo).order_by(models.Dispositivo.id)
        dispositivos = q.all()

        if filtro:
            dispositivos = [d for d in dispositivos if filtro in (d.nombre or "").lower() or filtro in (d.serial_number or "").lower()]

        if not dispositivos:
            print("No se encontraron dispositivos" + (f" con '{filtro}'" if filtro else ""))
            return

        print("=" * 80)
        print("DISPOSITIVOS EN LA BASE DE DATOS")
        print("=" * 80)

        for d in dispositivos:
            print(f"\n--- {d.nombre} (ID: {d.id}) ---")
            print(f"  activo:           {d.activo}")
            print(f"  ip_local:         {d.ip_local or '(vacío)'}")
            print(f"  serial_number:    {d.serial_number or '(vacío)'}")
            print(f"  api_key:          {d.api_key[:20]}...{d.api_key[-8:] if d.api_key and len(d.api_key) > 30 else d.api_key}")
            print(f"  ultima_sync_agente: {d.ultima_sync_agente or 'nunca'}")
            print(f"  ultima_ip_conexion: {d.ultima_ip_conexion or '-'}")

            # Diagnóstico
            problemas = []
            if not d.activo:
                problemas.append("Dispositivo INACTIVO - el agente lo ignora")
            if not d.ip_local or not d.ip_local.strip():
                problemas.append("ip_local vacía - necesitas la IP para config.yaml")
            if not d.api_key:
                problemas.append("Sin API Key")
            if problemas:
                print("  ⚠️  Posibles problemas:")
                for p in problemas:
                    print(f"      - {p}")
            else:
                print("  ✓ Datos básicos OK (verifica que config.yaml tenga ip y api_key correctos)")

        print("\n" + "=" * 80)
        print("PARA QUE EL AGENTE CONECTE:")
        print("  1. config.yaml debe tener: name, ip (del checador), port: 4370, api_key (de arriba)")
        print("  2. La PC del agente y el checador deben estar en la misma red")
        print("  3. Probar: ping <ip_del_checador>")
        print("=" * 80)

    finally:
        db.close()


if __name__ == "__main__":
    main()
