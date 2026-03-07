from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import Optional
import logging
from app.modules.asistencia import models, schemas
from app.modules.personal import models as personal_models
from app.modules.asistencia.biometric.agent_auth import verify_api_key

logger = logging.getLogger(__name__)

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
        """Auto-asigna tipo segun cuantas checadas tiene el empleado ese dia.
        Lunes a viernes: entrada, salida_comer, regreso_comer, salida (4 checadas).
        Sabado/Domingo: entrada, salida (2 checadas).
        Returns (TipoChecada, es_tiempo_extra)
        """
        dia_inicio = timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
        dia_fin = dia_inicio + timedelta(days=1)

        checadas_hoy = db.query(models.Asistencia).filter(
            models.Asistencia.empleado_id == empleado_id,
            models.Asistencia.timestamp >= dia_inicio,
            models.Asistencia.timestamp < dia_fin,
        ).count()

        dia_semana = timestamp.weekday()
        es_domingo = dia_semana == 6
        es_fin_semana = dia_semana >= 5

        secuencia = TIPO_FIN_SEMANA if es_fin_semana else TIPO_LUNES_VIERNES

        if checadas_hoy < len(secuencia):
            tipo = secuencia[checadas_hoy]
        else:
            tipo = models.TipoChecada.ENTRADA

        return tipo, es_domingo

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
        """
        from sqlalchemy.orm import joinedload

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
        ts = asistencia.timestamp
        tipo_checada = asistencia.tipo
        tolerancia = horario.tolerancia_minutos or 0

        incidencia_tipo = None
        descripcion = None

        if tipo_checada == models.TipoChecada.ENTRADA:
            try:
                h_ent, m_ent = [int(x) for x in horario.hora_entrada.split(":")]
            except Exception:
                return
            hora_esperada = ts.replace(hour=h_ent, minute=m_ent, second=0, microsecond=0)
            limite = hora_esperada + timedelta(minutes=tolerancia)
            if ts > limite:
                minutos_tarde = int((ts - hora_esperada).total_seconds() / 60)
                incidencia_tipo = models.TipoIncidencia.RETARDO
                descripcion = f"Retardo de {minutos_tarde} minuto(s). Hora entrada: {horario.hora_entrada}, llegó: {ts.strftime('%H:%M')}"

        elif tipo_checada == models.TipoChecada.SALIDA:
            try:
                h_sal, m_sal = [int(x) for x in horario.hora_salida.split(":")]
            except Exception:
                return
            hora_esperada = ts.replace(hour=h_sal, minute=m_sal, second=0, microsecond=0)
            limite = hora_esperada - timedelta(minutes=tolerancia)
            if ts < limite:
                minutos_antes = int((hora_esperada - ts).total_seconds() / 60)
                incidencia_tipo = models.TipoIncidencia.SALIDA_ANTICIPADA
                descripcion = f"Salida anticipada de {minutos_antes} minuto(s). Hora salida: {horario.hora_salida}, salió: {ts.strftime('%H:%M')}"

        if not incidencia_tipo:
            return

        # Evitar duplicados para el mismo tipo en el mismo día
        dia_inicio = ts.replace(hour=0, minute=0, second=0, microsecond=0)
        dia_fin = dia_inicio + timedelta(days=1)
        existente = db.query(models.Incidencia).filter(
            models.Incidencia.empleado_id == empleado_id,
            models.Incidencia.tipo == incidencia_tipo,
            models.Incidencia.fecha >= dia_inicio,
            models.Incidencia.fecha < dia_fin,
            models.Incidencia.origen == "automatico",
        ).first()
        if existente:
            return

        inc = models.Incidencia(
            empleado_id=empleado_id,
            asistencia_id=asistencia.id,
            fecha=ts,
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
        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.pin_checador == user_id
        ).first()
        if not empleado:
            empleado = db.query(personal_models.Empleado).filter(
                personal_models.Empleado.numero_empleado == user_id
            ).first()
        if not empleado:
            logger.info(f"Checada ignorada (agente): user_id={user_id} no registrado en el sistema.")
            raise ValueError(f"PIN {user_id} no registrado. Solo se aceptan checadas de empleados dados de alta.")

        try:
            timestamp = datetime.fromisoformat(sync_data.timestamp.replace('Z', '+00:00'))
        except Exception:
            timestamp = datetime.utcnow()

        existente = db.query(models.Asistencia).filter(
            models.Asistencia.empleado_id == empleado.id,
            models.Asistencia.timestamp == timestamp,
        ).first()
        if existente:
            logger.info(f"Checada duplicada ignorada: empleado={sync_data.user_id}, timestamp={timestamp}")
            return existente

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
        db.commit()
        db.refresh(asistencia)

        # Detectar incidencias automáticas basadas en horario
        try:
            SyncService._detectar_incidencia(db, asistencia, empleado.id)
        except Exception as exc:
            logger.warning(f"Error al detectar incidencia automática: {exc}")

        agente = db.query(models.Agente).filter(
            models.Agente.dispositivo_id == dispositivo.id
        ).first()

        if agente:
            agente.ultima_sincronizacion = datetime.utcnow()
            agente.estado = "activo"
        else:
            agente = models.Agente(
                dispositivo_id=dispositivo.id,
                ultima_sincronizacion=datetime.utcnow(),
                estado="activo"
            )
            db.add(agente)

        db.commit()
        return asistencia
