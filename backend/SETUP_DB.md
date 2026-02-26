# Configuración de Base de Datos MySQL

## Opción 1: Script Automático (Recomendado)

Ejecuta el script con tu contraseña de MySQL root:

```bash
cd backend
python3 setup_database.py [tu_contraseña_root]
```

Si no tienes contraseña en root, ejecuta:
```bash
python3 setup_database.py ""
```

## Opción 2: Manualmente en MySQL

Conéctate a MySQL:
```bash
mysql -u root -p
```

Luego ejecuta:
```sql
CREATE DATABASE optiexpress_online CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'optiexpress_user'@'localhost' IDENTIFIED BY 'optiexpress_password';
GRANT ALL PRIVILEGES ON optiexpress.* TO 'optiexpress_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## Después de crear la base de datos

Una vez creada la base de datos, ejecuta las migraciones:

```bash
cd backend
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head
```

Esto creará todas las tablas necesarias para el sistema.
