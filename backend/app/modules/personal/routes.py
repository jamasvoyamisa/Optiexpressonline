from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import logging
from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user
from app.core.deps import get_current_empleado_with_rol
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


# ========== RUTAS DE PUESTOS ==========

def _puesto_to_response(p):
    return schemas.PuestoResponse(**service.PersonalService._puesto_to_response(p))


@router.get("/puestos", response_model=List[schemas.PuestoResponse])
def get_puestos(
    activo: Optional[bool] = Query(None, description="true=activos, false=inactivos, omitir=todos"),
    empresa_id: Optional[int] = Query(None, description="Filtrar por empresa"),
    departamento_id: Optional[int] = Query(None, description="Filtrar por departamento"),
    db: Session = Depends(get_db)
):
    """Lista de puestos por empresa y departamento. Director, Gerente General y RH son globales (sin empresa/depto)."""
    puestos = service.PersonalService.get_puestos(db, activo=activo, empresa_id=empresa_id, departamento_id=departamento_id)
    return [_puesto_to_response(p) for p in puestos]


@router.post("/puestos", response_model=schemas.PuestoResponse, status_code=status.HTTP_201_CREATED)
def create_puesto(data: schemas.PuestoCreate, db: Session = Depends(get_db)):
    """Crear puesto por empresa y departamento. No se pueden crear: Director, Gerente General, RH."""
    try:
        p = service.PersonalService.create_puesto(db, data)
        p = service.PersonalService.get_puesto(db, p.id)
        return _puesto_to_response(p)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/puestos/{puesto_id}", response_model=schemas.PuestoResponse)
def update_puesto(
    puesto_id: int,
    data: schemas.PuestoUpdate,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Actualizar puesto. Director, Gerente General y RH solo los edita el Administrador."""
    p = service.PersonalService.get_puesto(db, puesto_id)
    if not p:
        raise HTTPException(status_code=404, detail="Puesto no encontrado")
    if service.PersonalService._nombre_reservado(p.nombre) and not current_extra.get("is_superuser"):
        raise HTTPException(
            status_code=403,
            detail="Solo el Administrador puede editar los puestos Director, Gerente General y RH."
        )
    try:
        updated = service.PersonalService.update_puesto(db, puesto_id, data)
        if not updated:
            raise HTTPException(status_code=404, detail="Puesto no encontrado")
        updated = service.PersonalService.get_puesto(db, puesto_id)
        return _puesto_to_response(updated)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/puestos/{puesto_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_puesto(puesto_id: int, db: Session = Depends(get_db)):
    """Eliminar puesto. No se puede eliminar Director/Gerente General/RH ni puestos con empleados asignados."""
    try:
        if not service.PersonalService.delete_puesto(db, puesto_id):
            raise HTTPException(status_code=404, detail="Puesto no encontrado")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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

@router.get("/empleados/next-numero")
def next_numero_empleado(empresa_id: int, db: Session = Depends(get_db)):
    """Devuelve el siguiente número de empleado disponible para una empresa."""
    numeros = [
        int(e.numero_empleado)
        for e in db.query(models.Empleado.numero_empleado)
        .filter(models.Empleado.empresa_id == empresa_id)
        .all()
        if e.numero_empleado and e.numero_empleado.isdigit()
    ]
    siguiente = 1
    numeros_set = set(numeros)
    while siguiente in numeros_set:
        siguiente += 1
    return {"numero_empleado": str(siguiente).zfill(3)}


@router.get("/empleados/check-username")
def check_username(username: str, exclude_id: int = None, db: Session = Depends(get_db)):
    """Verificar si un username está disponible. Devuelve {available, suggested}."""
    available = service.PersonalService.check_username_available(db, username, exclude_id)
    return {"available": available, "username": username}


@router.get("/empleados/suggest-username")
def suggest_username(nombre: str, apellido_paterno: str, exclude_id: int = None, db: Session = Depends(get_db)):
    """Generar un username único a partir de nombre y apellido paterno."""
    username = service.PersonalService.suggest_username(db, nombre, apellido_paterno, exclude_id)
    return {"username": username}


@router.post("/empleados", response_model=schemas.EmpleadoResponse, status_code=status.HTTP_201_CREATED)
def create_empleado(
    empleado: schemas.EmpleadoCreate,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Crear nuevo empleado y usuario del sistema. Datos personales y laborales son obligatorios."""
    # Solo Administrador puede asignar puestos Director, Gerente General, RH
    if empleado.puesto_id:
        puesto = service.PersonalService.get_puesto(db, empleado.puesto_id)
        if puesto and service.PersonalService._nombre_reservado(puesto.nombre):
            if not current_extra.get("is_superuser"):
                raise HTTPException(
                    status_code=403,
                    detail="Solo el Administrador puede asignar los puestos Director, Gerente General y RH."
                )
    # Validar datos personales obligatorios
    if not (empleado.numero_empleado and empleado.numero_empleado.strip()):
        raise HTTPException(status_code=400, detail="Número de empleado es obligatorio")
    if not (empleado.nombre and empleado.nombre.strip()):
        raise HTTPException(status_code=400, detail="Nombre es obligatorio")
    if not (empleado.apellido_paterno and str(empleado.apellido_paterno or "").strip()):
        raise HTTPException(status_code=400, detail="Apellido paterno es obligatorio")
    if not (empleado.apellido_materno and str(empleado.apellido_materno or "").strip()):
        raise HTTPException(status_code=400, detail="Apellido materno es obligatorio")
    if not empleado.fecha_nacimiento:
        raise HTTPException(status_code=400, detail="Fecha de nacimiento es obligatoria")
    # Validar datos laborales obligatorios
    if not empleado.empresa_id:
        raise HTTPException(status_code=400, detail="Empresa es obligatoria")
    if not empleado.departamento_id:
        raise HTTPException(status_code=400, detail="Departamento es obligatorio")
    if not empleado.puesto_id:
        raise HTTPException(status_code=400, detail="Puesto es obligatorio")
    if not empleado.fecha_ingreso:
        raise HTTPException(status_code=400, detail="Fecha de ingreso es obligatoria")

    # Verificar si ya existe un empleado con ese número en la misma empresa
    existing = db.query(models.Empleado).filter(
        models.Empleado.numero_empleado == empleado.numero_empleado,
        models.Empleado.empresa_id == empleado.empresa_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un empleado con ese número en esta empresa"
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
            from app.modules.asistencia import models as asist_models
            nombre_completo = f"{empleado.nombre} {empleado.apellido_paterno or ''} {empleado.apellido_materno or ''}".strip()
            for did in empleado.dispositivo_ids:
                try:
                    # Crear la cola directamente usando el pin_checador del empleado recién creado
                    pendiente = asist_models.UsuarioPendienteDispositivo(
                        dispositivo_id=int(did),
                        numero_empleado=db_empleado.numero_empleado,
                        pin_checador=db_empleado.pin_checador,
                        nombre=nombre_completo,
                        enviado=False,
                    )
                    db.add(pendiente)
                    db.commit()
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
    departamento_id: Optional[int] = None,
    search: Optional[str] = None,
    exento_incidencias: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """Listar empleados con filtros. exento_incidencias=true lista solo usuarios especiales."""
    return service.PersonalService.get_empleados(
        db,
        skip=skip,
        limit=limit,
        estado=estado,
        rol_id=rol_id,
        jefe_id=jefe_id,
        departamento_id=departamento_id,
        search=search,
        exento_incidencias=exento_incidencias,
    )


@router.get("/me", response_model=schemas.EmpleadoResponse)
def get_me(
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Datos del empleado actual (portal del empleado). Requiere autenticación."""
    empleado_id = int(current["user_id"])
    db_empleado = service.PersonalService.get_empleado(db, empleado_id)
    if not db_empleado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empleado no encontrado"
        )
    return db_empleado


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
def update_empleado(
    empleado_id: int,
    empleado: schemas.EmpleadoUpdate,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Actualizar empleado"""
    # Solo Administrador puede asignar puestos Director, Gerente General, RH
    if empleado.puesto_id is not None:
        puesto = service.PersonalService.get_puesto(db, empleado.puesto_id)
        if puesto and service.PersonalService._nombre_reservado(puesto.nombre):
            if not current_extra.get("is_superuser"):
                raise HTTPException(
                    status_code=403,
                    detail="Solo el Administrador puede asignar los puestos Director, Gerente General y RH."
                )
    db_empleado = service.PersonalService.update_empleado(db, empleado_id, empleado)
    if not db_empleado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empleado no encontrado"
        )
    return db_empleado


@router.patch("/empleados/{empleado_id}/permisos-especiales", response_model=schemas.EmpleadoResponse)
def set_permisos_especiales(
    empleado_id: int,
    body: schemas.PermisosEspecialesUpdate,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    """
    Actualiza los permisos especiales de un empleado (exento_incidencias, puede_checar_remoto).
    Solo el Administrador (superuser) puede usar este endpoint.
    """
    if not current_extra.get("is_superuser"):
        raise HTTPException(status_code=403, detail="Solo el Administrador puede gestionar permisos especiales.")
    emp = service.PersonalService.get_empleado(db, empleado_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    if body.exento_incidencias is not None:
        emp.exento_incidencias = body.exento_incidencias
    if body.puede_checar_remoto is not None:
        emp.puede_checar_remoto = body.puede_checar_remoto
    db.commit()
    db.refresh(emp)
    return emp


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
