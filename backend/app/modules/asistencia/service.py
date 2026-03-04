from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional
from datetime import datetime, timedelta
from . import models, schemas
from .biometric.sync_service import SyncService
from app.modules.personal import models as personal_models


class AsistenciaService:
    
    # ========== DISPOSITIVOS ==========
    
    @staticmethod
    def create_dispositivo(db: Session, dispositivo: schemas.DispositivoCreate) -> models.Dispositivo:
        """Crear nuevo dispositivo y generar API key"""
        from app.modules.asistencia.biometric.agent_auth import generate_api_key
        
        api_key = generate_api_key()
        db_dispositivo = models.Dispositivo(
            **dispositivo.dict(),
            api_key=api_key
        )
        db.add(db_dispositivo)
        db.commit()
        db.refresh(db_dispositivo)
        return db_dispositivo
    
    @staticmethod
    def get_dispositivo(db: Session, dispositivo_id: int) -> Optional[models.Dispositivo]:
        """Obtener dispositivo por ID"""
        return db.query(models.Dispositivo).filter(models.Dispositivo.id == dispositivo_id).first()
    
    @staticmethod
    def get_dispositivos(db: Session, activo: Optional[bool] = None) -> List[models.Dispositivo]:
        """Listar dispositivos"""
        query = db.query(models.Dispositivo)
        if activo is not None:
            query = query.filter(models.Dispositivo.activo == activo)
        return query.all()

    @staticmethod
    def update_dispositivo(db: Session, device_id: int, data: "schemas.DispositivoUpdate") -> Optional[models.Dispositivo]:
        """Actualizar dispositivo"""
        dispositivo = db.query(models.Dispositivo).filter(models.Dispositivo.id == device_id).first()
        if not dispositivo:
            return None
        update_data = data.dict(exclude_unset=True)
        for k, v in update_data.items():
            setattr(dispositivo, k, v)
        db.commit()
        db.refresh(dispositivo)
        return dispositivo

    @staticmethod
    def delete_dispositivo(db: Session, device_id: int) -> bool:
        """Eliminar dispositivo y todos sus registros asociados (checadas, colas, etc.)."""
        dispositivo = db.query(models.Dispositivo).filter(models.Dispositivo.id == device_id).first()
        if not dispositivo:
            raise ValueError("Dispositivo no encontrado")
        db.query(models.Asistencia).filter(models.Asistencia.dispositivo_id == device_id).delete()
        db.query(models.UsuarioPendienteDispositivo).filter(
            models.UsuarioPendienteDispositivo.dispositivo_id == device_id
        ).delete()
        db.query(models.PendingEnroll).filter(models.PendingEnroll.dispositivo_id == device_id).delete()
        db.query(models.Agente).filter(models.Agente.dispositivo_id == device_id).delete()
        db.delete(dispositivo)
        db.commit()
        return True

    @staticmethod
    def test_connection(db: Session, device_id: int) -> dict:
        """
        Prueba de conexión: simula una checada de prueba para verificar
        que el dispositivo está correctamente configurado y el backend puede recibir datos.
        """
        dispositivo = db.query(models.Dispositivo).filter(models.Dispositivo.id == device_id).first()
        if not dispositivo:
            return {"success": False, "message": "Dispositivo no encontrado"}
        if not dispositivo.serial_number:
            return {"success": False, "message": "El dispositivo no tiene número de serie (SN). Regístralo para usar ADMS."}
        if not dispositivo.activo:
            return {"success": False, "message": "El dispositivo está inactivo."}

        # Buscar o crear empleado de prueba
        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.numero_empleado == "TEST"
        ).first()
        if not empleado:
            empleado = personal_models.Empleado(
                numero_empleado="TEST",
                nombre="Prueba",
                apellido_paterno="Conexión",
                estado=personal_models.EstadoEmpleado.ACTIVO
            )
            db.add(empleado)
            db.commit()
            db.refresh(empleado)

        # Crear checada de prueba
        from datetime import datetime
        asistencia = models.Asistencia(
            empleado_id=empleado.id,
            dispositivo_id=dispositivo.id,
            timestamp=datetime.utcnow(),
            tipo=models.TipoChecada.ENTRADA,
            sincronizado=True
        )
        db.add(asistencia)
        db.commit()
        db.refresh(asistencia)

        return {
            "success": True,
            "message": f"Conexión OK. Dispositivo '{dispositivo.nombre}' (SN: {dispositivo.serial_number}) listo para recibir checadas.",
            "test_checada_id": asistencia.id
        }

    @staticmethod
    def test_device_connection(db: Session, device_id: int) -> dict:
        """
        Prueba conexión REAL con el dispositivo (pyzk, puerto 4370).
        El backend debe estar en la misma red que el dispositivo.
        Si no tiene ip_local, retorna mensaje para agregarlo.
        """
        dispositivo = db.query(models.Dispositivo).filter(models.Dispositivo.id == device_id).first()
        if not dispositivo:
            return {"success": False, "message": "Dispositivo no encontrado"}
        ip = (dispositivo.ip_local or "").strip()
        if not ip:
            return {
                "success": False,
                "message": "Agrega la IP local del dispositivo para probar. Edita el dispositivo y pon la IP (ej: 192.168.1.201). El backend debe estar en la misma red."
            }
        try:
            from zk import ZK
            zk = ZK(ip, port=4370, timeout=5)
            conn = zk.connect()
            try:
                version = conn.get_firmware_version()
                conn.disconnect()
                return {
                    "success": True,
                    "message": f"✅ El dispositivo responde. Firmware: {version}",
                    "firmware": str(version) if version else None
                }
            finally:
                if conn:
                    conn.disconnect()
        except Exception as e:
            return {
                "success": False,
                "message": f"❌ No hay conexión: {str(e)}. Verifica que el backend esté en la misma red que el dispositivo y que la IP sea correcta."
            }

    @staticmethod
    def enqueue_user(db: Session, device_id: int, data: schemas.EnqueueUserRequest) -> models.UsuarioPendienteDispositivo:
        """Agregar usuario a la cola para alta remota (agente o ADMS).
        Tambien crea el empleado en el sistema si no existe, para que sus checadas se registren."""
        dispositivo = db.query(models.Dispositivo).filter(models.Dispositivo.id == device_id).first()
        if not dispositivo:
            raise ValueError("Dispositivo no encontrado")

        numero = data.numero_empleado.strip()
        nombre_completo = data.nombre.strip()

        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.numero_empleado == numero
        ).first()

        if not empleado:
            partes = nombre_completo.split(" ", 2)
            nombre = partes[0] if partes else nombre_completo
            apellido_p = partes[1] if len(partes) > 1 else ""
            apellido_m = partes[2] if len(partes) > 2 else ""
            empleado = personal_models.Empleado(
                numero_empleado=numero,
                nombre=nombre,
                apellido_paterno=apellido_p,
                apellido_materno=apellido_m,
                estado=personal_models.EstadoEmpleado.ACTIVO
            )
            db.add(empleado)
            db.commit()
            db.refresh(empleado)
        elif empleado.apellido_paterno == "(No registrado)":
            partes = nombre_completo.split(" ", 2)
            empleado.nombre = partes[0] if partes else nombre_completo
            empleado.apellido_paterno = partes[1] if len(partes) > 1 else ""
            empleado.apellido_materno = partes[2] if len(partes) > 2 else ""
            db.commit()

        pendiente = models.UsuarioPendienteDispositivo(
            dispositivo_id=device_id,
            numero_empleado=numero,
            nombre=nombre_completo,
            enviado=False
        )
        db.add(pendiente)
        db.commit()
        db.refresh(pendiente)
        return pendiente

    @staticmethod
    def get_pending_users(db: Session, device_id: Optional[int] = None, include_sent: bool = False) -> list:
        """Obtener usuarios pendientes (y opcionalmente enviados) de enviar al dispositivo"""
        query = db.query(models.UsuarioPendienteDispositivo)
        if not include_sent:
            query = query.filter(models.UsuarioPendienteDispositivo.enviado == False)
        if device_id:
            query = query.filter(models.UsuarioPendienteDispositivo.dispositivo_id == device_id)
        return query.order_by(models.UsuarioPendienteDispositivo.created_at).all()

    @staticmethod
    def mark_users_sent(db: Session, ids: list, dispositivo_id: int) -> int:
        """Marcar usuarios como enviados (usado por el agente)"""
        from datetime import datetime
        updated = db.query(models.UsuarioPendienteDispositivo).filter(
            models.UsuarioPendienteDispositivo.id.in_(ids),
            models.UsuarioPendienteDispositivo.dispositivo_id == dispositivo_id,
            models.UsuarioPendienteDispositivo.enviado == False
        ).update(
            {models.UsuarioPendienteDispositivo.enviado: True,
             models.UsuarioPendienteDispositivo.enviado_at: datetime.utcnow()},
            synchronize_session=False
        )
        db.commit()
        return updated

    @staticmethod
    def start_enroll(db: Session, device_id: int, numero_empleado: str) -> models.PendingEnroll:
        """Agregar usuario a la cola de registro de huella. Si no esta enviado, lo encola automaticamente."""
        dispositivo = db.query(models.Dispositivo).filter(models.Dispositivo.id == device_id).first()
        if not dispositivo:
            raise ValueError("Dispositivo no encontrado")

        numero = numero_empleado.strip()
        from app.modules.personal import models as pm
        empleado = db.query(pm.Empleado).filter(pm.Empleado.numero_empleado == numero).first()
        if not empleado:
            raise ValueError(f"Empleado {numero} no encontrado en el sistema")

        enviado = db.query(models.UsuarioPendienteDispositivo).filter(
            models.UsuarioPendienteDispositivo.dispositivo_id == device_id,
            models.UsuarioPendienteDispositivo.numero_empleado == numero,
            models.UsuarioPendienteDispositivo.enviado == True
        ).first()
        if not enviado:
            existe_en_cola = db.query(models.UsuarioPendienteDispositivo).filter(
                models.UsuarioPendienteDispositivo.dispositivo_id == device_id,
                models.UsuarioPendienteDispositivo.numero_empleado == numero,
            ).first()
            if not existe_en_cola:
                nombre = f"{empleado.nombre} {empleado.apellido_paterno or ''}".strip()
                nuevo = models.UsuarioPendienteDispositivo(
                    dispositivo_id=device_id,
                    numero_empleado=numero,
                    nombre=nombre,
                )
                db.add(nuevo)
                db.flush()

        existente = db.query(models.PendingEnroll).filter(
            models.PendingEnroll.dispositivo_id == device_id,
            models.PendingEnroll.numero_empleado == numero,
            models.PendingEnroll.status == "pending"
        ).first()
        if existente:
            return existente

        fallido = db.query(models.PendingEnroll).filter(
            models.PendingEnroll.dispositivo_id == device_id,
            models.PendingEnroll.numero_empleado == numero,
            models.PendingEnroll.status == "failed"
        ).first()
        if fallido:
            fallido.status = "pending"
            fallido.completed_at = None
            db.commit()
            db.refresh(fallido)
            return fallido

        pe = models.PendingEnroll(
            dispositivo_id=device_id,
            numero_empleado=numero,
            status="pending"
        )
        db.add(pe)
        db.commit()
        db.refresh(pe)
        return pe

    @staticmethod
    def get_pending_enrolls(db: Session, dispositivo_id: int) -> list:
        """Obtener enrolls pendientes para un dispositivo"""
        return db.query(models.PendingEnroll).filter(
            models.PendingEnroll.dispositivo_id == dispositivo_id,
            models.PendingEnroll.status == "pending"
        ).order_by(models.PendingEnroll.created_at).all()

    @staticmethod
    def mark_enroll_done(db: Session, enroll_id: int, dispositivo_id: int, success: bool = True) -> bool:
        """Marcar enroll como completado (usado por el agente)"""
        from datetime import datetime
        pe = db.query(models.PendingEnroll).filter(
            models.PendingEnroll.id == enroll_id,
            models.PendingEnroll.dispositivo_id == dispositivo_id,
            models.PendingEnroll.status == "pending"
        ).first()
        if not pe:
            return False
        pe.status = "completed" if success else "failed"
        pe.completed_at = datetime.utcnow()
        db.commit()
        return True

    # ========== ASISTENCIAS ==========
    
    @staticmethod
    def get_asistencias(
        db: Session,
        skip: int = 0,
        limit: int = 100,
        empleado_id: Optional[int] = None,
        dispositivo_id: Optional[int] = None,
        fecha_inicio: Optional[datetime] = None,
        fecha_fin: Optional[datetime] = None
    ) -> list:
        """Listar asistencias con filtros, incluye nombre del empleado"""
        query = db.query(models.Asistencia)

        if empleado_id:
            query = query.filter(models.Asistencia.empleado_id == empleado_id)
        if dispositivo_id:
            query = query.filter(models.Asistencia.dispositivo_id == dispositivo_id)
        if fecha_inicio:
            query = query.filter(models.Asistencia.timestamp >= fecha_inicio)
        if fecha_fin:
            query = query.filter(models.Asistencia.timestamp <= fecha_fin)

        asistencias = query.order_by(models.Asistencia.timestamp.desc()).offset(skip).limit(limit).all()

        emp_ids = {a.empleado_id for a in asistencias}
        empleados = {
            e.id: e for e in db.query(personal_models.Empleado).filter(
                personal_models.Empleado.id.in_(emp_ids)
            ).all()
        } if emp_ids else {}

        result = []
        for a in asistencias:
            emp = empleados.get(a.empleado_id)
            nombre = ""
            numero = ""
            if emp:
                nombre = f"{emp.nombre} {emp.apellido_paterno or ''} {emp.apellido_materno or ''}".strip()
                numero = emp.numero_empleado or ""
            a.empleado_nombre = nombre
            a.empleado_numero = numero
            result.append(a)

        return result
    
    # ========== HORARIOS ==========
    
    @staticmethod
    def create_horario(db: Session, horario: schemas.HorarioCreate) -> models.Horario:
        """Crear nuevo horario"""
        db_horario = models.Horario(**horario.dict())
        db.add(db_horario)
        db.commit()
        db.refresh(db_horario)
        return db_horario
    
    @staticmethod
    def get_horarios(db: Session, activo: Optional[bool] = None) -> List[models.Horario]:
        """Listar horarios"""
        query = db.query(models.Horario)
        if activo is not None:
            query = query.filter(models.Horario.activo == activo)
        return query.all()
    
    # ========== INCIDENCIAS ==========
    
    @staticmethod
    def create_incidencia(db: Session, incidencia: schemas.IncidenciaCreate) -> models.Incidencia:
        """Crear nueva incidencia"""
        db_incidencia = models.Incidencia(**incidencia.dict())
        db.add(db_incidencia)
        db.commit()
        db.refresh(db_incidencia)
        return db_incidencia
    
    @staticmethod
    def get_incidencias(
        db: Session,
        empleado_id: Optional[int] = None,
        tipo: Optional[str] = None,
        fecha_inicio: Optional[datetime] = None,
        fecha_fin: Optional[datetime] = None
    ) -> List[models.Incidencia]:
        """Listar incidencias con filtros"""
        query = db.query(models.Incidencia)
        
        if empleado_id:
            query = query.filter(models.Incidencia.empleado_id == empleado_id)
        if tipo:
            query = query.filter(models.Incidencia.tipo == tipo)
        if fecha_inicio:
            query = query.filter(models.Incidencia.fecha >= fecha_inicio)
        if fecha_fin:
            query = query.filter(models.Incidencia.fecha <= fecha_fin)
        
        return query.order_by(models.Incidencia.fecha.desc()).all()
