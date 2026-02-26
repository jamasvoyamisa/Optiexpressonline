#!/usr/bin/env python3
"""
Script para listar todas las bases de datos existentes en MySQL
"""
import pymysql
import sys
import getpass

def list_databases(root_password=None):
    """Lista todas las bases de datos"""
    if root_password is None:
        print("Necesitas la contraseña de MySQL root para listar las bases de datos.")
        root_password = getpass.getpass("Contraseña de MySQL root (Enter si no tiene): ")
        if not root_password:
            root_password = ""
    
    try:
        # Conectar como root
        print("\nConectando a MySQL...")
        connection = pymysql.connect(
            host="localhost",
            user="root",
            password=root_password,
            charset='utf8mb4'
        )
        
        with connection.cursor() as cursor:
            # Listar todas las bases de datos
            cursor.execute("SHOW DATABASES")
            databases = cursor.fetchall()
            
            print("\n" + "="*60)
            print("BASES DE DATOS EXISTENTES EN MYSQL:")
            print("="*60)
            
            db_names = []
            for db in databases:
                db_name = db[0]
                # Omitir bases de datos del sistema
                if db_name not in ['information_schema', 'performance_schema', 'mysql', 'sys']:
                    db_names.append(db_name)
                    print(f"  • {db_name}")
            
            if not db_names:
                print("  (No hay bases de datos de usuario)")
            
            print("="*60)
            
            # Verificar si optiexpress_online ya existe
            if 'optiexpress_online' in db_names:
                print("\n⚠️  ADVERTENCIA: La base de datos 'optiexpress_online' ya existe!")
            else:
                print("\n✓ La base de datos 'optiexpress_online' no existe aún.")
                print("  Se puede crear sin conflictos.")
            
            # Verificar si hay otras bases de datos optiexpress
            optiexpress_dbs = [db for db in db_names if 'optiexpress' in db.lower()]
            if optiexpress_dbs:
                print("\n📋 Bases de datos relacionadas con 'optiexpress' encontradas:")
                for db in optiexpress_dbs:
                    print(f"  • {db}")
        
        connection.close()
        return db_names
        
    except pymysql.Error as e:
        print(f"\n✗ Error de MySQL: {e}")
        if "Access denied" in str(e):
            print("\nLa contraseña es incorrecta o el usuario root no tiene permisos.")
        return None
    except Exception as e:
        print(f"\n✗ Error: {e}")
        return None

if __name__ == "__main__":
    password = None
    if len(sys.argv) > 1:
        password = sys.argv[1]
    
    list_databases(password)
