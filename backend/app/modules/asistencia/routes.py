from fastapi import APIRouter, Depends, HTTPException, status, Query, Header, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.core.database import get_db
from app.core.config import settings
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

@router.get("/server-url")
def get_server_url(request: Request):
    """URL del servidor para configurar ADMS en el dispositivo. El dispositivo debe poder alcanzar esta URL."""
    base = str(request.base_url).rstrip("/")
    return {"url": base, "getrequest": f"{base}/iclock/getrequest"}


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


@router.post("/devices/{device_id}/force-getrequest")
def force_getrequest(device_id: int, db: Session = Depends(get_db)):
    """
    Simula la llamada getrequest del dispositivo. Procesa usuarios pendientes y los marca como enviados.
    Nota: El dispositivo físico NO recibe los datos; esto solo ejecuta la lógica en el servidor.
    Útil para: probar, o cuando ya agregaste el usuario manualmente en el dispositivo.
    """
    dispositivo = service.AsistenciaService.get_dispositivo(db, device_id)
    if not dispositivo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dispositivo no encontrado")
    if not dispositivo.serial_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El dispositivo debe tener SN")
    # Ejecutar lógica de getrequest directamente (misma DB session).
    # actualizar_conexion=False: NO tocar ultima_llamada/ultima_ip (no es el dispositivo real).
    from .biometric.iclock_routes import _process_getrequest
    body = _process_getrequest(db, dispositivo.serial_number.strip(), test=False, actualizar_conexion=False)
    return {"response": body, "status": "ok"}


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
    """Ver si un empleado tiene templates de huella almacenados"""
    return db.query(models.FingerprintTemplate).filter(
        models.FingerprintTemplate.numero_empleado == numero_empleado.strip()
    ).all()


@router.post("/replicate-fingerprint")
def replicate_fingerprint(data: schemas.ReplicateRequest, db: Session = Depends(get_db)):
    """Replica huella de un empleado a dispositivos seleccionados.
    Agrega al usuario en la cola de cada dispositivo y el agente se encarga
    de subir el template cuando detecte que hay uno disponible."""
    templates = db.query(models.FingerprintTemplate).filter(
        models.FingerprintTemplate.numero_empleado == data.numero_empleado.strip()
    ).all()
    if not templates:
        raise HTTPException(status_code=400, detail="No hay huella registrada para este empleado. Primero registre la huella en un dispositivo.")

    results = []
    for did in data.dispositivo_ids:
        try:
            enqueue_data = schemas.EnqueueUserRequest(
                numero_empleado=data.numero_empleado.strip(),
                nombre=data.numero_empleado.strip(),
            )
            from app.modules.personal import models as pm
            emp = db.query(pm.Empleado).filter(pm.Empleado.numero_empleado == data.numero_empleado.strip()).first()
            if emp:
                enqueue_data.nombre = f"{emp.nombre} {emp.apellido_paterno or ''}".strip()

            existing_pending = db.query(models.UsuarioPendienteDispositivo).filter(
                models.UsuarioPendienteDispositivo.dispositivo_id == did,
                models.UsuarioPendienteDispositivo.numero_empleado == data.numero_empleado.strip(),
            ).first()
            if not existing_pending:
                service.AsistenciaService.enqueue_user(db, did, enqueue_data)

            results.append({"dispositivo_id": did, "ok": True})
        except Exception as e:
            results.append({"dispositivo_id": did, "ok": False, "error": str(e)})

    return {"results": results, "templates_count": len(templates)}


@router.get("/devices/{device_id}/preview-getrequest")
def preview_getrequest(device_id: int, base_url: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """
    Vista previa y diagnóstico. Devuelve qué recibiría el dispositivo y la URL que debe llamar.
    """
    dispositivo = service.AsistenciaService.get_dispositivo(db, device_id)
    if not dispositivo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dispositivo no encontrado")
    if not dispositivo.serial_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El dispositivo debe tener SN configurado")
    pendientes = service.AsistenciaService.get_pending_users(db, device_id, include_sent=False)
    lines = []
    for p in pendientes:
        pin = str(p.numero_empleado).strip()
        name = (p.nombre or "").strip() or pin
        userinfo = "\t".join([
            f"PIN={pin}", f"Name={name}", "Pri=0", "Passwd=", "Card=", "Grp=1",
            "TZ=0000000100000000", "Verify=0", "ViceCard=", "StartDatetime=0", "EndDatetime=0"
        ])
        lines.append(f"USERINFO\t{userinfo}")
    body = "\r\n".join(lines) + "\r\nOK" if lines else "OK"
    # URL que el dispositivo debe llamar (ej: http://192.168.1.100:9081/iclock/getrequest?SN=XXX)
    sn = dispositivo.serial_number.strip()
    url = f"{base_url or 'http://TU_SERVIDOR:9081'}/iclock/getrequest?SN={sn}"
    return {
        "preview": body,
        "pending_count": len(pendientes),
        "sn": sn,
        "url_dispositivo": url,
        "porque_no_envia": "El dispositivo debe llamar a la URL arriba. Si no se envía: 1) Verifica Server Address en el dispositivo = IP (ej: 192.168.2.55), Puerto = 9081  2) Verifica que el SN coincida exactamente  3) El dispositivo debe poder alcanzar el servidor."
    }


@router.post("/devices/{device_id}/pending-users/{pending_id}/retry")
def retry_pending_user(device_id: int, pending_id: int, db: Session = Depends(get_db)):
    """Reintentar envío: marca como no enviado para que el dispositivo lo reciba de nuevo en el próximo getrequest"""
    pendiente = db.query(models.UsuarioPendienteDispositivo).filter(
        models.UsuarioPendienteDispositivo.id == pending_id,
        models.UsuarioPendienteDispositivo.dispositivo_id == device_id
    ).first()
    if not pendiente:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    pendiente.enviado = False
    pendiente.enviado_at = None
    db.commit()
    return {"status": "ok", "message": "Se reenviará cuando el agente sincronice (o en el próximo getrequest)"}


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


# ========== ENDPOINTS PARA AGENTE (X-API-Key) ==========

def _get_device_from_api_key(x_api_key: str = Header(..., alias="X-API-Key"), db: Session = Depends(get_db)):
    from .biometric.agent_auth import verify_api_key
    dispositivo = verify_api_key(db, x_api_key)
    if not dispositivo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API Key inválida o dispositivo inactivo")
    dispositivo.ultima_sync_agente = datetime.utcnow()
    db.commit()
    return dispositivo


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
    """Obtiene templates pendientes de replicar a ESTE dispositivo.
    Busca usuarios enviados a este dispositivo que tengan template pero que el template
    venga de otro dispositivo (no de este)."""
    sent_users = db.query(models.UsuarioPendienteDispositivo).filter(
        models.UsuarioPendienteDispositivo.dispositivo_id == dispositivo.id,
        models.UsuarioPendienteDispositivo.enviado == True,
    ).all()
    numeros = [u.numero_empleado for u in sent_users]
    if not numeros:
        return []
    templates = db.query(models.FingerprintTemplate).filter(
        models.FingerprintTemplate.numero_empleado.in_(numeros),
        models.FingerprintTemplate.source_device_id != dispositivo.id,
    ).all()
    return [
        {
            "numero_empleado": t.numero_empleado,
            "finger_index": t.finger_index,
            "template_data": t.template_data,
        }
        for t in templates
    ]


@router.get("/agent/pending-deletes")
def agent_get_pending_deletes(
    dispositivo: models.Dispositivo = Depends(_get_device_from_api_key),
    db: Session = Depends(get_db)
):
    """Obtiene usuarios pendientes de eliminar de este dispositivo"""
    pending = db.query(models.PendingDelete).filter(
        models.PendingDelete.dispositivo_id == dispositivo.id,
        models.PendingDelete.procesado == False,
    ).all()
    return [{"id": p.id, "numero_empleado": p.numero_empleado} for p in pending]


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
