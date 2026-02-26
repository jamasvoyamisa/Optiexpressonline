#!/usr/bin/env python3
"""Script para registrar el dispositivo físico en el sistema"""
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.modules.asistencia import models
from app.modules.asistencia.biometric.agent_auth import generate_api_key

def register_device():
    db: Session = SessionLocal()
    try:
        # Datos del dispositivo físico
        device_ip = "192.168.2.215"
        device_name = "ZKTeco MB160 Oficina Principal"
        device_location = "Oficina Principal"
        
        # Verificar si ya existe un dispositivo con esta IP
        existing = db.query(models.Dispositivo).filter(
            models.Dispositivo.ip_local == device_ip
        ).first()
        
        if existing:
            print("="*60)
            print("DISPOSITIVO YA REGISTRADO")
            print("="*60)
            print(f"\nNombre: {existing.nombre}")
            print(f"IP: {existing.ip_local}")
            print(f"Ubicación: {existing.ubicacion or 'No especificada'}")
            print(f"Estado: {'Activo' if existing.activo else 'Inactivo'}")
            print(f"\n{'='*60}")
            print("TU API KEY:")
            print("="*60)
            print(f"\n{existing.api_key}\n")
            print("="*60)
            print("\nEste dispositivo ya está registrado en el sistema.")
            print("Usa esta API Key en tu agente local.")
            print("="*60)
        else:
            # Crear nuevo dispositivo
            api_key = generate_api_key()
            dispositivo = models.Dispositivo(
                nombre=device_name,
                ip_local=device_ip,
                ubicacion=device_location,
                api_key=api_key,
                activo=True
            )
            db.add(dispositivo)
            db.commit()
            db.refresh(dispositivo)
            
            print("="*60)
            print("DISPOSITIVO REGISTRADO EXITOSAMENTE")
            print("="*60)
            print(f"\nNombre: {dispositivo.nombre}")
            print(f"IP: {dispositivo.ip_local}")
            print(f"Ubicación: {dispositivo.ubicacion}")
            print(f"Estado: Activo")
            print(f"\n{'='*60}")
            print("TU API KEY:")
            print("="*60)
            print(f"\n{dispositivo.api_key}\n")
            print("="*60)
            print("\n⚠️  IMPORTANTE:")
            print("   Copia esta API Key y actualiza tu config.yaml:")
            print(f"   api_key: {dispositivo.api_key}")
            print("="*60)
            print("\nEl dispositivo ya está listo para recibir checadas.")
            print("="*60)
        
    except Exception as e:
        print(f"✗ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    register_device()
