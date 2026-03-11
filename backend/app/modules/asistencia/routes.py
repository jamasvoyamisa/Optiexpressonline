from fastapi import APIRouter, Depends, HTTPException, status, Query, Header
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, timezone
from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user
from app.core.deps import get_current_empleado_with_rol
from app.modules.personal import models as personal_models
from . import schemas, service, models
from .biometric.sync_service import SyncService

router = APIRouter(prefix=f"{settings.API_V1_PREFIX}/asistencia", tags=["Asistencia"])


# ========== SINCRONIZACIÓN DESDE AGENTE LOCAL ==========

@router.post("/device-sync", response_model=schemas.AsistenciaResponse, status_code=status.HTTP_201_CREATED)
def sync_attendance(
    sync_data: schemas.AsistenciaSync,
    x_api_key: str = Header(..., alias="X-API-Key", description="API Key del agente"),
    db: Session = Depends(get_db)
):
    """
    Endpoint para recibir checadas del agente local
    
    Este es el endpoint principal que usa el agente para enviar datos del dispositivo biométrico.
    
    Headers requeridos:
    - X-API-Key: API Key del dispositivo registrado
    
    Body:
    - user_id: Número de empleado en el dispositivo
    - timestamp: Fecha y hora de la checada (ISO format)
    - device_id: ID del dispositivo (opcional, se usa la API key)
    - tipo: "entrada" o "salida" (opcional, default: "entrada")
    """
    try:
        asistencia = SyncService.sync_attendance(db, sync_data, x_api_key)
        return asistencia
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al sincronizar asistencia: {str(e)}"
        )


# ========== DISPOSITIVOS ==========
# Nota: ADMS (conexión directa dispositivo→servidor) ya no se usa. Solo el agente local sincroniza.

@router.post("/devices", response_model=schemas.DispositivoResponse, status_code=status.HTTP_201_CREATED)
def create_dispositivo(dispositivo: schemas.DispositivoCreate, db: Session = Depends(get_db)):
    """Registrar nuevo dispositivo/agente"""
    return service.AsistenciaService.create_dispositivo(db, dispositivo)


@router.get("/devices", response_model=List[schemas.DispositivoResponse])
def get_dispositivos(
    activo: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """Listar dispositivos registrados"""
    return service.AsistenciaService.get_dispositivos(db, activo=activo)


@router.get("/devices/{device_id}", response_model=schemas.DispositivoResponse)
def get_dispositivo(device_id: int, db: Session = Depends(get_db)):
    """Obtener dispositivo por ID"""
    dispositivo = service.AsistenciaService.get_dispositivo(db, device_id)
    if not dispositivo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dispositivo no encontrado"
        )
    return dispositivo


@router.patch("/devices/{device_id}", response_model=schemas.DispositivoResponse)
def update_dispositivo(device_id: int, data: schemas.DispositivoUpdate, db: Session = Depends(get_db)):
    """Actualizar dispositivo (nombre, ip_local, ubicación, etc.)"""
    dispositivo = service.AsistenciaService.update_dispositivo(db, device_id, data)
    if not dispositivo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dispositivo no encontrado")
    return dispositivo


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dispositivo(device_id: int, db: Session = Depends(get_db)):
    """Eliminar dispositivo. No permite si tiene checadas registradas."""
    try:
        service.AsistenciaService.delete_dispositivo(db, device_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/devices/{device_id}/test-connection", response_model=schemas.TestConnectionResponse)
def test_connection(device_id: int, db: Session = Depends(get_db)):
    """Probar configuración: crea registro de prueba"""
    result = service.AsistenciaService.test_connection(db, device_id)
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["message"]
        )
    return result


@router.post("/devices/{device_id}/test-device-connection")
def test_real_device_connection(device_id: int, db: Session = Depends(get_db)):
    """Probar conexión REAL con el dispositivo (pyzk, puerto 4370). El backend debe estar en la misma red."""
    result = service.AsistenciaService.test_device_connection(db, device_id)
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["message"]
        )
    return result


@router.post("/devices/{device_id}/enqueue-user", response_model=schemas.UsuarioPendienteResponse, status_code=status.HTTP_201_CREATED)
def enqueue_user(
    device_id: int,
    data: schemas.EnqueueUserRequest,
    db: Session = Depends(get_db)
):
    """Agregar usuario a la cola para alta remota en un dispositivo"""
    try:
        return service.AsistenciaService.enqueue_user(db, device_id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/enqueue-user-multi")
def enqueue_user_multi(
    data: schemas.EnqueueUserRequest,
    dispositivo_ids: List[int] = Query(..., description="IDs de dispositivos destino"),
    db: Session = Depends(get_db)
):
    """Agregar usuario a la cola en multiples dispositivos a la vez"""
    results = []
    for did in dispositivo_ids:
        try:
            service.AsistenciaService.enqueue_user(db, did, data)
            results.append({"dispositivo_id": did, "ok": True})
        except ValueError as e:
            results.append({"dispositivo_id": did, "ok": False, "error": str(e)})
    return {"results": results}


@router.get("/fingerprint-templates/{numero_empleado}", response_model=List[schemas.FingerprintTemplateResponse])
def get_templates_for_employee(numero_empleado: str, db: Session = Depends(get_db)):
    """Ver si un empleado tiene templates de huella almacenados, con nombre del dispositivo origen"""
    templates = db.query(models.FingerprintTemplate).filter(
        models.FingerprintTemplate.numero_empleado == numero_empleado.strip()
    ).all()
    # Cargar nombres de dispositivos
    device_ids = {t.source_device_id for t in templates if t.source_device_id}
    dispositivos = {d.id: d.nombre for d in db.query(models.Dispositivo).filter(
        models.Dispositivo.id.in_(device_ids)
    ).all()} if device_ids else {}
    result = []
    for t in templates:
        item = schemas.FingerprintTemplateResponse.model_validate(t)
        item.source_device_nombre = dispositivos.get(t.source_device_id)
        result.append(item)
    return result


@router.post("/devices/{device_id}/pending-users/{pending_id}/retry")
def retry_pending_user(device_id: int, pending_id: int, db: Session = Depends(get_db)):
    """Reintentar envío: marca como no enviado para que el agente lo reenvíe en el próximo ciclo"""
    pendiente = db.query(models.UsuarioPendienteDispositivo).filter(
        models.UsuarioPendienteDispositivo.id == pending_id,
        models.UsuarioPendienteDispositivo.dispositivo_id == device_id
    ).first()
    if not pendiente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    pendiente.enviado = False
    pendiente.enviado_at = None
    db.commit()
    return {"status": "ok", "message": "Se reenviará cuando el agente sincronice"}


@router.get("/devices/{device_id}/pending-users", response_model=List[schemas.UsuarioPendienteResponse])
def get_pending_users(
    device_id: int,
    include_sent: bool = Query(False, description="Incluir usuarios ya enviados"),
    db: Session = Depends(get_db)
):
    """Listar usuarios en cola (pendientes y opcionalmente enviados)"""
    return service.AsistenciaService.get_pending_users(db, device_id, include_sent=include_sent)


@router.post("/devices/{device_id}/start-enroll", response_model=schemas.PendingEnrollResponse, status_code=status.HTTP_201_CREATED)
def start_enroll(
    device_id: int,
    data: schemas.StartEnrollRequest,
    db: Session = Depends(get_db)
):
    """Iniciar registro de huella para un usuario ya enviado al dispositivo. Requiere agente en la misma red."""
    try:
        return service.AsistenciaService.start_enroll(db, device_id, data.numero_empleado)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/devices/{device_id}/enroll-status/{enroll_id}", response_model=schemas.PendingEnrollResponse)
def get_enroll_status(
    device_id: int,
    enroll_id: int,
    db: Session = Depends(get_db)
):
    """Consultar el estado de un enroll pendiente (para polling desde el frontend)."""
    pe = db.query(models.PendingEnroll).filter(
        models.PendingEnroll.id == enroll_id,
        models.PendingEnroll.dispositivo_id == device_id,
    ).first()
    if not pe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enroll no encontrado")
    return pe


# ========== ENDPOINTS PARA AGENTE (X-API-Key) ==========

def _get_device_from_api_key(x_api_key: str = Header(..., alias="X-API-Key"), db: Session = Depends(get_db)):
    from .biometric.agent_auth import verify_api_key
    dispositivo = verify_api_key(db, x_api_key)
    if not dispositivo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API Key inválida o dispositivo inactivo")
    dispositivo.ultima_sync_agente = datetime.now(timezone.utc)
    db.commit()
    return dispositivo


@router.get("/agent/pin-to-numero")
def agent_get_pin_to_numero(
    dispositivo: models.Dispositivo = Depends(_get_device_from_api_key),
    db: Session = Depends(get_db)
):
    """Mapeo pin_checador -> numero_empleado para que el agente suba templates con numero_empleado correcto.
    El dispositivo guarda user_id=pin (1,2,3); al subir al backend necesitamos numero_empleado (124)."""
    from app.modules.personal import models as pm
    empleados = db.query(pm.Empleado).filter(
        pm.Empleado.pin_checador.isnot(None),
        pm.Empleado.pin_checador != ""
    ).all()
    mapping = {str(e.pin_checador).strip(): str(e.numero_empleado).strip() for e in empleados if e.pin_checador}
    # Incluir también usuarios pendientes de este dispositivo (por si aún no están en empleados con pin)
    pendientes = db.query(models.UsuarioPendienteDispositivo).filter(
        models.UsuarioPendienteDispositivo.dispositivo_id == dispositivo.id,
        models.UsuarioPendienteDispositivo.pin_checador.isnot(None),
    ).all()
    for p in pendientes:
        if p.pin_checador and p.numero_empleado:
            mapping[str(p.pin_checador).strip()] = str(p.numero_empleado).strip()
    return mapping


@router.get("/agent/diagnostic")
def agent_diagnostic(
    dispositivo: models.Dispositivo = Depends(_get_device_from_api_key),
    db: Session = Depends(get_db)
):
    """Diagnostico: verifica API Key y muestra usuarios pendientes (para depurar)"""
    pendientes = service.AsistenciaService.get_pending_users(db, dispositivo.id, include_sent=False)
    return {
        "ok": True,
        "dispositivo": {"id": dispositivo.id, "nombre": dispositivo.nombre},
        "pendientes": len(pendientes),
        "usuarios": [{"id": p.id, "numero_empleado": p.numero_empleado, "nombre": p.nombre} for p in pendientes]
    }


@router.get("/agent/pending-users", response_model=List[schemas.UsuarioPendienteResponse])
def agent_get_pending_users(
    dispositivo: models.Dispositivo = Depends(_get_device_from_api_key),
    db: Session = Depends(get_db)
):
    """Obtener usuarios pendientes de enviar (para agente con pyzk set_user)"""
    return service.AsistenciaService.get_pending_users(db, dispositivo.id, include_sent=False)


@router.post("/agent/pending-users/mark-sent")
def agent_mark_users_sent(
    data: schemas.MarkSentRequest,
    dispositivo: models.Dispositivo = Depends(_get_device_from_api_key),
    db: Session = Depends(get_db)
):
    """Marcar usuarios como enviados al dispositivo (llamado por el agente tras set_user)"""
    count = service.AsistenciaService.mark_users_sent(db, data.ids, dispositivo.id)
    return {"marked": count}


@router.get("/agent/pending-enroll", response_model=List[schemas.PendingEnrollResponse])
def agent_get_pending_enroll(
    dispositivo: models.Dispositivo = Depends(_get_device_from_api_key),
    db: Session = Depends(get_db)
):
    """Obtener enrolls pendientes (para agente con pyzk enroll_user)"""
    return service.AsistenciaService.get_pending_enrolls(db, dispositivo.id)


@router.post("/agent/pending-enroll/{enroll_id}/mark-done")
def agent_mark_enroll_done(
    enroll_id: int,
    success: bool = Query(True),
    dispositivo: models.Dispositivo = Depends(_get_device_from_api_key),
    db: Session = Depends(get_db)
):
    """Marcar enroll como completado (llamado por el agente tras enroll_user)"""
    ok = service.AsistenciaService.mark_enroll_done(db, enroll_id, dispositivo.id, success=success)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enroll no encontrado o ya procesado")
    return {"ok": True}


@router.post("/agent/upload-template")
def agent_upload_template(
    data: schemas.UploadTemplateRequest,
    dispositivo: models.Dispositivo = Depends(_get_device_from_api_key),
    db: Session = Depends(get_db)
):
    """El agente sube un template de huella despues del enroll exitoso"""
    existing = db.query(models.FingerprintTemplate).filter(
        models.FingerprintTemplate.numero_empleado == data.numero_empleado.strip(),
        models.FingerprintTemplate.finger_index == data.finger_index,
    ).first()
    if existing:
        existing.template_data = data.template_data
        existing.source_device_id = dispositivo.id
    else:
        tpl = models.FingerprintTemplate(
            numero_empleado=data.numero_empleado.strip(),
            finger_index=data.finger_index,
            template_data=data.template_data,
            source_device_id=dispositivo.id,
        )
        db.add(tpl)
    db.commit()
    return {"ok": True, "numero_empleado": data.numero_empleado.strip(), "finger_index": data.finger_index}


@router.get("/agent/pending-templates")
def agent_get_pending_templates(
    dispositivo: models.Dispositivo = Depends(_get_device_from_api_key),
    db: Session = Depends(get_db)
):
    """Usuarios ya enviados a este dispositivo con template de otro dispositivo (sin cola de replicación)."""
    sent_users = db.query(models.UsuarioPendienteDispositivo).filter(
        models.UsuarioPendienteDispositivo.dispositivo_id == dispositivo.id,
        models.UsuarioPendienteDispositivo.enviado == True,
    ).all()
    numero_to_user_id = {
        (u.numero_empleado or "").strip(): (u.pin_checador or u.numero_empleado or "").strip()
        for u in sent_users
    }
    numeros = list(numero_to_user_id.keys())
    if not numeros:
        return []
    templates = db.query(models.FingerprintTemplate).filter(
        models.FingerprintTemplate.numero_empleado.in_(numeros),
        models.FingerprintTemplate.source_device_id != dispositivo.id,
    ).all()
    return [
        {
            "numero_empleado": t.numero_empleado,
            "user_id": numero_to_user_id.get((t.numero_empleado or "").strip()) or t.numero_empleado,
            "finger_index": t.finger_index,
            "template_data": t.template_data,
            "create_user_first": False,
            "pending_replicate": False,
        }
        for t in templates
    ]


@router.get("/agent/pending-deletes")
def agent_get_pending_deletes(
    dispositivo: models.Dispositivo = Depends(_get_device_from_api_key),
    db: Session = Depends(get_db)
):
    """Obtiene usuarios pendientes de eliminar. Incluye pin_checador para que el agente elimine por ID del dispositivo."""
    pending = db.query(models.PendingDelete).filter(
        models.PendingDelete.dispositivo_id == dispositivo.id,
        models.PendingDelete.procesado == False,
    ).all()
    result = []
    for p in pending:
        emp = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.numero_empleado == p.numero_empleado
        ).first()
        pin = emp.pin_checador if emp else p.numero_empleado
        result.append({"id": p.id, "numero_empleado": p.numero_empleado, "pin_checador": pin or p.numero_empleado})
    return result


@router.post("/agent/pending-deletes/{delete_id}/mark-done")
def agent_mark_delete_done(
    delete_id: int,
    dispositivo: models.Dispositivo = Depends(_get_device_from_api_key),
    db: Session = Depends(get_db)
):
    """Marcar eliminacion como procesada"""
    pd = db.query(models.PendingDelete).filter(
        models.PendingDelete.id == delete_id,
        models.PendingDelete.dispositivo_id == dispositivo.id,
        models.PendingDelete.procesado == False,
    ).first()
    if not pd:
        raise HTTPException(status_code=404, detail="No encontrado o ya procesado")
    from datetime import datetime
    pd.procesado = True
    pd.procesado_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


# ========== DASHBOARD ==========

@router.get("/dashboard")
def get_dashboard_stats(
    departamento_ids: Optional[str] = Query(None, description="IDs de departamentos separados por coma para filtrar por área (solo para vista general)"),
    tipo_grafica: Optional[str] = Query("global", description="Tipo de gráfica de asistencia: global, empresa, area"),
    db: Session = Depends(get_db),
    current_extra: dict = Depends(get_current_empleado_with_rol),
):
    """
    Datos del dashboard. Admin/Director/Gerente General/RH ven todo; pueden filtrar por área con departamento_ids.
    Gerentes y supervisores ven solo datos de su área.
    """
    puede_ver = current_extra.get("puede_ver_dashboard") or current_extra.get("puede_ver_mi_area")
    if not puede_ver:
        raise HTTPException(status_code=403, detail="No tienes permiso para ver el dashboard")
    from datetime import date, timedelta
    from app.core.timezone_utils import mexico_date_to_utc_range
    from app.modules.personal import models as pm

    depto_ids = current_extra.get("departamento_ids_que_administro") or []
    tiene_vista_general = current_extra.get("puede_ver_dashboard")
    filtro_manual_ids = []
    if departamento_ids and tiene_vista_general:
        try:
            filtro_manual_ids = [int(x.strip()) for x in departamento_ids.split(",") if x.strip()]
        except ValueError:
            filtro_manual_ids = []
    if filtro_manual_ids:
        depto_ids = filtro_manual_ids
        solo_mi_area = True
    else:
        solo_mi_area = current_extra.get("puede_ver_mi_area") and not tiene_vista_general and depto_ids

    hoy = date.today()
    inicio_mes = hoy.replace(day=1)
    fin_mes = inicio_mes + timedelta(days=32)
    fin_mes = fin_mes.replace(day=1) - timedelta(days=1)

    # Base query empleados
    q_empleados = db.query(pm.Empleado)
    if solo_mi_area:
        q_empleados = q_empleados.filter(pm.Empleado.departamento_id.in_(depto_ids))

    total_empleados = q_empleados.count()
    empleados_activos = q_empleados.filter(pm.Empleado.estado == pm.EstadoEmpleado.ACTIVO).count()
    empleados_inactivos = q_empleados.filter(pm.Empleado.estado == pm.EstadoEmpleado.INACTIVO).count()
    empleados_baja = q_empleados.filter(pm.Empleado.estado == pm.EstadoEmpleado.BAJA).count()

    # Empresas y departamentos (para mi área: solo los de su ámbito)
    if solo_mi_area:
        total_departamentos = db.query(pm.Departamento).filter(
            pm.Departamento.activo == True,
            pm.Departamento.id.in_(depto_ids),
        ).count()
        deptos_area = db.query(pm.Departamento).filter(pm.Departamento.id.in_(depto_ids)).all()
        empresa_ids = list({d.empresa_id for d in deptos_area if d.empresa_id})
        total_empresas = db.query(pm.Empresa).filter(
            pm.Empresa.activo == True,
            pm.Empresa.id.in_(empresa_ids),
        ).count() if empresa_ids else 0
    else:
        total_empresas = db.query(pm.Empresa).filter(pm.Empresa.activo == True).count()
        total_departamentos = db.query(pm.Departamento).filter(pm.Departamento.activo == True).count()

    # Empleados del área para filtrar checadas e incidencias
    empleado_ids_area = None
    if solo_mi_area:
        empleado_ids_area = [e.id for e in db.query(pm.Empleado.id).filter(pm.Empleado.departamento_id.in_(depto_ids)).all()]

    dt_inicio, _ = mexico_date_to_utc_range(inicio_mes)
    _, dt_fin = mexico_date_to_utc_range(fin_mes + timedelta(days=1))

    q_checadas = db.query(models.Asistencia).filter(
        models.Asistencia.timestamp >= dt_inicio,
        models.Asistencia.timestamp < dt_fin,
    )
    if empleado_ids_area is not None:
        q_checadas = q_checadas.filter(models.Asistencia.empleado_id.in_(empleado_ids_area))
    checadas_mes = q_checadas.count()

    q_incidencias = db.query(models.Incidencia).filter(
        models.Incidencia.fecha >= dt_inicio,
        models.Incidencia.fecha < dt_fin,
    )
    if empleado_ids_area is not None:
        q_incidencias = q_incidencias.filter(models.Incidencia.empleado_id.in_(empleado_ids_area))
    incidencias_mes = q_incidencias.count()

    # Checadas por mes (últimos 12 meses)
    checadas_por_mes: list[dict] = []
    d = inicio_mes
    for _ in range(12):
        mes_fin = d + timedelta(days=32)
        mes_fin = mes_fin.replace(day=1) - timedelta(days=1)
        di, _ = mexico_date_to_utc_range(d)
        _, df = mexico_date_to_utc_range(mes_fin + timedelta(days=1))
        q = db.query(models.Asistencia).filter(
            models.Asistencia.timestamp >= di,
            models.Asistencia.timestamp < df,
        )
        if empleado_ids_area is not None:
            q = q.filter(models.Asistencia.empleado_id.in_(empleado_ids_area))
        count = q.count()
        checadas_por_mes.append({
            "mes": d.strftime("%Y-%m"),
            "label": d.strftime("%b %Y"),
            "checadas": count,
        })
        d = (d.replace(day=1) - timedelta(days=1)).replace(day=1)

    checadas_por_mes.reverse()

    # Gráfica de asistencia vs personal (hoy)
    hoy_inicio, _ = mexico_date_to_utc_range(hoy)
    _, hoy_fin = mexico_date_to_utc_range(hoy + timedelta(days=1))
    empleados_con_checada_hoy = set(
        r[0] for r in db.query(models.Asistencia.empleado_id).filter(
            models.Asistencia.timestamp >= hoy_inicio,
            models.Asistencia.timestamp < hoy_fin,
        ).distinct().all()
    )
    if empleado_ids_area is not None:
        empleados_con_checada_hoy &= set(empleado_ids_area)

    asistencia_grafica: dict = {}
    tipo_g = (tipo_grafica or "global").lower()

    if tipo_g == "global":
        if empleado_ids_area is not None:
            activos_ids = {e.id for e in db.query(pm.Empleado.id).filter(
                pm.Empleado.departamento_id.in_(depto_ids),
                pm.Empleado.estado == pm.EstadoEmpleado.ACTIVO,
            ).all()}
        else:
            activos_ids = {e.id for e in db.query(pm.Empleado.id).filter(
                pm.Empleado.estado == pm.EstadoEmpleado.ACTIVO,
            ).all()}
        personal_activos = len(activos_ids)
        con_asistencia = len(empleados_con_checada_hoy & activos_ids)
        asistencia_grafica = {
            "tipo": "global",
            "items": [{"label": "Personal", "personal": personal_activos, "con_asistencia": con_asistencia}],
        }
    elif tipo_g == "empresa":
        empresas = db.query(pm.Empresa).filter(pm.Empresa.activo == True).order_by(pm.Empresa.nombre).all()
        if empleado_ids_area is not None:
            deptos_area = db.query(pm.Departamento).filter(pm.Departamento.id.in_(depto_ids)).all()
            empresa_ids_scope = {d.empresa_id for d in deptos_area if d.empresa_id}
            empresas = [e for e in empresas if e.id in empresa_ids_scope]
        items = []
        for emp in empresas:
            emp_ids = [e.id for e in db.query(pm.Empleado.id).filter(
                pm.Empleado.empresa_id == emp.id,
                pm.Empleado.estado == pm.EstadoEmpleado.ACTIVO,
            ).all()]
            if empleado_ids_area is not None:
                emp_ids = [e for e in emp_ids if e in empleado_ids_area]
            personal = len(emp_ids)
            con_asistencia = len(empleados_con_checada_hoy & set(emp_ids))
            items.append({"label": emp.nombre, "personal": personal, "con_asistencia": con_asistencia})
        asistencia_grafica = {"tipo": "empresa", "items": items}
    elif tipo_g == "area":
        deptos = db.query(pm.Departamento).filter(pm.Departamento.activo == True).order_by(pm.Departamento.nombre).all()
        if empleado_ids_area is not None:
            deptos = [d for d in deptos if d.id in depto_ids]
        items = []
        for dept in deptos:
            emp_ids = [e.id for e in db.query(pm.Empleado.id).filter(
                pm.Empleado.departamento_id == dept.id,
                pm.Empleado.estado == pm.EstadoEmpleado.ACTIVO,
            ).all()]
            personal = len(emp_ids)
            con_asistencia = len(empleados_con_checada_hoy & set(emp_ids))
            items.append({"label": dept.nombre, "personal": personal, "con_asistencia": con_asistencia})
        asistencia_grafica = {"tipo": "area", "items": items}
    else:
        asistencia_grafica = {"tipo": "global", "items": []}

    return {
        "empleados": {
            "total": total_empleados,
            "activos": empleados_activos,
            "inactivos": empleados_inactivos,
            "baja": empleados_baja,
        },
        "empresas": total_empresas,
        "departamentos": total_departamentos,
        "checadas_mes_actual": checadas_mes,
        "incidencias_mes_actual": incidencias_mes,
        "checadas_por_mes": checadas_por_mes,
        "solo_mi_area": solo_mi_area,
        "asistencia_grafica": asistencia_grafica,
    }


# ========== ASISTENCIAS ==========

@router.get("/checadas", response_model=List[schemas.AsistenciaResponse])
def get_checadas(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    empleado_id: Optional[int] = None,
    dispositivo_id: Optional[int] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Listar checadas con filtros"""
    fecha_inicio_dt = None
    fecha_fin_dt = None
    
    if fecha_inicio:
        try:
            fecha_inicio_dt = datetime.fromisoformat(fecha_inicio)
        except:
            pass
    
    if fecha_fin:
        try:
            fecha_fin_dt = datetime.fromisoformat(fecha_fin)
        except:
            pass
    
    return service.AsistenciaService.get_asistencias(
        db,
        skip=skip,
        limit=limit,
        empleado_id=empleado_id,
        dispositivo_id=dispositivo_id,
        fecha_inicio=fecha_inicio_dt,
        fecha_fin=fecha_fin_dt
    )


@router.get("/mis-checadas", response_model=List[schemas.AsistenciaResponse])
def get_mis_checadas(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    current: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Checadas del empleado actual (portal del empleado). Requiere autenticación."""
    fecha_inicio_dt = None
    fecha_fin_dt = None
    if fecha_inicio:
        try:
            d = datetime.fromisoformat(fecha_inicio.replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            fecha_inicio_dt = d
        except Exception:
            pass
    if fecha_fin:
        try:
            d = datetime.fromisoformat(fecha_fin.replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            fecha_fin_dt = d
        except Exception:
            pass
    empleado_id = int(current["user_id"])
    return service.AsistenciaService.get_asistencias(
        db,
        skip=skip,
        limit=limit,
        empleado_id=empleado_id,
        fecha_inicio=fecha_inicio_dt,
        fecha_fin=fecha_fin_dt
    )


@router.post("/cleanup-employees")
def cleanup_employees(
    keep_numeros: List[str] = Query(..., description="Numeros de empleado a conservar"),
    db: Session = Depends(get_db)
):
    """
    Elimina empleados que NO estan en la lista keep_numeros.
    Tambien elimina sus checadas y registros pendientes.
    """
    from app.modules.personal import models as pm
    all_emps = db.query(pm.Empleado).all()
    deleted_names = []
    for emp in all_emps:
        if emp.numero_empleado not in keep_numeros:
            db.query(models.Asistencia).filter(models.Asistencia.empleado_id == emp.id).delete()
            db.query(models.UsuarioPendienteDispositivo).filter(
                models.UsuarioPendienteDispositivo.numero_empleado == emp.numero_empleado
            ).delete()
            db.query(models.PendingEnroll).filter(
                models.PendingEnroll.numero_empleado == emp.numero_empleado
            ).delete()
            deleted_names.append(f"{emp.numero_empleado} ({emp.nombre})")
            db.delete(emp)
    db.commit()
    return {"deleted": deleted_names, "kept": keep_numeros}


# ========== HORARIOS ==========

@router.post("/horarios", response_model=schemas.HorarioResponse, status_code=status.HTTP_201_CREATED)
def create_horario(horario: schemas.HorarioCreate, db: Session = Depends(get_db)):
    """Crear nuevo horario"""
    return service.AsistenciaService.create_horario(db, horario)


@router.get("/horarios", response_model=List[schemas.HorarioResponse])
def get_horarios(
    activo: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """Listar horarios"""
    return service.AsistenciaService.get_horarios(db, activo=activo)


# ========== INCIDENCIAS ==========

@router.post("/incidencias", response_model=schemas.IncidenciaResponse, status_code=status.HTTP_201_CREATED)
def create_incidencia(incidencia: schemas.IncidenciaCreate, db: Session = Depends(get_db)):
    """Crear nueva incidencia"""
    return service.AsistenciaService.create_incidencia(db, incidencia)


@router.get("/incidencias", response_model=List[schemas.IncidenciaResponse])
def get_incidencias(
    empleado_id: Optional[int] = None,
    tipo: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Listar incidencias con filtros"""
    fecha_inicio_dt = None
    fecha_fin_dt = None
    
    if fecha_inicio:
        try:
            fecha_inicio_dt = datetime.fromisoformat(fecha_inicio)
        except:
            pass
    
    if fecha_fin:
        try:
            fecha_fin_dt = datetime.fromisoformat(fecha_fin)
        except:
            pass
    
    return service.AsistenciaService.get_incidencias(
        db,
        empleado_id=empleado_id,
        tipo=tipo,
        fecha_inicio=fecha_inicio_dt,
        fecha_fin=fecha_fin_dt
    )


@router.get("/checadas/mi-area", response_model=List[schemas.AsistenciaResponse])
def get_checadas_mi_area(
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    limit: int = Query(2000, ge=1, le=5000),
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Checadas del personal del área del gerente/supervisor autenticado. Requiere autenticación."""
    empleado_id = current_extra["user_id"]
    is_superuser = current_extra.get("is_superuser") is True

    if is_superuser:
        empleado_ids = None
    else:
        from app.modules.personal import service as personal_service
        depto_ids = personal_service.PersonalService.get_departamento_ids_que_administro(db, empleado_id)
        if not depto_ids:
            return []
        empleados = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.departamento_id.in_(depto_ids)
        ).all()
        empleado_ids = [e.id for e in empleados]
        if not empleado_ids:
            return []

    fecha_inicio_dt = None
    fecha_fin_dt = None
    if fecha_inicio:
        try:
            fecha_inicio_dt = datetime.fromisoformat(fecha_inicio)
        except Exception:
            pass
    if fecha_fin:
        try:
            fecha_fin_dt = datetime.fromisoformat(fecha_fin)
        except Exception:
            pass

    if empleado_ids is None:
        return service.AsistenciaService.get_asistencias(
            db, skip=0, limit=limit,
            fecha_inicio=fecha_inicio_dt, fecha_fin=fecha_fin_dt
        )

    # Por cada empleado del área pedir hasta 500 checadas (suficiente para una quincena);
    # luego unir, ordenar y devolver hasta `limit` para no truncar solo a un subconjunto de empleados
    limit_por_empleado = 500
    resultados = []
    for eid in empleado_ids:
        resultados += service.AsistenciaService.get_asistencias(
            db, skip=0, limit=limit_por_empleado,
            empleado_id=eid,
            fecha_inicio=fecha_inicio_dt, fecha_fin=fecha_fin_dt
        )
    resultados.sort(key=lambda a: a.timestamp, reverse=True)
    return resultados[:limit]


@router.get("/incidencias/mi-area", response_model=List[schemas.IncidenciaResponse])
def get_incidencias_mi_area(
    tipo: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """
    Lista incidencias: si es jefe de área, las de su equipo; si es superuser, todas.
    Requiere autenticación.
    """
    empleado_id = current_extra["user_id"]
    is_superuser = current_extra.get("is_superuser") is True
    is_jefe = current_extra.get("is_jefe") is True

    if is_superuser:
        empleado_ids = None
    else:
        # Área que administro: departamentos donde soy jefe (gerente) o donde soy supervisor
        from app.modules.personal import service as personal_service
        depto_ids = personal_service.PersonalService.get_departamento_ids_que_administro(db, empleado_id)
        if not depto_ids:
            return []
        empleados = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.departamento_id.in_(depto_ids)
        ).all()
        empleado_ids = [e.id for e in empleados]
        if not empleado_ids:
            return []

    fecha_inicio_dt = None
    fecha_fin_dt = None
    if fecha_inicio:
        try:
            fecha_inicio_dt = datetime.fromisoformat(fecha_inicio)
        except Exception:
            pass
    if fecha_fin:
        try:
            fecha_fin_dt = datetime.fromisoformat(fecha_fin)
        except Exception:
            pass
    incidencias = service.AsistenciaService.get_incidencias(
        db,
        empleado_ids=empleado_ids,
        tipo=tipo,
        fecha_inicio=fecha_inicio_dt,
        fecha_fin=fecha_fin_dt
    )
    all_emp_ids = list({inc.empleado_id for inc in incidencias})
    empleados_map = {
        e.id: f"{e.nombre} {e.apellido_paterno or ''} {e.apellido_materno or ''}".strip()
        for e in db.query(personal_models.Empleado).filter(
            personal_models.Empleado.id.in_(all_emp_ids)
        ).all()
    }
    for inc in incidencias:
        inc.empleado_nombre = empleados_map.get(inc.empleado_id) or ""
    return incidencias


@router.patch("/incidencias/{incidencia_id}", response_model=schemas.IncidenciaResponse)
def update_incidencia(
    incidencia_id: int,
    body: schemas.IncidenciaUpdate,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """
    Actualizar incidencia (justificada, comentarios).
    Gerente: puede justificar incidencias de empleados y supervisores de su área.
    Supervisor: puede justificar solo incidencias de empleados (no de supervisores).
    """
    inc = service.AsistenciaService.get_incidencia(db, incidencia_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")
    current_id = current_extra["user_id"]
    if not current_extra.get("is_superuser"):
        from app.modules.personal import service as personal_service
        empleado = db.query(personal_models.Empleado).options(
            joinedload(personal_models.Empleado.puesto_rel)
        ).filter(personal_models.Empleado.id == inc.empleado_id).first()
        aprobadores = personal_service.PersonalService.get_ids_aprobadores_area(db, empleado.departamento_id if empleado else None)
        depto_ids_admin = current_extra.get("departamento_ids_que_administro") or []
        gg_puede_justificar_su_area = (
            current_extra.get("is_gerente_general") is True
            and empleado
            and empleado.departamento_id
            and empleado.departamento_id in depto_ids_admin
        )
        if current_id not in aprobadores and not gg_puede_justificar_su_area:
            raise HTTPException(
                status_code=403,
                detail="Solo el gerente o supervisor del área del empleado puede justificar esta incidencia"
            )
        # Supervisor solo puede justificar empleados; gerente puede justificar empleados y supervisores
        empleado_puesto = (empleado.puesto_rel.nombre or "").strip().lower() if (empleado and empleado.puesto_rel) else ""
        empleado_es_supervisor = "supervisor" in empleado_puesto
        empleado_es_gerente = "gerente" in empleado_puesto
        current_emp = db.query(personal_models.Empleado).options(
            joinedload(personal_models.Empleado.puesto_rel)
        ).filter(personal_models.Empleado.id == current_id).first()
        current_puesto = (current_emp.puesto_rel.nombre or "").strip().lower() if (current_emp and current_emp.puesto_rel) else ""
        current_es_solo_supervisor = "supervisor" in current_puesto and "gerente" not in current_puesto
        # Jefe de departamento se considera gerente para este fin
        current_es_jefe = db.query(personal_models.Departamento).filter(personal_models.Departamento.jefe_id == current_id).count() > 0
        current_es_gerente = "gerente" in current_puesto or current_es_jefe
        if current_es_solo_supervisor and (empleado_es_supervisor or empleado_es_gerente):
            raise HTTPException(
                status_code=403,
                detail="El supervisor solo puede justificar incidencias de empleados. Las de supervisores las justifica el gerente del área."
            )
    update_data = body.dict(exclude_unset=True)
    if body.justificada:
        update_data["justificado_por_id"] = current_id
    updated = service.AsistenciaService.update_incidencia(db, incidencia_id, update_data)
    return updated


# ========== HORARIOS ==========

@router.get("/horarios", response_model=List[schemas.HorarioResponse])
def get_horarios(
    activo: Optional[bool] = None,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Lista todos los horarios. Acceso: RH y superadmin."""
    return service.AsistenciaService.get_horarios(db, activo=activo)


@router.post("/horarios", response_model=schemas.HorarioResponse, status_code=status.HTTP_201_CREATED)
def create_horario(
    horario: schemas.HorarioCreate,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Crear horario. Solo RH y superadmin."""
    if not current_extra.get("is_superuser") and not current_extra.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH o superadmin pueden gestionar horarios")
    return service.AsistenciaService.create_horario(db, horario)


@router.put("/horarios/{horario_id}", response_model=schemas.HorarioResponse)
def update_horario(
    horario_id: int,
    horario: schemas.HorarioUpdate,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Actualizar horario. Solo RH y superadmin."""
    if not current_extra.get("is_superuser") and not current_extra.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH o superadmin pueden gestionar horarios")
    h = service.AsistenciaService.update_horario(db, horario_id, horario)
    if not h:
        raise HTTPException(status_code=404, detail="Horario no encontrado")
    return h


@router.delete("/horarios/{horario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_horario(
    horario_id: int,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Desactivar horario. Solo RH y superadmin."""
    if not current_extra.get("is_superuser") and not current_extra.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH o superadmin pueden gestionar horarios")
    if not service.AsistenciaService.delete_horario(db, horario_id):
        raise HTTPException(status_code=404, detail="Horario no encontrado")


# ========== ASIGNACIÓN DE HORARIO A EMPLEADO ==========

@router.get("/empleados/{empleado_id}/horarios", response_model=list[schemas.EmpleadoHorarioResponse])
def get_horarios_empleado(
    empleado_id: int,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Lista todos los horarios activos del empleado (puede haber varios para días distintos)."""
    return service.AsistenciaService.get_horarios_activos_empleado(db, empleado_id)


@router.get("/empleados/{empleado_id}/horario", response_model=schemas.EmpleadoHorarioResponse)
def get_horario_empleado(
    empleado_id: int,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Obtiene el primer horario activo del empleado (compatibilidad)."""
    eh = service.AsistenciaService.get_horario_activo_empleado(db, empleado_id)
    if not eh:
        raise HTTPException(status_code=404, detail="El empleado no tiene horario asignado")
    return eh


@router.post("/empleados/{empleado_id}/horario", response_model=schemas.EmpleadoHorarioResponse, status_code=status.HTTP_201_CREATED)
def assign_horario_empleado(
    empleado_id: int,
    body: schemas.AsignarHorarioRequest,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """
    Asigna un horario al empleado. Solo RH y superadmin.
    Si el nuevo horario comparte días con uno existente, reemplaza ese bloque de días.
    Horarios con días distintos coexisten (ej: L-V + Sábado).
    """
    if not current_extra.get("is_superuser") and not current_extra.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH o superadmin pueden asignar horarios")
    horario = service.AsistenciaService.get_horario(db, body.horario_id)
    if not horario:
        raise HTTPException(status_code=404, detail="Horario no encontrado")
    empleado = db.query(personal_models.Empleado).filter(personal_models.Empleado.id == empleado_id).first()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    try:
        return service.AsistenciaService.assign_horario_empleado(db, empleado_id, body.horario_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/empleados/{empleado_id}/horario/{asignacion_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_horario_asignacion(
    empleado_id: int,
    asignacion_id: int,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Quita una asignación de horario específica del empleado. Solo RH y superadmin."""
    if not current_extra.get("is_superuser") and not current_extra.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH o superadmin pueden gestionar horarios")
    if not service.AsistenciaService.remove_horario_empleado(db, empleado_id, asignacion_id):
        raise HTTPException(status_code=404, detail="Asignación no encontrada")


@router.delete("/empleados/{empleado_id}/horario", status_code=status.HTTP_204_NO_CONTENT)
def remove_todos_horarios_empleado(
    empleado_id: int,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Quita TODOS los horarios activos del empleado. Solo RH y superadmin."""
    if not current_extra.get("is_superuser") and not current_extra.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH o superadmin pueden gestionar horarios")
    if not service.AsistenciaService.remove_horario_empleado(db, empleado_id):
        raise HTTPException(status_code=404, detail="El empleado no tiene horario asignado")


# ========== PROCESO DIARIO ==========

@router.post("/horarios/procesar-dia")
def procesar_dia(
    fecha: Optional[str] = Query(None, description="Fecha YYYY-MM-DD (default: ayer)"),
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """
    Detecta faltas y checadas incompletas para todos los empleados con horario asignado.
    Si no se indica fecha, procesa el día de ayer.
    Solo RH y superadmin.
    """
    if not current_extra.get("is_superuser") and not current_extra.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH o superadmin pueden ejecutar este proceso")
    try:
        resultado = service.AsistenciaService.procesar_dia(db, fecha)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return resultado


# ========== DÍAS FESTIVOS ==========

@router.get("/festivos", response_model=list[schemas.DiaFestivoResponse])
def get_dias_festivos(
    año: Optional[int] = Query(None, description="Filtrar por año"),
    solo_activos: bool = Query(True),
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Lista días festivos. Con ?solo_activos=false devuelve todos."""
    return service.AsistenciaService.get_dias_festivos(db, año=año, solo_activos=solo_activos)


@router.post("/festivos", response_model=schemas.DiaFestivoResponse, status_code=status.HTTP_201_CREATED)
def create_dia_festivo(
    data: schemas.DiaFestivoCreate,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Crear día festivo manualmente. Solo superadmin y RH."""
    if not current_extra.get("is_superuser") and not current_extra.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH o superadmin")
    try:
        return service.AsistenciaService.create_dia_festivo(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/festivos/{festivo_id}", response_model=schemas.DiaFestivoResponse)
def update_dia_festivo(
    festivo_id: int,
    data: schemas.DiaFestivoUpdate,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Actualizar nombre, tipo o activo de un día festivo. Solo superadmin y RH."""
    if not current_extra.get("is_superuser") and not current_extra.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH o superadmin")
    festivo = service.AsistenciaService.update_dia_festivo(db, festivo_id, data)
    if not festivo:
        raise HTTPException(status_code=404, detail="Festivo no encontrado")
    return festivo


@router.delete("/festivos/{festivo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dia_festivo(
    festivo_id: int,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """Eliminar día festivo. Solo superadmin y RH."""
    if not current_extra.get("is_superuser") and not current_extra.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH o superadmin")
    if not service.AsistenciaService.delete_dia_festivo(db, festivo_id):
        raise HTTPException(status_code=404, detail="Festivo no encontrado")


@router.post("/festivos/generar/{año}", status_code=status.HTTP_200_OK)
def generar_festivos_año(
    año: int,
    current_extra: dict = Depends(get_current_empleado_with_rol),
    db: Session = Depends(get_db)
):
    """
    Auto-genera los días festivos LFT para el año indicado (Art. 74 + Semana Santa).
    Omite los que ya existen. Solo superadmin y RH.
    """
    if not current_extra.get("is_superuser") and not current_extra.get("is_rh"):
        raise HTTPException(status_code=403, detail="Solo RH o superadmin")
    if año < 2020 or año > 2099:
        raise HTTPException(status_code=400, detail="Año inválido (2020-2099)")
    return service.AsistenciaService.generar_festivos_año(db, año)


# ========== REPORTES ==========

@router.get("/reporte-resumen")
def reporte_resumen_asistencia(
    fecha_inicio: str = Query(..., description="YYYY-MM-DD"),
    fecha_fin: str = Query(..., description="YYYY-MM-DD"),
    empresa_id: Optional[int] = None,
    departamento_id: Optional[int] = None,
    empleado_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _current: dict = Depends(get_current_user),
):
    """
    Reporte de asistencia resumido por empleado.
    Devuelve para cada empleado: días laborables en el período, asistencias,
    faltas, retardos, salidas anticipadas e incapacidades.
    """
    from datetime import date, timedelta, datetime as dt
    from app.modules.personal import models as pm
    from app.modules.incapacidades import service as inc_svc
    from sqlalchemy import func as sqlfunc

    try:
        fi = date.fromisoformat(fecha_inicio)
        ff = date.fromisoformat(fecha_fin)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido (use YYYY-MM-DD)")

    if (ff - fi).days > 366:
        raise HTTPException(status_code=400, detail="El rango máximo es 1 año")

    # ── Obtener empleados del scope ──
    q = db.query(pm.Empleado).filter(pm.Empleado.estado == pm.EstadoEmpleado.ACTIVO)
    if empleado_id:
        q = q.filter(pm.Empleado.id == empleado_id)
    elif departamento_id:
        q = q.filter(pm.Empleado.departamento_id == departamento_id)
    elif empresa_id:
        q = q.filter(pm.Empleado.empresa_id == empresa_id)

    empleados = q.order_by(pm.Empleado.apellido_paterno, pm.Empleado.nombre).all()
    if not empleados:
        return []

    emp_ids = [e.id for e in empleados]

    # ── Festivos activos en el período ──
    festivos_bd = db.query(models.DiaFestivo).filter(
        models.DiaFestivo.activo == True,
        models.DiaFestivo.fecha >= fi,
        models.DiaFestivo.fecha <= ff,
    ).all()
    festivos_set = {f.fecha for f in festivos_bd}

    # ── Días laborables del período (lun–sáb, sin domingos ni festivos) ──
    def dias_laborables(inicio: date, fin: date) -> int:
        count = 0
        d = inicio
        while d <= fin:
            if d.weekday() != 6 and d not in festivos_set:  # 6=domingo
                count += 1
            d += timedelta(days=1)
        return count

    total_dias = dias_laborables(fi, ff)

    # ── Checadas en el período (rango UTC para días en México) ──
    from app.core.timezone_utils import mexico_date_to_utc_range
    dt_inicio_utc, _ = mexico_date_to_utc_range(fi)
    _, dt_fin_utc = mexico_date_to_utc_range(ff + timedelta(days=1))

    checadas_rows = db.query(
        models.Asistencia.empleado_id,
        models.Asistencia.timestamp,
    ).filter(
        models.Asistencia.empleado_id.in_(emp_ids),
        models.Asistencia.timestamp >= dt_inicio_utc,
        models.Asistencia.timestamp < dt_fin_utc,
    ).all()

    # Agrupar por empleado y día (en hora México)
    from app.core.timezone_utils import to_mexico
    dias_con_checada: dict[int, set] = {e.id: set() for e in empleados}
    dias_completos: dict[int, int] = {e.id: 0 for e in empleados}  # ≥4 checadas
    checadas_por_emp_dia: dict[tuple[int, str], int] = {}
    for row in checadas_rows:
        ts_mex = to_mexico(row.timestamp) or row.timestamp
        dia_str = ts_mex.strftime("%Y-%m-%d") if hasattr(ts_mex, "strftime") else str(row.timestamp.date())
        dias_con_checada[row.empleado_id].add(dia_str)
        key = (row.empleado_id, dia_str)
        checadas_por_emp_dia[key] = checadas_por_emp_dia.get(key, 0) + 1
    for (emp_id, dia_str), n in checadas_por_emp_dia.items():
        if n >= 4:
            dias_completos[emp_id] += 1

    # ── Incidencias en el período ──
    incidencias_rows = db.query(models.Incidencia).filter(
        models.Incidencia.empleado_id.in_(emp_ids),
        models.Incidencia.fecha >= dt_inicio_utc,
        models.Incidencia.fecha < dt_fin_utc,
    ).all()

    faltas: dict[int, int] = {e.id: 0 for e in empleados}
    faltas_justificadas: dict[int, int] = {e.id: 0 for e in empleados}
    incompletas: dict[int, int] = {e.id: 0 for e in empleados}
    retardos: dict[int, int] = {e.id: 0 for e in empleados}
    salidas_anticipadas: dict[int, int] = {e.id: 0 for e in empleados}

    for inc in incidencias_rows:
        eid = inc.empleado_id
        if inc.tipo == models.TipoIncidencia.FALTA:
            if inc.justificada:
                faltas_justificadas[eid] = faltas_justificadas.get(eid, 0) + 1
            else:
                faltas[eid] = faltas.get(eid, 0) + 1
        elif inc.tipo == models.TipoIncidencia.INCOMPLETA:
            incompletas[eid] = incompletas.get(eid, 0) + 1
        elif inc.tipo == models.TipoIncidencia.RETARDO:
            retardos[eid] = retardos.get(eid, 0) + 1
        elif inc.tipo == models.TipoIncidencia.SALIDA_ANTICIPADA:
            salidas_anticipadas[eid] = salidas_anticipadas.get(eid, 0) + 1

    # ── Incapacidades en el período ──
    from app.modules.incapacidades import models as inc_models
    incapacidades_rows = db.query(inc_models.Incapacidad).filter(
        inc_models.Incapacidad.empleado_id.in_(emp_ids),
        inc_models.Incapacidad.estado == inc_models.EstadoIncapacidad.ACTIVA,
        inc_models.Incapacidad.fecha_inicio <= ff,
        inc_models.Incapacidad.fecha_fin >= fi,
    ).all()

    dias_incapacidad: dict[int, int] = {e.id: 0 for e in empleados}
    for inc in incapacidades_rows:
        inicio_real = max(inc.fecha_inicio, fi)
        fin_real = min(inc.fecha_fin, ff)
        dias_incapacidad[inc.empleado_id] = (
            dias_incapacidad.get(inc.empleado_id, 0)
            + dias_laborables(inicio_real, fin_real)
        )

    # ── Armar departamentos y empresas para los empleados ──
    dep_ids = {e.departamento_id for e in empleados if e.departamento_id}
    emp_empresa_ids = {e.empresa_id for e in empleados if e.empresa_id}
    deptos_map = {
        d.id: d.nombre
        for d in db.query(pm.Departamento).filter(pm.Departamento.id.in_(dep_ids)).all()
    } if dep_ids else {}
    empresas_map = {
        em.id: em.nombre
        for em in db.query(pm.Empresa).filter(pm.Empresa.id.in_(emp_empresa_ids)).all()
    } if emp_empresa_ids else {}

    # ── Construir resultado ──
    resultado = []
    for emp in empleados:
        dias_asistio = len(dias_con_checada.get(emp.id, set()))
        f = faltas.get(emp.id, 0)
        fj = faltas_justificadas.get(emp.id, 0)
        inc = incompletas.get(emp.id, 0)
        r = retardos.get(emp.id, 0)
        sa = salidas_anticipadas.get(emp.id, 0)
        di = dias_incapacidad.get(emp.id, 0)
        dc = dias_completos.get(emp.id, 0)

        resultado.append({
            "empleado_id": emp.id,
            "numero_empleado": emp.numero_empleado,
            "nombre": emp.nombre,
            "apellido_paterno": emp.apellido_paterno or "",
            "apellido_materno": emp.apellido_materno or "",
            "empresa": empresas_map.get(emp.empresa_id, "") if emp.empresa_id else "",
            "departamento": deptos_map.get(emp.departamento_id, "") if emp.departamento_id else "",
            "total_dias_laborables": total_dias,
            "dias_asistio": dias_asistio,
            "dias_completos": dc,
            "faltas": f,
            "faltas_justificadas": fj,
            "incompletas": inc,
            "retardos": r,
            "salidas_anticipadas": sa,
            "dias_incapacidad": di,
            "puntualidad_pct": round(
                (dc / max(1, total_dias - di - f - fj)) * 100, 1
            ) if (total_dias - di - f - fj) > 0 else 0,
        })

    return resultado


@router.get("/reporte-detalle/{empleado_id}")
def reporte_detalle_empleado(
    empleado_id: int,
    fecha_inicio: str = Query(...),
    fecha_fin: str = Query(...),
    db: Session = Depends(get_db),
    _current: dict = Depends(get_current_user),
):
    """
    Detalle día a día de un empleado en el período: checadas, incidencias e incapacidades.
    """
    from datetime import date, timedelta, datetime as dt
    from app.modules.incapacidades import models as inc_models
    from app.core.timezone_utils import to_mexico, mexico_date_to_utc_range

    try:
        fi = date.fromisoformat(fecha_inicio)
        ff = date.fromisoformat(fecha_fin)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido")

    # Rango en UTC para el período (días en calendario México)
    dt_inicio_utc, _ = mexico_date_to_utc_range(fi)
    ff_end_utc, _ = mexico_date_to_utc_range(ff + timedelta(days=1))

    # Checadas en ese rango (por día en México)
    checadas = db.query(models.Asistencia).filter(
        models.Asistencia.empleado_id == empleado_id,
        models.Asistencia.timestamp >= dt_inicio_utc,
        models.Asistencia.timestamp < ff_end_utc,
    ).order_by(models.Asistencia.timestamp).all()

    # Incidencias (mismo rango UTC)
    incidencias = db.query(models.Incidencia).filter(
        models.Incidencia.empleado_id == empleado_id,
        models.Incidencia.fecha >= dt_inicio_utc,
        models.Incidencia.fecha < ff_end_utc,
    ).order_by(models.Incidencia.fecha).all()

    # Obtener nombres de quienes justificaron (consulta explícita, evita problemas de relación entre módulos)
    justificador_ids = {inc.justificado_por_id for inc in incidencias if inc.justificado_por_id}
    justificadores_map = {}
    if justificador_ids:
        for e in db.query(personal_models.Empleado).filter(personal_models.Empleado.id.in_(justificador_ids)).all():
            justificadores_map[e.id] = f"{e.nombre} {e.apellido_paterno or ''}".strip()

    # Incapacidades
    incapacidades = db.query(inc_models.Incapacidad).filter(
        inc_models.Incapacidad.empleado_id == empleado_id,
        inc_models.Incapacidad.estado == inc_models.EstadoIncapacidad.ACTIVA,
        inc_models.Incapacidad.fecha_inicio <= ff,
        inc_models.Incapacidad.fecha_fin >= fi,
    ).all()
    incap_ranges = [(i.fecha_inicio, i.fecha_fin, i.tipo) for i in incapacidades]

    # Construir vista diaria
    festivos_bd = db.query(models.DiaFestivo).filter(
        models.DiaFestivo.activo == True,
        models.DiaFestivo.fecha >= fi,
        models.DiaFestivo.fecha <= ff,
    ).all()
    festivos_map = {f.fecha: f.nombre for f in festivos_bd}

    # Agrupar checadas por día (hora mostrada en México)
    checadas_por_dia: dict[str, list] = {}
    for c in checadas:
        ts_mex = to_mexico(c.timestamp) or c.timestamp
        dia = ts_mex.strftime("%Y-%m-%d")
        checadas_por_dia.setdefault(dia, []).append({
            "hora": ts_mex.strftime("%H:%M"),
            "tipo": c.tipo.value if hasattr(c.tipo, "value") else str(c.tipo),
        })

    # Agrupar incidencias por día (fecha en México)
    incidencias_por_dia: dict[str, list] = {}
    for inc in incidencias:
        ts_mex = to_mexico(inc.fecha) or inc.fecha
        dia = ts_mex.strftime("%Y-%m-%d")
        justificado_por_nombre = justificadores_map.get(inc.justificado_por_id) if inc.justificado_por_id else None
        incidencias_por_dia.setdefault(dia, []).append({
            "tipo": inc.tipo.value if hasattr(inc.tipo, "value") else str(inc.tipo),
            "descripcion": inc.descripcion,
            "justificada": inc.justificada,
            "comentarios": inc.comentarios,  # observaciones del que justificó
            "justificado_por_nombre": justificado_por_nombre,
            "origen": inc.origen,
        })

    dias = []
    d = fi
    while d <= ff:
        dia_str = d.isoformat()
        es_domingo = d.weekday() == 6
        festivo = festivos_map.get(d)
        en_incapacidad = any(i[0] <= d <= i[1] for i in incap_ranges)
        dias.append({
            "fecha": dia_str,
            "dia_semana": ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][d.weekday()],
            "es_domingo": es_domingo,
            "es_festivo": festivo is not None,
            "festivo_nombre": festivo,
            "en_incapacidad": en_incapacidad,
            "checadas": checadas_por_dia.get(dia_str, []),
            "incidencias": incidencias_por_dia.get(dia_str, []),
        })
        d += timedelta(days=1)

    return {"empleado_id": empleado_id, "fecha_inicio": fecha_inicio, "fecha_fin": fecha_fin, "dias": dias}
