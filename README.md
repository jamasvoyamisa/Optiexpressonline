# Sistema de Gestión Interna Modular - Optiexpress

Sistema modular de gestión interna con backend FastAPI y frontend React+TypeScript.

## Requisitos

- Python 3.8+
- Node.js 18+
- MySQL 8.0+ (instalado localmente o en servidor remoto)

## Configuración del Backend

1. Crear archivo `.env` en `backend/` basado en `.env.example`:

```bash
cd backend
cp .env.example .env
```

2. Editar `.env` con tus credenciales de MySQL:

```env
DATABASE_URL=mysql+pymysql://usuario:password@localhost:3306/optiexpress_online
```

3. Instalar dependencias:

```bash
pip install -r requirements.txt
```

4. Ejecutar migraciones (cuando estén creadas):

```bash
alembic upgrade head
```

5. Iniciar servidor:

```bash
uvicorn app.main:app --reload
```

## Configuración del Frontend

1. Instalar dependencias:

```bash
cd frontend
npm install
```

2. Iniciar servidor de desarrollo:

```bash
npm run dev
```

## Agente Local

Ver documentación en `agent-local/README.md`
