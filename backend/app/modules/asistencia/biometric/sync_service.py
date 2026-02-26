from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
import logging
from app.modules.asistencia import models, schemas
from app.modules.personal import models as personal_models
from app.modules.asistencia.biometric.agent_auth import verify_api_key

logger = logging.getLogger(__name__)


class SyncService:
    
    @staticmethod
    def sync_attendance(
        db: Session,
        sync_data: schemas.AsistenciaSync,
        api_key: str
    ) -> Optional[models.Asistencia]:
        """
        Sincroniza una checada recibida del agente local
        """
        # Verificar API key
        dispositivo = verify_api_key(db, api_key)
        if not dispositivo:
            raise ValueError("API key inválida o dispositivo inactivo")
        
        # Buscar empleado por número de empleado (user_id del dispositivo)
        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.numero_empleado == sync_data.user_id
        ).first()
        
        # Si el empleado no existe, crear uno temporal para que se pueda ver la checada
        if not empleado:
            logger.warning(f"Empleado con número {sync_data.user_id} no encontrado. Creando empleado temporal.")
            # Crear empleado temporal
            empleado = personal_models.Empleado(
                numero_empleado=sync_data.user_id,
                nombre=f"Usuario {sync_data.user_id}",
                apellido_paterno="(No registrado)",
                estado=personal_models.EstadoEmpleado.ACTIVO
            )
            db.add(empleado)
            db.commit()
            db.refresh(empleado)
            logger.info(f"Empleado temporal creado: ID {empleado.id}, Número {sync_data.user_id}")
        
        # Parsear timestamp
        try:
            timestamp = datetime.fromisoformat(sync_data.timestamp.replace('Z', '+00:00'))
        except:
            timestamp = datetime.utcnow()
        
        # Determinar tipo de checada
        tipo = models.TipoChecada.ENTRADA if sync_data.tipo.lower() == "entrada" else models.TipoChecada.SALIDA
        
        # Crear registro de asistencia
        asistencia = models.Asistencia(
            empleado_id=empleado.id,
            dispositivo_id=dispositivo.id,
            timestamp=timestamp,
            tipo=tipo,
            sincronizado=True
        )
        
        db.add(asistencia)
        db.commit()
        db.refresh(asistencia)
        
        # Actualizar última sincronización del agente
        agente = db.query(models.Agente).filter(
            models.Agente.dispositivo_id == dispositivo.id
        ).first()
        
        if agente:
            agente.ultima_sincronizacion = datetime.utcnow()
            agente.estado = "activo"
        else:
            # Crear agente si no existe
            agente = models.Agente(
                dispositivo_id=dispositivo.id,
                ultima_sincronizacion=datetime.utcnow(),
                estado="activo"
            )
            db.add(agente)
        
        db.commit()
        
        return asistencia
