from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.config import settings
from . import schemas, service

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/rh", tags=["RH"])


# ========== EXPEDIENTES ==========

@router.post("/expedientes", response_model=schemas.ExpedienteResponse, status_code=status.HTTP_201_CREATED)
def create_expediente(expediente: schemas.ExpedienteCreate, db: Session = Depends(get_db)):
    """Crear nuevo expediente"""
    try:
        return service.RHService.create_expediente(db, expediente)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/expedientes/empleado/{empleado_id}", response_model=schemas.ExpedienteResponse)
def get_expediente_by_empleado(empleado_id: int, db: Session = Depends(get_db)):
    """Obtener expediente por empleado"""
    expediente = service.RHService.get_expediente_by_empleado(db, empleado_id)
    if not expediente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expediente no encontrado"
        )
    return expediente


@router.put("/expedientes/{expediente_id}", response_model=schemas.ExpedienteResponse)
def update_expediente(expediente_id: int, expediente: schemas.ExpedienteUpdate, db: Session = Depends(get_db)):
    """Actualizar expediente"""
    db_expediente = service.RHService.update_expediente(db, expediente_id, expediente)
    if not db_expediente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expediente no encontrado"
        )
    return db_expediente


# ========== TIPOS DE DOCUMENTO ==========

@router.post("/tipos-documento", response_model=schemas.TipoDocumentoResponse, status_code=status.HTTP_201_CREATED)
def create_tipo_documento(tipo: schemas.TipoDocumentoCreate, db: Session = Depends(get_db)):
    """Crear nuevo tipo de documento"""
    return service.RHService.create_tipo_documento(db, tipo)


@router.get("/tipos-documento", response_model=List[schemas.TipoDocumentoResponse])
def get_tipos_documento(db: Session = Depends(get_db)):
    """Listar tipos de documento"""
    return service.RHService.get_tipos_documento(db)


# ========== DOCUMENTOS ==========

@router.post("/documentos", response_model=schemas.DocumentoResponse, status_code=status.HTTP_201_CREATED)
def create_documento(documento: schemas.DocumentoCreate, db: Session = Depends(get_db)):
    """Crear nuevo documento"""
    return service.RHService.create_documento(db, documento)


@router.get("/documentos/expediente/{expediente_id}", response_model=List[schemas.DocumentoResponse])
def get_documentos_by_expediente(expediente_id: int, db: Session = Depends(get_db)):
    """Listar documentos de un expediente"""
    return service.RHService.get_documentos_by_expediente(db, expediente_id)


@router.put("/documentos/{documento_id}", response_model=schemas.DocumentoResponse)
def update_documento(documento_id: int, documento: schemas.DocumentoUpdate, db: Session = Depends(get_db)):
    """Actualizar documento"""
    db_documento = service.RHService.update_documento(db, documento_id, documento)
    if not db_documento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento no encontrado"
        )
    return db_documento


@router.delete("/documentos/{documento_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_documento(documento_id: int, db: Session = Depends(get_db)):
    """Eliminar documento"""
    success = service.RHService.delete_documento(db, documento_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento no encontrado"
        )


# ========== EVALUACIONES ==========

@router.post("/evaluaciones", response_model=schemas.EvaluacionResponse, status_code=status.HTTP_201_CREATED)
def create_evaluacion(evaluacion: schemas.EvaluacionCreate, db: Session = Depends(get_db)):
    """Crear nueva evaluación"""
    return service.RHService.create_evaluacion(db, evaluacion)


@router.get("/evaluaciones/expediente/{expediente_id}", response_model=List[schemas.EvaluacionResponse])
def get_evaluaciones_by_expediente(expediente_id: int, db: Session = Depends(get_db)):
    """Listar evaluaciones de un expediente"""
    return service.RHService.get_evaluaciones_by_expediente(db, expediente_id)


@router.put("/evaluaciones/{evaluacion_id}", response_model=schemas.EvaluacionResponse)
def update_evaluacion(evaluacion_id: int, evaluacion: schemas.EvaluacionUpdate, db: Session = Depends(get_db)):
    """Actualizar evaluación"""
    db_evaluacion = service.RHService.update_evaluacion(db, evaluacion_id, evaluacion)
    if not db_evaluacion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluación no encontrada"
        )
    return db_evaluacion


@router.delete("/evaluaciones/{evaluacion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_evaluacion(evaluacion_id: int, db: Session = Depends(get_db)):
    """Eliminar evaluación"""
    success = service.RHService.delete_evaluacion(db, evaluacion_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluación no encontrada"
        )


# ========== CAPACITACIONES ==========

@router.post("/capacitaciones", response_model=schemas.CapacitacionResponse, status_code=status.HTTP_201_CREATED)
def create_capacitacion(capacitacion: schemas.CapacitacionCreate, db: Session = Depends(get_db)):
    """Crear nueva capacitación"""
    return service.RHService.create_capacitacion(db, capacitacion)


@router.get("/capacitaciones/empleado/{empleado_id}", response_model=List[schemas.CapacitacionResponse])
def get_capacitaciones_by_empleado(empleado_id: int, db: Session = Depends(get_db)):
    """Listar capacitaciones de un empleado"""
    return service.RHService.get_capacitaciones_by_empleado(db, empleado_id)


@router.put("/capacitaciones/{capacitacion_id}", response_model=schemas.CapacitacionResponse)
def update_capacitacion(capacitacion_id: int, capacitacion: schemas.CapacitacionUpdate, db: Session = Depends(get_db)):
    """Actualizar capacitación"""
    db_capacitacion = service.RHService.update_capacitacion(db, capacitacion_id, capacitacion)
    if not db_capacitacion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Capacitación no encontrada"
        )
    return db_capacitacion


@router.delete("/capacitaciones/{capacitacion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_capacitacion(capacitacion_id: int, db: Session = Depends(get_db)):
    """Eliminar capacitación"""
    success = service.RHService.delete_capacitacion(db, capacitacion_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Capacitación no encontrada"
        )
