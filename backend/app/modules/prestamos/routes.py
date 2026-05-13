from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.deps import get_current_empleado_with_rol
from app.core.config import settings
from app.modules.audit.negocio import registrar_negocio
from . import service, schemas

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/prestamos", tags=["prestamos"])


def _puede_gestion_rh_prestamos(current: dict) -> bool:
    """Admin, RH o Director: listados amplios y alta en nombre de terceros (módulo RH)."""
    return bool(current.get("is_superuser") or current.get("is_rh") or current.get("is_director"))


@router.get("", response_model=List[schemas.SolicitudPrestamoResponse])
def listar(
    empleado_id: Optional[int] = None,
    estado: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """
    Lista solicitudes de préstamo.
    - Empleado: solo las propias.
    - RH/Admin: todas, con filtros opcionales.
    """
    user_id = int(current["user_id"])
    puede_rh = _puede_gestion_rh_prestamos(current)
    if not puede_rh and empleado_id is not None and empleado_id != user_id:
        raise HTTPException(status_code=403, detail="Solo puedes ver tus propias solicitudes")
    if not puede_rh:
        empleado_id = user_id
    include_canceladas = bool(
        current.get("is_superuser")
        or current.get("is_rh")
        or current.get("is_director")
        or (empleado_id and empleado_id == user_id)
    )
    sols = service.listar_solicitudes(
        db,
        empleado_id=empleado_id,
        estado=estado,
        include_canceladas=include_canceladas,
        skip=skip,
        limit=limit,
    )
    return [
        schemas.SolicitudPrestamoResponse.model_validate(s).model_copy(
            update={"saldo_restante": service.calcular_saldo_restante(s)}
        )
        for s in sols
    ]


@router.post("", response_model=schemas.SolicitudPrestamoResponse, status_code=status.HTTP_201_CREATED)
def crear(
    data: schemas.SolicitudPrestamoCreate,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    """El empleado crea su propia solicitud de préstamo."""
    empleado_id = int(current["user_id"])
    try:
        sol = service.crear_solicitud(db, data, empleado_id)
        registrar_negocio(
            db,
            empleado_id=empleado_id,
            mensaje=f"Solicitud de préstamo creada id={sol.id} monto={sol.monto}",
        )
        return schemas.SolicitudPrestamoResponse.model_validate(sol).model_copy(
            update={"saldo_restante": service.calcular_saldo_restante(sol)}
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/rh", response_model=schemas.SolicitudPrestamoResponse, status_code=status.HTTP_201_CREATED)
def crear_rh(
    data: schemas.SolicitudPrestamoCreateRH,
    current: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db),
):
    """RH o Director crea una solicitud en nombre de un empleado."""
    if not _puede_gestion_rh_prestamos(current):
        raise HTTPException(status_code=403, detail="Solo RH o Director pueden crear solicitudes en nombre de empleados")
    puede_excepcion = bool(
        current.get("is_superuser") or current.get("is_director") or current.get("is_gerente_general")
    )
    if data.es_excepcion and not puede_excepcion:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo Gerente General, Director o Administrador pueden marcar excepción a la política de monto y plazo.",
        )
    permitir_excepcion = puede_excepcion and data.es_excepcion
    try:
        sol = service.crear_solicitud_rh(db, data, permitir_excepcion=permitir_excepcion)
        actor = int(current["user_id"])
        registrar_negocio(
            db,
            empleado_id=actor,
            mensaje=f"Solicitud de préstamo (RH) id={sol.id} para empleado_id={sol.empleado_id} monto={sol.monto}",
        )
        return schemas.SolicitudPrestamoResponse.model_validate(sol).model_copy(
            update={"saldo_restante": service.calcular_saldo_restante(sol)}
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/pendientes-mi-departamento", response_model=List[schemas.SolicitudPrestamoResponse])
def pendientes_mi_departamento(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """Solicitudes pendientes del departamento cuyo jefe es el usuario actual."""
    if current.get("is_superuser"):
        sols = service.listar_solicitudes(db, empleado_id=None, estado="pendiente", skip=skip, limit=limit)
    elif current.get("is_director"):
        # Director: autoriza solicitudes del Gerente General.
        sols = service.listar_pendientes_gerente_general(db, skip=skip, limit=limit)
    else:
        jefe_id = int(current["user_id"])
        sols = service.listar_pendientes_departamento(db, jefe_id=jefe_id, skip=skip, limit=limit)
    return [
        schemas.SolicitudPrestamoResponse.model_validate(s).model_copy(
            update={"saldo_restante": service.calcular_saldo_restante(s)}
        )
        for s in sols
    ]


@router.get("/pendientes-deposito", response_model=List[schemas.SolicitudPrestamoResponse])
def pendientes_deposito(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """Autorizadas por gerente de departamento; pendientes de depósito y referencia (Gerente General)."""
    if not current.get("is_superuser") and not current.get("is_director") and not current.get("is_gerente_general"):
        raise HTTPException(
            status_code=403,
            detail="Solo Gerente General, Director o Administrador pueden ver solicitudes pendientes de depósito",
        )
    sols = service.listar_pendientes_deposito(db, skip=skip, limit=limit)
    return [
        schemas.SolicitudPrestamoResponse.model_validate(s).model_copy(
            update={"saldo_restante": service.calcular_saldo_restante(s)}
        )
        for s in sols
    ]


@router.get("/solicitudes-pendientes", response_model=List[schemas.SolicitudPrestamoResponse])
def solicitudes_pendientes(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """Alias: mismas solicitudes que pendientes-mi-departamento (gerente de departamento)."""
    if current.get("is_superuser"):
        sols = service.listar_solicitudes(db, empleado_id=None, estado="pendiente", skip=skip, limit=limit)
    elif current.get("is_director"):
        sols = service.listar_pendientes_gerente_general(db, skip=skip, limit=limit)
    else:
        jefe_id = int(current["user_id"])
        sols = service.listar_pendientes_departamento(db, jefe_id=jefe_id, skip=skip, limit=limit)
    return [
        schemas.SolicitudPrestamoResponse.model_validate(s).model_copy(
            update={"saldo_restante": service.calcular_saldo_restante(s)}
        )
        for s in sols
    ]


@router.get("/solicitudes-pendientes-rh", response_model=List[schemas.SolicitudPrestamoResponse])
def solicitudes_pendientes_rh(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """Préstamos depositados pendientes de confirmación de RH (registro en nómina)."""
    if not current.get("is_superuser") and not current.get("is_rh") and not current.get("is_director"):
        raise HTTPException(status_code=403, detail="Solo RH o Director pueden acceder a este listado")
    sols = service.listar_pendientes_confirmacion_rh(db, skip=skip, limit=limit)
    return [
        schemas.SolicitudPrestamoResponse.model_validate(s).model_copy(
            update={"saldo_restante": service.calcular_saldo_restante(s)}
        )
        for s in sols
    ]


@router.get("/mi-area", response_model=List[schemas.SolicitudPrestamoResponse])
def solicitudes_mi_area(
    estado: Optional[str] = None,
    departamento_id: Optional[int] = Query(
        None,
        description="Solo superusuario: filtrar por departamento del solicitante.",
    ),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """Solicitudes de préstamos del personal del área que administra el usuario actual."""
    if current.get("is_superuser"):
        if departamento_id is not None:
            sols = service.listar_solicitudes_mi_area(
                db,
                departamento_ids=[departamento_id],
                estado=estado,
                skip=skip,
                limit=limit,
            )
        else:
            sols = service.listar_solicitudes(
                db, empleado_id=None, estado=estado, include_canceladas=True, skip=skip, limit=limit
            )
    else:
        dept_ids = current.get("departamento_ids_que_administro") or []
        if not dept_ids:
            return []
        sols = service.listar_solicitudes_mi_area(
            db,
            departamento_ids=dept_ids,
            estado=estado,
            skip=skip,
            limit=limit,
        )
    return [
        schemas.SolicitudPrestamoResponse.model_validate(s).model_copy(
            update={"saldo_restante": service.calcular_saldo_restante(s)}
        )
        for s in sols
    ]


@router.get("/{solicitud_id}", response_model=schemas.SolicitudPrestamoResponse)
def obtener(
    solicitud_id: int,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    sol = service.get_solicitud(db, solicitud_id)
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    user_id = int(current["user_id"])
    if not _puede_gestion_rh_prestamos(current) and sol.empleado_id != user_id:
        raise HTTPException(status_code=403, detail="No tienes permiso para ver esta solicitud")
    estado_sol = getattr(sol.estado, "value", str(sol.estado)).lower()
    if estado_sol == "cancelada" and sol.empleado_id != user_id and not _puede_gestion_rh_prestamos(current):
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    return schemas.SolicitudPrestamoResponse.model_validate(sol).model_copy(
        update={"saldo_restante": service.calcular_saldo_restante(sol)}
    )


@router.put("/{solicitud_id}", response_model=schemas.SolicitudPrestamoResponse)
def actualizar(
    solicitud_id: int,
    data: schemas.SolicitudPrestamoUpdate,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    sol = service.get_solicitud(db, solicitud_id)
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    user_id = int(current["user_id"])
    if sol.empleado_id != user_id:
        raise HTTPException(status_code=403, detail="Solo puedes editar tus propias solicitudes")
    result = service.actualizar_solicitud(db, solicitud_id, data)
    if not result:
        raise HTTPException(status_code=400, detail="La solicitud no está pendiente o no se pudo actualizar")
    return schemas.SolicitudPrestamoResponse.model_validate(result).model_copy(
        update={"saldo_restante": service.calcular_saldo_restante(result)}
    )


@router.post("/{solicitud_id}/aprobar-departamento", response_model=schemas.SolicitudPrestamoResponse)
def aprobar_departamento(
    solicitud_id: int,
    data: schemas.AprobarRechazarPrestamo,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """Gerente del departamento del solicitante autoriza o rechaza (pendiente → aprobada_departamento / rechazada)."""
    aprobador_id = int(current["user_id"])
    es_superuser = bool(current.get("is_superuser"))
    es_director = bool(current.get("is_director"))
    sol = service.get_solicitud(db, solicitud_id)
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if sol.estado != "pendiente":
        raise HTTPException(status_code=404, detail="Solicitud no encontrada o no está pendiente")

    # Permitir aprobación a quien administre el departamento (gerente/supervisor) o superuser.
    dept_ids_admin = current.get("departamento_ids_que_administro") or []
    dept_id_sol = getattr(sol.empleado, "departamento_id", None) if sol.empleado else None
    puede_aprobar_area = bool(dept_id_sol and dept_id_sol in dept_ids_admin)
    solicitante_es_gg = service.empleado_es_gerente_general(db, sol.empleado_id)
    puede_aprobar_por_rol_especial = solicitante_es_gg and (es_director or es_superuser)
    if not es_superuser and not puede_aprobar_area and not puede_aprobar_por_rol_especial:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el gerente o supervisor del área del solicitante puede autorizar esta solicitud.",
        )
    try:
        result = service.aprobar_departamento(
            db,
            solicitud_id,
            data.aprobado,
            aprobador_id,
            data.comentarios,
            es_superuser=(es_superuser or puede_aprobar_area),
            es_director=es_director,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada o no está pendiente")
    registrar_negocio(
        db,
        empleado_id=aprobador_id,
        mensaje=f"Préstamo id={solicitud_id} autorización departamento: {'aprobada' if data.aprobado else 'rechazada'}",
    )
    return schemas.SolicitudPrestamoResponse.model_validate(result).model_copy(
        update={"saldo_restante": service.calcular_saldo_restante(result)}
    )


@router.post("/{solicitud_id}/depositar", response_model=schemas.SolicitudPrestamoResponse)
def depositar(
    solicitud_id: int,
    data: schemas.DepositarPrestamo,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """Gerente General / Director / Admin registra depósito y referencia bancaria."""
    if not current.get("is_superuser") and not current.get("is_director") and not current.get("is_gerente_general"):
        raise HTTPException(
            status_code=403,
            detail="Solo Gerente General, Director o Administrador pueden registrar el depósito",
        )
    depositador_id = int(current["user_id"])
    try:
        result = service.marcar_depositado(
            db,
            solicitud_id,
            data.referencia_bancaria,
            depositador_id,  # reservado para auditoría futura
            data.comentarios,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if not result:
        raise HTTPException(
            status_code=404,
            detail="Solicitud no encontrada o no está autorizada por departamento (pendiente de depósito)",
        )
    registrar_negocio(
        db,
        empleado_id=depositador_id,
        mensaje=f"Préstamo id={solicitud_id} depósito registrado ref={data.referencia_bancaria}",
    )
    return schemas.SolicitudPrestamoResponse.model_validate(result).model_copy(
        update={"saldo_restante": service.calcular_saldo_restante(result)}
    )


@router.post("/{solicitud_id}/aprobar", response_model=schemas.SolicitudPrestamoResponse)
def aprobar_legacy(
    solicitud_id: int,
    data: schemas.AprobarRechazarPrestamo,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """Obsoleto: use POST /aprobar-departamento."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Este endpoint ya no aplica. Use POST /prestamos/{id}/aprobar-departamento como gerente de departamento.",
    )


@router.put("/{solicitud_id}/confirmar-rh", response_model=schemas.SolicitudPrestamoResponse)
def confirmar_rh(
    solicitud_id: int,
    data: schemas.ConfirmarRHPrestamo,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    """RH confirma registro en nómina del préstamo ya depositado; notifica al empleado."""
    if not current.get("is_superuser") and not current.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH puede confirmar préstamos")
    rh_uid = int(current["user_id"])
    result = service.confirmar_rh(db, solicitud_id, data.comentarios)
    if not result:
        raise HTTPException(
            status_code=404,
            detail="Solicitud no encontrada o no está depositada (pendiente de confirmación RH)",
        )
    registrar_negocio(
        db,
        empleado_id=rh_uid,
        mensaje=f"Préstamo id={solicitud_id} confirmado en nómina por RH",
    )
    return schemas.SolicitudPrestamoResponse.model_validate(result).model_copy(
        update={"saldo_restante": service.calcular_saldo_restante(result)}
    )


@router.delete("/{solicitud_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancelar(
    solicitud_id: int,
    db: Session = Depends(get_db),
    current: dict = Depends(get_current_empleado_with_rol),
):
    sol = service.get_solicitud(db, solicitud_id)
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    user_id = int(current["user_id"])
    if sol.empleado_id != user_id:
        raise HTTPException(status_code=403, detail="Solo puedes cancelar tus propias solicitudes")
    result = service.cancelar_solicitud(db, solicitud_id)
    if not result:
        raise HTTPException(status_code=400, detail="La solicitud no está pendiente o no se pudo cancelar")
