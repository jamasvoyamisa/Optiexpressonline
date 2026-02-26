#!/usr/bin/env python3
"""
Registra un dispositivo ZKTeco para push ADMS.
Uso: python create_device_adms.py "NOMBRE" "SERIAL_NUMBER"
Ej: python create_device_adms.py "Oficina Principal" "DGD919000012345"
"""
import sys
from app.core.database import SessionLocal
from app.modules.asistencia import models
from app.modules.asistencia.biometric.agent_auth import generate_api_key

def main():
    if len(sys.argv) < 3:
        print("Uso: python create_device_adms.py \"Nombre\" \"SerialNumber\"")
        print("Ej: python create_device_adms.py \"Oficina Principal\" \"DGD919000012345\"")
        sys.exit(1)

    nombre = sys.argv[1]
    serial_number = sys.argv[2].strip()

    db = SessionLocal()
    try:
        existing = db.query(models.Dispositivo).filter(
            models.Dispositivo.serial_number == serial_number
        ).first()
        if existing:
            print(f"Ya existe dispositivo con SN {serial_number}: {existing.nombre}")
            print(f"API Key: {existing.api_key}")
            return

        api_key = generate_api_key()
        dispositivo = models.Dispositivo(
            nombre=nombre,
            serial_number=serial_number,
            api_key=api_key,
            activo=True
        )
        db.add(dispositivo)
        db.commit()
        db.refresh(dispositivo)

        print("Dispositivo ADMS registrado:")
        print(f"  ID: {dispositivo.id}")
        print(f"  Nombre: {dispositivo.nombre}")
        print(f"  SN: {dispositivo.serial_number}")
        print(f"  API Key: {dispositivo.api_key}")
        print()
        print("Configura en el MB160:")
        print(f"  COMM → Cloud Server → Server Address: TU_IP, Puerto: 9081")
        print(f"  (El dispositivo usará /iclock/getrequest y /iclock/cdata)")
    finally:
        db.close()

if __name__ == "__main__":
    main()
