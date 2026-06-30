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
    FiscalApiStatusResponse,
    TimbrarPeriodoResponse,
    TimbrarDetalleResponse,
    ValidarTimbradoResponse,
    PreviewPeriodoResponse,
    AreasNominaResponse,
    EjerciciosHistorialResponse,
    CerrarPeriodoResponse,
    QuincenasEjercicioResponse,
)
from .service import NominaService
from .calculo_prueba import calcular_periodo_prueba
from .calculo_nomina import calcular_periodo_nomina
from .export_nomina import generar_xlsx_periodo
from .fiscalapi_client import fiscalapi_status_publico
from .timbrado_service import timbrar_detalle_empleado, timbrar_periodo
from .validacion_timbrado import validar_periodo_para_timbrado
from .preview_service import preview_periodo
from .nomina_areas import listar_areas_periodo
from .numero_periodo import meta_periodo_nomina
from .historial_service import (
    cerrar_periodo_historial,
    listar_ejercicios,
    listar_periodos_ejercicio,
)

def _departamento_query(departamento_id: Optional[int]) -> Optional[int]:
    """0 = sin área (NULL en BD)."""
    if departamento_id == 0:
        return None
    return departamento_id


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

def _serializar_periodo(p) -> PeriodoNominaResponse:
    base = PeriodoNominaResponse.model_validate(p)
    meta = meta_periodo_nomina(p.periodicidad, p.fecha_inicio, p.fecha_fin)
    return base.model_copy(update=meta)


@router.get("/quincenas", response_model=QuincenasEjercicioResponse)
def catalogo_quincenas(
    ejercicio: int = Query(..., ge=2000, le=2100),
    _ctx: dict = Depends(require_superuser),
):
    """Catálogo de quincenas 1–24 del ejercicio (fechas de calendario)."""
    from .numero_periodo import listar_quincenas_ejercicio

    return QuincenasEjercicioResponse(ejercicio=ejercicio, items=listar_quincenas_ejercicio(ejercicio))


@router.get("/periodos", response_model=PeriodoNominaListResponse)
def listar_periodos(
    empresa_id: Optional[int] = None,
    activos: bool = Query(
        True,
        description="Si true, solo borrador y calculada (excluye timbrada y pagada).",
    ),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    items, total = NominaService.listar_periodos(
        db, empresa_id=empresa_id, skip=skip, limit=limit, activos=activos
    )
    return PeriodoNominaListResponse(
        items=[_serializar_periodo(p) for p in items],
        total=total,
    )


@router.post("/periodos", response_model=PeriodoNominaResponse, status_code=status.HTTP_201_CREATED)
def crear_periodo(
    body: PeriodoNominaCreate,
    ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    data = body.model_dump()
    try:
        p = NominaService.crear_periodo(db, data, creado_por=ctx["user_id"])
        return _serializar_periodo(p)
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
    return _serializar_periodo(periodo)


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
    return _serializar_periodo(periodo)


@router.post("/periodos/{periodo_id}/cerrar", response_model=CerrarPeriodoResponse)
def cerrar_periodo_historial_endpoint(
    periodo_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """
    Guarda el periodo en el historial (estado pagada).
    Consultable después por ejercicio fiscal.
    """
    try:
        return cerrar_periodo_historial(db, periodo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/historial/ejercicios", response_model=EjerciciosHistorialResponse)
def historial_ejercicios(
    empresa_id: Optional[int] = None,
    solo_cerrados: bool = Query(False),
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """Lista ejercicios fiscales con totales acumulados de nómina."""
    items = listar_ejercicios(db, empresa_id=empresa_id, solo_cerrados=solo_cerrados)
    return EjerciciosHistorialResponse(items=items)


@router.get("/historial/periodos", response_model=PeriodoNominaListResponse)
def historial_periodos(
    ejercicio: int = Query(..., ge=2000, le=2100),
    empresa_id: Optional[int] = None,
    solo_cerrados: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """Periodos de un ejercicio fiscal (consulta de historial)."""
    items, total = listar_periodos_ejercicio(
        db,
        ejercicio=ejercicio,
        empresa_id=empresa_id,
        solo_cerrados=solo_cerrados,
        skip=skip,
        limit=limit,
    )
    return PeriodoNominaListResponse(
        items=[PeriodoNominaResponse.model_validate(i) for i in items],
        total=total,
    )


@router.get("/fiscalapi/status", response_model=FiscalApiStatusResponse)
def fiscalapi_status(
    _ctx: dict = Depends(require_superuser),
):
    """
    Estado de integración FiscalAPI (sandbox/producción).
    No expone credenciales. Requiere NOMINA_FISCALAPI_ENABLED + API key en .env.
    """
    return fiscalapi_status_publico()


@router.get("/periodos/{periodo_id}/areas-nomina", response_model=AreasNominaResponse)
def areas_nomina_periodo(
    periodo_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """Áreas (departamentos) con recibos calculados en el periodo."""
    try:
        items = listar_areas_periodo(db, periodo_id)
        if not items:
            raise ValueError("No hay recibos calculados en este periodo.")
        return AreasNominaResponse(periodo_id=periodo_id, items=items)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/periodos/{periodo_id}/preview", response_model=PreviewPeriodoResponse)
def preview_periodo_nomina(
    periodo_id: int,
    departamento_id: Optional[int] = Query(None, description="Área/departamento a previsualizar."),
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """
    Previsualiza recibos calculados del área indicada y el resumen CFDI.
    No llama a FiscalAPI ni cambia el periodo.
    """
    try:
        return preview_periodo(
            db, periodo_id, departamento_id=_departamento_query(departamento_id)
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/periodos/{periodo_id}/validar-timbrado", response_model=ValidarTimbradoResponse)
def validar_timbrado_periodo(
    periodo_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """
    Revisa datos fiscales de empresa y empleados antes de timbrar.
    No llama a FiscalAPI; útil para corregir RFC, CP, salarios, etc.
    """
    try:
        return validar_periodo_para_timbrado(db, periodo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/periodos/{periodo_id}/timbrar-prueba", response_model=TimbrarPeriodoResponse)
def timbrar_periodo_prueba_endpoint(
    periodo_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """
    Timbra todos los recibos del periodo vía FiscalAPI **sandbox** (pruebas).
    Sin validez fiscal. Requiere periodo calculada y credenciales en .env.
    """
    try:
        return timbrar_periodo(db, periodo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/periodos/{periodo_id}/detalles/{empleado_id}/timbrar-prueba",
    response_model=TimbrarDetalleResponse,
)
def timbrar_detalle_prueba_endpoint(
    periodo_id: int,
    empleado_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """Timbra un solo recibo (reintento o prueba unitaria)."""
    try:
        return timbrar_detalle_empleado(db, periodo_id, empleado_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


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
def exportar_periodo_xlsx(
    periodo_id: int,
    _ctx: dict = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    """Exporta todos los recibos del periodo en Excel (.xlsx), una hoja por área."""
    try:
        filename, content = generar_xlsx_periodo(db, periodo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
