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


def _ejecutar_si_pendiente():
    """
    Si son pasadas las 02:00 hora México y aún no se ha ejecutado hoy,
    ejecuta procesar_dia (por si el servidor reinició después de la hora programada).
    """
    now = datetime.now(TZ_MEXICO)
    if now.hour >= 2:
        logger.info("Ejecutando procesar_dia al arrancar (recuperación tras reinicio)")
        _ejecutar_procesar_dia()


def iniciar_scheduler():
    """Inicia el programador. Ejecuta procesar_dia a las 02:00 hora México."""
    global _scheduler
    if _scheduler is not None:
        return

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        _ejecutar_procesar_dia,
        CronTrigger(hour=2, minute=0, timezone=TZ_MEXICO),
        id="procesar_dia",
    )
    _scheduler.start()
    logger.info("Scheduler iniciado: procesar_dia se ejecutará diariamente a las 02:00 (hora México)")

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
