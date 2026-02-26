from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.config import settings
from . import schemas, service, models

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/personal", tags=["Personal"])


# ========== RUTAS DE ROLES ==========

@router.post("/roles", response_model=schemas.RolResponse, status_code=status.HTTP_201_CREATED)
def create_rol(rol: schemas.RolCreate, db: Session = Depends(get_db)):
    """Crear nuevo rol"""
    # Verificar si ya existe un rol con ese nombre
    existing = db.query(models.Rol).filter(models.Rol.nombre == rol.nombre).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un rol con ese nombre"
        )
    return service.PersonalService.create_rol(db, rol)


@router.get("/roles", response_model=List[schemas.RolResponse])
def get_roles(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    activo: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """Listar roles"""
    return service.PersonalService.get_roles(db, skip=skip, limit=limit, activo=activo)


@router.get("/roles/{rol_id}", response_model=schemas.RolResponse)
def get_rol(rol_id: int, db: Session = Depends(get_db)):
    """Obtener rol por ID"""
    db_rol = service.PersonalService.get_rol(db, rol_id)
    if not db_rol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rol no encontrado"
        )
    return db_rol


@router.put("/roles/{rol_id}", response_model=schemas.RolResponse)
def update_rol(rol_id: int, rol: schemas.RolUpdate, db: Session = Depends(get_db)):
    """Actualizar rol"""
    db_rol = service.PersonalService.update_rol(db, rol_id, rol)
    if not db_rol:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rol no encontrado"
        )
    return db_rol


@router.delete("/roles/{rol_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rol(rol_id: int, db: Session = Depends(get_db)):
    """Eliminar rol (desactivar)"""
    success = service.PersonalService.delete_rol(db, rol_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rol no encontrado"
        )


# ========== RUTAS DE EMPLEADOS ==========

@router.post("/empleados", response_model=schemas.EmpleadoResponse, status_code=status.HTTP_201_CREATED)
def create_empleado(empleado: schemas.EmpleadoCreate, db: Session = Depends(get_db)):
    """Crear nuevo empleado"""
    # Verificar si ya existe un empleado con ese número
    existing = service.PersonalService.get_empleado_by_numero(db, empleado.numero_empleado)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un empleado con ese número de empleado"
        )
    
    # Verificar si el rol existe (si se proporciona)
    if empleado.rol_id:
        rol = service.PersonalService.get_rol(db, empleado.rol_id)
        if not rol:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El rol especificado no existe"
            )
    
    # Verificar si el jefe existe (si se proporciona)
    if empleado.jefe_id:
        jefe = service.PersonalService.get_empleado(db, empleado.jefe_id)
        if not jefe:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El jefe especificado no existe"
            )
    
    return service.PersonalService.create_empleado(db, empleado)


@router.get("/empleados", response_model=List[schemas.EmpleadoResponse])
def get_empleados(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    estado: Optional[str] = None,
    rol_id: Optional[int] = None,
    jefe_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Listar empleados con filtros"""
    return service.PersonalService.get_empleados(
        db, 
        skip=skip, 
        limit=limit,
        estado=estado,
        rol_id=rol_id,
        jefe_id=jefe_id,
        search=search
    )


@router.get("/empleados/{empleado_id}", response_model=schemas.EmpleadoResponse)
def get_empleado(empleado_id: int, db: Session = Depends(get_db)):
    """Obtener empleado por ID"""
    db_empleado = service.PersonalService.get_empleado(db, empleado_id)
    if not db_empleado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empleado no encontrado"
        )
    return db_empleado


@router.put("/empleados/{empleado_id}", response_model=schemas.EmpleadoResponse)
def update_empleado(empleado_id: int, empleado: schemas.EmpleadoUpdate, db: Session = Depends(get_db)):
    """Actualizar empleado"""
    db_empleado = service.PersonalService.update_empleado(db, empleado_id, empleado)
    if not db_empleado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empleado no encontrado"
        )
    return db_empleado


@router.delete("/empleados/{empleado_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_empleado(empleado_id: int, db: Session = Depends(get_db)):
    """Eliminar empleado (dar de baja)"""
    success = service.PersonalService.delete_empleado(db, empleado_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empleado no encontrado"
        )


@router.get("/empleados/{jefe_id}/subordinados", response_model=List[schemas.EmpleadoResponse])
def get_subordinados(jefe_id: int, db: Session = Depends(get_db)):
    """Obtener subordinados de un jefe"""
    jefe = service.PersonalService.get_empleado(db, jefe_id)
    if not jefe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Jefe no encontrado"
        )
    return service.PersonalService.get_subordinados(db, jefe_id)
