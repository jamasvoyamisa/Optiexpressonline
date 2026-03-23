from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
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
    try:
        return service.PersonalService.create_empresa(db, empresa)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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
    try:
        emp = service.PersonalService.update_empresa(db, empresa_id, empresa)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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
    """Siguiente número de empleado = último numérico registrado en la empresa + 1.
    Solo considera valores totalmente numéricos; el formato (ceros a la izquierda) se
    mantiene acorde al ancho máximo existente."""
    digit_strs = [
        e.numero_empleado.strip()
        for e in db.query(models.Empleado.numero_empleado)
        .filter(models.Empleado.empresa_id == empresa_id)
        .all()
        if e.numero_empleado and str(e.numero_empleado).strip().isdigit()
    ]
    if not digit_strs:
        return {"numero_empleado": "1"}
    numeros = [int(s) for s in digit_strs]
    siguiente = max(numeros) + 1
    sig_str = str(siguiente)
    min_width = max(len(s) for s in digit_strs)
    width = max(min_width, len(sig_str))
    return {"numero_empleado": sig_str.zfill(width)}


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


# ========== IMPORTACIÓN MASIVA DESDE XLSX ==========

@router.get("/importar/plantilla")
def descargar_plantilla_xlsx(
    db: Session = Depends(get_db),
    _current: dict = Depends(get_current_user),
):
    """Descarga una plantilla XLSX con las columnas necesarias y catálogos en hojas auxiliares."""
    from io import BytesIO
    from fastapi.responses import StreamingResponse
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, Protection
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    empresas = db.query(models.Empresa).filter(models.Empresa.activo == True).order_by(models.Empresa.nombre).all()
    deptos = db.query(models.Departamento).filter(models.Departamento.activo == True).order_by(models.Departamento.nombre).all()
    puestos = db.query(models.Puesto).filter(models.Puesto.activo == True).order_by(models.Puesto.nombre).all()

    wb = Workbook()

    thin = Side(style="thin", color="B0B0B0")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    hdr_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    hdr_fill = PatternFill(start_color="2B6CB0", end_color="2B6CB0", fill_type="solid")
    opt_fill = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
    align_c = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # ── Hoja principal: Empleados ──
    ws = wb.active
    ws.title = "Empleados"

    columnas = [
        ("numero_empleado", "No. Empleado *", 14),
        ("nombre", "Nombre *", 18),
        ("apellido_paterno", "Ap. Paterno *", 16),
        ("apellido_materno", "Ap. Materno *", 16),
        ("empresa", "Empresa *", 24),
        ("departamento", "Departamento *", 22),
        ("puesto", "Puesto *", 22),
        ("fecha_ingreso", "Fecha Ingreso * (DD/MM/AAAA)", 18),
        ("fecha_nacimiento", "Fecha Nacimiento (DD/MM/AAAA)", 18),
        ("email", "Email", 26),
        ("telefono", "Teléfono", 14),
        ("curp", "CURP", 20),
        ("rfc", "RFC", 15),
        ("nss", "NSS", 13),
        ("direccion", "Dirección", 30),
        ("colonia", "Colonia", 18),
        ("cp", "C.P.", 8),
        ("ciudad", "Ciudad", 16),
        ("contacto_emergencia", "Contacto Emergencia", 22),
        ("telefono_emergencia", "Tel. Emergencia", 16),
        ("password", "Contraseña", 14),
    ]

    for ci, (key, label, width) in enumerate(columnas, 1):
        cell = ws.cell(row=1, column=ci, value=label)
        cell.font = hdr_font
        cell.fill = hdr_fill
        cell.alignment = align_c
        cell.border = border
        ws.column_dimensions[get_column_letter(ci)].width = width
        # Columnas opcionales con fondo gris
        if "*" not in label:
            for r in range(2, 102):
                ws.cell(row=r, column=ci).fill = opt_fill

    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "A2"

    # ── Hoja catálogo: Empresas ──
    ws_emp = wb.create_sheet("Cat. Empresas")
    ws_emp.cell(row=1, column=1, value="Empresa").font = hdr_font
    ws_emp.cell(row=1, column=1).fill = hdr_fill
    ws_emp.column_dimensions["A"].width = 30
    for i, e in enumerate(empresas, 2):
        ws_emp.cell(row=i, column=1, value=e.nombre)

    # ── Hoja catálogo: Departamentos ──
    ws_dep = wb.create_sheet("Cat. Departamentos")
    ws_dep.cell(row=1, column=1, value="Departamento").font = hdr_font
    ws_dep.cell(row=1, column=1).fill = hdr_fill
    ws_dep.cell(row=1, column=2, value="Empresa").font = hdr_font
    ws_dep.cell(row=1, column=2).fill = hdr_fill
    ws_dep.column_dimensions["A"].width = 30
    ws_dep.column_dimensions["B"].width = 30
    emp_map = {e.id: e.nombre for e in empresas}
    for i, d in enumerate(deptos, 2):
        ws_dep.cell(row=i, column=1, value=d.nombre)
        ws_dep.cell(row=i, column=2, value=emp_map.get(d.empresa_id, ""))

    # ── Hoja catálogo: Puestos ──
    ws_pue = wb.create_sheet("Cat. Puestos")
    ws_pue.cell(row=1, column=1, value="Puesto").font = hdr_font
    ws_pue.cell(row=1, column=1).fill = hdr_fill
    ws_pue.column_dimensions["A"].width = 30
    for i, p in enumerate(puestos, 2):
        ws_pue.cell(row=i, column=1, value=p.nombre)

    # Validaciones desplegable para Empresa, Depto, Puesto
    if empresas:
        dv_emp = DataValidation(type="list", formula1=f"'Cat. Empresas'!$A$2:$A${len(empresas)+1}", allow_blank=False)
        dv_emp.error = "Seleccione una empresa del catálogo"
        dv_emp.prompt = "Seleccione empresa"
        ws.add_data_validation(dv_emp)
        dv_emp.add(f"E2:E1000")
    if deptos:
        dv_dep = DataValidation(type="list", formula1=f"'Cat. Departamentos'!$A$2:$A${len(deptos)+1}", allow_blank=False)
        ws.add_data_validation(dv_dep)
        dv_dep.add(f"F2:F1000")
    if puestos:
        dv_pue = DataValidation(type="list", formula1=f"'Cat. Puestos'!$A$2:$A${len(puestos)+1}", allow_blank=False)
        ws.add_data_validation(dv_pue)
        dv_pue.add(f"G2:G1000")

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="plantilla_empleados.xlsx"'},
    )


@router.post("/importar/xlsx")
async def importar_empleados_xlsx(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _current: dict = Depends(get_current_user),
):
    """
    Importa empleados desde un archivo XLSX.
    Busca empresa/departamento/puesto por nombre.
    Si el empleado (numero_empleado + empresa) ya existe, lo omite.
    Devuelve resumen de creados, omitidos y errores.
    """
    from io import BytesIO
    from openpyxl import load_workbook
    from datetime import datetime, date
    from app.core.security import get_password_hash

    if not file.filename or not file.filename.endswith(('.xlsx', '.XLSX')):
        raise HTTPException(status_code=400, detail="El archivo debe ser .xlsx")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Archivo demasiado grande (máx 10 MB)")

    try:
        wb = load_workbook(BytesIO(content), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="No se pudo leer el archivo XLSX")

    ws = wb.active
    if ws is None:
        raise HTTPException(status_code=400, detail="El archivo no tiene hojas")

    # Leer encabezados (fila 1)
    headers = []
    for cell in ws[1]:
        headers.append(str(cell.value or "").strip().lower())

    COL_MAP = {
        "no. empleado": "numero_empleado", "numero_empleado": "numero_empleado", "no empleado": "numero_empleado",
        "nombre": "nombre",
        "ap. paterno": "apellido_paterno", "apellido_paterno": "apellido_paterno", "ap paterno": "apellido_paterno",
        "ap. materno": "apellido_materno", "apellido_materno": "apellido_materno", "ap materno": "apellido_materno",
        "empresa": "empresa",
        "departamento": "departamento",
        "puesto": "puesto",
        "fecha ingreso": "fecha_ingreso", "fecha_ingreso": "fecha_ingreso",
        "fecha nacimiento": "fecha_nacimiento", "fecha_nacimiento": "fecha_nacimiento",
        "email": "email", "correo": "email",
        "telefono": "telefono", "teléfono": "telefono",
        "curp": "curp", "rfc": "rfc", "nss": "nss",
        "direccion": "direccion", "dirección": "direccion",
        "colonia": "colonia", "c.p.": "cp", "cp": "cp",
        "ciudad": "ciudad",
        "contacto emergencia": "contacto_emergencia", "contacto_emergencia": "contacto_emergencia",
        "tel. emergencia": "telefono_emergencia", "telefono_emergencia": "telefono_emergencia",
        "contraseña": "password", "password": "password", "contraseña": "password",
    }

    col_idx = {}
    for i, h in enumerate(headers):
        clean = h.replace("*", "").replace("(dd/mm/aaaa)", "").strip()
        mapped = COL_MAP.get(clean)
        if mapped:
            col_idx[mapped] = i

    required = ["numero_empleado", "nombre", "apellido_paterno", "apellido_materno", "empresa", "departamento", "puesto", "fecha_ingreso"]
    missing = [r for r in required if r not in col_idx]
    if missing:
        raise HTTPException(status_code=400, detail=f"Columnas faltantes: {', '.join(missing)}")

    # Cachear catálogos
    empresas_map = {}
    for e in db.query(models.Empresa).filter(models.Empresa.activo == True).all():
        empresas_map[e.nombre.strip().lower()] = e.id

    deptos_all = db.query(models.Departamento).filter(models.Departamento.activo == True).all()
    deptos_map = {}
    for d in deptos_all:
        deptos_map[(d.nombre.strip().lower(), d.empresa_id)] = d.id

    puestos_all = db.query(models.Puesto).filter(models.Puesto.activo == True).all()
    puestos_map = {}
    for p in puestos_all:
        puestos_map[p.nombre.strip().lower()] = p.id

    # Rol "empleado" por defecto
    rol_empleado = db.query(models.Rol).filter(models.Rol.nombre.ilike("%empleado%")).first()
    rol_id_default = rol_empleado.id if rol_empleado else None

    def get_cell(row_data, field):
        idx = col_idx.get(field)
        if idx is None or idx >= len(row_data):
            return None
        v = row_data[idx]
        if v is None:
            return None
        return str(v).strip() if not isinstance(v, (datetime, date)) else v

    def parse_date(val):
        if val is None:
            return None
        if isinstance(val, datetime):
            return val
        if isinstance(val, date):
            return datetime(val.year, val.month, val.day)
        s = str(val).strip()
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
            try:
                return datetime.strptime(s, fmt)
            except ValueError:
                continue
        return None

    creados = []
    omitidos = []
    errores = []

    for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        row_data = list(row)

        num_emp = get_cell(row_data, "numero_empleado")
        nombre = get_cell(row_data, "nombre")
        if not num_emp or not nombre:
            continue  # fila vacía

        ap_pat = get_cell(row_data, "apellido_paterno") or ""
        ap_mat = get_cell(row_data, "apellido_materno") or ""
        empresa_name = get_cell(row_data, "empresa") or ""
        depto_name = get_cell(row_data, "departamento") or ""
        puesto_name = get_cell(row_data, "puesto") or ""

        # Resolver IDs
        empresa_id = empresas_map.get(empresa_name.lower())
        if not empresa_id:
            errores.append({"fila": row_num, "error": f"Empresa no encontrada: '{empresa_name}'"})
            continue

        depto_id = deptos_map.get((depto_name.lower(), empresa_id))
        if not depto_id:
            errores.append({"fila": row_num, "error": f"Departamento '{depto_name}' no encontrado en empresa '{empresa_name}'"})
            continue

        puesto_id = puestos_map.get(puesto_name.lower())
        if not puesto_id:
            errores.append({"fila": row_num, "error": f"Puesto no encontrado: '{puesto_name}'"})
            continue

        fecha_ingreso = parse_date(get_cell(row_data, "fecha_ingreso"))
        if not fecha_ingreso:
            errores.append({"fila": row_num, "error": "Fecha de ingreso inválida o vacía"})
            continue

        # Ya existe?
        existing = db.query(models.Empleado).filter(
            models.Empleado.numero_empleado == str(num_emp),
            models.Empleado.empresa_id == empresa_id,
        ).first()
        if existing:
            omitidos.append({"fila": row_num, "numero_empleado": str(num_emp), "nombre": nombre, "razon": "Ya existe"})
            continue

        fecha_nac = parse_date(get_cell(row_data, "fecha_nacimiento"))
        email_val = get_cell(row_data, "email") or None
        if email_val:
            exists_email = db.query(models.Empleado).filter(models.Empleado.email == email_val).first()
            if exists_email:
                email_val = None  # evitar duplicado, se deja sin email

        password_raw = get_cell(row_data, "password")
        rfc_val = get_cell(row_data, "rfc") or ""

        try:
            emp_data = schemas.EmpleadoCreate(
                numero_empleado=str(num_emp),
                nombre=nombre,
                apellido_paterno=ap_pat,
                apellido_materno=ap_mat,
                empresa_id=empresa_id,
                departamento_id=depto_id,
                puesto_id=puesto_id,
                fecha_ingreso=fecha_ingreso,
                fecha_nacimiento=fecha_nac,
                email=email_val,
                telefono=get_cell(row_data, "telefono"),
                curp=get_cell(row_data, "curp"),
                rfc=rfc_val,
                nss=get_cell(row_data, "nss"),
                direccion=get_cell(row_data, "direccion"),
                colonia=get_cell(row_data, "colonia"),
                cp=get_cell(row_data, "cp"),
                ciudad=get_cell(row_data, "ciudad"),
                contacto_emergencia=get_cell(row_data, "contacto_emergencia"),
                telefono_emergencia=get_cell(row_data, "telefono_emergencia"),
                rol_id=rol_id_default,
                password=password_raw,
                estado=models.EstadoEmpleado.ACTIVO,
            )
            db_emp = service.PersonalService.create_empleado(db, emp_data)
            creados.append({"fila": row_num, "id": db_emp.id, "numero_empleado": str(num_emp), "nombre": f"{nombre} {ap_pat}"})
        except Exception as e:
            db.rollback()
            errores.append({"fila": row_num, "error": str(e)[:200]})

    wb.close()

    return {
        "total_filas": len(creados) + len(omitidos) + len(errores),
        "creados": len(creados),
        "omitidos": len(omitidos),
        "errores_count": len(errores),
        "detalle_creados": creados,
        "detalle_omitidos": omitidos,
        "detalle_errores": errores,
    }
