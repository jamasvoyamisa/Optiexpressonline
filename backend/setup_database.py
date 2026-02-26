#!/usr/bin/env python3
"""
Script interactivo para crear la base de datos MySQL
"""
import pymysql
import sys
import getpass

# Configuración
DB_HOST = "localhost"
DB_NAME = "optiexpress_online"  # Cambiado para evitar conflictos con otros proyectos
DB_USER_APP = "optiexpress_user"
DB_PASSWORD_APP = "optiexpress_password"

def create_database(root_password=None):
    """Crea la base de datos y usuario"""
    if root_password is None:
        print("Necesitas la contraseña de MySQL root para crear la base de datos.")
        root_password = getpass.getpass("Contraseña de MySQL root (Enter si no tiene): ")
        if not root_password:
            root_password = ""
    
    try:
        # Conectar como root
        print("\nConectando a MySQL...")
        connection = pymysql.connect(
            host=DB_HOST,
            user="root",
            password=root_password,
            charset='utf8mb4'
        )
        
        with connection.cursor() as cursor:
            # Crear base de datos
            print(f"Creando base de datos '{DB_NAME}'...")
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            print(f"✓ Base de datos '{DB_NAME}' creada")
            
            # Crear usuario
            print(f"Creando usuario '{DB_USER_APP}'...")
            try:
                cursor.execute(f"DROP USER IF EXISTS '{DB_USER_APP}'@'localhost'")
                cursor.execute(f"CREATE USER '{DB_USER_APP}'@'localhost' IDENTIFIED BY '{DB_PASSWORD_APP}'")
                print(f"✓ Usuario '{DB_USER_APP}' creado")
            except Exception as e:
                if "already exists" in str(e).lower() or "1396" in str(e):
                    print(f"✓ Usuario '{DB_USER_APP}' ya existe, actualizando contraseña...")
                    cursor.execute(f"ALTER USER '{DB_USER_APP}'@'localhost' IDENTIFIED BY '{DB_PASSWORD_APP}'")
                else:
                    raise
            
            # Otorgar privilegios
            print(f"Otorgando privilegios...")
            cursor.execute(f"GRANT ALL PRIVILEGES ON {DB_NAME}.* TO '{DB_USER_APP}'@'localhost'")
            cursor.execute("FLUSH PRIVILEGES")
            print("✓ Privilegios otorgados")
            
            # Verificar
            cursor.execute(f"SHOW DATABASES LIKE '{DB_NAME}'")
            result = cursor.fetchone()
            if result:
                print(f"✓ Base de datos '{DB_NAME}' verificada")
            else:
                print(f"✗ Error: Base de datos no encontrada")
                return False
        
        connection.close()
        print("\n" + "="*50)
        print("✓ Base de datos configurada correctamente")
        print("="*50)
        print(f"\nCredenciales de conexión:")
        print(f"  Host: {DB_HOST}")
        print(f"  Usuario: {DB_USER_APP}")
        print(f"  Contraseña: {DB_PASSWORD_APP}")
        print(f"  Base de datos: {DB_NAME}")
        print(f"\nURL de conexión:")
        print(f"  mysql+pymysql://{DB_USER_APP}:{DB_PASSWORD_APP}@{DB_HOST}:3306/{DB_NAME}")
        return True
        
    except pymysql.Error as e:
        print(f"\n✗ Error de MySQL: {e}")
        if "Access denied" in str(e):
            print("\nLa contraseña es incorrecta o el usuario root no tiene permisos.")
            print("Intenta ejecutar el script nuevamente con la contraseña correcta.")
        return False
    except Exception as e:
        print(f"\n✗ Error: {e}")
        return False

if __name__ == "__main__":
    password = None
    if len(sys.argv) > 1:
        password = sys.argv[1]
    
    success = create_database(password)
    sys.exit(0 if success else 1)
