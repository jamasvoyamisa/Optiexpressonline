from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# pymysql: evita esperas indefinidas si MySQL no responde al abrir conexión
_connect_args = {}
if "+pymysql" in settings.DATABASE_URL:
    _connect_args["connect_timeout"] = 10

# Pool ampliado: en la mañana varios agentes sincronizan a la vez (device-sync + portal).
# Default SQLAlchemy (5 + overflow 10) saturaba y provocaba timeouts 499 en agentes.
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_timeout=30,
    pool_size=10,
    max_overflow=20,
    connect_args=_connect_args,
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency para obtener sesión de base de datos"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
