#!/usr/bin/env python3
"""Script para crear un usuario de prueba (solo desarrollo local, no usar en producción)."""
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.modules.personal.models import Empleado, Rol
from app.core.security import get_password_hash

def create_test_user():
    db: Session = SessionLocal()
    try:
        # Crear rol de administrador si no existe
        admin_rol = db.query(Rol).filter(Rol.nombre == "Administrador").first()
        if not admin_rol:
            admin_rol = Rol(nombre="Administrador", descripcion="Rol de administrador del sistema")
            db.add(admin_rol)
            db.commit()
            db.refresh(admin_rol)
        
        # Crear usuario de prueba si no existe
        test_user = db.query(Empleado).filter(Empleado.email == "admin@test.com").first()
        if not test_user:
            test_user = Empleado(
                numero_empleado="ADMIN001",
                nombre="Administrador",
                apellido_paterno="Sistema",
                email="admin@test.com",
                password_hash=get_password_hash("admin123"),
                rol_id=admin_rol.id
            )
            db.add(test_user)
            db.commit()
            print("✓ Usuario de prueba creado:")
            print("  Email: admin@test.com")
            print("  Contraseña: admin123")
        else:
            # Actualizar contraseña si ya existe
            test_user.password_hash = get_password_hash("admin123")
            db.commit()
            print("✓ Usuario de prueba actualizado:")
            print("  Email: admin@test.com")
            print("  Contraseña: admin123")
    except Exception as e:
        print(f"✗ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_test_user()
