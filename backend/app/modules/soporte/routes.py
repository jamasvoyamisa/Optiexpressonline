from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_empleado_with_rol, get_current_empleado_with_rol_download
from app.modules.personal.models import Departamento, Empleado, Empresa, EstadoEmpleado
from . import models, schemas, service

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/soporte", tags=["Soporte"])
ALLOWED_BG_EXT = {".jpg", ".jpeg", ".png", ".webp"}
BG_MEDIA_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def _portal_bg_dirs() -> list[Path]:
    dirs: list[Path] = []
    configured = Path(settings.SOPORTE_PORTAL_BG_DIR).resolve()
    dirs.append(configured)
    # Fallback local para entorno de desarrollo (repo completo)
    repo_ti = Path(__file__).resolve().parents[4] / "frontend" / "src" / "assets" / "ti"
    dirs.append(repo_ti.resolve())
    return dirs


def _portal_logo_candidates() -> list[Path]:
    repo_root = Path(__file__).resolve().parents[4]
    return [
        Path("/opt/optiexpress/frontend/dist/GPO-Cristal-bco.png"),
        Path("/opt/optiexpress/frontend/dist/GPOCristal.png"),
        repo_root / "frontend" / "public" / "GPO-Cristal-bco.png",
        repo_root / "frontend" / "src" / "assets" / "GPO-Cristal-bco.png",
        repo_root / "GPO-Cristal-bco.png",
        repo_root / "frontend" / "public" / "GPOCristal.png",
        repo_root / "frontend" / "src" / "assets" / "GPOCristal.png",
    ]


def _require_soporte_ti(current: dict) -> None:
    """Misma regla que el menú Soporte TI en el frontend (is_superuser o is_ti)."""
    if current.get("is_superuser") or current.get("is_ti"):
        return
    raise HTTPException(status_code=403, detail="Solo TI o Administrador puede acceder a Soporte TI.")


@router.get("/clases", response_model=list[schemas.SoporteTicketClaseResponse])
def listar_clases(
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    if not bool(current.get("is_superuser")):
        raise HTTPException(status_code=403, detail="Solo Administrador puede configurar clases de ticket.")
    return service.SoporteService.list_clases(db, solo_activas=False)


@router.post("/clases", response_model=schemas.SoporteTicketClaseResponse, status_code=status.HTTP_201_CREATED)
def crear_clase(
    data: schemas.SoporteTicketClaseCreate,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    if not bool(current.get("is_superuser")):
        raise HTTPException(status_code=403, detail="Solo Administrador puede configurar clases de ticket.")
    try:
        return service.SoporteService.create_clase(db, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/clases/{clase_id}", response_model=schemas.SoporteTicketClaseResponse)
def actualizar_clase(
    clase_id: int,
    data: schemas.SoporteTicketClaseUpdate,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    if not bool(current.get("is_superuser")):
        raise HTTPException(status_code=403, detail="Solo Administrador puede configurar clases de ticket.")
    try:
        updated = service.SoporteService.update_clase(db, clase_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="Clase de ticket no encontrada.")
    return updated


@router.get("/tipos", response_model=list[schemas.SoporteTicketTipoResponse])
def listar_tipos_ticket(
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    if not bool(current.get("is_superuser")):
        raise HTTPException(status_code=403, detail="Solo Administrador puede configurar tipos de ticket.")
    return service.SoporteService.list_tipos_ticket(db, solo_activos=False)


@router.post("/tipos", response_model=schemas.SoporteTicketTipoResponse, status_code=status.HTTP_201_CREATED)
def crear_tipo_ticket(
    data: schemas.SoporteTicketTipoCreate,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    if not bool(current.get("is_superuser")):
        raise HTTPException(status_code=403, detail="Solo Administrador puede configurar tipos de ticket.")
    if not data.nombre.strip():
        raise HTTPException(status_code=400, detail="El nombre es obligatorio.")
    try:
        return service.SoporteService.create_tipo_ticket(db, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/tipos/{tipo_id}", response_model=schemas.SoporteTicketTipoResponse)
def actualizar_tipo_ticket(
    tipo_id: int,
    data: schemas.SoporteTicketTipoUpdate,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    if not bool(current.get("is_superuser")):
        raise HTTPException(status_code=403, detail="Solo Administrador puede configurar tipos de ticket.")
    try:
        updated = service.SoporteService.update_tipo_ticket(db, tipo_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="Tipo de ticket no encontrado.")
    return updated


@router.get("/portal/clases", response_model=list[schemas.SoporteTicketClaseResponse])
def listar_clases_portal(db: Session = Depends(get_db)):
    return service.SoporteService.list_clases_portal(db)


@router.get("/portal/tipos", response_model=list[schemas.SoporteTicketTipoResponse])
def listar_tipos_ticket_portal(
    clase_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    return service.SoporteService.list_tipos_portal(db, clase_id=clase_id)


@router.get("/portal/catalogo")
def catalogo_portal(db: Session = Depends(get_db)):
    empresas = (
        db.query(Empresa)
        .filter(Empresa.activo.is_(True))
        .order_by(Empresa.nombre.asc())
        .all()
    )
    departamentos = (
        db.query(Departamento)
        .filter(Departamento.activo.is_(True))
        .order_by(Departamento.nombre.asc())
        .all()
    )
    return {
        "empresas": [{"id": int(e.id), "nombre": e.nombre} for e in empresas],
        "departamentos": [{"id": int(d.id), "nombre": d.nombre, "empresa_id": int(d.empresa_id)} for d in departamentos],
    }


@router.get("/portal/empleados")
def empleados_portal(
    empresa_id: int = Query(..., ge=1),
    departamento_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    empleados = (
        db.query(Empleado)
        .filter(
            Empleado.empresa_id == empresa_id,
            Empleado.departamento_id == departamento_id,
            Empleado.estado == EstadoEmpleado.ACTIVO,
        )
        .order_by(Empleado.nombre.asc(), Empleado.apellido_paterno.asc(), Empleado.apellido_materno.asc())
        .all()
    )
    return [
        {
            "id": int(e.id),
            "nombre_completo": " ".join(
                [x for x in [e.nombre, e.apellido_paterno, e.apellido_materno] if (x or "").strip()]
            ).strip(),
        }
        for e in empleados
    ]


@router.get("/portal/backgrounds")
def backgrounds_portal():
    urls: list[str] = []
    for d in _portal_bg_dirs():
        if not d.exists() or not d.is_dir():
            continue
        for p in sorted(d.iterdir()):
            if p.is_file() and p.suffix.lower() in ALLOWED_BG_EXT:
                urls.append(f"{settings.API_V1_PREFIX}/soporte/portal/background/{p.name}")
        if urls:
            break
    return {"items": urls}


@router.get("/portal/background/{filename}", include_in_schema=False)
def background_portal_file(filename: str):
    safe_name = Path(filename).name
    if not safe_name or safe_name != filename:
        raise HTTPException(status_code=400, detail="Nombre de imagen inválido.")
    if Path(safe_name).suffix.lower() not in ALLOWED_BG_EXT:
        raise HTTPException(status_code=400, detail="Tipo de imagen inválido.")
    for d in _portal_bg_dirs():
        file_path = (d / safe_name).resolve()
        if d.exists() and d.is_dir() and str(file_path).startswith(str(d.resolve())) and file_path.exists():
            return FileResponse(path=str(file_path), media_type=BG_MEDIA_BY_EXT.get(file_path.suffix.lower(), "application/octet-stream"))
    raise HTTPException(status_code=404, detail="Imagen no encontrada.")


@router.get("/portal/logo", include_in_schema=False)
def logo_portal():
    for p in _portal_logo_candidates():
        rp = p.resolve()
        if rp.exists() and rp.is_file():
            return FileResponse(path=str(rp), media_type="image/png")
    raise HTTPException(status_code=404, detail="Logo no encontrado.")


@router.get("/portal/favicon.png", include_in_schema=False)
def favicon_soporte():
    repo_root = Path(__file__).resolve().parents[4]
    candidates = [
        Path(__file__).resolve().parent / "static" / "favicon.png",
        Path("/opt/optiexpress/backend/app/modules/soporte/static/favicon.png"),
        Path("/opt/optiexpress/frontend/dist/favicon.png"),
        repo_root / "frontend" / "public" / "favicon.png",
    ]
    for p in candidates:
        rp = p.resolve()
        if rp.exists() and rp.is_file():
            return FileResponse(path=str(rp), media_type="image/png")
    raise HTTPException(status_code=404, detail="Favicon no encontrado.")


@router.get("/interno/catalogo", response_model=schemas.SoporteInternoCatalogoResponse)
def catalogo_ticket_interno(
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    _require_soporte_ti(current)
    data = service.SoporteService.catalogo_ticket_interno(db)
    return schemas.SoporteInternoCatalogoResponse(**data)


@router.get("/interno/empleados", response_model=list[schemas.SoporteInternoEmpleadoItem])
def empleados_ticket_interno(
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    _require_soporte_ti(current)
    return service.SoporteService.list_empleados_interno(db)


@router.post("/tickets", response_model=schemas.SoporteTicketResponse, status_code=status.HTTP_201_CREATED)
def crear_ticket_interno(
    data: schemas.SoporteTicketInternoCreate,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    _require_soporte_ti(current)
    if not data.titulo.strip() or not data.descripcion.strip():
        raise HTTPException(status_code=400, detail="Título y descripción son obligatorios.")
    try:
        return service.SoporteService.create_ticket_interno(db, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tickets", response_model=schemas.SoporteTicketListResponse)
def listar_tickets(
    estado: Optional[models.TicketEstado] = Query(None),
    prioridad: Optional[models.TicketPrioridad] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    _require_soporte_ti(current)
    items, total = service.SoporteService.list_tickets(db, estado=estado, prioridad=prioridad, skip=skip, limit=limit)
    return schemas.SoporteTicketListResponse(items=items, total=total)


@router.get("/tickets/{ticket_id}", response_model=schemas.SoporteTicketResponse)
def obtener_ticket(
    ticket_id: int,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    _require_soporte_ti(current)
    ticket = service.SoporteService.get_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return ticket


@router.patch("/tickets/{ticket_id}", response_model=schemas.SoporteTicketResponse)
def actualizar_ticket(
    ticket_id: int,
    data: schemas.SoporteTicketUpdate,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    _require_soporte_ti(current)
    updated = service.SoporteService.update_ticket(db, ticket_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return updated


@router.post("/portal/tickets", response_model=schemas.SoporteTicketResponse, status_code=status.HTTP_201_CREATED)
def crear_ticket_portal(data: schemas.SoporteTicketPortalCreate, db: Session = Depends(get_db)):
    if not data.titulo.strip() or not data.descripcion.strip():
        raise HTTPException(status_code=400, detail="Título y descripción son obligatorios.")
    if not (data.usuario or "").strip() or not (data.password or "").strip():
        raise HTTPException(status_code=400, detail="Usuario de sistema y contraseña son obligatorios.")
    if data.tipo_ticket_id is None:
        raise HTTPException(status_code=400, detail="El tipo de ticket es obligatorio.")
    try:
        return service.SoporteService.create_ticket_portal(db, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/tickets/{ticket_id}/adjuntos", response_model=list[schemas.SoporteTicketAdjuntoResponse], status_code=status.HTTP_201_CREATED)
async def subir_adjuntos_ticket(
    ticket_id: int,
    files: list[UploadFile] = File(...),
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    _require_soporte_ti(current)
    if not files:
        raise HTTPException(status_code=400, detail="Debes adjuntar al menos un archivo.")
    ticket = service.SoporteService.get_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado.")
    created: list[models.SoporteTicketAdjunto] = []
    for f in files:
        raw = await f.read()
        try:
            created.append(
                service.SoporteService.guardar_adjunto_bytes(
                    db=db,
                    ticket_id=ticket_id,
                    filename=f.filename or "",
                    content_type=f.content_type,
                    raw_bytes=raw,
                )
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    return created


@router.post("/portal/tickets/{ticket_id}/adjuntos", response_model=list[schemas.SoporteTicketAdjuntoResponse], status_code=status.HTTP_201_CREATED)
async def subir_adjuntos_portal(
    ticket_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status_code=400, detail="Debes adjuntar al menos un archivo.")
    created: list[models.SoporteTicketAdjunto] = []
    for f in files:
        raw = await f.read()
        try:
            created.append(
                service.SoporteService.guardar_adjunto_bytes(
                    db=db,
                    ticket_id=ticket_id,
                    filename=f.filename or "",
                    content_type=f.content_type,
                    raw_bytes=raw,
                )
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    return created


@router.get("/tickets/{ticket_id}/adjuntos", response_model=list[schemas.SoporteTicketAdjuntoResponse])
def listar_adjuntos_ticket(
    ticket_id: int,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    _require_soporte_ti(current)
    return service.SoporteService.list_adjuntos(db, ticket_id)


@router.get("/adjuntos/{adjunto_id}/download", include_in_schema=False)
def descargar_adjunto(
    adjunto_id: int,
    current: dict = Depends(get_current_empleado_with_rol_download),
    db: Session = Depends(get_db),
):
    _require_soporte_ti(current)
    adj = service.SoporteService.get_adjunto(db, adjunto_id)
    if not adj:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado.")
    try:
        abs_path = service.SoporteService.adjunto_abs_path(adj)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not abs_path.exists():
        raise HTTPException(status_code=404, detail="Archivo físico no encontrado.")
    media_type = adj.mime_type or "application/octet-stream"
    return FileResponse(path=str(abs_path), filename=adj.nombre_original, media_type=media_type)


@router.get("/portal", response_class=HTMLResponse, include_in_schema=False)
def portal_soporte():
    template = Path(__file__).resolve().parent / "templates" / "portal_soporte.html"
    return template.read_text(encoding="utf-8")
