"""
Pruebas del módulo de asistencia - dispositivos, getrequest, etc.
"""
import pytest
from fastapi.testclient import TestClient

# Importar modelos para que Base tenga todas las tablas
from app.modules.asistencia import models  # noqa: F401
from app.modules.personal import models as personal_models  # noqa: F401

from app.main import app
from app.core.database import Base, get_db
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_server_url():
    """GET /api/v1/asistencia/server-url retorna la URL del servidor"""
    response = client.get("/api/v1/asistencia/server-url")
    assert response.status_code == 200
    data = response.json()
    assert "url" in data
    assert "getrequest" in data
    assert "iclock" in data["getrequest"]


def test_getrequest_sin_sn():
    """GET /iclock/getrequest sin SN retorna OK"""
    response = client.get("/iclock/getrequest")
    assert response.status_code == 200
    assert response.text == "OK"


def test_getrequest_sn_no_registrado():
    """GET /iclock/getrequest con SN no registrado retorna OK (no rompe)"""
    response = client.get("/iclock/getrequest?SN=NOEXISTE123")
    assert response.status_code == 200
    assert response.text == "OK"


def test_health():
    """GET /health retorna healthy"""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
