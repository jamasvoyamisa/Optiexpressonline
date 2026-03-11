from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.modules.personal import models as pm
from . import schemas, service

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/portal", tags=["Portal Checadas Remotas"])


@router.get("/empresas")
def listar_empresas_checadas_remotas(db: Session = Depends(get_db)):
    """Lista empresas que tienen habilitadas las checadas remotas (público, sin auth)."""
    empresas = db.query(pm.Empresa).filter(
        pm.Empresa.activo == True,
        pm.Empresa.checadas_remotas == True,
    ).order_by(pm.Empresa.nombre).all()
    return [{"id": e.id, "nombre": e.nombre} for e in empresas]


@router.post("/checadas", response_model=schemas.ChecadaRemotaResponse)
def registrar_checada(data: schemas.ChecadaRemotaRequest, db: Session = Depends(get_db)):
    """Registra una checada remota. Autentica con empresa + número de empleado + contraseña de la app."""
    return service.registrar_checada_remota(
        db,
        empresa_id=data.empresa_id,
        numero_empleado=data.numero_empleado,
        password=data.password,
    )
