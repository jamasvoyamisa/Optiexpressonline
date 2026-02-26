#!/usr/bin/env python3
"""Script para crear un dispositivo de prueba y obtener su API Key"""
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.modules.asistencia import models
from app.modules.asistencia.biometric.agent_auth import generate_api_key

def create_test_device():
    db: Session = SessionLocal()
    try:
        # Verificar si ya existe un dispositivo de prueba
        existing = db.query(models.Dispositivo).filter(
            models.Dispositivo.nombre == "Dispositivo de Prueba"
        ).first()
        
        if existing:
            print("="*60)
            print("DISPOSITIVO DE PRUEBA YA EXISTE")
            print("="*60)
            print(f"\nNombre: {existing.nombre}")
            print(f"Ubicación: {existing.ubicacion or 'No especificada'}")
            print(f"IP Local: {existing.ip_local or 'No especificada'}")
            print(f"Estado: {'Activo' if existing.activo else 'Inactivo'}")
            print(f"\n{'='*60}")
            print("TU API KEY:")
            print("="*60)
            print(f"\n{existing.api_key}\n")
            print("="*60)
            print("\nCopia esta API Key y úsala en tu agente local")
            print("="*60)
        else:
            # Crear nuevo dispositivo
            api_key = generate_api_key()
            dispositivo = models.Dispositivo(
                nombre="Dispositivo de Prueba",
                ubicacion="Oficina Principal",
                ip_local="192.168.1.100",
                api_key=api_key,
                activo=True
            )
            db.add(dispositivo)
            db.commit()
            db.refresh(dispositivo)
            
            print("="*60)
            print("DISPOSITIVO DE PRUEBA CREADO")
            print("="*60)
            print(f"\nNombre: {dispositivo.nombre}")
            print(f"Ubicación: {dispositivo.ubicacion}")
            print(f"IP Local: {dispositivo.ip_local}")
            print(f"Estado: Activo")
            print(f"\n{'='*60}")
            print("TU API KEY:")
            print("="*60)
            print(f"\n{dispositivo.api_key}\n")
            print("="*60)
            print("\nCopia esta API Key y úsala en tu agente local")
            print("="*60)
            print("\nEjemplo de uso en el agente local:")
            print(f"  API_KEY={dispositivo.api_key}")
            print("="*60)
        
    except Exception as e:
        print(f"✗ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_test_device()
