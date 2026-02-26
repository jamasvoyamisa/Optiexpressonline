#!/usr/bin/env python3
"""Script para crear checadas de prueba"""
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.modules.asistencia import models
from app.modules.personal import models as personal_models
from datetime import datetime, timedelta
import random

def create_test_checadas():
    db: Session = SessionLocal()
    try:
        # Obtener empleados
        empleados = db.query(personal_models.Empleado).all()
        if not empleados:
            print("⚠️  No hay empleados en el sistema. Crea empleados primero.")
            return
        
        # Obtener dispositivos
        dispositivos = db.query(models.Dispositivo).all()
        if not dispositivos:
            print("⚠️  No hay dispositivos registrados. Registra un dispositivo primero.")
            return
        
        dispositivo = dispositivos[0]  # Usar el primer dispositivo
        
        # Crear checadas de prueba para los últimos 7 días
        checadas_creadas = 0
        hoy = datetime.now()
        
        for dia in range(7):
            fecha = hoy - timedelta(days=dia)
            
            # Para cada empleado, crear entrada y salida
            for empleado in empleados:
                # Hora de entrada aleatoria entre 7:00 y 9:00
                hora_entrada = random.randint(7, 9)
                minuto_entrada = random.randint(0, 59)
                timestamp_entrada = fecha.replace(hour=hora_entrada, minute=minuto_entrada, second=0)
                
                # Hora de salida aleatoria entre 17:00 y 19:00
                hora_salida = random.randint(17, 19)
                minuto_salida = random.randint(0, 59)
                timestamp_salida = fecha.replace(hour=hora_salida, minute=minuto_salida, second=0)
                
                # Crear checada de entrada
                entrada = models.Asistencia(
                    empleado_id=empleado.id,
                    dispositivo_id=dispositivo.id,
                    timestamp=timestamp_entrada,
                    tipo=models.TipoChecada.ENTRADA,
                    sincronizado=True
                )
                db.add(entrada)
                checadas_creadas += 1
                
                # Crear checada de salida
                salida = models.Asistencia(
                    empleado_id=empleado.id,
                    dispositivo_id=dispositivo.id,
                    timestamp=timestamp_salida,
                    tipo=models.TipoChecada.SALIDA,
                    sincronizado=True
                )
                db.add(salida)
                checadas_creadas += 1
        
        db.commit()
        
        print("="*60)
        print("CHECADAS DE PRUEBA CREADAS")
        print("="*60)
        print(f"\n✓ Total de checadas creadas: {checadas_creadas}")
        print(f"✓ Empleados: {len(empleados)}")
        print(f"✓ Dispositivo: {dispositivo.nombre}")
        print(f"✓ Período: Últimos 7 días")
        print("\n" + "="*60)
        print("Ahora puedes ver los datos en:")
        print("http://localhost:3000/asistencia")
        print("="*60)
        
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_test_checadas()
