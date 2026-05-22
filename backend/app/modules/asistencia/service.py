from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from typing import List, Optional, Union, Tuple, Dict, Any
from datetime import datetime, timedelta, date, timezone
import calendar
from . import models, schemas
from .biometric.sync_service import SyncService
from .checada_especial_resolver import obtener_checada_especial_vigente
from app.modules.personal import models as personal_models
from app.modules.personal import service as personal_service


# ──────────────────────────────────────────────
# UTILIDADES: DÍAS FESTIVOS LFT MÉXICO
# ──────────────────────────────────────────────

def _primer_lunes(year: int, month: int) -> date:
    """Devuelve el primer lunes del mes/año dado."""
    d = date(year, month, 1)
    # weekday(): 0=lun … 6=dom
    offset = (7 - d.weekday()) % 7  # días hasta el próximo lunes (0 si ya es lunes)
    return d + timedelta(days=offset)


def _tercer_lunes(year: int, month: int) -> date:
    """Devuelve el tercer lunes del mes/año dado."""
    primero = _primer_lunes(year, month)
    return primero + timedelta(weeks=2)


def _semana_santa(year: int):
    """Calcula Jueves y Viernes Santos mediante el algoritmo de Gauss para Pascua."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    domingo_pascua = date(year, month, day)
    jueves = domingo_pascua - timedelta(days=3)
    viernes = domingo_pascua - timedelta(days=2)
    return jueves, viernes


def generar_festivos_lft(year: int) -> list[dict]:
    """
    Genera los días festivos oficiales según LFT Art. 74 para el año dado.
    Incluye Jueves y Viernes Santos (ampliamente adoptados en México).
    """
    festivos = []

    # ── Fechas fijas ──
    festivos.append({"fecha": date(year, 1, 1),  "nombre": "Año Nuevo",                 "tipo": "LFT"})
    festivos.append({"fecha": date(year, 5, 1),  "nombre": "Día del Trabajo",            "tipo": "LFT"})
    festivos.append({"fecha": date(year, 9, 16), "nombre": "Independencia de México",    "tipo": "LFT"})
    festivos.append({"fecha": date(year, 12, 25),"nombre": "Navidad",                    "tipo": "LFT"})

    # ── Fechas flotantes (movidas al lunes más cercano, LFT Art. 74) ──
    festivos.append({"fecha": _primer_lunes(year, 2),  "nombre": "Aniversario de la Constitución (1er lunes de febrero)", "tipo": "LFT"})
    festivos.append({"fecha": _tercer_lunes(year, 3),  "nombre": "Natalicio de Benito Juárez (3er lunes de marzo)",       "tipo": "LFT"})
    festivos.append({"fecha": _tercer_lunes(year, 11), "nombre": "Revolución Mexicana (3er lunes de noviembre)",          "tipo": "LFT"})

    # ── Semana Santa (Jueves y Viernes Santos) ──
    jueves, viernes = _semana_santa(year)
    festivos.append({"fecha": jueves,  "nombre": "Jueves Santo", "tipo": "adicional"})
    festivos.append({"fecha": viernes, "nombre": "Viernes Santo", "tipo": "adicional"})

    return festivos


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
        # Desvincular incidencias que referencian asistencias de este dispositivo
        db.query(models.Incidencia).filter(
            models.Incidencia.asistencia_id.in_(
                db.query(models.Asistencia.id).filter(models.Asistencia.dispositivo_id == device_id)
            )
        ).update({models.Incidencia.asistencia_id: None}, synchronize_session=False)
        db.query(models.Asistencia).filter(models.Asistencia.dispositivo_id == device_id).delete()
        db.query(models.UsuarioPendienteDispositivo).filter(
            models.UsuarioPendienteDispositivo.dispositivo_id == device_id
        ).delete()
        db.query(models.PendingEnroll).filter(models.PendingEnroll.dispositivo_id == device_id).delete()
        db.query(models.PendingDelete).filter(models.PendingDelete.dispositivo_id == device_id).delete()
        db.query(models.Agente).filter(models.Agente.dispositivo_id == device_id).delete()
        # fingerprint_templates.source_device_id: poner NULL para no perder templates
        db.query(models.FingerprintTemplate).filter(
            models.FingerprintTemplate.source_device_id == device_id
        ).update({models.FingerprintTemplate.source_device_id: None})
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
            return {"success": False, "message": "El dispositivo no tiene número de serie (SN). Regístralo para probar conexión."}
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
            timestamp=datetime.now(timezone.utc),
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
    def _resolver_empleado_para_checador(
        db: Session,
        numero_empleado: str,
        *,
        empleado_id: Optional[int] = None,
        empresa_id: Optional[int] = None,
    ) -> Optional[personal_models.Empleado]:
        """
        Identifica al empleado sin ambigüedad para colas de checador / enroll.
        No usa pin_checador como identificador: un número de empleado puede coincidir con el PIN
        de otra persona y sobrescribir huellas o asignar enroll al equivocado.
        """
        numero = (numero_empleado or "").strip()
        if not numero:
            return None
        pm = personal_models
        if empleado_id is not None:
            emp = db.query(pm.Empleado).filter(pm.Empleado.id == int(empleado_id)).first()
            if not emp:
                raise ValueError(f"No existe empleado con id={empleado_id}.")
            if (emp.numero_empleado or "").strip() != numero:
                raise ValueError("El empleado_id no coincide con el número de empleado enviado.")
            return emp
        if empresa_id is not None:
            return (
                db.query(pm.Empleado)
                .filter(
                    pm.Empleado.empresa_id == int(empresa_id),
                    pm.Empleado.numero_empleado == numero,
                )
                .first()
            )
        rows = db.query(pm.Empleado).filter(pm.Empleado.numero_empleado == numero).all()
        if len(rows) == 0:
            return None
        if len(rows) > 1:
            raise ValueError(
                "Hay más de un empleado con ese número de empleado en distintas empresas. "
                "Envía empleado_id o empresa_id en la solicitud para no mezclar usuarios."
            )
        return rows[0]

    @staticmethod
    def enqueue_user(db: Session, device_id: int, data: schemas.EnqueueUserRequest) -> models.UsuarioPendienteDispositivo:
        """Agregar usuario a la cola para alta remota (agente local).
        Tambien crea el empleado en el sistema si no existe, para que sus checadas se registren."""
        dispositivo = db.query(models.Dispositivo).filter(models.Dispositivo.id == device_id).first()
        if not dispositivo:
            raise ValueError("Dispositivo no encontrado")

        numero = data.numero_empleado.strip()
        nombre_completo = data.nombre.strip()

        empleado = AsistenciaService._resolver_empleado_para_checador(
            db,
            numero,
            empleado_id=data.empleado_id,
            empresa_id=data.empresa_id,
        )

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
            # Asignar pin_checador (empleado sin empresa: usar id; con empresa: usar rango)
            if not empleado.pin_checador:
                if empleado.empresa_id:
                    try:
                        pin = personal_service.PersonalService._next_pin_checador(db, empleado.empresa_id)
                        empleado.pin_checador = pin
                        db.commit()
                        db.refresh(empleado)
                    except Exception:
                        empleado.pin_checador = str(empleado.id)
                        db.commit()
                else:
                    empleado.pin_checador = str(empleado.id)
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
            numero_empleado=(empleado.numero_empleado or numero).strip(),
            pin_checador=empleado.pin_checador if empleado else None,
            nombre=nombre_completo,
            enviado=False
        )
        db.add(pendiente)
        db.commit()
        db.refresh(pendiente)
        return pendiente

    @staticmethod
    def get_pending_users(db: Session, device_id: Optional[int] = None, include_sent: bool = False) -> list:
        """Obtener usuarios pendientes (y opcionalmente enviados) de enviar al dispositivo.
        Asegura que pin_checador esté siempre poblado (nunca enviar numero_empleado al dispositivo)."""
        query = db.query(models.UsuarioPendienteDispositivo)
        if not include_sent:
            query = query.filter(models.UsuarioPendienteDispositivo.enviado == False)
        if device_id:
            query = query.filter(models.UsuarioPendienteDispositivo.dispositivo_id == device_id)
        pendientes = query.order_by(models.UsuarioPendienteDispositivo.created_at).all()
        # Corregir pendientes con pin_checador null: asignar desde empleado/empresa
        for p in pendientes:
            if not p.pin_checador or not str(p.pin_checador).strip():
                emp = db.query(personal_models.Empleado).filter(
                    personal_models.Empleado.numero_empleado == p.numero_empleado
                ).first()
                if emp:
                    pin = emp.pin_checador
                    if not pin and emp.empresa_id:
                        try:
                            pin = personal_service.PersonalService._next_pin_checador(db, emp.empresa_id)
                            emp.pin_checador = pin
                        except Exception:
                            pin = str(emp.id)
                            emp.pin_checador = pin
                    elif not pin:
                        pin = str(emp.id)
                        emp.pin_checador = pin
                    p.pin_checador = pin
                    db.commit()
        return pendientes

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
             models.UsuarioPendienteDispositivo.enviado_at: datetime.now(timezone.utc)},
            synchronize_session=False
        )
        db.commit()
        return updated

    @staticmethod
    def marcar_empleado_enviado_en_dispositivo(
        db: Session,
        device_id: int,
        empleado: personal_models.Empleado,
    ) -> None:
        """Marca al empleado como dado de alta en el checador (p. ej. tras replicar huella con éxito)."""
        numero = (empleado.numero_empleado or "").strip()
        if not numero:
            return
        pin = (empleado.pin_checador or "").strip() or None
        nombre = f"{empleado.nombre or ''} {empleado.apellido_paterno or ''} {empleado.apellido_materno or ''}".strip() or numero
        q = db.query(models.UsuarioPendienteDispositivo).filter(
            models.UsuarioPendienteDispositivo.dispositivo_id == device_id,
            models.UsuarioPendienteDispositivo.numero_empleado == numero,
        )
        if pin:
            q = q.filter(
                (models.UsuarioPendienteDispositivo.pin_checador == pin)
                | (models.UsuarioPendienteDispositivo.pin_checador.is_(None))
            )
        pendiente = q.order_by(models.UsuarioPendienteDispositivo.id.desc()).first()
        now = datetime.now(timezone.utc)
        if pendiente:
            if not pendiente.enviado:
                pendiente.enviado = True
                pendiente.enviado_at = now
            if pin and not pendiente.pin_checador:
                pendiente.pin_checador = pin
        else:
            pendiente = models.UsuarioPendienteDispositivo(
                dispositivo_id=device_id,
                numero_empleado=numero,
                pin_checador=pin,
                nombre=nombre,
                enviado=True,
                enviado_at=now,
            )
            db.add(pendiente)
        db.commit()

    @staticmethod
    def start_enroll(
        db: Session,
        device_id: int,
        numero_empleado: str,
        *,
        empleado_id: Optional[int] = None,
        empresa_id: Optional[int] = None,
    ) -> models.PendingEnroll:
        """Agregar usuario a la cola de registro de huella. Si no esta enviado, lo encola automaticamente."""
        dispositivo = db.query(models.Dispositivo).filter(models.Dispositivo.id == device_id).first()
        if not dispositivo:
            raise ValueError("Dispositivo no encontrado")

        numero = numero_empleado.strip()
        empleado = AsistenciaService._resolver_empleado_para_checador(
            db, numero, empleado_id=empleado_id, empresa_id=empresa_id
        )
        if not empleado:
            raise ValueError(f"Empleado {numero} no encontrado en el sistema")

        # Asegurar pin_checador: usar rango de empresa si aplica, nunca numero_empleado en el dispositivo
        pin = empleado.pin_checador
        if not pin and empleado.empresa_id:
            try:
                pin = personal_service.PersonalService._next_pin_checador(db, empleado.empresa_id)
                empleado.pin_checador = pin
                db.commit()
            except Exception:
                pin = str(empleado.id)
                empleado.pin_checador = pin
                db.commit()
        elif not pin:
            pin = str(empleado.id)
            empleado.pin_checador = pin
            db.commit()

        # Filtrar por pin_checador (único globalmente) para evitar confundir empleados
        # de distintas empresas con el mismo numero_empleado.
        enviado = db.query(models.UsuarioPendienteDispositivo).filter(
            models.UsuarioPendienteDispositivo.dispositivo_id == device_id,
            models.UsuarioPendienteDispositivo.pin_checador == pin,
            models.UsuarioPendienteDispositivo.enviado == True
        ).first()
        if not enviado:
            existe_en_cola = db.query(models.UsuarioPendienteDispositivo).filter(
                models.UsuarioPendienteDispositivo.dispositivo_id == device_id,
                models.UsuarioPendienteDispositivo.pin_checador == pin,
            ).first()
            if not existe_en_cola:
                nombre = f"{empleado.nombre} {empleado.apellido_paterno or ''}".strip()
                nuevo = models.UsuarioPendienteDispositivo(
                    dispositivo_id=device_id,
                    numero_empleado=empleado.numero_empleado,
                    pin_checador=pin,
                    nombre=nombre,
                )
                db.add(nuevo)
                db.flush()

        existente = db.query(models.PendingEnroll).filter(
            models.PendingEnroll.dispositivo_id == device_id,
            models.PendingEnroll.pin_checador == pin,
            models.PendingEnroll.status == "pending"
        ).first()
        if existente:
            return existente

        nombre_completo = f"{empleado.nombre} {empleado.apellido_paterno or ''}".strip()

        fallido = db.query(models.PendingEnroll).filter(
            models.PendingEnroll.dispositivo_id == device_id,
            models.PendingEnroll.pin_checador == pin,
            models.PendingEnroll.status == "failed"
        ).first()
        if fallido:
            fallido.status = "pending"
            fallido.pin_checador = pin
            fallido.nombre = nombre_completo
            fallido.completed_at = None
            db.commit()
            db.refresh(fallido)
            return fallido

        pe = models.PendingEnroll(
            dispositivo_id=device_id,
            numero_empleado=empleado.numero_empleado,
            pin_checador=pin,
            nombre=nombre_completo,
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
        pe.completed_at = datetime.now(timezone.utc)
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
            e.id: e
            for e in db.query(personal_models.Empleado)
            .options(
                joinedload(personal_models.Empleado.empresa),
                joinedload(personal_models.Empleado.departamento_rel),
            )
            .filter(personal_models.Empleado.id.in_(emp_ids))
            .all()
        } if emp_ids else {}

        result = []
        for a in asistencias:
            emp = empleados.get(a.empleado_id)
            nombre = ""
            numero = ""
            empresa_nombre: Optional[str] = None
            departamento_nombre: Optional[str] = None
            if emp:
                nombre = f"{emp.nombre} {emp.apellido_paterno or ''} {emp.apellido_materno or ''}".strip()
                numero = emp.numero_empleado or ""
                if emp.empresa is not None:
                    empresa_nombre = emp.empresa.nombre
                if emp.departamento_rel is not None:
                    departamento_nombre = emp.departamento_rel.nombre
            a.empleado_nombre = nombre
            a.empleado_numero = numero
            a.empresa_nombre = empresa_nombre
            a.departamento_nombre = departamento_nombre
            result.append(a)

        return result
    
    # ========== HORARIOS ==========

    @staticmethod
    def create_horario(db: Session, horario: schemas.HorarioCreate) -> models.Horario:
        db_horario = models.Horario(**horario.dict())
        db.add(db_horario)
        db.commit()
        db.refresh(db_horario)
        return db_horario

    @staticmethod
    def get_horarios(db: Session, activo: Optional[bool] = None) -> List[models.Horario]:
        query = db.query(models.Horario)
        if activo is not None:
            query = query.filter(models.Horario.activo == activo)
        return query.order_by(models.Horario.nombre).all()

    @staticmethod
    def get_horario(db: Session, horario_id: int) -> Optional[models.Horario]:
        return db.query(models.Horario).filter(models.Horario.id == horario_id).first()

    @staticmethod
    def update_horario(db: Session, horario_id: int, data: schemas.HorarioUpdate) -> Optional[models.Horario]:
        h = db.query(models.Horario).filter(models.Horario.id == horario_id).first()
        if not h:
            return None
        for k, v in data.dict(exclude_unset=True).items():
            setattr(h, k, v)
        db.commit()
        db.refresh(h)
        return h

    @staticmethod
    def delete_horario(db: Session, horario_id: int) -> bool:
        h = db.query(models.Horario).filter(models.Horario.id == horario_id).first()
        if not h:
            return False
        h.activo = False
        db.commit()
        return True

    # ========== ASIGNACIÓN DE HORARIO A EMPLEADO ==========

    @staticmethod
    def _dias_set(dias_semana: Optional[str]) -> set:
        """Convierte el string '1,2,3,4,5' en un set {1,2,3,4,5}. Sin string = todos los días."""
        if not dias_semana:
            return {1, 2, 3, 4, 5, 6, 7}
        return {int(d.strip()) for d in dias_semana.split(",") if d.strip().isdigit()}

    @staticmethod
    def assign_horario_empleado(
        db: Session, empleado_id: int, horario_id: int
    ) -> models.EmpleadoHorario:
        """
        Asigna un horario al empleado.
        Si el nuevo horario comparte días con uno existente, desactiva el existente primero.
        Horarios con días distintos coexisten (ej: L-V + Sábado).
        """
        from datetime import datetime
        from sqlalchemy.orm import joinedload

        nuevo_horario = db.query(models.Horario).filter(models.Horario.id == horario_id).first()
        if not nuevo_horario:
            raise ValueError("Horario no encontrado")

        nuevos_dias = AsistenciaService._dias_set(nuevo_horario.dias_semana)

        # Desactivar solo asignaciones activas que compartan días con el nuevo horario
        activas = (
            db.query(models.EmpleadoHorario)
            .options(joinedload(models.EmpleadoHorario.horario))
            .filter(
                models.EmpleadoHorario.empleado_id == empleado_id,
                models.EmpleadoHorario.activo == True,
            )
            .all()
        )
        for asig in activas:
            if asig.horario and (AsistenciaService._dias_set(asig.horario.dias_semana) & nuevos_dias):
                asig.activo = False
                asig.fecha_fin = datetime.now(timezone.utc)

        eh = models.EmpleadoHorario(
            empleado_id=empleado_id,
            horario_id=horario_id,
            fecha_inicio=datetime.now(timezone.utc),
            activo=True,
        )
        db.add(eh)
        db.commit()
        db.refresh(eh)
        return eh

    @staticmethod
    def get_horarios_activos_empleado(db: Session, empleado_id: int) -> list:
        """Devuelve TODAS las asignaciones de horario activas del empleado (puede haber varias para días distintos)."""
        from sqlalchemy.orm import joinedload
        return (
            db.query(models.EmpleadoHorario)
            .options(joinedload(models.EmpleadoHorario.horario))
            .filter(
                models.EmpleadoHorario.empleado_id == empleado_id,
                models.EmpleadoHorario.activo == True,
            )
            .all()
        )

    @staticmethod
    def get_horario_activo_empleado(db: Session, empleado_id: int) -> Optional[models.EmpleadoHorario]:
        """Devuelve la primera asignación activa (compatibilidad con código existente)."""
        from sqlalchemy.orm import joinedload
        return (
            db.query(models.EmpleadoHorario)
            .options(joinedload(models.EmpleadoHorario.horario))
            .filter(
                models.EmpleadoHorario.empleado_id == empleado_id,
                models.EmpleadoHorario.activo == True,
            )
            .first()
        )

    @staticmethod
    def remove_horario_empleado(db: Session, empleado_id: int, asignacion_id: Optional[int] = None) -> bool:
        """
        Quita horario(s) activo(s) del empleado.
        Si se pasa asignacion_id, quita solo esa asignación específica.
        Si no, quita todas las asignaciones activas.
        """
        from datetime import datetime
        query = db.query(models.EmpleadoHorario).filter(
            models.EmpleadoHorario.empleado_id == empleado_id,
            models.EmpleadoHorario.activo == True,
        )
        if asignacion_id:
            query = query.filter(models.EmpleadoHorario.id == asignacion_id)
        updated = query.update(
            {models.EmpleadoHorario.activo: False, models.EmpleadoHorario.fecha_fin: datetime.now(timezone.utc)},
            synchronize_session=False,
        )
        db.commit()
        return updated > 0

    # ========== DÍAS FESTIVOS ==========

    @staticmethod
    def get_dias_festivos(db: Session, año: Optional[int] = None, solo_activos: bool = True) -> list:
        query = db.query(models.DiaFestivo)
        if solo_activos:
            query = query.filter(models.DiaFestivo.activo == True)
        if año:
            query = query.filter(
                models.DiaFestivo.fecha >= date(año, 1, 1),
                models.DiaFestivo.fecha <= date(año, 12, 31),
            )
        return query.order_by(models.DiaFestivo.fecha).all()

    @staticmethod
    def create_dia_festivo(db: Session, data: schemas.DiaFestivoCreate) -> models.DiaFestivo:
        existente = db.query(models.DiaFestivo).filter(models.DiaFestivo.fecha == data.fecha).first()
        if existente:
            raise ValueError(f"Ya existe un día festivo para la fecha {data.fecha}")
        festivo = models.DiaFestivo(**data.dict())
        db.add(festivo)
        db.commit()
        db.refresh(festivo)
        return festivo

    @staticmethod
    def update_dia_festivo(db: Session, festivo_id: int, data: schemas.DiaFestivoUpdate) -> Optional[models.DiaFestivo]:
        festivo = db.query(models.DiaFestivo).filter(models.DiaFestivo.id == festivo_id).first()
        if not festivo:
            return None
        for k, v in data.dict(exclude_unset=True).items():
            setattr(festivo, k, v)
        db.commit()
        db.refresh(festivo)
        return festivo

    @staticmethod
    def delete_dia_festivo(db: Session, festivo_id: int) -> bool:
        festivo = db.query(models.DiaFestivo).filter(models.DiaFestivo.id == festivo_id).first()
        if not festivo:
            return False
        db.delete(festivo)
        db.commit()
        return True

    @staticmethod
    def generar_festivos_año(db: Session, año: int) -> dict:
        """Inserta los festivos LFT para el año indicado, omitiendo los que ya existen."""
        festivos = generar_festivos_lft(año)
        creados = 0
        omitidos = 0
        for f in festivos:
            existente = db.query(models.DiaFestivo).filter(models.DiaFestivo.fecha == f["fecha"]).first()
            if existente:
                omitidos += 1
                continue
            db.add(models.DiaFestivo(fecha=f["fecha"], nombre=f["nombre"], tipo=f["tipo"], activo=True))
            creados += 1
        db.commit()
        return {"año": año, "creados": creados, "omitidos": omitidos}

    @staticmethod
    def es_dia_festivo(db: Session, fecha: date) -> bool:
        """Devuelve True si la fecha es un día festivo activo."""
        return db.query(models.DiaFestivo).filter(
            models.DiaFestivo.fecha == fecha,
            models.DiaFestivo.activo == True,
        ).first() is not None

    @staticmethod
    def empleados_cubiertos_por_vacacion_general_aplicada(db: Session, fecha: date) -> set[int]:
        """
        Empleados que ya tienen aplicada una vacación general cuyo rango [inicio, fin]
        incluye `fecha`. Evita marcar falta ese día (el descuento de días va por otro flujo).
        """
        from app.modules.vacaciones import models as vac_models

        rows = (
            db.query(vac_models.VacacionGeneralAplicacion.empleado_id)
            .join(
                vac_models.VacacionGeneral,
                vac_models.VacacionGeneral.id == vac_models.VacacionGeneralAplicacion.vacacion_general_id,
            )
            .filter(
                vac_models.VacacionGeneral.activo == True,
                vac_models.VacacionGeneral.fecha_inicio <= fecha,
                vac_models.VacacionGeneral.fecha_fin >= fecha,
            )
            .distinct()
            .all()
        )
        return {int(r[0]) for r in rows}

    @staticmethod
    def empleados_cubiertos_por_solicitud_vacaciones_aprobada(db: Session, fecha: date) -> set[int]:
        """
        Empleados con solicitud de vacaciones aprobada (jefe o RH) cuyo periodo
        cubre el día `fecha` (calendario México). Evita generar falta automática.
        """
        from app.core.timezone_utils import mexico_date_to_utc_range
        from app.modules.vacaciones.models import SolicitudVacaciones, EstadoSolicitud

        start_utc, end_utc = mexico_date_to_utc_range(fecha)
        rows = (
            db.query(SolicitudVacaciones.empleado_id)
            .filter(
                SolicitudVacaciones.estado.in_(
                    (EstadoSolicitud.APROBADA, EstadoSolicitud.APROBADA_JEFE)
                ),
                SolicitudVacaciones.fecha_inicio < end_utc,
                SolicitudVacaciones.fecha_fin > start_utc,
            )
            .distinct()
            .all()
        )
        return {int(r[0]) for r in rows}

    @staticmethod
    def _checadas_requeridas_dia_horario(
        db: Session,
        empleado: personal_models.Empleado,
        fecha_mex: date,
    ) -> Tuple[int, str]:
        """
        Solo horario / empresa / festivo: misma regla que procesar_dia (sin incapacidad ni vacaciones).
        """
        empresa = empleado.empresa
        trabaja_festivos = bool(getattr(empresa, "trabaja_festivos", False))
        if AsistenciaService.es_dia_festivo(db, fecha_mex) and not trabaja_festivos:
            return 0, "festivo"

        wd = fecha_mex.weekday()
        dia_num = wd + 1
        dias_laborales_emp = ((empleado.empresa.dias_laborales if empleado.empresa else None) or "lun-sab").strip().lower()

        if wd == 6:
            if dias_laborales_emp == "lun-dom":
                return 2, "domingo_laborable"
            return 0, "domingo"

        eh = (
            db.query(models.EmpleadoHorario)
            .filter(
                models.EmpleadoHorario.empleado_id == empleado.id,
                models.EmpleadoHorario.activo == True,
            )
            .first()
        )
        if not eh or not eh.horario or not eh.horario.activo:
            return 0, "sin_horario"

        horario = eh.horario

        if wd == 5:
            # Empleado trabaja sábado si:
            #   - Tiene empleado.horario_sabado_id (legacy), o
            #   - Su horario L-V tiene hora_salida_sabado definida (modal actual).
            trabaja_sabado = False
            if empleado.horario_sabado_id:
                horario_sab = (
                    db.query(models.Horario)
                    .filter(
                        models.Horario.id == empleado.horario_sabado_id,
                        models.Horario.activo == True,
                    )
                    .first()
                )
                if horario_sab:
                    trabaja_sabado = True
            if not trabaja_sabado and getattr(horario, "hora_salida_sabado", None):
                trabaja_sabado = True
            if not trabaja_sabado:
                return 0, "no_sabado"
            return 2, "sabado"

        if horario.dias_semana:
            dias_permitidos = [int(d.strip()) for d in horario.dias_semana.split(",") if d.strip().isdigit()]
            if dias_permitidos and dia_num not in dias_permitidos:
                return 0, "no_laborable"

        ce = obtener_checada_especial_vigente(db, empleado.id, fecha_mex)
        if ce and wd < 5 and ce.checadas_requeridas is not None:
            return int(ce.checadas_requeridas), "checada_especial"
        if ce and ce.jornada_reducida_lv and wd < 5:
            return 2, "jornada_reducida"

        return 4, "entre_semana"

    @staticmethod
    def contexto_dia_laboral_empleado(
        db: Session,
        empleado: personal_models.Empleado,
        fecha_mex: date,
    ) -> Dict[str, Any]:
        """
        Contexto unificado: incapacidad, vacaciones (solicitud / general), festivo, horario.
        Usado por portal, listados y debe alinearse con procesar_dia.
        """
        from app.core.timezone_utils import mexico_date_to_utc_range
        from app.modules.incapacidades import service as incapacidad_service
        from app.modules.incapacidades import models as incap_models
        from app.modules.vacaciones.models import (
            SolicitudVacaciones,
            EstadoSolicitud,
            VacacionGeneral,
            VacacionGeneralAplicacion,
        )

        def _base(checadas_req: int, motivo: str, tipo_dia: str, etiqueta: str) -> Dict[str, Any]:
            return {
                "checadas_requeridas": checadas_req,
                "motivo": motivo,
                "tipo_dia": tipo_dia,
                "etiqueta": etiqueta,
                "requiere_checadas": checadas_req > 0,
            }

        if incapacidad_service.empleado_tiene_incapacidad_activa(db, empleado.id, fecha_mex):
            inc = (
                db.query(incap_models.Incapacidad)
                .filter(
                    incap_models.Incapacidad.empleado_id == empleado.id,
                    incap_models.Incapacidad.estado != incap_models.EstadoIncapacidad.CANCELADA,
                    incap_models.Incapacidad.fecha_inicio <= fecha_mex,
                    incap_models.Incapacidad.fecha_fin >= fecha_mex,
                )
                .first()
            )
            tipo_txt = (
                inc.tipo.value.replace("_", " ") if inc and inc.tipo else "incapacidad"
            )
            return _base(
                0,
                "incapacidad",
                "incapacidad",
                f"Incapacidad ({tipo_txt})" if inc else "Incapacidad",
            )

        start_utc, end_utc = mexico_date_to_utc_range(fecha_mex)
        sol = (
            db.query(SolicitudVacaciones)
            .filter(
                SolicitudVacaciones.empleado_id == empleado.id,
                SolicitudVacaciones.estado.in_(
                    (EstadoSolicitud.APROBADA, EstadoSolicitud.APROBADA_JEFE)
                ),
                SolicitudVacaciones.fecha_inicio < end_utc,
                SolicitudVacaciones.fecha_fin > start_utc,
            )
            .order_by(SolicitudVacaciones.id.desc())
            .first()
        )
        if sol:
            estado_txt = (
                "registro formal RH"
                if sol.estado == EstadoSolicitud.APROBADA
                else "aprobada por jefe (saldo descontado)"
            )
            return _base(
                0,
                "vacacion_solicitud",
                "vacacion_solicitud",
                f"Vacaciones por solicitud ({estado_txt})",
            )

        vg_ap = (
            db.query(VacacionGeneral)
            .join(
                VacacionGeneralAplicacion,
                VacacionGeneralAplicacion.vacacion_general_id == VacacionGeneral.id,
            )
            .filter(
                VacacionGeneralAplicacion.empleado_id == empleado.id,
                VacacionGeneral.activo == True,
                VacacionGeneral.fecha_inicio <= fecha_mex,
                VacacionGeneral.fecha_fin >= fecha_mex,
            )
            .first()
        )
        if vg_ap:
            return _base(
                0,
                "vacacion_general",
                "vacacion_general",
                f"Vacación general: {vg_ap.nombre}",
            )

        empresa = empleado.empresa
        trabaja_festivos = bool(getattr(empresa, "trabaja_festivos", False))
        fest = (
            db.query(models.DiaFestivo)
            .filter(
                models.DiaFestivo.fecha == fecha_mex,
                models.DiaFestivo.activo == True,
            )
            .first()
        )
        if fest and not trabaja_festivos:
            return _base(
                0,
                "festivo",
                "festivo",
                f"Festivo: {fest.nombre}",
            )

        n, motivo = AsistenciaService._checadas_requeridas_dia_horario(db, empleado, fecha_mex)
        etiquetas_horario = {
            "festivo": "Día festivo",
            "domingo": "Domingo (no laborable)",
            "domingo_laborable": "Domingo laborable",
            "sin_horario": "Sin horario asignado",
            "no_sabado": "Sin jornada de sábado",
            "no_laborable": "No laborable (horario)",
            "checada_especial": "Horario / checada especial",
            "jornada_reducida": "Jornada reducida",
            "entre_semana": "Jornada entre semana",
            "sabado": "Jornada de sábado",
        }
        etiqueta = etiquetas_horario.get(motivo, motivo)
        return _base(n, motivo, motivo, etiqueta)

    @staticmethod
    def listar_contexto_dias_empleado_rango(
        db: Session,
        empleado_id: int,
        fecha_ini: date,
        fecha_fin: date,
    ) -> List[Dict[str, Any]]:
        emp = (
            db.query(personal_models.Empleado)
            .filter(personal_models.Empleado.id == empleado_id)
            .first()
        )
        if not emp:
            return []
        out: List[Dict[str, Any]] = []
        d = fecha_ini
        while d <= fecha_fin:
            ctx = AsistenciaService.contexto_dia_laboral_empleado(db, emp, d)
            row = dict(ctx)
            row["fecha"] = d.isoformat()
            out.append(row)
            d += timedelta(days=1)
        return out

    @staticmethod
    def reconciliar_faltas_automaticas_con_contexto(
        db: Session,
        fecha_inicio: date,
        fecha_fin: date,
    ) -> Dict[str, Any]:
        """
        Marca como justificadas las FALTA con origen automático cuando, con las reglas
        actuales, ese día no requería asistencia (incapacidad, vacación por solicitud,
        vacación general aplicada, festivo sin laborar).
        Corrige faltas generadas antes de alinear procesar_dia con esas reglas.
        """
        from app.core.timezone_utils import mexico_date_to_utc_range, to_mexico

        motivos_ajuste = frozenset(
            {
                "incapacidad",
                "vacacion_solicitud",
                "vacacion_general",
                "festivo",
            }
        )

        lo = mexico_date_to_utc_range(fecha_inicio)[0]
        hi = mexico_date_to_utc_range(fecha_fin)[1]

        incs = (
            db.query(models.Incidencia)
            .filter(
                models.Incidencia.tipo == models.TipoIncidencia.FALTA,
                models.Incidencia.origen == "automatico",
                models.Incidencia.justificada == False,
                models.Incidencia.fecha >= lo,
                models.Incidencia.fecha < hi,
            )
            .all()
        )

        empleado_ids = {i.empleado_id for i in incs}
        empleados_map = (
            {
                e.id: e
                for e in db.query(personal_models.Empleado).filter(
                    personal_models.Empleado.id.in_(empleado_ids)
                )
            }
            if empleado_ids
            else {}
        )

        actualizadas = 0
        omitidas = 0
        detalle: List[Dict[str, Any]] = []

        for inc in incs:
            emp = empleados_map.get(inc.empleado_id)
            if not emp:
                omitidas += 1
                continue
            ts = to_mexico(inc.fecha)
            if not ts:
                omitidas += 1
                continue
            d_mex = ts.date()

            ctx = AsistenciaService.contexto_dia_laboral_empleado(db, emp, d_mex)
            if ctx.get("motivo") not in motivos_ajuste:
                continue

            inc.justificada = True
            msg = (
                f"Ajuste sistema: el día correspondía a «{ctx['etiqueta']}»; "
                "no debía registrarse falta automática."
            )
            if inc.comentarios and str(inc.comentarios).strip():
                inc.comentarios = str(inc.comentarios).strip() + "\n" + msg
            else:
                inc.comentarios = msg
            actualizadas += 1
            detalle.append(
                {
                    "incidencia_id": inc.id,
                    "empleado_id": inc.empleado_id,
                    "fecha": d_mex.isoformat(),
                    "motivo_contexto": ctx["motivo"],
                }
            )

        db.commit()
        return {
            "fecha_inicio": str(fecha_inicio),
            "fecha_fin": str(fecha_fin),
            "revisadas": len(incs),
            "justificadas": actualizadas,
            "omitidas_sin_empleado_o_fecha": omitidas,
            "detalle": detalle[:500],
        }

    # ========== PROCESO DIARIO: FALTAS E INCOMPLETAS ==========

    @staticmethod
    def procesar_dia(db: Session, fecha_str: Optional[str] = None) -> dict:
        """
        Detecta faltas y checadas incompletas para todos los empleados con horario asignado ese día.
        Si fecha_str es None, usa la fecha de ayer (para procesar el día ya cerrado).
        """
        from datetime import datetime, timedelta, date as date_type

        if fecha_str:
            try:
                fecha = datetime.strptime(fecha_str, "%Y-%m-%d").date()
            except ValueError:
                raise ValueError("Formato de fecha inválido. Use YYYY-MM-DD.")
        else:
            from app.core.timezone_utils import hoy_mexico
            fecha = hoy_mexico() - timedelta(days=1)

        from app.core.timezone_utils import mexico_date_to_utc_range, to_mexico
        dia_inicio_utc, dia_fin_utc = mexico_date_to_utc_range(fecha)

        dia_semana = fecha.weekday()  # 0=lunes … 6=domingo

        es_festivo_global = AsistenciaService.es_dia_festivo(db, fecha)

        # Obtener todos los EmpleadoHorario activos
        asignaciones = db.query(models.EmpleadoHorario).filter(
            models.EmpleadoHorario.activo == True,
        ).all()

        creadas = 0
        omitidas = 0

        # Pre-cargar los empleados para acceder a horario_sabado_id
        empleado_ids = {asig.empleado_id for asig in asignaciones}
        from app.modules.personal import models as personal_models
        empleados_map = {
            e.id: e for e in db.query(personal_models.Empleado).filter(
                personal_models.Empleado.id.in_(empleado_ids)
            ).all()
        } if empleado_ids else {}
        empresa_ids = {e.empresa_id for e in empleados_map.values() if e and e.empresa_id}
        empresas_map = {
            emp.id: emp for emp in db.query(personal_models.Empresa).filter(
                personal_models.Empresa.id.in_(empresa_ids)
            ).all()
        } if empresa_ids else {}

        # Pre-cargar empleados con incapacidad activa ese día para evitar generar faltas
        from app.modules.incapacidades import service as incapacidad_service
        con_incapacidad = {
            emp_id for emp_id in empleado_ids
            if incapacidad_service.empleado_tiene_incapacidad_activa(db, emp_id, fecha)
        }

        con_vacacion_general = AsistenciaService.empleados_cubiertos_por_vacacion_general_aplicada(db, fecha)
        con_solicitud_vacaciones = AsistenciaService.empleados_cubiertos_por_solicitud_vacaciones_aprobada(db, fecha)

        # Usuarios especiales (exento_incidencias): no generan incidencias automáticas
        exentos = {
            eid for eid, emp in empleados_map.items()
            if getattr(emp, "exento_incidencias", False)
        }

        for asig in asignaciones:
            horario = asig.horario
            if not horario or not horario.activo:
                continue

            # Si el empleado tiene incapacidad activa ese día → no generar incidencia
            if asig.empleado_id in con_incapacidad:
                continue

            # Vacación general ya aplicada y el día cae en el rango → no marcar falta/incompleta
            if asig.empleado_id in con_vacacion_general:
                continue

            # Solicitud de vacaciones aprobada (jefe o RH) en el periodo → no marcar falta
            if asig.empleado_id in con_solicitud_vacaciones:
                continue

            # Usuario especial (exento de incidencias) → no generar
            if asig.empleado_id in exentos:
                continue

            # dias_semana usa 1=lunes…7=domingo; weekday() devuelve 0=lun…6=dom
            dia_num = dia_semana + 1  # 1–7
            empleado = empleados_map.get(asig.empleado_id)
            empresa = empresas_map.get(empleado.empresa_id) if empleado and empleado.empresa_id else None
            dias_laborales_empresa = ((empresa.dias_laborales if empresa else None) or "lun-sab").strip().lower()
            trabaja_festivos_empresa = bool(getattr(empresa, "trabaja_festivos", False))

            # En festivo global, solo procesar empresas que sí laboran festivos.
            if es_festivo_global and not trabaja_festivos_empresa:
                continue

            # ── Sábado (dia_num == 6): lógica especial ──
            if dia_num == 6:
                # Determinar si el empleado labora sábado y cuál es su salida efectiva.
                # Prioridad:
                #   1. empleado.horario_sabado_id → horario separado (legacy).
                #   2. horario.hora_salida_sabado → columna del mismo horario L-V
                #      (es como lo guarda el modal actual de crear/editar horario).
                # Si ninguno define horario sabatino, el empleado NO labora sábados.
                hora_salida_efectiva = None
                tolerancia_efectiva = horario.tolerancia_minutos or 0
                if empleado and empleado.horario_sabado_id:
                    horario_sab = db.query(models.Horario).filter(
                        models.Horario.id == empleado.horario_sabado_id,
                        models.Horario.activo == True,
                    ).first()
                    if horario_sab:
                        hora_salida_efectiva = horario_sab.hora_salida_sabado or horario_sab.hora_salida
                        tolerancia_efectiva = horario_sab.tolerancia_minutos or 0
                if hora_salida_efectiva is None and getattr(horario, "hora_salida_sabado", None):
                    hora_salida_efectiva = horario.hora_salida_sabado
                if hora_salida_efectiva is None:
                    continue
            elif dia_num == 7:
                # Domingo: solo aplica para empresas configuradas como lun-dom.
                if dias_laborales_empresa != "lun-dom":
                    continue
                # Domingo se trata como jornada corta (2 checadas: entrada/salida).
                hora_salida_efectiva = horario.hora_salida
                tolerancia_efectiva = horario.tolerancia_minutos or 0
            else:
                # Verificar si el día está incluido en dias_semana
                if horario.dias_semana:
                    dias_permitidos = [int(d.strip()) for d in horario.dias_semana.split(",") if d.strip().isdigit()]
                    if dia_num not in dias_permitidos:
                        continue
                hora_salida_efectiva = horario.hora_salida
                tolerancia_efectiva = horario.tolerancia_minutos or 0

            ce_pd = obtener_checada_especial_vigente(db, asig.empleado_id, fecha)
            if ce_pd:
                if ce_pd.tolerancia_minutos is not None:
                    tolerancia_efectiva = ce_pd.tolerancia_minutos
                if dia_num == 6:
                    if ce_pd.hora_salida_sabado:
                        hora_salida_efectiva = ce_pd.hora_salida_sabado
                    elif ce_pd.hora_salida:
                        hora_salida_efectiva = ce_pd.hora_salida
                elif ce_pd.hora_salida:
                    hora_salida_efectiva = ce_pd.hora_salida

            # Sábado y domingo laborable: 2 checadas (entrada + salida, sin comida)
            checadas_requeridas = 2 if dia_num in (6, 7) else 4
            if ce_pd and 1 <= dia_num <= 5 and ce_pd.checadas_requeridas is not None:
                checadas_requeridas = int(ce_pd.checadas_requeridas)
            elif ce_pd and ce_pd.jornada_reducida_lv and 1 <= dia_num <= 5:
                checadas_requeridas = 2

            # Contar checadas del empleado ese día (rango en UTC para fecha en México)
            checadas = db.query(models.Asistencia).filter(
                models.Asistencia.empleado_id == asig.empleado_id,
                models.Asistencia.timestamp >= dia_inicio_utc,
                models.Asistencia.timestamp < dia_fin_utc,
            ).count()

            if checadas >= checadas_requeridas:
                # ── Verificar salida anticipada ──
                salida_real = db.query(models.Asistencia).filter(
                    models.Asistencia.empleado_id == asig.empleado_id,
                    models.Asistencia.timestamp >= dia_inicio_utc,
                    models.Asistencia.timestamp < dia_fin_utc,
                    models.Asistencia.tipo == models.TipoChecada.SALIDA,
                ).order_by(models.Asistencia.timestamp.desc()).first()

                if salida_real:
                    partes = hora_salida_efectiva.split(":")
                    hora_sal_prog = datetime(
                        fecha.year, fecha.month, fecha.day,
                        int(partes[0]), int(partes[1]), 0
                    )
                    tolerancia_sa = timedelta(minutes=tolerancia_efectiva)
                    ts_salida_mex = to_mexico(salida_real.timestamp) or salida_real.timestamp
                    ts_salida = ts_salida_mex.replace(tzinfo=None) if ts_salida_mex.tzinfo else ts_salida_mex

                    if ts_salida < hora_sal_prog - tolerancia_sa:
                        minutos_antes = int((hora_sal_prog - ts_salida).total_seconds() / 60)

                        existe_sa = db.query(models.Incidencia).filter(
                            models.Incidencia.empleado_id == asig.empleado_id,
                            models.Incidencia.fecha >= dia_inicio_utc,
                            models.Incidencia.fecha < dia_fin_utc,
                            models.Incidencia.tipo == models.TipoIncidencia.SALIDA_ANTICIPADA,
                            models.Incidencia.origen == "automatico",
                        ).first()

                        if not existe_sa:
                            db.add(models.Incidencia(
                                empleado_id=asig.empleado_id,
                                tipo=models.TipoIncidencia.SALIDA_ANTICIPADA,
                                fecha=dia_inicio_utc,
                                descripcion=(
                                    f"Salida anticipada: registró salida a las "
                                    f"{ts_salida.strftime('%H:%M')} "
                                    f"({minutos_antes} min antes de las {hora_salida_efectiva})"
                                ),
                                justificada=False,
                                origen="automatico",
                            ))
                            creadas += 1
                continue

            # Determinar tipo y descripción según checadas
            # FALTA = no se presentó (0 checadas)
            # INCOMPLETA = asistió pero faltan checadas (1, 2 o 3 de 4)
            if checadas_requeridas == 2:
                # Solo entrada y salida (sábado, domingo laborable o medio día L-V)
                if checadas == 0:
                    tipo = models.TipoIncidencia.FALTA
                    descripcion = "No se presentó (sin checadas)"
                else:  # 1
                    tipo = models.TipoIncidencia.INCOMPLETA
                    descripcion = "Solo registró entrada. Falta checada de salida"
            else:
                # L-V: 4 checadas requeridas
                if checadas == 0:
                    tipo = models.TipoIncidencia.FALTA
                    descripcion = "No se presentó (sin checadas)"
                elif checadas == 1:
                    tipo = models.TipoIncidencia.INCOMPLETA
                    descripcion = "Solo registró entrada. Faltan: salida a comer, regreso de comer y salida"
                elif checadas == 2:
                    tipo = models.TipoIncidencia.INCOMPLETA
                    descripcion = "Faltan: regreso de comer y salida"
                else:  # 3
                    tipo = models.TipoIncidencia.INCOMPLETA
                    descripcion = "Falta checada de salida"

            # Evitar duplicados
            existente = db.query(models.Incidencia).filter(
                models.Incidencia.empleado_id == asig.empleado_id,
                models.Incidencia.fecha >= dia_inicio_utc,
                models.Incidencia.fecha < dia_fin_utc,
                models.Incidencia.tipo == tipo,
                models.Incidencia.origen == "automatico",
            ).first()

            if existente:
                omitidas += 1
                continue

            inc = models.Incidencia(
                empleado_id=asig.empleado_id,
                tipo=tipo,
                fecha=dia_inicio_utc,
                descripcion=descripcion,
                justificada=False,
                origen="automatico",
            )
            db.add(inc)
            creadas += 1

        db.commit()
        return {"fecha": str(fecha), "incidencias_creadas": creadas, "omitidas_duplicadas": omitidas}
    
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
        empleado_ids: Optional[List[int]] = None,
        tipo: Optional[str] = None,
        fecha_inicio: Optional[datetime] = None,
        fecha_fin: Optional[datetime] = None
    ) -> List[models.Incidencia]:
        """Listar incidencias con filtros. empleado_ids permite filtrar por varios (ej. mi área)."""
        query = db.query(models.Incidencia)
        
        if empleado_id:
            query = query.filter(models.Incidencia.empleado_id == empleado_id)
        if empleado_ids:
            query = query.filter(models.Incidencia.empleado_id.in_(empleado_ids))
        if tipo:
            query = query.filter(models.Incidencia.tipo == tipo)
        if fecha_inicio:
            query = query.filter(models.Incidencia.fecha >= fecha_inicio)
        if fecha_fin:
            query = query.filter(models.Incidencia.fecha <= fecha_fin)
        
        return query.order_by(models.Incidencia.fecha.desc()).all()

    @staticmethod
    def update_incidencia(
        db: Session,
        incidencia_id: int,
        data: Union["schemas.IncidenciaUpdate", dict]
    ) -> Optional[models.Incidencia]:
        """Actualizar incidencia (ej. justificada, comentarios, justificado_por_id)."""
        inc = db.query(models.Incidencia).filter(models.Incidencia.id == incidencia_id).first()
        if not inc:
            return None
        update_data = data.dict(exclude_unset=True) if hasattr(data, "dict") else data
        for k, v in update_data.items():
            if hasattr(inc, k):
                setattr(inc, k, v)
        db.commit()
        db.refresh(inc)
        return inc

    @staticmethod
    def get_incidencia(db: Session, incidencia_id: int) -> Optional[models.Incidencia]:
        """Obtener una incidencia por ID."""
        return db.query(models.Incidencia).filter(models.Incidencia.id == incidencia_id).first()

    # ========== CHECADAS ESPECIALES ==========

    @staticmethod
    def listar_checadas_especiales(db: Session) -> List[models.ChecadaEspecial]:
        return (
            db.query(models.ChecadaEspecial)
            .order_by(models.ChecadaEspecial.fecha_inicio.desc())
            .all()
        )

    @staticmethod
    def map_checada_especial_response(ce: models.ChecadaEspecial) -> schemas.ChecadaEspecialResponse:
        cr = ce.checadas_requeridas
        if cr is None:
            cr = 2 if ce.jornada_reducida_lv else 4
        incl_list: List[int] = []
        if ce.empresas_incluidas is not None and isinstance(ce.empresas_incluidas, list):
            incl_list = [int(x) for x in ce.empresas_incluidas]
        excl_list: List[int] = []
        if ce.empresas_excluidas and isinstance(ce.empresas_excluidas, list):
            excl_list = [int(x) for x in ce.empresas_excluidas]
        fecha_fin_opt = ce.fecha_fin if ce.fecha_fin != ce.fecha_inicio else None
        a = (ce.alcance or "global").strip().lower()
        # Reglas antiguas solo JSON: alcance en BD era "global" pero lista de una empresa
        if ce.empresas_incluidas is not None and isinstance(ce.empresas_incluidas, list):
            if a == "global" and len(incl_list) == 1 and ce.departamento_id is None:
                a = "empresa"
        eid = ce.empresa_id
        did = ce.departamento_id
        legacy = ce.empresas_incluidas is None
        if legacy:
            alcance_legacy = ce.alcance
            empresa_id_legacy = ce.empresa_id
            departamento_id_legacy = ce.departamento_id
        else:
            alcance_legacy = None
            empresa_id_legacy = None
            departamento_id_legacy = None
        return schemas.ChecadaEspecialResponse(
            id=ce.id,
            nombre=ce.nombre,
            fecha=ce.fecha_inicio,
            fecha_fin=fecha_fin_opt,
            hora_entrada=ce.hora_entrada,
            hora_salida=ce.hora_salida,
            tolerancia_minutos=ce.tolerancia_minutos,
            checadas_requeridas=cr,
            alcance=a,
            empresa_id=eid,
            departamento_id=did,
            empresas_incluidas=incl_list,
            empresas_excluidas=excl_list,
            notas=ce.notas,
            activo=bool(ce.activo),
            created_at=ce.created_at,
            updated_at=ce.updated_at,
            alcance_legacy=alcance_legacy,
            empresa_id_legacy=empresa_id_legacy,
            departamento_id_legacy=departamento_id_legacy,
        )

    @staticmethod
    def _sync_checada_especial_incluidas(ce: models.ChecadaEspecial) -> None:
        """Alinea empresas_incluidas (JSON) con alcance / empresa_id / departamento_id."""
        a = (ce.alcance or "global").strip().lower()
        if a == "departamento":
            ce.empresas_incluidas = None
        elif a == "global":
            ce.empresas_incluidas = []
        elif a == "empresa":
            if ce.empresa_id is not None:
                ce.empresas_incluidas = [ce.empresa_id]
            else:
                ce.empresas_incluidas = []

    @staticmethod
    def crear_checada_especial(db: Session, data: schemas.ChecadaEspecialCreate) -> models.ChecadaEspecial:
        a = data.alcance
        if a == "empresa" and not data.empresa_id:
            raise ValueError("empresa_id es obligatorio cuando el alcance es empresa")
        if a == "departamento" and not data.departamento_id:
            raise ValueError("departamento_id es obligatorio cuando el alcance es departamento")
        jornada = data.checadas_requeridas == 2
        excl = list(data.empresas_excluidas or [])
        if a == "global":
            alc = "global"
            eid = None
            did = None
            incl: Optional[List[int]] = []
        elif a == "empresa":
            alc = "empresa"
            eid = data.empresa_id
            did = None
            incl = [data.empresa_id] if data.empresa_id else []
        else:
            alc = "departamento"
            eid = None
            did = data.departamento_id
            incl = None
        ce = models.ChecadaEspecial(
            nombre=data.nombre.strip(),
            notas=data.notas,
            activo=data.activo if data.activo is not None else True,
            fecha_inicio=data.fecha,
            fecha_fin=data.fecha,
            alcance=alc,
            empresa_id=eid,
            departamento_id=did,
            hora_entrada=data.hora_entrada,
            hora_salida=data.hora_salida,
            hora_entrada_sabado=None,
            hora_salida_sabado=None,
            tolerancia_minutos=data.tolerancia_minutos,
            jornada_reducida_lv=jornada,
            checadas_requeridas=data.checadas_requeridas,
            empresas_incluidas=incl,
            empresas_excluidas=excl,
        )
        db.add(ce)
        db.commit()
        db.refresh(ce)
        return ce

    @staticmethod
    def actualizar_checada_especial(
        db: Session, checada_id: int, data: schemas.ChecadaEspecialUpdate
    ) -> Optional[models.ChecadaEspecial]:
        ce = db.query(models.ChecadaEspecial).filter(models.ChecadaEspecial.id == checada_id).first()
        if not ce:
            return None
        payload = data.model_dump(exclude_unset=True)
        if "fecha" in payload and payload["fecha"] is not None:
            fi = payload["fecha"]
            ce.fecha_inicio = fi
            ce.fecha_fin = fi
            del payload["fecha"]
        if "checadas_requeridas" in payload and payload["checadas_requeridas"] is not None:
            ce.jornada_reducida_lv = payload["checadas_requeridas"] == 2
        for k, v in payload.items():
            if hasattr(ce, k):
                setattr(ce, k, v)
        if "alcance" in payload:
            new_a = (ce.alcance or "global").strip().lower()
            if new_a == "global":
                ce.empresa_id = None
                ce.departamento_id = None
            elif new_a == "empresa":
                ce.departamento_id = None
            elif new_a == "departamento":
                ce.empresa_id = None
        new_a = (ce.alcance or "global").strip().lower()
        if new_a == "empresa" and ce.empresa_id is None:
            raise ValueError("empresa_id es obligatorio cuando el alcance es empresa")
        if new_a == "departamento" and ce.departamento_id is None:
            raise ValueError("departamento_id es obligatorio cuando el alcance es departamento")
        AsistenciaService._sync_checada_especial_incluidas(ce)
        db.commit()
        db.refresh(ce)
        return ce

    @staticmethod
    def eliminar_checada_especial(db: Session, checada_id: int) -> bool:
        ce = db.query(models.ChecadaEspecial).filter(models.ChecadaEspecial.id == checada_id).first()
        if not ce:
            return False
        db.delete(ce)
        db.commit()
        return True
