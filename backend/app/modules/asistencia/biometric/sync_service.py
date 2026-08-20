from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone, date
from typing import Optional
import logging
from app.modules.asistencia import models, schemas
from app.modules.personal import models as personal_models
from app.modules.asistencia.biometric.agent_auth import verify_api_key
from app.core.timezone_utils import to_mexico, to_utc, mexico_date_to_utc_range
from app.modules.asistencia.checada_especial_resolver import (
    obtener_checada_especial_vigente,
    tiempos_incidencia_entrada_salida,
)

logger = logging.getLogger(__name__)


def _dia_checada_mexico(timestamp_utc: datetime) -> date:
    ts_m = to_mexico(timestamp_utc) or timestamp_utc
    return ts_m.date() if hasattr(ts_m, "date") else timestamp_utc.date()


def _as_utc_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def checada_anterior_a_alta_en_sistema(empleado, timestamp_utc: datetime) -> bool:
    """
    True si la checada es estrictamente anterior a empleado.created_at.
    El reloj puede traer marcas viejas; no pueden atribuirse a un expediente que aún no existía en BD.
    """
    cr = getattr(empleado, "created_at", None)
    if not cr or not isinstance(cr, datetime):
        return False
    ts = _as_utc_aware(timestamp_utc)
    cr_u = _as_utc_aware(cr)
    return ts < cr_u


def checada_anterior_a_fecha_ingreso(empleado, timestamp_utc: datetime) -> bool:
    """
    True si el día de la checada (zona México) es anterior al día de ingreso a la empresa (fecha_ingreso).
    Distinto de la alta en sistema (created_at).
    """
    fi = getattr(empleado, "fecha_ingreso", None)
    if not fi:
        return False
    dia_checada = _dia_checada_mexico(timestamp_utc)
    if isinstance(fi, datetime):
        dia_ingreso = (to_mexico(fi) or fi).date()
    elif isinstance(fi, date):
        dia_ingreso = fi
    else:
        return False
    return dia_checada < dia_ingreso


TIPO_LUNES_VIERNES = [
    models.TipoChecada.ENTRADA,
    models.TipoChecada.SALIDA_COMER,
    models.TipoChecada.REGRESO_COMER,
    models.TipoChecada.SALIDA,
]

TIPO_FIN_SEMANA = [
    models.TipoChecada.ENTRADA,
    models.TipoChecada.SALIDA,
]


class SyncService:

    @staticmethod
    def _determinar_tipo(db: Session, empleado_id: int, timestamp: datetime) -> tuple:
        """Auto-asigna tipo segun cuantas checadas tiene el empleado ese dia (en hora México).
        Lunes a viernes: entrada, salida_comer, regreso_comer, salida (4 checadas).
        Sabado/Domingo: entrada + salida (2) por defecto; 4 si la empresa tiene
        fin_semana_4_checadas.
        Returns (TipoChecada, es_tiempo_extra)
        """
        ts_mex = to_mexico(timestamp) or timestamp
        dia_mex = ts_mex.date() if hasattr(ts_mex, "date") else timestamp.date()
        dia_inicio_utc, dia_fin_utc = mexico_date_to_utc_range(dia_mex)

        checadas_hoy = db.query(models.Asistencia).filter(
            models.Asistencia.empleado_id == empleado_id,
            models.Asistencia.timestamp >= dia_inicio_utc,
            models.Asistencia.timestamp < dia_fin_utc,
        ).count()

        dia_semana = ts_mex.weekday() if hasattr(ts_mex, "weekday") else timestamp.weekday()
        es_domingo = dia_semana == 6
        es_fin_semana = dia_semana >= 5

        empleado_row = (
            db.query(personal_models.Empleado)
            .filter(personal_models.Empleado.id == empleado_id)
            .first()
        )
        ce = (
            obtener_checada_especial_vigente(db, empleado_id, dia_mex)
            if empleado_row
            else None
        )
        if ce and ce.checadas_requeridas == 2 and dia_semana < 5:
            secuencia = TIPO_FIN_SEMANA
        elif ce and ce.jornada_reducida_lv and dia_semana < 5:
            secuencia = TIPO_FIN_SEMANA
        elif es_fin_semana:
            fin4 = bool(
                empleado_row
                and empleado_row.empresa
                and getattr(empleado_row.empresa, "fin_semana_4_checadas", False)
            )
            secuencia = TIPO_LUNES_VIERNES if fin4 else TIPO_FIN_SEMANA
        else:
            secuencia = TIPO_LUNES_VIERNES

        if checadas_hoy >= len(secuencia):
            raise ValueError(
                f"Checada rechazada: el empleado {empleado_id} ya tiene {checadas_hoy} "
                f"de {len(secuencia)} marcas requeridas el {dia_mex}. "
                "No se permiten checadas adicionales ese día."
            )

        tipo = secuencia[checadas_hoy]

        # Tiempo extra: fuera del calendario laboral pactado de la empresa.
        # Antes se marcaba todo domingo como extra; en lun-dom el domingo es día normal.
        es_tiempo_extra = False
        if empleado_row and empleado_row.empresa:
            emp = empleado_row.empresa
            dias_lab = (emp.dias_laborales or "lun-sab").strip().lower()
            trabaja_fest = bool(getattr(emp, "trabaja_festivos", False))
        else:
            dias_lab = "lun-sab"
            trabaja_fest = False

        if es_domingo and dias_lab != "lun-dom":
            es_tiempo_extra = True
        else:
            # Import diferido: service importa SyncService en nivel de módulo.
            from app.modules.asistencia.service import AsistenciaService

            if AsistenciaService.es_dia_festivo(db, dia_mex) and not trabaja_fest:
                es_tiempo_extra = True

        return tipo, es_tiempo_extra

    @staticmethod
    def _limpiar_incidencias_si_dia_completo(
        db: Session,
        empleado_id: int,
        timestamp: datetime,
    ) -> None:
        """
        Tras guardar una checada (posiblemente tardía), verifica si el día ya quedó
        completo. Si es así, elimina cualquier FALTA o INCOMPLETA automática de ese día
        para no dejar incidencias falsas cuando el agente estuvo apagado.
        """
        dia_mex = _dia_checada_mexico(timestamp)
        dia_inicio_utc, dia_fin_utc = mexico_date_to_utc_range(dia_mex)

        checadas_hoy = db.query(models.Asistencia).filter(
            models.Asistencia.empleado_id == empleado_id,
            models.Asistencia.timestamp >= dia_inicio_utc,
            models.Asistencia.timestamp < dia_fin_utc,
        ).count()

        dia_semana = dia_mex.weekday()
        es_fin_semana = dia_semana >= 5

        empleado_row = (
            db.query(personal_models.Empleado)
            .filter(personal_models.Empleado.id == empleado_id)
            .first()
        )
        ce = (
            obtener_checada_especial_vigente(db, empleado_id, dia_mex)
            if empleado_row
            else None
        )
        if ce and ce.checadas_requeridas == 2 and dia_semana < 5:
            requeridas = 2
        elif ce and ce.jornada_reducida_lv and dia_semana < 5:
            requeridas = 2
        elif es_fin_semana:
            fin4 = bool(
                empleado_row
                and empleado_row.empresa
                and getattr(empleado_row.empresa, "fin_semana_4_checadas", False)
            )
            requeridas = 4 if fin4 else 2
        else:
            requeridas = 4

        if checadas_hoy < requeridas:
            return

        eliminadas = (
            db.query(models.Incidencia)
            .filter(
                models.Incidencia.empleado_id == empleado_id,
                models.Incidencia.fecha >= dia_inicio_utc,
                models.Incidencia.fecha < dia_fin_utc,
                models.Incidencia.tipo.in_([
                    models.TipoIncidencia.FALTA,
                    models.TipoIncidencia.INCOMPLETA,
                ]),
                models.Incidencia.origen == "automatico",
                models.Incidencia.justificada == False,
            )
            .all()
        )
        for inc in eliminadas:
            logger.info(
                "Incidencia automática eliminada por checadas tardías: "
                "empleado=%s tipo=%s fecha=%s (día ahora completo: %s/%s marcas)",
                empleado_id, inc.tipo.value, dia_mex, checadas_hoy, requeridas,
            )
            db.delete(inc)

    @staticmethod
    def _detectar_incidencia(
        db: Session,
        asistencia: models.Asistencia,
        empleado_id: int,
    ) -> None:
        """
        Detecta y crea incidencias automáticas basadas en el horario del empleado.
        Solo valida ENTRADA (retardo) y SALIDA (salida anticipada).
        La comida es libre (SALIDA_COMER y REGRESO_COMER no se validan).
        Usuarios con exento_incidencias no generan incidencias.
        """
        from sqlalchemy.orm import joinedload

        emp = db.query(personal_models.Empleado).filter(personal_models.Empleado.id == empleado_id).first()
        if emp and getattr(emp, "exento_incidencias", False):
            return

        # Obtener horario activo del empleado
        eh = (
            db.query(models.EmpleadoHorario)
            .options(joinedload(models.EmpleadoHorario.horario))
            .filter(
                models.EmpleadoHorario.empleado_id == empleado_id,
                models.EmpleadoHorario.activo == True,
            )
            .first()
        )
        if not eh or not eh.horario or not eh.horario.activo:
            return

        horario = eh.horario
        ts_utc = asistencia.timestamp
        ts = to_mexico(ts_utc) or ts_utc  # hora local México para comparar con horario
        tipo_checada = asistencia.tipo
        h_ent_s, h_sal_s, tolerancia = tiempos_incidencia_entrada_salida(
            db, empleado_id, ts, horario, emp
        )

        incidencia_tipo = None
        descripcion = None

        if tipo_checada == models.TipoChecada.ENTRADA:
            if not h_ent_s:
                return
            try:
                h_ent, m_ent = [int(x) for x in h_ent_s.split(":")[:2]]
            except Exception:
                return
            hora_esperada = ts.replace(hour=h_ent, minute=m_ent, second=0, microsecond=0)
            limite = hora_esperada + timedelta(minutes=tolerancia)
            if ts > limite:
                minutos_tarde = int((ts - hora_esperada).total_seconds() / 60)
                incidencia_tipo = models.TipoIncidencia.RETARDO
                descripcion = f"Retardo de {minutos_tarde} minuto(s). Hora entrada: {h_ent_s}, llegó: {ts.strftime('%H:%M')}"

        elif tipo_checada == models.TipoChecada.SALIDA:
            if not h_sal_s:
                return
            try:
                h_sal, m_sal = [int(x) for x in h_sal_s.split(":")[:2]]
            except Exception:
                return
            hora_esperada = ts.replace(hour=h_sal, minute=m_sal, second=0, microsecond=0)
            limite = hora_esperada - timedelta(minutes=tolerancia)
            if ts < limite:
                minutos_antes = int((hora_esperada - ts).total_seconds() / 60)
                incidencia_tipo = models.TipoIncidencia.SALIDA_ANTICIPADA
                descripcion = f"Salida anticipada de {minutos_antes} minuto(s). Hora salida: {h_sal_s}, salió: {ts.strftime('%H:%M')}"

        if not incidencia_tipo:
            return

        # Evitar duplicados para el mismo tipo en el mismo día (día en México)
        dia_mex = ts.date()
        dia_inicio_utc, dia_fin_utc = mexico_date_to_utc_range(dia_mex)
        existente = db.query(models.Incidencia).filter(
            models.Incidencia.empleado_id == empleado_id,
            models.Incidencia.tipo == incidencia_tipo,
            models.Incidencia.fecha >= dia_inicio_utc,
            models.Incidencia.fecha < dia_fin_utc,
            models.Incidencia.origen == "automatico",
        ).first()
        if existente:
            return

        inc = models.Incidencia(
            empleado_id=empleado_id,
            asistencia_id=asistencia.id,
            fecha=dia_inicio_utc,
            tipo=incidencia_tipo,
            descripcion=descripcion,
            justificada=False,
            origen="automatico",
        )
        db.add(inc)
        db.commit()
        logger.info(f"Incidencia automática creada: {incidencia_tipo} para empleado {empleado_id} — {descripcion}")

    @staticmethod
    def sync_attendance(
        db: Session,
        sync_data: schemas.AsistenciaSync,
        api_key: str
    ) -> Optional[models.Asistencia]:
        """Sincroniza una checada recibida del agente local y detecta incidencias."""
        dispositivo = verify_api_key(db, api_key)
        if not dispositivo:
            raise ValueError("API key invalida o dispositivo inactivo")

        dispositivo.ultima_sync_agente = datetime.now(timezone.utc)

        user_id = str(sync_data.user_id).strip()
        # 1) Prioridad absoluta: pin_checador (único globalmente).
        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.pin_checador == user_id
        ).first()
        # 2) Fallback por numero_empleado: solo si es único; nunca asumir si hay duplicados.
        if not empleado:
            candidatos = db.query(personal_models.Empleado).filter(
                personal_models.Empleado.numero_empleado == user_id
            ).all()
            if len(candidatos) == 1:
                empleado = candidatos[0]
            elif len(candidatos) > 1:
                logger.warning(
                    f"Checada (agente): user_id={user_id} coincide con {len(candidatos)} empleados "
                    "por numero_empleado y no hay match por pin_checador. Se ignora para evitar registrar "
                    "la checada al empleado equivocado."
                )
        if not empleado:
            logger.info(f"Checada ignorada (agente): user_id={user_id} no registrado en el sistema.")
            # Persistir latido aunque rechacemos la checada (el agente sí conectó)
            try:
                db.commit()
            except Exception:
                db.rollback()
            raise ValueError(f"PIN {user_id} no registrado. Solo se aceptan checadas de empleados dados de alta.")

        if getattr(empleado, "exento_incidencias", False):
            logger.info(f"Checada ignorada (agente): empleado especial {user_id} no debe registrar checadas.")
            try:
                db.commit()
            except Exception:
                db.rollback()
            raise ValueError("Usuario especial: no requiere registrar checadas.")

        try:
            raw = datetime.fromisoformat(sync_data.timestamp.replace('Z', '+00:00'))
            # Guardar siempre en UTC (si el agente envía sin Z, se asume hora local México)
            timestamp = to_utc(raw)
        except Exception:
            timestamp = datetime.now(timezone.utc)

        if checada_anterior_a_alta_en_sistema(empleado, timestamp):
            logger.info(
                "Checada ignorada (agente): anterior a created_at empleado_id=%s ts=%s created_at=%s",
                empleado.id,
                timestamp,
                empleado.created_at,
            )
            try:
                db.commit()
            except Exception:
                db.rollback()
            raise ValueError(
                "Checada anterior al registro del empleado en el sistema. No se registró."
            )

        if checada_anterior_a_fecha_ingreso(empleado, timestamp):
            logger.info(
                "Checada ignorada (agente): anterior a fecha_ingreso empleado_id=%s ts=%s ingreso=%s",
                empleado.id,
                timestamp,
                empleado.fecha_ingreso,
            )
            try:
                db.commit()
            except Exception:
                db.rollback()
            raise ValueError(
                "Checada anterior a la fecha de ingreso del empleado. No se registró."
            )

        ventana_inicio = timestamp - timedelta(seconds=60)
        existente = db.query(models.Asistencia).filter(
            models.Asistencia.empleado_id == empleado.id,
            models.Asistencia.timestamp >= ventana_inicio,
            models.Asistencia.timestamp <= timestamp,
        ).first()
        if existente:
            logger.info(
                f"Checada near-dup ignorada: empleado={sync_data.user_id} ts={timestamp} "
                f"(ya existe a {existente.timestamp}, <60s)"
            )
            try:
                db.commit()
            except Exception:
                db.rollback()
            return existente

        try:
            tipo, es_tiempo_extra = SyncService._determinar_tipo(db, empleado.id, timestamp)
        except ValueError as exc:
            logger.warning(f"Checada ignorada (agente): {exc}")
            try:
                db.commit()
            except Exception:
                db.rollback()
            raise

        asistencia = models.Asistencia(
            empleado_id=empleado.id,
            dispositivo_id=dispositivo.id,
            timestamp=timestamp,
            tipo=tipo,
            es_tiempo_extra=es_tiempo_extra,
            sincronizado=True
        )

        db.add(asistencia)
        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            if "uq_asistencias_empleado_timestamp" in str(exc) or "Duplicate entry" in str(exc):
                logger.info(f"Checada duplicada (IntegrityError) ignorada: emp={empleado.id} ts={timestamp}")
                dup = db.query(models.Asistencia).filter(
                    models.Asistencia.empleado_id == empleado.id,
                    models.Asistencia.timestamp == timestamp,
                ).first()
                if not dup:
                    ventana = timestamp - timedelta(seconds=60)
                    dup = (
                        db.query(models.Asistencia)
                        .filter(
                            models.Asistencia.empleado_id == empleado.id,
                            models.Asistencia.timestamp >= ventana,
                            models.Asistencia.timestamp <= timestamp,
                        )
                        .order_by(models.Asistencia.timestamp.desc())
                        .first()
                    )
                if dup:
                    return dup
                raise ValueError("Checada duplicada")
            raise
        db.refresh(asistencia)

        # Si el día ya quedó completo, eliminar FALTA/INCOMPLETA automáticas previas
        try:
            SyncService._limpiar_incidencias_si_dia_completo(db, empleado.id, timestamp)
            db.commit()
        except Exception as exc:
            logger.warning(f"Error al limpiar incidencias tras checada tardía: {exc}")

        # Detectar incidencias automáticas basadas en horario
        try:
            SyncService._detectar_incidencia(db, asistencia, empleado.id)
        except Exception as exc:
            logger.warning(f"Error al detectar incidencia automática: {exc}")

        agente = db.query(models.Agente).filter(
            models.Agente.dispositivo_id == dispositivo.id
        ).first()

        if agente:
            agente.ultima_sincronizacion = datetime.now(timezone.utc)
            agente.estado = "activo"
        else:
            agente = models.Agente(
                dispositivo_id=dispositivo.id,
                ultima_sincronizacion=datetime.now(timezone.utc),
                estado="activo"
            )
            db.add(agente)

        db.commit()
        return asistencia
