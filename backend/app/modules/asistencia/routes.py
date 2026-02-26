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
    """Agregar usuario a la cola para alta remota en el dispositivo (prueba MB160)"""
    try:
        return service.AsistenciaService.enqueue_user(db, device_id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


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
    return {"status": "ok", "message": "Se reenviará en el próximo getrequest del dispositivo"}


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
    return dispositivo


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
