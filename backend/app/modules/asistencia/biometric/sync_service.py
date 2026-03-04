from sqlalchemy.orm import Session
from datetime import datetime, timedelta
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
        Sabado: entrada, salida (2 checadas, sin horario de comida).
        Domingo: entrada, salida (2 checadas, marcadas como tiempo extra).
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
    def sync_attendance(
        db: Session,
        sync_data: schemas.AsistenciaSync,
        api_key: str
    ) -> Optional[models.Asistencia]:
        """Sincroniza una checada recibida del agente local"""
        dispositivo = verify_api_key(db, api_key)
        if not dispositivo:
            raise ValueError("API key invalida o dispositivo inactivo")

        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.numero_empleado == sync_data.user_id
        ).first()

        if not empleado:
            logger.info(f"Checada ignorada: empleado {sync_data.user_id} no registrado en el sistema.")
            raise ValueError(f"Empleado {sync_data.user_id} no registrado. Solo se aceptan checadas de empleados dados de alta.")

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
