from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import logging
from app.core.database import get_db
from app.core.config import settings
from . import schemas, service, models

logger = logging.getLogger(__name__)
router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/personal", tags=["Personal"])


def _depto_to_response(depto: models.Departamento) -> dict:
    data = {
        "id": depto.id, "nombre": depto.nombre, "empresa_id": depto.empresa_id,
        "jefe_id": depto.jefe_id, "activo": depto.activo,
        "created_at": depto.created_at, "updated_at": depto.updated_at,
        "empresa": depto.empresa,
        "jefe_nombre": None,
    }
    if depto.jefe:
        j = depto.jefe
        data["jefe_nombre"] = f"{j.nombre} {j.apellido_paterno or ''} {j.apellido_materno or ''}".strip()
    return data


# ========== RUTAS DE EMPRESAS ==========

@router.post("/empresas", response_model=schemas.EmpresaResponse, status_code=status.HTTP_201_CREATED)
def create_empresa(empresa: schemas.EmpresaCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Empresa).filter(models.Empresa.nombre == empresa.nombre).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe una empresa con ese nombre")
    return service.PersonalService.create_empresa(db, empresa)


@router.get("/empresas", response_model=List[schemas.EmpresaResponse])
def get_empresas(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    activo: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    return service.PersonalService.get_empresas(db, skip=skip, limit=limit, activo=activo)


@router.get("/empresas/{empresa_id}", response_model=schemas.EmpresaResponse)
def get_empresa(empresa_id: int, db: Session = Depends(get_db)):
    emp = service.PersonalService.get_empresa(db, empresa_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return emp


@router.put("/empresas/{empresa_id}", response_model=schemas.EmpresaResponse)
def update_empresa(empresa_id: int, empresa: schemas.EmpresaUpdate, db: Session = Depends(get_db)):
    emp = service.PersonalService.update_empresa(db, empresa_id, empresa)
    if not emp:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return emp


@router.delete("/empresas/{empresa_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_empresa(empresa_id: int, db: Session = Depends(get_db)):
    if not service.PersonalService.delete_empresa(db, empresa_id):
        raise HTTPException(status_code=404, detail="Empresa no encontrada")


# ========== RUTAS DE DEPARTAMENTOS ==========

@router.post("/departamentos", response_model=schemas.DepartamentoResponse, status_code=status.HTTP_201_CREATED)
def create_departamento(depto: schemas.DepartamentoCreate, db: Session = Depends(get_db)):
    empresa = service.PersonalService.get_empresa(db, depto.empresa_id)
    if not empresa:
        raise HTTPException(status_code=400, detail="La empresa especificada no existe")
    if depto.jefe_id:
        jefe = service.PersonalService.get_empleado(db, depto.jefe_id)
        if not jefe:
            raise HTTPException(status_code=400, detail="El jefe especificado no existe")
    db_depto = service.PersonalService.create_departamento(db, depto)
    loaded = service.PersonalService.get_departamento(db, db_depto.id)
    return _depto_to_response(loaded)


@router.get("/departamentos", response_model=List[schemas.DepartamentoResponse])
def get_departamentos(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    empresa_id: Optional[int] = None,
    activo: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    deptos = service.PersonalService.get_departamentos(db, skip=skip, limit=limit, empresa_id=empresa_id, activo=activo)
    return [_depto_to_response(d) for d in deptos]


@router.get("/departamentos/{depto_id}", response_model=schemas.DepartamentoResponse)
def get_departamento(depto_id: int, db: Session = Depends(get_db)):
    depto = service.PersonalService.get_departamento(db, depto_id)
    if not depto:
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    return _depto_to_response(depto)


@router.put("/departamentos/{depto_id}", response_model=schemas.DepartamentoResponse)
def update_departamento(depto_id: int, depto: schemas.DepartamentoUpdate, db: Session = Depends(get_db)):
    updated = service.PersonalService.update_departamento(db, depto_id, depto)
    if not updated:
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    loaded = service.PersonalService.get_departamento(db, depto_id)
    return _depto_to_response(loaded)


@router.delete("/departamentos/{depto_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_departamento(depto_id: int, db: Session = Depends(get_db)):
    if not service.PersonalService.delete_departamento(db, depto_id):
        raise HTTPException(status_code=404, detail="Departamento no encontrado")


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
    
    db_empleado = service.PersonalService.create_empleado(db, empleado)

    if empleado.registrar_en_checador and empleado.dispositivo_ids:
        try:
            from app.modules.asistencia.service import AsistenciaService
            from app.modules.asistencia.schemas import EnqueueUserRequest
            nombre_completo = f"{empleado.nombre} {empleado.apellido_paterno or ''} {empleado.apellido_materno or ''}".strip()
            enqueue_data = EnqueueUserRequest(
                numero_empleado=empleado.numero_empleado,
                nombre=nombre_completo,
            )
            for did in empleado.dispositivo_ids:
                try:
                    AsistenciaService.enqueue_user(db, int(did), enqueue_data)
                except Exception as e:
                    logger.warning(f"Fallo enqueue en dispositivo {did}: {e}")
        except Exception as e:
            logger.warning(f"Empleado creado pero fallo enqueue en checadores: {e}")

    return db_empleado


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
