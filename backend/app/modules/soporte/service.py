from datetime import datetime, timezone
from pathlib import Path
import hashlib
import uuid
from typing import Optional

from passlib.context import CryptContext
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.modules.personal import models as personal_models
from . import models, schemas

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _verificar_password_empleado(empleado: personal_models.Empleado, password: str) -> bool:
    """Misma lógica que portal de checadas: sin hash legacy, SHA256 64 hex, o bcrypt."""
    if not empleado.password_hash:
        return password == (empleado.numero_empleado or "") or password == "admin123"
    h = empleado.password_hash
    if len(h) == 64:
        return hashlib.sha256(password.encode()).hexdigest() == h
    try:
        return bool(_pwd_ctx.verify(password, h))
    except Exception:
        return False


class SoporteService:
    ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt"}
    MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB por archivo
    # Categorías solo para alta interna (TI/Admin), no en portal público
    _CLASES_SOLO_INTERNO_KEYWORDS = ("mantenimiento", "ventana", "ventanas")
    _ADMIN_ROL_NAMES = ("Administrador", "Superuser")
    _CLASES_INTERNAS_SEED: dict[str, list[str]] = {
        "Mantenimiento": [
            "Equipo de cómputo",
            "Red y conectividad",
            "Impresora / periféricos",
            "Otro (mantenimiento)",
        ],
        "Ventanas": [
            "Instalación de Windows",
            "Actualización y parches",
            "Activación / licencia",
            "Falla del sistema",
            "Otro (Windows)",
        ],
    }

    @staticmethod
    def _norm_clase_nombre(nombre: Optional[str]) -> str:
        return (nombre or "").strip().lower()

    @staticmethod
    def clase_es_solo_interno(nombre: Optional[str]) -> bool:
        """True si la categoría es de uso exclusivo TI (mantenimiento, ventanas)."""
        n = SoporteService._norm_clase_nombre(nombre)
        if not n:
            return False
        return any(k in n for k in SoporteService._CLASES_SOLO_INTERNO_KEYWORDS)

    @staticmethod
    def _es_depto_ti(nombre: Optional[str]) -> bool:
        n = (nombre or "").strip().lower()
        if not n:
            return False
        if n in ("ti", "it", "sistemas", "tecnología de la información", "tecnologias de la informacion"):
            return True
        return "sistemas" in n or "tecnolog" in n

    @staticmethod
    def empleado_es_personal_ti(empleado: personal_models.Empleado) -> bool:
        """Personal del departamento de TI."""
        if empleado.empresa_id is None:
            return False
        if not empleado.departamento_rel:
            return False
        return SoporteService._es_depto_ti(empleado.departamento_rel.nombre)

    @staticmethod
    def empleado_es_administrador(empleado: personal_models.Empleado) -> bool:
        rol = getattr(empleado, "rol", None)
        if rol and (rol.nombre or "") in SoporteService._ADMIN_ROL_NAMES:
            return True
        return False

    @staticmethod
    def empleado_puede_registrar_ticket_interno(empleado: personal_models.Empleado) -> bool:
        """TI o Administrador pueden registrar tickets de Mantenimiento / Ventanas."""
        if SoporteService.empleado_es_administrador(empleado):
            return True
        return SoporteService.empleado_es_personal_ti(empleado)

    @staticmethod
    def _empresa_etiqueta(empresa: Optional[personal_models.Empresa]) -> Optional[str]:
        """Siglas si están definidas; si no, nombre completo."""
        if not empresa:
            return None
        siglas = (empresa.siglas or "").strip()
        if siglas:
            return siglas
        return (empresa.nombre or "").strip() or None

    @staticmethod
    def _aplicar_empresa_etiqueta_en_tickets(db: Session, tickets: list) -> None:
        """Sustituye empresa_nombre en memoria por siglas (vía empleado) para la respuesta API."""
        emp_ids = [int(t.empleado_id) for t in tickets if getattr(t, "empleado_id", None)]
        if not emp_ids:
            return
        rows = (
            db.query(personal_models.Empleado)
            .options(joinedload(personal_models.Empleado.empresa))
            .filter(personal_models.Empleado.id.in_(emp_ids))
            .all()
        )
        etiqueta_por_empleado = {
            int(e.id): SoporteService._empresa_etiqueta(e.empresa)
            for e in rows
        }
        for t in tickets:
            eid = getattr(t, "empleado_id", None)
            if eid is None:
                continue
            etiqueta = etiqueta_por_empleado.get(int(eid))
            if etiqueta:
                t.empresa_nombre = etiqueta

    @staticmethod
    def _empleado_datos_ticket(empleado: personal_models.Empleado, empresa: personal_models.Empresa):
        nombre_solicitante = " ".join(
            [x for x in [empleado.nombre, empleado.apellido_paterno, empleado.apellido_materno] if (x or "").strip()]
        ).strip() or (empleado.numero_empleado or "Empleado")
        depto_nombre = None
        if empleado.departamento_rel:
            depto_nombre = (empleado.departamento_rel.nombre or "").strip() or None
        tel_empresa = (getattr(empleado, "telefono_empresa_asignado", None) or "").strip()
        tel_personal = (empleado.telefono or "").strip()
        tel_ticket = (tel_empresa or tel_personal) or None
        return nombre_solicitante, depto_nombre, tel_ticket, SoporteService._empresa_etiqueta(empresa)

    @staticmethod
    def _resolve_adjuntos_base_dir() -> Path:
        preferred = Path(settings.SOPORTE_ADJUNTOS_DIR).resolve()
        try:
            preferred.mkdir(parents=True, exist_ok=True)
            return preferred
        except (PermissionError, FileNotFoundError, OSError):
            # Fallback para desarrollo local cuando /opt no existe o no es escribible.
            local = Path(__file__).resolve().parents[3] / "storage" / "soporte" / "adjuntos"
            local.mkdir(parents=True, exist_ok=True)
            return local

    @staticmethod
    def ensure_clases_internas_activas(db: Session) -> None:
        """Crea o reactiva Mantenimiento/Ventanas y sus tipos si faltan en BD."""
        for clase_nombre, tipos in SoporteService._CLASES_INTERNAS_SEED.items():
            clase = (
                db.query(models.SoporteTicketClase)
                .filter(models.SoporteTicketClase.nombre.ilike(clase_nombre))
                .first()
            )
            if not clase:
                clase = models.SoporteTicketClase(nombre=clase_nombre, activo=True)
                db.add(clase)
                db.flush()
            elif not clase.activo:
                clase.activo = True
            for tipo_nombre in tipos:
                tipo = (
                    db.query(models.SoporteTicketTipo)
                    .filter(models.SoporteTicketTipo.nombre.ilike(tipo_nombre))
                    .first()
                )
                if not tipo:
                    db.add(
                        models.SoporteTicketTipo(
                            nombre=tipo_nombre,
                            clase_id=int(clase.id),
                            activo=True,
                        )
                    )
                else:
                    tipo.clase_id = int(clase.id)
                    tipo.activo = True
        db.commit()

    @staticmethod
    def list_clases(db: Session, solo_activas: bool = False, solo_interno: Optional[bool] = None):
        q = db.query(models.SoporteTicketClase)
        if solo_activas:
            q = q.filter(models.SoporteTicketClase.activo.is_(True))
        rows = q.order_by(models.SoporteTicketClase.nombre.asc()).all()
        if solo_interno is True:
            return [c for c in rows if SoporteService.clase_es_solo_interno(c.nombre)]
        if solo_interno is False:
            return [c for c in rows if not SoporteService.clase_es_solo_interno(c.nombre)]
        return rows

    @staticmethod
    def list_clases_portal(db: Session):
        return SoporteService.list_clases(db, solo_activas=True, solo_interno=False)

    @staticmethod
    def list_tipos_portal(db: Session, clase_id: Optional[int] = None):
        if clase_id is not None:
            clase = db.query(models.SoporteTicketClase).filter(models.SoporteTicketClase.id == clase_id).first()
            if not clase or SoporteService.clase_es_solo_interno(clase.nombre):
                return []
        tipos = SoporteService.list_tipos_ticket(db, solo_activos=True, clase_id=clase_id)
        return [
            t for t in tipos
            if not (t.clase and SoporteService.clase_es_solo_interno(t.clase.nombre))
        ]

    @staticmethod
    def create_clase(db: Session, data: schemas.SoporteTicketClaseCreate) -> models.SoporteTicketClase:
        nombre = data.nombre.strip()
        if not nombre:
            raise ValueError("El nombre de la clase es obligatorio.")
        existente = db.query(models.SoporteTicketClase).filter(models.SoporteTicketClase.nombre.ilike(nombre)).first()
        if existente:
            raise ValueError("Ya existe una clase con ese nombre.")
        item = models.SoporteTicketClase(nombre=nombre, activo=bool(data.activo))
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @staticmethod
    def update_clase(db: Session, clase_id: int, data: schemas.SoporteTicketClaseUpdate) -> Optional[models.SoporteTicketClase]:
        item = db.query(models.SoporteTicketClase).filter(models.SoporteTicketClase.id == clase_id).first()
        if not item:
            return None
        update = data.model_dump(exclude_unset=True)
        if "nombre" in update and update["nombre"] is not None:
            nombre = str(update["nombre"]).strip()
            existente = db.query(models.SoporteTicketClase).filter(
                models.SoporteTicketClase.id != clase_id,
                models.SoporteTicketClase.nombre.ilike(nombre),
            ).first()
            if existente:
                raise ValueError("Ya existe una clase con ese nombre.")
            item.nombre = nombre
        if "activo" in update and update["activo"] is not None:
            item.activo = bool(update["activo"])
        db.commit()
        db.refresh(item)
        return item

    @staticmethod
    def _tipo_to_response(tipo: models.SoporteTicketTipo) -> dict:
        return {
            "id": tipo.id,
            "nombre": tipo.nombre,
            "clase_id": tipo.clase_id,
            "clase_nombre": tipo.clase.nombre if tipo.clase else None,
            "activo": tipo.activo,
        }

    @staticmethod
    def list_tipos_ticket(db: Session, solo_activos: bool = False, clase_id: Optional[int] = None):
        from sqlalchemy.orm import joinedload
        q = db.query(models.SoporteTicketTipo).options(joinedload(models.SoporteTicketTipo.clase))
        if solo_activos:
            q = q.filter(models.SoporteTicketTipo.activo.is_(True))
        if clase_id is not None:
            q = q.filter(models.SoporteTicketTipo.clase_id == clase_id)
        return q.order_by(models.SoporteTicketTipo.nombre.asc()).all()

    @staticmethod
    def create_tipo_ticket(db: Session, data: schemas.SoporteTicketTipoCreate) -> models.SoporteTicketTipo:
        from sqlalchemy.orm import joinedload
        nombre = data.nombre.strip()
        existente = db.query(models.SoporteTicketTipo).filter(models.SoporteTicketTipo.nombre.ilike(nombre)).first()
        if existente:
            raise ValueError("Ya existe un tipo de ticket con ese nombre.")
        if data.clase_id is not None:
            clase = db.query(models.SoporteTicketClase).filter(models.SoporteTicketClase.id == data.clase_id).first()
            if not clase:
                raise ValueError("Clase de ticket no encontrada.")
        item = models.SoporteTicketTipo(nombre=nombre, clase_id=data.clase_id, activo=bool(data.activo))
        db.add(item)
        db.commit()
        db.refresh(item)
        return db.query(models.SoporteTicketTipo).options(joinedload(models.SoporteTicketTipo.clase)).filter(models.SoporteTicketTipo.id == item.id).first()

    @staticmethod
    def update_tipo_ticket(db: Session, tipo_id: int, data: schemas.SoporteTicketTipoUpdate) -> Optional[models.SoporteTicketTipo]:
        from sqlalchemy.orm import joinedload
        item = db.query(models.SoporteTicketTipo).filter(models.SoporteTicketTipo.id == tipo_id).first()
        if not item:
            return None
        update = data.model_dump(exclude_unset=True)
        if "nombre" in update and update["nombre"] is not None:
            nombre = str(update["nombre"]).strip()
            existente = db.query(models.SoporteTicketTipo).filter(
                models.SoporteTicketTipo.id != tipo_id,
                models.SoporteTicketTipo.nombre.ilike(nombre)
            ).first()
            if existente:
                raise ValueError("Ya existe un tipo de ticket con ese nombre.")
            item.nombre = nombre
        if "clase_id" in update:
            if update["clase_id"] is not None:
                clase = db.query(models.SoporteTicketClase).filter(models.SoporteTicketClase.id == update["clase_id"]).first()
                if not clase:
                    raise ValueError("Clase de ticket no encontrada.")
            item.clase_id = update["clase_id"]
        if "activo" in update and update["activo"] is not None:
            item.activo = bool(update["activo"])
        db.commit()
        db.refresh(item)
        return db.query(models.SoporteTicketTipo).options(joinedload(models.SoporteTicketTipo.clase)).filter(models.SoporteTicketTipo.id == item.id).first()

    @staticmethod
    def _next_folio(db: Session) -> str:
        year = datetime.now(timezone.utc).year
        prefix = f"TKT-{year}-"
        rows = db.query(models.SoporteTicket.folio).filter(models.SoporteTicket.folio.like(f"{prefix}%")).all()
        nums = []
        for (folio,) in rows:
            if not folio:
                continue
            part = str(folio).replace(prefix, "", 1)
            if part.isdigit():
                nums.append(int(part))
        nxt = (max(nums) + 1) if nums else 1
        return f"{prefix}{str(nxt).zfill(5)}"

    @staticmethod
    def create_ticket_portal(db: Session, data: schemas.SoporteTicketPortalCreate) -> models.SoporteTicket:
        empresa = (
            db.query(personal_models.Empresa)
            .filter(personal_models.Empresa.id == data.empresa_id, personal_models.Empresa.activo.is_(True))
            .first()
        )
        if not empresa:
            raise ValueError("Empresa no válida o inactiva.")

        usr = (data.usuario or "").strip()
        if not usr:
            raise ValueError("Usuario de sistema obligatorio.")

        empleado = (
            db.query(personal_models.Empleado)
            .options(
                joinedload(personal_models.Empleado.departamento_rel),
            )
            .filter(
                personal_models.Empleado.empresa_id == data.empresa_id,
                personal_models.Empleado.estado == personal_models.EstadoEmpleado.ACTIVO,
                (
                    (personal_models.Empleado.username == usr) |
                    (personal_models.Empleado.numero_empleado == usr)
                ),
            )
            .first()
        )
        if not empleado or not _verificar_password_empleado(empleado, data.password):
            raise ValueError("Credenciales incorrectas.")

        tipo_ticket = SoporteService._resolver_tipo_ticket(
            db, data.tipo_ticket_id, solo_interno=False, obligatorio=True
        )
        nombre_solicitante, depto_nombre, tel_ticket, empresa_nombre = SoporteService._empleado_datos_ticket(
            empleado, empresa
        )

        ticket = models.SoporteTicket(
            folio=SoporteService._next_folio(db),
            origen="portal",
            estado=models.TicketEstado.ABIERTO,
            prioridad=data.prioridad,
            titulo=data.titulo.strip(),
            descripcion=data.descripcion.strip(),
            nombre_solicitante=nombre_solicitante,
            email_solicitante=(empleado.email or "").strip() or None,
            telefono_solicitante=tel_ticket,
            empresa_nombre=empresa_nombre,
            departamento_nombre=depto_nombre,
            tipo_ticket_id=tipo_ticket.id if tipo_ticket else None,
            empleado_id=int(empleado.id),
        )
        db.add(ticket)
        db.commit()
        db.refresh(ticket)
        return ticket

    @staticmethod
    def _resolver_tipo_ticket(
        db: Session,
        tipo_ticket_id: Optional[int],
        *,
        solo_interno: bool,
        obligatorio: bool,
    ) -> Optional[models.SoporteTicketTipo]:
        if tipo_ticket_id is None:
            if obligatorio:
                raise ValueError("El tipo de ticket es obligatorio.")
            return None
        tipo = (
            db.query(models.SoporteTicketTipo)
            .options(joinedload(models.SoporteTicketTipo.clase))
            .filter(
                models.SoporteTicketTipo.id == tipo_ticket_id,
                models.SoporteTicketTipo.activo.is_(True),
            )
            .first()
        )
        if not tipo:
            raise ValueError("Tipo de ticket inválido o inactivo.")
        es_interno = bool(tipo.clase and SoporteService.clase_es_solo_interno(tipo.clase.nombre))
        if solo_interno and not es_interno:
            raise ValueError("El tipo seleccionado no pertenece a Mantenimiento o Ventanas.")
        if not solo_interno and es_interno:
            raise ValueError("Este tipo de ticket solo puede crearse desde Soporte TI (aplicación interna).")
        return tipo

    @staticmethod
    def create_ticket_interno(db: Session, data: schemas.SoporteTicketInternoCreate) -> models.SoporteTicket:
        empleado = (
            db.query(personal_models.Empleado)
            .options(joinedload(personal_models.Empleado.departamento_rel))
            .filter(
                personal_models.Empleado.id == data.empleado_id,
                or_(
                    personal_models.Empleado.estado == personal_models.EstadoEmpleado.ACTIVO,
                    personal_models.Empleado.estado.is_(None),
                ),
            )
            .first()
        )
        if not empleado:
            raise ValueError("Empleado no encontrado o inactivo.")
        if not SoporteService.empleado_puede_registrar_ticket_interno(empleado):
            raise ValueError("Solo puede seleccionarse personal de TI o Administrador.")

        empresa = (
            db.query(personal_models.Empresa)
            .filter(
                personal_models.Empresa.id == data.empresa_id,
                personal_models.Empresa.activo.is_(True),
            )
            .first()
        )
        if not empresa:
            raise ValueError("Empresa no válida o inactiva.")

        tipo_ticket = SoporteService._resolver_tipo_ticket(
            db, data.tipo_ticket_id, solo_interno=True, obligatorio=True
        )
        nombre_solicitante, depto_nombre, tel_ticket, empresa_nombre = SoporteService._empleado_datos_ticket(
            empleado, empresa
        )

        ticket = models.SoporteTicket(
            folio=SoporteService._next_folio(db),
            origen="interno",
            estado=models.TicketEstado.ABIERTO,
            prioridad=data.prioridad,
            titulo=data.titulo.strip(),
            descripcion=data.descripcion.strip(),
            nombre_solicitante=nombre_solicitante,
            email_solicitante=(empleado.email or "").strip() or None,
            telefono_solicitante=tel_ticket,
            empresa_nombre=empresa_nombre,
            departamento_nombre=depto_nombre,
            tipo_ticket_id=tipo_ticket.id if tipo_ticket else None,
            empleado_id=int(empleado.id),
        )
        db.add(ticket)
        db.commit()
        db.refresh(ticket)
        return ticket

    @staticmethod
    def list_empleados_interno(db: Session) -> list[dict]:
        """Personal de TI y administradores activos (quienes registran tickets internos)."""
        empleados = (
            db.query(personal_models.Empleado)
            .options(
                joinedload(personal_models.Empleado.departamento_rel),
                joinedload(personal_models.Empleado.empresa),
                joinedload(personal_models.Empleado.rol),
            )
            .filter(
                or_(
                    personal_models.Empleado.estado == personal_models.EstadoEmpleado.ACTIVO,
                    personal_models.Empleado.estado.is_(None),
                ),
            )
            .order_by(
                personal_models.Empleado.nombre.asc(),
                personal_models.Empleado.apellido_paterno.asc(),
                personal_models.Empleado.apellido_materno.asc(),
            )
            .all()
        )
        out: list[dict] = []
        for e in empleados:
            if not SoporteService.empleado_puede_registrar_ticket_interno(e):
                continue
            nombre = " ".join(
                [x for x in [e.nombre, e.apellido_paterno, e.apellido_materno] if (x or "").strip()]
            ).strip()
            empresa = (e.empresa.nombre if getattr(e, "empresa", None) else None) or ""
            label = nombre or (e.numero_empleado or f"#{e.id}")
            if empresa:
                label = f"{label} ({empresa})"
            out.append({"id": int(e.id), "nombre_completo": label})
        return out

    @staticmethod
    def catalogo_ticket_interno(db: Session) -> dict:
        clases = SoporteService.list_clases(db, solo_activas=True, solo_interno=True)
        if not clases:
            SoporteService.ensure_clases_internas_activas(db)
            clases = SoporteService.list_clases(db, solo_activas=True, solo_interno=True)
        clase_ids = [int(c.id) for c in clases]
        tipos_raw = SoporteService.list_tipos_ticket(db, solo_activos=True)
        tipos = [SoporteService._tipo_to_response(t) for t in tipos_raw if t.clase_id in clase_ids]
        empresas = (
            db.query(personal_models.Empresa)
            .filter(personal_models.Empresa.activo.is_(True))
            .order_by(personal_models.Empresa.nombre.asc())
            .all()
        )
        return {
            "empresas": [{"id": int(e.id), "nombre": e.nombre} for e in empresas],
            "clases": [{"id": int(c.id), "nombre": c.nombre, "activo": bool(c.activo)} for c in clases],
            "tipos": tipos,
        }

    @staticmethod
    def list_tickets(
        db: Session,
        estado: Optional[models.TicketEstado] = None,
        prioridad: Optional[models.TicketPrioridad] = None,
        skip: int = 0,
        limit: int = 100,
    ):
        q = db.query(models.SoporteTicket)
        if estado is not None:
            q = q.filter(models.SoporteTicket.estado == estado)
        if prioridad is not None:
            q = q.filter(models.SoporteTicket.prioridad == prioridad)
        total = q.count()
        items = q.order_by(models.SoporteTicket.created_at.desc()).offset(skip).limit(limit).all()
        ids = [int(x.id) for x in items]
        count_map: dict[int, int] = {}
        if ids:
            rows = (
                db.query(models.SoporteTicketAdjunto.ticket_id, func.count(models.SoporteTicketAdjunto.id))
                .filter(models.SoporteTicketAdjunto.ticket_id.in_(ids))
                .group_by(models.SoporteTicketAdjunto.ticket_id)
                .all()
            )
            count_map = {int(ticket_id): int(cnt) for ticket_id, cnt in rows}
        for it in items:
            setattr(it, "_adjuntos_count", count_map.get(int(it.id), 0))
        SoporteService._aplicar_empresa_etiqueta_en_tickets(db, items)
        return items, total

    @staticmethod
    def get_ticket(db: Session, ticket_id: int) -> Optional[models.SoporteTicket]:
        ticket = db.query(models.SoporteTicket).filter(models.SoporteTicket.id == ticket_id).first()
        if ticket:
            cnt = (
                db.query(func.count(models.SoporteTicketAdjunto.id))
                .filter(models.SoporteTicketAdjunto.ticket_id == ticket.id)
                .scalar()
            ) or 0
            setattr(ticket, "_adjuntos_count", int(cnt))
            SoporteService._aplicar_empresa_etiqueta_en_tickets(db, [ticket])
        return ticket

    @staticmethod
    def update_ticket(db: Session, ticket_id: int, data: schemas.SoporteTicketUpdate) -> Optional[models.SoporteTicket]:
        ticket = SoporteService.get_ticket(db, ticket_id)
        if not ticket:
            return None
        update = data.model_dump(exclude_unset=True)
        for k, v in update.items():
            setattr(ticket, k, v)
        if ticket.estado in (models.TicketEstado.RESUELTO, models.TicketEstado.CERRADO):
            ticket.closed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(ticket)
        setattr(ticket, "_adjuntos_count", int(
            db.query(func.count(models.SoporteTicketAdjunto.id))
            .filter(models.SoporteTicketAdjunto.ticket_id == ticket.id)
            .scalar()
            or 0
        ))
        SoporteService._aplicar_empresa_etiqueta_en_tickets(db, [ticket])
        return ticket

    @staticmethod
    def list_adjuntos(db: Session, ticket_id: int) -> list[models.SoporteTicketAdjunto]:
        return (
            db.query(models.SoporteTicketAdjunto)
            .filter(models.SoporteTicketAdjunto.ticket_id == ticket_id)
            .order_by(models.SoporteTicketAdjunto.created_at.desc())
            .all()
        )

    @staticmethod
    def get_adjunto(db: Session, adjunto_id: int) -> Optional[models.SoporteTicketAdjunto]:
        return db.query(models.SoporteTicketAdjunto).filter(models.SoporteTicketAdjunto.id == adjunto_id).first()

    @staticmethod
    def guardar_adjunto_bytes(
        db: Session,
        ticket_id: int,
        filename: str,
        content_type: Optional[str],
        raw_bytes: bytes,
    ) -> models.SoporteTicketAdjunto:
        ticket = SoporteService.get_ticket(db, ticket_id)
        if not ticket:
            raise ValueError("Ticket no encontrado.")
        original = (filename or "").strip()
        if not original:
            raise ValueError("Nombre de archivo inválido.")
        ext = Path(original).suffix.lower()
        if ext not in SoporteService.ALLOWED_EXTENSIONS:
            raise ValueError("Tipo de archivo no permitido.")
        if len(raw_bytes) > SoporteService.MAX_FILE_BYTES:
            raise ValueError("Archivo excede el límite de 10 MB.")

        base_dir = SoporteService._resolve_adjuntos_base_dir()
        ticket_dir = base_dir / f"ticket-{ticket_id}"
        ticket_dir.mkdir(parents=True, exist_ok=True)

        stored_name = f"{uuid.uuid4().hex}{ext}"
        abs_path = ticket_dir / stored_name
        abs_path.write_bytes(raw_bytes)

        try:
            ruta_rel = str(abs_path.relative_to(base_dir))
        except ValueError:
            ruta_rel = f"ticket-{ticket_id}/{stored_name}"

        adj = models.SoporteTicketAdjunto(
            ticket_id=ticket_id,
            nombre_original=original,
            nombre_guardado=stored_name,
            ruta_relativa=ruta_rel,
            mime_type=(content_type or "").strip() or None,
            tamano_bytes=len(raw_bytes),
        )
        db.add(adj)
        db.commit()
        db.refresh(adj)
        return adj

    @staticmethod
    def adjunto_abs_path(adjunto: models.SoporteTicketAdjunto) -> Path:
        bases = [
            SoporteService._resolve_adjuntos_base_dir(),
            Path(__file__).resolve().parents[3] / "storage" / "soporte" / "adjuntos",
        ]
        rel = Path(adjunto.ruta_relativa)
        for base in bases:
            base_resolved = base.resolve()
            candidate = (base_resolved / rel).resolve()
            if str(candidate).startswith(str(base_resolved)) and candidate.exists():
                return candidate
        raise ValueError("Archivo de adjunto no localizado en storage.")
