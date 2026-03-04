"""
Endpoints para protocolo iClock/ADMS de ZKTeco.
El dispositivo envía datos directamente a estas rutas.
En desarrollo: http://localhost:9081/iclock/...
En producción: https://tu-servidor.com/iclock/...
"""
from fastapi import APIRouter, Depends, Request, Query
from typing import Optional
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.core.database import get_db
from app.modules.asistencia import models
from app.modules.asistencia.biometric.agent_auth import verify_serial_number
from app.modules.personal import models as personal_models
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/iclock", tags=["iClock ADMS"])


def _process_getrequest(db: Session, serial: str, test: bool = False, client_ip: Optional[str] = None, actualizar_conexion: bool = True) -> str:
    """
    Lógica de getrequest. Retorna el body de respuesta. Si test=False, marca usuarios como enviados.
    actualizar_conexion: solo True cuando la llamada viene del dispositivo real (/iclock/getrequest).
    Si False (ej. force-getrequest desde la web), NO actualiza ultima_llamada ni ultima_ip.
    """
    if not serial:
        return "OK"
    dispositivo = verify_serial_number(db, serial)
    if not dispositivo:
        logger.warning(f"Dispositivo NO registrado con SN={serial!r}")
        return "OK"
    if not test:
        if actualizar_conexion and client_ip:
            dispositivo.ultima_llamada_getrequest = datetime.now(timezone.utc)
            dispositivo.ultima_ip_conexion = client_ip[:50]
            logger.info(f"Conexión REAL dispositivo ADMS: SN={serial} -> {dispositivo.nombre} desde IP={client_ip}")
    pendientes = db.query(models.UsuarioPendienteDispositivo).filter(
        models.UsuarioPendienteDispositivo.dispositivo_id == dispositivo.id,
        models.UsuarioPendienteDispositivo.enviado == False
    ).order_by(models.UsuarioPendienteDispositivo.created_at).all()
    lines = []
    for p in pendientes:
        pin = str(p.numero_empleado).strip()
        name = (p.nombre or "").strip() or pin
        userinfo = "\t".join([
            f"PIN={pin}", f"Name={name}", "Pri=0", "Passwd=", "Card=", "Grp=1",
            "TZ=0000000100000000", "Verify=0", "ViceCard=", "StartDatetime=0", "EndDatetime=0"
        ])
        lines.append(f"USERINFO\t{userinfo}")
        if not test:
            p.enviado = True
            p.enviado_at = datetime.now(timezone.utc)
            logger.info(f"Enviando USERINFO al dispositivo {serial}: PIN={pin}, Name={name}")
    if (pendientes and not test) or (dispositivo and not test):
        db.commit()
    # Algunos ZKTeco esperan \n; probar ambos formatos
    return "\n".join(lines) + "\nOK" if lines else "OK"


def _get_client_ip(request: Request) -> str:
    """Obtiene la IP del cliente (considera X-Forwarded-For si hay proxy)."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


@router.get("/getrequest", response_class=PlainTextResponse)
async def iclock_getrequest(
    request: Request,
    SN: Optional[str] = Query(None, alias="SN"),
    sn: Optional[str] = Query(None, include_in_schema=False),
    test: Optional[str] = Query(None, description="Si=1, devuelve preview sin marcar enviado"),
    db: Session = Depends(get_db)
):
    """
    Ping del dispositivo ZKTeco.
    El dispositivo llama a GET /iclock/getrequest?SN=XXXXXXXXXX
    Responde OK. Si hay usuarios pendientes de alta remota, incluye líneas USERINFO.
    """
    serial = (SN or sn or "").strip()
    client_ip = _get_client_ip(request)
    logger.info(f"iClock getrequest recibido: SN={serial!r} desde IP={client_ip or '?'}")
    return _process_getrequest(db, serial, test=(test == "1"), client_ip=client_ip)


@router.get("/cdata", response_class=PlainTextResponse)
async def iclock_cdata_get(
    request: Request,
    SN: Optional[str] = Query(None, alias="SN"),
    sn: Optional[str] = Query(None, include_in_schema=False),
    db: Session = Depends(get_db)
):
    """
    El MB160 envía GET /iclock/cdata?SN=XXX&options=all... primero.
    Responder OK para que continúe con getrequest y POST cdata.
    """
    serial = (SN or sn or "").strip()
    client_ip = _get_client_ip(request)
    if serial and client_ip:
        dispositivo = verify_serial_number(db, serial)
        if dispositivo:
            dispositivo.ultima_llamada_getrequest = datetime.now(timezone.utc)
            dispositivo.ultima_ip_conexion = client_ip[:50]
            db.commit()
            logger.info(f"Conexión REAL (GET cdata): SN={serial} -> {dispositivo.nombre} desde IP={client_ip}")
    return "OK"


@router.post("/cdata", response_class=PlainTextResponse)
async def iclock_cdata(
    request: Request,
    SN: Optional[str] = Query(None, alias="SN"),
    sn: Optional[str] = Query(None, include_in_schema=False),
    table: str = Query(...),
    stamp: str = Query("", alias="Stamp"),
    db: Session = Depends(get_db)
):
    """
    Recepción de datos del dispositivo ZKTeco (ATTLOG, OPERLOG).
    POST /iclock/cdata?SN=XXX&table=ATTLOG&Stamp=9999
    Body: datos tab-separated (PIN, DateTime, 0/1, ...)
    """
    serial = (SN or sn or "").strip()
    dispositivo = verify_serial_number(db, serial)
    if not dispositivo:
        logger.warning(f"Dispositivo no registrado: SN={serial}. Registra el dispositivo con este serial_number.")
        return "OK"  # Siempre OK para que el dispositivo no reintente infinitamente

    # Registrar IP y timestamp de conexión
    client_ip = _get_client_ip(request)
    dispositivo.ultima_llamada_getrequest = datetime.now(timezone.utc)
    dispositivo.ultima_ip_conexion = client_ip[:50] if client_ip else None
    db.commit()

    body = await request.body()
    raw_data = body.decode("utf-8", errors="ignore").strip()

    if not raw_data:
        return "OK"

    if table == "ATTLOG":
        _process_attlog(db, raw_data, dispositivo)
    elif table == "OPERLOG":
        _process_operlog(db, raw_data, dispositivo)
    else:
        logger.info(f"Tabla desconocida de dispositivo {serial}: {table}")

    return "OK"


def _process_attlog(db: Session, raw_data: str, dispositivo: models.Dispositivo):
    """
    Procesa ATTLOG: PIN\tDateTime\t0|1\t...
    0 = entrada, 1 = salida
    """
    for line in raw_data.split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        try:
            user_id = str(parts[0]).strip()
            timestamp_str = parts[1].strip()
            timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
        except (ValueError, IndexError) as e:
            logger.warning(f"Error parseando ATTLOG: {line} - {e}")
            continue

        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.numero_empleado == user_id
        ).first()

        if not empleado:
            logger.info(f"ADMS checada ignorada: empleado {user_id} no registrado en el sistema.")
            continue

        existente = db.query(models.Asistencia).filter(
            models.Asistencia.empleado_id == empleado.id,
            models.Asistencia.timestamp == timestamp,
        ).first()
        if existente:
            continue

        from .sync_service import SyncService
        tipo, es_tiempo_extra = SyncService._determinar_tipo(db, empleado.id, timestamp)

        asistencia = models.Asistencia(
            empleado_id=empleado.id,
            dispositivo_id=dispositivo.id,
            timestamp=timestamp,
            tipo=tipo,
            es_tiempo_extra=es_tiempo_extra,
            sincronizado=True
        )
        db.add(asistencia)
        logger.info(f"Checada ADMS: user={user_id}, {tipo.value}, extra={es_tiempo_extra}, {timestamp}")

    db.commit()


def _process_operlog(db: Session, raw_data: str, dispositivo: models.Dispositivo):
    """
    Procesa OPERLOG: PIN=2\tName=John\t...
    Registro de usuarios en el dispositivo. Opcional.
    """
    for line in raw_data.split("\n"):
        line = line.strip()
        if not line:
            continue
        data = {}
        for part in line.split("\t"):
            if "=" in part:
                k, v = part.split("=", 1)
                data[k.strip()] = v.strip()
        pin = data.get("PIN") or data.get("pin")
        name = data.get("Name") or data.get("name", "")
        if pin:
            logger.info(f"OPERLOG dispositivo {dispositivo.nombre}: PIN={pin}, Name={name}")

    db.commit()
