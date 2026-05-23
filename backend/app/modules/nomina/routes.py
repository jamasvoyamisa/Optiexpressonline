"""Rutas API para el módulo de Nómina (Fase 1)."""
from typing import Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_superuser

from .schemas import (
    CatalogosResponse,
    EmpresaNominaConfigCreate,
    EmpresaNominaConfigUpdate,
    EmpresaNominaConfigResponse,
    EmpleadoNominaCreate,
    EmpleadoNominaUpdate,
    EmpleadoNominaResponse,
    PeriodoNominaCreate,
    PeriodoNominaUpdate,
    PeriodoNominaResponse,
    PeriodoNominaListResponse,
    DetalleNominaCreate,
    DetalleNominaResponse,
    CalcularNominaResponse,
)
from .service import NominaService
from .calculo_prueba import calcular_periodo_prueba
from .calculo_nomina import calcular_periodo_nomina
from .export_nomina import generar_csv_periodo

router = APIRouter(
    prefix=f"{settings.API_V1_PREFIX}/nomina",
    tags=["nomina"],
)


# ── Catálogos ─────────────────────────────────────────────────────────────

@router.get("/catalogos", response_model=CatalogosResponse)
def get_catalogos(
    _ctx: dict = Depends(require_superuser),
):
    """Devuelve todos los catálogos SAT necesarios para nómina."""
    return NominaService.get_catalogos()


# ── Configuración empresa ──────────────────────────────────────────────────

@router.get(
    "/empresas/{empresa_id}/config",
    response_model=EmpresaNominaConfigResponse,
)
def get_config_empresa(
    empresa_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    cfg = NominaService.get_config_empresa(db, empresa_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Configuración no encontrada para esta empresa.")
    return cfg


@router.put(
    "/empresas/{empresa_id}/config",
    response_model=EmpresaNominaConfigResponse,
)
def upsert_config_empresa(
    empresa_id: int,
    body: EmpresaNominaConfigUpdate,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """Crea o actualiza la configuración de nómina de una empresa."""
    data = body.model_dump(exclude_unset=True)
    return NominaService.upsert_config_empresa(db, empresa_id, data)


# ── Datos empleado ─────────────────────────────────────────────────────────

@router.get(
    "/empleados/{empleado_id}/datos",
    response_model=EmpleadoNominaResponse,
)
def get_datos_empleado(
    empleado_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    datos = NominaService.get_datos_empleado(db, empleado_id)
    if not datos:
        raise HTTPException(status_code=404, detail="Datos de nómina no encontrados para este empleado.")
    return datos


@router.put(
    "/empleados/{empleado_id}/datos",
    response_model=EmpleadoNominaResponse,
)
def upsert_datos_empleado(
    empleado_id: int,
    body: EmpleadoNominaUpdate,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """Crea o actualiza los datos de nómina de un empleado."""
    data = body.model_dump(exclude_unset=True)
    return NominaService.upsert_datos_empleado(db, empleado_id, data)


@router.get("/empleados", response_model=list[EmpleadoNominaResponse])
def listar_datos_empleados(
    empresa_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    items, _ = NominaService.listar_datos_empleados(db, empresa_id=empresa_id, skip=skip, limit=limit)
    return items


# ── Periodos ───────────────────────────────────────────────────────────────

@router.get("/periodos", response_model=PeriodoNominaListResponse)
def listar_periodos(
    empresa_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    items, total = NominaService.listar_periodos(db, empresa_id=empresa_id, skip=skip, limit=limit)
    return PeriodoNominaListResponse(items=items, total=total)


@router.post("/periodos", response_model=PeriodoNominaResponse, status_code=status.HTTP_201_CREATED)
def crear_periodo(
    body: PeriodoNominaCreate,
    ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    data = body.model_dump()
    try:
        return NominaService.crear_periodo(db, data, creado_por=ctx["user_id"])
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/periodos/{periodo_id}", response_model=PeriodoNominaResponse)
def get_periodo(
    periodo_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    periodo = NominaService.get_periodo(db, periodo_id)
    if not periodo:
        raise HTTPException(status_code=404, detail="Periodo no encontrado.")
    return periodo


@router.patch("/periodos/{periodo_id}", response_model=PeriodoNominaResponse)
def actualizar_periodo(
    periodo_id: int,
    body: PeriodoNominaUpdate,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    data = body.model_dump(exclude_unset=True)
    periodo = NominaService.actualizar_periodo(db, periodo_id, data)
    if not periodo:
        raise HTTPException(status_code=404, detail="Periodo no encontrado.")
    return periodo


@router.post("/periodos/{periodo_id}/calcular", response_model=CalcularNominaResponse)
def calcular_periodo_endpoint(
    periodo_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """
    Calcula nómina del periodo (ISR, subsidio, IMSS, días por asistencia).
    Periodos en borrador o calculada; no timbrados ni pagados.
    """
    try:
        return calcular_periodo_nomina(db, periodo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/periodos/{periodo_id}/export")
def exportar_periodo_csv(
    periodo_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """Exporta detalle del periodo en CSV."""
    try:
        filename, content = generar_csv_periodo(db, periodo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return Response(
        content=content.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/periodos/{periodo_id}/calcular-prueba")
def calcular_periodo_prueba_endpoint(
    periodo_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Calcula percepciones y deducciones de prueba para el periodo (solo borrador).
    Requiere NOMINA_CALCULO_PRUEBAS=true en .env — uso exclusivo en entorno local de pruebas.
    """
    if not (settings.NOMINA_CALCULO_PRUEBAS or settings.DEBUG):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El cálculo de nómina de pruebas está desactivado. "
            "En desarrollo local usa DEBUG=true o NOMINA_CALCULO_PRUEBAS=true en backend/.env.",
        )
    try:
        return calcular_periodo_prueba(db, periodo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/periodos/{periodo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_periodo(
    periodo_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """Solo se pueden eliminar periodos en estado borrador."""
    ok = NominaService.eliminar_periodo(db, periodo_id)
    if not ok:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar: el periodo no existe o no está en estado borrador.",
        )


# ── Detalles de periodo ────────────────────────────────────────────────────

@router.get("/periodos/{periodo_id}/detalles", response_model=list[DetalleNominaResponse])
def listar_detalles(
    periodo_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    return NominaService.listar_detalles_periodo(db, periodo_id)


@router.put(
    "/periodos/{periodo_id}/detalles/{empleado_id}",
    response_model=DetalleNominaResponse,
)
def upsert_detalle(
    periodo_id: int,
    empleado_id: int,
    body: DetalleNominaCreate,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    data = body.model_dump(exclude={"empleado_id"}, exclude_unset=True)
    return NominaService.agregar_empleado_a_periodo(db, periodo_id, empleado_id, data)
