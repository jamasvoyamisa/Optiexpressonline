"""
Programador de tareas en segundo plano.
Ejecuta procesar_dia automáticamente cada día para generar incidencias (faltas, salidas anticipadas).
"""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None
TZ_MEXICO = ZoneInfo("America/Mexico_City")


def _ejecutar_procesar_dia():
    """Ejecuta procesar_dia para el día anterior. Usa su propia sesión de BD."""
    from app.core.database import SessionLocal
    from app.modules.asistencia.service import AsistenciaService

    db = SessionLocal()
    try:
        resultado = AsistenciaService.procesar_dia(db, fecha_str=None)
        logger.info(f"Procesar día automático: {resultado}")
    except Exception as e:
        logger.exception(f"Error en procesar_dia automático: {e}")
    finally:
        db.close()


def _ejecutar_vacaciones_periodos():
    """Actualiza periodos LFT (nuevo aniversario = nuevo periodo) para todos los empleados activos."""
    from app.core.database import SessionLocal
    from app.modules.vacaciones.service import VacacionesService

    db = SessionLocal()
    try:
        res = VacacionesService.ensure_periodos_empleados_activos_job(db)
        logger.info(f"Vacaciones periodos LFT automático: {res}")
    except Exception as e:
        logger.exception(f"Error en vacaciones periodos automático: {e}")
    finally:
        db.close()


def _ejecutar_vacaciones_auto_confirm_rh():
    """APROBADA_JEFE → APROBADA si faltan ≤24 h para el inicio y RH no registró formal."""
    from app.core.database import SessionLocal
    from app.modules.vacaciones.service import VacacionesService

    db = SessionLocal()
    try:
        res = VacacionesService.auto_confirmar_rh_si_plazo_24h(db)
        if res.get("auto_confirmadas"):
            logger.info(f"Vacaciones auto-confirmación RH 24h: {res}")
    except Exception as e:
        logger.exception(f"Error en auto-confirmación vacaciones RH: {e}")
    finally:
        db.close()


def _ejecutar_si_pendiente():
    """
    Si son pasadas las 02:00 hora México y aún no se ha ejecutado hoy,
    ejecuta procesar_dia (por si el servidor reinició después de la hora programada).
    """
    now = datetime.now(TZ_MEXICO)
    if now.hour >= 2:
        logger.info("Ejecutando procesar_dia al arrancar (recuperación tras reinicio)")
        _ejecutar_procesar_dia()
        logger.info("Ejecutando vacaciones periodos LFT al arrancar (recuperación tras reinicio)")
        _ejecutar_vacaciones_periodos()


def iniciar_scheduler():
    """Inicia el programador: asistencias 02:00; periodos LFT 02:15; auto-RH vacaciones cada hora (hora México)."""
    global _scheduler
    if _scheduler is not None:
        return

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        _ejecutar_procesar_dia,
        CronTrigger(hour=2, minute=0, timezone=TZ_MEXICO),
        id="procesar_dia",
    )
    _scheduler.add_job(
        _ejecutar_vacaciones_periodos,
        CronTrigger(hour=2, minute=15, timezone=TZ_MEXICO),
        id="vacaciones_periodos_lft",
    )
    _scheduler.add_job(
        _ejecutar_vacaciones_auto_confirm_rh,
        CronTrigger(minute=0, timezone=TZ_MEXICO),
        id="vacaciones_auto_confirm_rh_24h",
    )
    _scheduler.start()
    logger.info(
        "Scheduler iniciado: procesar_dia 02:00; vacaciones LFT 02:15; auto-RH vacaciones cada hora (México)"
    )

    # Ejecutar en background para no bloquear el arranque del servidor
    import threading
    def _run_pendiente():
        try:
            _ejecutar_si_pendiente()
        except Exception as e:
            logger.exception(f"Error en ejecución pendiente: {e}")
    threading.Thread(target=_run_pendiente, daemon=True).start()


def detener_scheduler():
    """Detiene el programador."""
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler detenido")
