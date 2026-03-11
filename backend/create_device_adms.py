#!/usr/bin/env python3
"""
Registra un dispositivo para el agente local.
Uso: python create_device_adms.py "NOMBRE"
Ej: python create_device_adms.py "Oficina Principal"
"""
import sys
from app.core.database import SessionLocal
from app.modules.asistencia import models
from app.modules.asistencia.biometric.agent_auth import generate_api_key

def main():
    if len(sys.argv) < 2:
        print("Uso: python create_device_adms.py \"Nombre\"")
        print("Ej: python create_device_adms.py \"Oficina Principal\"")
        sys.exit(1)

    nombre = sys.argv[1].strip()

    db = SessionLocal()
    try:
        api_key = generate_api_key()
        dispositivo = models.Dispositivo(
            nombre=nombre,
            api_key=api_key,
            activo=True
        )
        db.add(dispositivo)
        db.commit()
        db.refresh(dispositivo)

        print("Dispositivo registrado para agente:")
        print(f"  ID: {dispositivo.id}")
        print(f"  Nombre: {dispositivo.nombre}")
        print(f"  API Key: {dispositivo.api_key}")
        print()
        print("Configura en config.yaml del agente local con esta API Key.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
