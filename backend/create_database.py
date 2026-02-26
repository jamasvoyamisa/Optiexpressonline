#!/usr/bin/env python3
"""
Script para crear la base de datos MySQL
"""
import pymysql
import sys
import os

# Configuración
import os
DB_HOST = "localhost"
DB_USER = "root"
DB_PASSWORD = os.getenv("MYSQL_ROOT_PASSWORD", "")  # Puedes usar variable de entorno o pasar como argumento
DB_NAME = "optiexpress_online"  # Cambiado para evitar conflictos con otros proyectos
DB_USER_APP = "optiexpress_user"
DB_PASSWORD_APP = "optiexpress_password"

# Si se pasa como argumento
if len(sys.argv) > 1:
    DB_PASSWORD = sys.argv[1]

try:
    # Conectar como root para crear la base de datos
    print("Conectando a MySQL...")
    connection = pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
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
            cursor.execute(f"CREATE USER IF NOT EXISTS '{DB_USER_APP}'@'localhost' IDENTIFIED BY '{DB_PASSWORD_APP}'")
            print(f"✓ Usuario '{DB_USER_APP}' creado")
        except Exception as e:
            if "already exists" in str(e).lower():
                print(f"✓ Usuario '{DB_USER_APP}' ya existe")
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
            sys.exit(1)
    
    connection.close()
    print("\n✓ Base de datos configurada correctamente")
    print(f"\nPuedes conectarte con:")
    print(f"  Usuario: {DB_USER_APP}")
    print(f"  Contraseña: {DB_PASSWORD_APP}")
    print(f"  Base de datos: {DB_NAME}")
    
except pymysql.Error as e:
    print(f"✗ Error de MySQL: {e}")
    print("\nSi tienes contraseña en root, edita este script y agrega:")
    print("  DB_PASSWORD = 'tu_contraseña'")
    sys.exit(1)
except Exception as e:
    print(f"✗ Error: {e}")
    sys.exit(1)
