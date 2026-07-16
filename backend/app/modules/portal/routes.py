from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.modules.personal import models as pm
from . import schemas, service

from pathlib import Path
from fastapi.responses import FileResponse

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/portal", tags=["Portal Asistencia Remota"])

ALLOWED_CHECADOR_BG_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def _checador_bg_dirs() -> list[Path]:
    dirs: list[Path] = []
    configured = Path(settings.CHECADOR_PORTAL_BG_DIR).resolve()
    dirs.append(configured)
    # Fallback local (desarrollo)
    repo_front_assets = Path(__file__).resolve().parents[4] / "frontend" / "src" / "assets" / "checador"
    dirs.append(repo_front_assets.resolve())
    return dirs


@router.get("/backgrounds")
def listar_backgrounds_checador():
    urls: list[str] = []
    for d in _checador_bg_dirs():
        if not d.exists() or not d.is_dir():
            continue
        for p in sorted(d.iterdir()):
            if p.is_file() and p.suffix.lower() in ALLOWED_CHECADOR_BG_EXT:
                urls.append(f"{settings.API_V1_PREFIX}/portal/background/{p.name}")
        if urls:
            break
    return {"items": urls}


@router.get("/background/{filename}", include_in_schema=False)
def background_checador_file(filename: str):
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido.")
    if Path(safe_name).suffix.lower() not in ALLOWED_CHECADOR_BG_EXT:
        raise HTTPException(status_code=400, detail="Tipo de imagen inválido.")

    for d in _checador_bg_dirs():
        file_path = (d / safe_name).resolve()
        if d.exists() and d.is_dir() and str(file_path).startswith(str(d.resolve())) and file_path.exists():
            ext = file_path.suffix.lower()
            # Content-Type correcto para que iOS Safari renderice webp/png/jpeg.
            if ext == ".png":
                media_type = "image/png"
            elif ext in {".jpg", ".jpeg"}:
                media_type = "image/jpeg"
            elif ext == ".webp":
                media_type = "image/webp"
            else:
                media_type = "application/octet-stream"
            return FileResponse(path=str(file_path), media_type=media_type)

    raise HTTPException(status_code=404, detail="Imagen no encontrada.")


@router.get("/logo", include_in_schema=False)
def logo_portal():
    # Reutiliza el logo del login. Priorizar versión clara (bco) sobre fondo oscuro del portal.
    repo = Path(__file__).resolve().parents[4]
    candidates = [
        Path("/opt/optiexpress/frontend/dist/GPO-Cristal-bco.png"),
        Path("/opt/optiexpress/frontend/dist/GPOCristal.png"),
        repo / "frontend" / "public" / "GPO-Cristal-bco.png",
        repo / "frontend" / "public" / "GPOCristal.png",
        repo / "frontend" / "src" / "assets" / "GPO-Cristal-bco.png",
        repo / "frontend" / "src" / "assets" / "GPOCristal.png",
        repo / "GPO-Cristal-bco.png",
        repo / "GPOCristal.png",
    ]
    for p in candidates:
        if p.exists() and p.is_file():
            return FileResponse(path=str(p), media_type="image/png")
    raise HTTPException(status_code=404, detail="Logo no encontrado.")


@router.get("/favicon.png", include_in_schema=False)
def favicon_portal():
    candidates = [
        Path(__file__).resolve().parent / "static" / "favicon.png",
        Path("/opt/optiexpress/backend/app/modules/portal/static/favicon.png"),
        Path("/opt/optiexpress/frontend/dist/favicon.png"),
        Path(__file__).resolve().parents[4] / "frontend" / "public" / "favicon.png",
    ]
    for p in candidates:
        if p.exists() and p.is_file():
            return FileResponse(path=str(p), media_type="image/png")
    raise HTTPException(status_code=404, detail="Favicon no encontrado.")


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
    """Registra una checada remota. Autentica con empresa + usuario + contraseña de la app."""
    return service.registrar_checada_remota(
        db,
        empresa_id=data.empresa_id,
        username=data.username,
        password=data.password,
        motivo=data.motivo,
        motivo_detalle=data.motivo_detalle,
        latitud=data.latitud,
        longitud=data.longitud,
        geo_precision_m=data.geo_precision_m,
    )


@router.post("/estado-hoy", response_model=schemas.EstadoChecadaRemotaResponse)
def estado_hoy(data: schemas.ChecadaRemotaRequest, db: Session = Depends(get_db)):
    """Consulta checadas de hoy vs requeridas (4 lun–vie, 2 sábado si aplica) sin registrar."""
    return service.estado_checada_remota(
        db,
        empresa_id=data.empresa_id,
        username=data.username,
        password=data.password,
    )
