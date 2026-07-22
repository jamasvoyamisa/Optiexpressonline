from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta, date
from typing import Optional, Tuple
import logging

from app.modules.personal import models as personal_models
from app.modules.asistencia import models as asistencia_models
from app.modules.asistencia.service import AsistenciaService
from app.modules.asistencia.biometric.sync_service import (
    checada_anterior_a_alta_en_sistema,
    checada_anterior_a_fecha_ingreso,
)
from app.core.security import verify_and_upgrade_password
from app.core.timezone_utils import to_mexico, mexico_date_to_utc_range
from app.modules.asistencia.motivo_remoto import MOTIVOS_REMOTOS_VALIDOS
from .schemas import ChecadaRemotaResponse, EstadoChecadaRemotaResponse

logger = logging.getLogger(__name__)

DISPOSITIVO_PORTAL_NOMBRE = "Portal Checadas Remotas"


def _get_dispositivo_portal(db: Session) -> Optional[asistencia_models.Dispositivo]:
    """Obtiene o crea el dispositivo virtual para checadas remotas."""
    from app.modules.asistencia.biometric.agent_auth import generate_api_key

    dispositivo = db.query(asistencia_models.Dispositivo).filter(
        asistencia_models.Dispositivo.nombre == DISPOSITIVO_PORTAL_NOMBRE,
        asistencia_models.Dispositivo.activo == True,
    ).first()
    if dispositivo:
        return dispositivo
    dispositivo = asistencia_models.Dispositivo(
        nombre=DISPOSITIVO_PORTAL_NOMBRE,
        ubicacion="Portal Web",
        api_key=generate_api_key(),
        activo=True,
    )
    db.add(dispositivo)
    db.commit()
    db.refresh(dispositivo)
    logger.info(f"Dispositivo portal creado: id={dispositivo.id}")
    return dispositivo


def _contar_checadas_dia_mexico(db: Session, empleado_id: int, fecha_mex: date) -> int:
    dia_inicio_utc, dia_fin_utc = mexico_date_to_utc_range(fecha_mex)
    return (
        db.query(asistencia_models.Asistencia)
        .filter(
            asistencia_models.Asistencia.empleado_id == empleado_id,
            asistencia_models.Asistencia.timestamp >= dia_inicio_utc,
            asistencia_models.Asistencia.timestamp < dia_fin_utc,
        )
        .count()
    )


def checadas_requeridas_dia(
    db: Session,
    empleado: personal_models.Empleado,
    fecha_mex: date,
) -> Tuple[int, str]:
    """
    Cuántas checadas se esperan ese día (México), incluyendo incapacidad, vacaciones y vacaciones generales.
    Alineado con procesar_dia y con la lista de contexto de días.
    """
    ctx = AsistenciaService.contexto_dia_laboral_empleado(db, empleado, fecha_mex)
    return ctx["checadas_requeridas"], ctx["motivo"]


def _mensaje_dia_no_laboral(motivo: str) -> str:
    return {
        "festivo": "Hoy es día festivo. No aplica registrar checada.",
        "domingo": "Los domingos no aplica checada.",
        "sin_horario": "No tienes horario asignado. Contacta a RH.",
        "no_sabado": "No tienes horario de sábado. No aplica checada hoy.",
        "no_laborable": "Hoy no es día laborable según tu horario.",
        "incapacidad": "Tienes incapacidad registrada este día. No aplica registrar checada.",
        "vacacion_solicitud": "Tienes vacaciones por solicitud aprobada. No aplica registrar checada.",
        "vacacion_general": "Vacación general de empresa aplicada. No aplica registrar checada.",
        "domingo_laborable": "Domingo laborable según tu empresa.",
        "checada_especial": "Horario o checada especial. Revisa el mensaje de checadas.",
        "jornada_reducida": "Jornada reducida. Revisa las checadas requeridas.",
    }.get(motivo, "No aplica checada hoy.")


def _verificar_password(db: Session, empleado: personal_models.Empleado, password: str) -> bool:
    """Verifica la contraseña del empleado (bcrypt o SHA-256 legacy, con upgrade transparente)."""
    return verify_and_upgrade_password(db, empleado, password)


def _auth_portal_checada(
    db: Session,
    empresa_id: int,
    username: str,
    password: str,
    *,
    ip_cliente: Optional[str] = None,
) -> Tuple[Optional[personal_models.Empleado], Optional[str], int]:
    """
    Valida empresa + usuario + contraseña + permiso remoto.
    Devuelve (empleado, None, 200) o (None, mensaje_error, 401|429).
    """
    from app.core.config import settings
    from app.core.login_protection import (
        MSG_CREDENCIALES,
        MSG_DEMASIADOS,
        account_is_locked,
        clear_account_failures,
        clear_user_failures,
        is_user_rate_limited,
        log_account_lock,
        log_bruteforce_ip_alert,
        register_account_failure,
        register_auth_failure,
    )

    ruta = f"{settings.API_V1_PREFIX}/portal"
    login_key = username or ""

    if is_user_rate_limited(login_key):
        return None, MSG_DEMASIADOS, 429

    empresa = db.query(personal_models.Empresa).filter(
        personal_models.Empresa.id == empresa_id,
        personal_models.Empresa.activo == True,
        personal_models.Empresa.checadas_remotas == True,
    ).first()
    if not empresa:
        return None, "Empresa no disponible para checadas remotas.", 400

    user = (username or "").strip().lower()
    if not user:
        user_limited, alert_ip = register_auth_failure(login_key, ip_cliente)
        if alert_ip and ip_cliente:
            log_bruteforce_ip_alert(db, ip=ip_cliente, ruta=ruta)
        return None, (MSG_DEMASIADOS if user_limited else MSG_CREDENCIALES), (429 if user_limited else 401)

    empleado = db.query(personal_models.Empleado).filter(
        personal_models.Empleado.empresa_id == empresa_id,
        personal_models.Empleado.username == user,
        personal_models.Empleado.estado == personal_models.EstadoEmpleado.ACTIVO,
    ).first()
    if not empleado:
        user_limited, alert_ip = register_auth_failure(login_key, ip_cliente)
        if alert_ip and ip_cliente:
            log_bruteforce_ip_alert(db, ip=ip_cliente, ruta=ruta)
        return None, (MSG_DEMASIADOS if user_limited else MSG_CREDENCIALES), (429 if user_limited else 401)

    if account_is_locked(empleado):
        return None, MSG_DEMASIADOS, 401

    # Regla de negocio: usuarios especiales no deben registrar checadas.
    if getattr(empleado, "exento_incidencias", False):
        return None, "Usuario especial: no requiere registrar checadas.", 403

    if not empleado.puede_checar_remoto:
        return None, "No tienes permiso para checar de forma remota.", 403

    if not _verificar_password(db, empleado, password):
        user_limited, alert_ip = register_auth_failure(login_key, ip_cliente)
        if alert_ip and ip_cliente:
            log_bruteforce_ip_alert(db, ip=ip_cliente, ruta=ruta)
        was_unlocked = not account_is_locked(empleado)
        locked = register_account_failure(db, empleado)
        if locked and was_unlocked:
            log_account_lock(db, empleado=empleado, ip=ip_cliente, ruta=ruta)
        detail = MSG_DEMASIADOS if (user_limited or locked) else MSG_CREDENCIALES
        code = 429 if user_limited else 401
        return None, detail, code

    clear_user_failures(login_key)
    clear_account_failures(db, empleado)
    return empleado, None, 200


def estado_checada_remota(
    db: Session,
    empresa_id: int,
    username: str,
    password: str,
    *,
    ip_cliente: Optional[str] = None,
) -> EstadoChecadaRemotaResponse:
    """Consulta cuántas checadas llevas hoy vs las requeridas (sin registrar)."""
    empleado, err, code = _auth_portal_checada(
        db, empresa_id, username, password, ip_cliente=ip_cliente
    )
    if err or not empleado:
        # El portal (checadas_remotas.html) lee `mensaje`/`ok` y NO inspecciona el status HTTP.
        # Devolvemos 200 con ok=False para conservar el mensaje (credenciales, bloqueo, permiso, etc.).
        # La protección anti-fuerza bruta ya se aplicó dentro de _auth_portal_checada.
        return EstadoChecadaRemotaResponse(ok=False, mensaje=err or "Error.")

    ts_mex = to_mexico(datetime.now(timezone.utc))
    fecha_mex = ts_mex.date() if ts_mex else datetime.now(timezone.utc).date()
    requeridas, motivo = checadas_requeridas_dia(db, empleado, fecha_mex)
    count = _contar_checadas_dia_mexico(db, empleado.id, fecha_mex)
    nombre_emp = f"{empleado.nombre} {empleado.apellido_paterno or ''}".strip()

    if requeridas == 0:
        return EstadoChecadaRemotaResponse(
            ok=True,
            mensaje=_mensaje_dia_no_laboral(motivo),
            nombre_empleado=nombre_emp or None,
            checadas_hoy=count,
            requeridas_hoy=0,
            completado=True,
            dia_no_laboral=True,
        )

    completado = count >= requeridas
    msg = (
        f"Ya registraste las {requeridas} checadas necesarias de hoy."
        if completado
        else f"Checadas de hoy: {count} de {requeridas}."
    )
    return EstadoChecadaRemotaResponse(
        ok=True,
        mensaje=msg,
        nombre_empleado=nombre_emp or None,
        checadas_hoy=count,
        requeridas_hoy=requeridas,
        completado=completado,
        dia_no_laboral=False,
    )


def registrar_checada_remota(
    db: Session,
    empresa_id: int,
    username: str,
    password: str,
    motivo: Optional[str] = None,
    motivo_detalle: Optional[str] = None,
    latitud: Optional[float] = None,
    longitud: Optional[float] = None,
    geo_precision_m: Optional[float] = None,
    *,
    ip_cliente: Optional[str] = None,
) -> ChecadaRemotaResponse:
    """
    Autentica al empleado y registra una checada remota.
    Fase D: exige motivo (HO/TFO/OTRO) y ubicación (lat/lng) solo al momento de checar.
    No permite más registros cuando ya se alcanzaron las checadas requeridas del día.
    """
    empleado, err, code = _auth_portal_checada(
        db, empresa_id, username, password, ip_cliente=ip_cliente
    )
    if err or not empleado:
        # El portal (checadas_remotas.html) lee `mensaje`/`ok` y NO inspecciona el status HTTP.
        # Devolvemos 200 con ok=False para conservar el mensaje (credenciales, bloqueo, permiso, etc.).
        # La protección anti-fuerza bruta ya se aplicó dentro de _auth_portal_checada.
        return ChecadaRemotaResponse(ok=False, mensaje=err or "Error.")

    dispositivo = _get_dispositivo_portal(db)
    if not dispositivo:
        return ChecadaRemotaResponse(ok=False, mensaje="Error interno. Intente más tarde.")

    motivo_norm = (motivo or "").strip().upper()
    if motivo_norm not in MOTIVOS_REMOTOS_VALIDOS:
        return ChecadaRemotaResponse(
            ok=False,
            mensaje="Selecciona el motivo de la checada remota (HO, TFO u Otro).",
        )
    detalle = (motivo_detalle or "").strip() or None
    if motivo_norm == "OTRO" and not detalle:
        return ChecadaRemotaResponse(ok=False, mensaje="Indica el detalle del motivo «Otro».")
    if detalle and len(detalle) > 255:
        detalle = detalle[:255]

    if latitud is None or longitud is None:
        return ChecadaRemotaResponse(
            ok=False,
            mensaje="Se requiere tu ubicación al checar (solo en este momento; no se rastrea después).",
        )
    try:
        lat_f = float(latitud)
        lng_f = float(longitud)
    except (TypeError, ValueError):
        return ChecadaRemotaResponse(ok=False, mensaje="Ubicación inválida.")
    if not (-90.0 <= lat_f <= 90.0 and -180.0 <= lng_f <= 180.0):
        return ChecadaRemotaResponse(ok=False, mensaje="Ubicación fuera de rango.")

    prec_f = None
    if geo_precision_m is not None:
        try:
            prec_f = float(geo_precision_m)
        except (TypeError, ValueError):
            prec_f = None

    timestamp = datetime.now(timezone.utc)
    ts_mex = to_mexico(timestamp) or timestamp
    fecha_mex = ts_mex.date() if hasattr(ts_mex, "date") else datetime.now(timezone.utc).date()

    nombre_emp = f"{empleado.nombre} {empleado.apellido_paterno or ''}".strip()

    def _resp_bloqueo(mensaje: str) -> ChecadaRemotaResponse:
        c = _contar_checadas_dia_mexico(db, empleado.id, fecha_mex)
        req, _ = checadas_requeridas_dia(db, empleado, fecha_mex)
        return ChecadaRemotaResponse(
            ok=False,
            mensaje=mensaje,
            nombre_empleado=nombre_emp or None,
            checadas_hoy=c,
            requeridas_hoy=req,
            completado=False,
            dia_no_laboral=False,
        )

    if checada_anterior_a_alta_en_sistema(empleado, timestamp):
        return _resp_bloqueo(
            "No aplica checada: la marca sería anterior al alta de tu expediente en este sistema."
        )

    if checada_anterior_a_fecha_ingreso(empleado, timestamp):
        return _resp_bloqueo(
            "No aplica checada: aún no has iniciado labores según tu fecha de ingreso a la empresa."
        )

    requeridas, motivo_dia = checadas_requeridas_dia(db, empleado, fecha_mex)
    count = _contar_checadas_dia_mexico(db, empleado.id, fecha_mex)

    if requeridas == 0:
        return ChecadaRemotaResponse(
            ok=False,
            mensaje=_mensaje_dia_no_laboral(motivo_dia),
            nombre_empleado=nombre_emp or None,
            checadas_hoy=count,
            requeridas_hoy=0,
            completado=True,
            dia_no_laboral=True,
        )

    if count >= requeridas:
        return ChecadaRemotaResponse(
            ok=False,
            mensaje=f"Ya registraste las {requeridas} checadas necesarias de hoy. No es necesario volver a checar.",
            nombre_empleado=nombre_emp or None,
            checadas_hoy=count,
            requeridas_hoy=requeridas,
            completado=True,
            dia_no_laboral=False,
        )

    ventana = timedelta(seconds=5)
    existente = db.query(asistencia_models.Asistencia).filter(
        asistencia_models.Asistencia.empleado_id == empleado.id,
        asistencia_models.Asistencia.timestamp >= timestamp - ventana,
        asistencia_models.Asistencia.timestamp <= timestamp + ventana,
    ).first()
    if existente:
        ts_m = to_mexico(timestamp) or timestamp
        c2 = _contar_checadas_dia_mexico(db, empleado.id, fecha_mex)
        return ChecadaRemotaResponse(
            ok=True,
            mensaje="Checada registrada.",
            tipo=existente.tipo.value if existente.tipo else None,
            timestamp=ts_m.strftime("%Y-%m-%d %H:%M:%S") if hasattr(ts_m, "strftime") else None,
            nombre_empleado=nombre_emp or None,
            checadas_hoy=c2,
            requeridas_hoy=requeridas,
            completado=c2 >= requeridas,
            dia_no_laboral=False,
        )

    from app.modules.asistencia.biometric.sync_service import SyncService

    tipo, es_tiempo_extra = SyncService._determinar_tipo(db, empleado.id, timestamp)

    asistencia = asistencia_models.Asistencia(
        empleado_id=empleado.id,
        dispositivo_id=dispositivo.id,
        timestamp=timestamp,
        tipo=tipo,
        es_tiempo_extra=es_tiempo_extra,
        sincronizado=True,
        motivo_remoto=motivo_norm,
        motivo_remoto_detalle=detalle if motivo_norm == "OTRO" else None,
        latitud=lat_f,
        longitud=lng_f,
        geo_precision_m=prec_f,
    )
    db.add(asistencia)
    db.commit()
    db.refresh(asistencia)

    try:
        SyncService._detectar_incidencia(db, asistencia, empleado.id)
    except Exception as exc:
        logger.warning(f"Error al detectar incidencia automática: {exc}")

    db.commit()

    nuevo_count = _contar_checadas_dia_mexico(db, empleado.id, fecha_mex)
    completado = nuevo_count >= requeridas
    tipo_label = tipo.value if tipo else "entrada"
    ts_out = to_mexico(timestamp) or timestamp
    msg = f"Checada registrada: {tipo_label}"
    if completado:
        msg = f"Checada registrada: {tipo_label}. ¡Listo! Ya completaste las {requeridas} checadas de hoy."

    return ChecadaRemotaResponse(
        ok=True,
        mensaje=msg,
        tipo=tipo_label,
        timestamp=ts_out.strftime("%Y-%m-%d %H:%M:%S") if hasattr(ts_out, "strftime") else None,
        nombre_empleado=nombre_emp or None,
        checadas_hoy=nuevo_count,
        requeridas_hoy=requeridas,
        completado=completado,
        dia_no_laboral=False,
    )
