import unicodedata
import re
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import or_, func
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from . import models, schemas
from app.core.security import get_password_hash


def _normalize_str(text: str) -> str:
    """Lowercase, remove accents and non-alphanumeric chars."""
    nfkd = unicodedata.normalize('NFD', text.lower())
    ascii_str = ''.join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]', '', ascii_str)


def _generate_unique_username(db: Session, nombre: str, apellido_paterno: str, exclude_id: int = None) -> str:
    """Generate username = first letter of nombre + apellido_paterno (normalized).
    If taken, append a suffix number until unique."""
    letra = _normalize_str(nombre)[:1]
    ap = _normalize_str(apellido_paterno)
    base = letra + ap
    candidate = base
    counter = 2
    while True:
        q = db.query(models.Empleado).filter(models.Empleado.username == candidate)
        if exclude_id:
            q = q.filter(models.Empleado.id != exclude_id)
        if not q.first():
            return candidate
        candidate = f"{base}{counter}"
        counter += 1


class PersonalService:

    # ========== EMPRESAS ==========

    BLOCK_SIZE = 1000  # Cada empresa obtiene un bloque de 1000 PINs

    @staticmethod
    def _validar_dias_laborales_empresa(valor: Optional[str]) -> str:
        v = (valor or "lun-sab").strip().lower()
        if v not in ("lun-sab", "lun-dom"):
            raise ValueError("dias_laborales debe ser 'lun-sab' o 'lun-dom'")
        return v

    @staticmethod
    def _assign_rango(db: Session) -> tuple:
        """Calcula el siguiente rango libre en bloques de 1000.
        Empresa 1 → 1-1000, Empresa 2 → 1001-2000, etc."""
        max_fin = db.query(func.max(models.Empresa.rango_fin)).scalar() or 0
        inicio = max_fin + 1
        fin = inicio + PersonalService.BLOCK_SIZE - 1
        return inicio, fin

    @staticmethod
    def create_empresa(db: Session, empresa: schemas.EmpresaCreate) -> models.Empresa:
        inicio, fin = PersonalService._assign_rango(db)
        payload = empresa.model_dump()
        payload["dias_laborales"] = PersonalService._validar_dias_laborales_empresa(payload.get("dias_laborales"))
        db_empresa = models.Empresa(**payload, rango_inicio=inicio, rango_fin=fin)
        db.add(db_empresa)
        db.commit()
        db.refresh(db_empresa)
        return db_empresa

    @staticmethod
    def get_empresa(db: Session, empresa_id: int) -> Optional[models.Empresa]:
        return db.query(models.Empresa).filter(models.Empresa.id == empresa_id).first()

    @staticmethod
    def get_empresas(db: Session, skip: int = 0, limit: int = 100, activo: Optional[bool] = None) -> List[models.Empresa]:
        query = db.query(models.Empresa)
        if activo is not None:
            query = query.filter(models.Empresa.activo == activo)
        return query.offset(skip).limit(limit).all()

    @staticmethod
    def update_empresa(db: Session, empresa_id: int, empresa: schemas.EmpresaUpdate) -> Optional[models.Empresa]:
        db_empresa = db.query(models.Empresa).filter(models.Empresa.id == empresa_id).first()
        if not db_empresa:
            return None
        update_data = empresa.model_dump(exclude_unset=True)
        if "dias_laborales" in update_data:
            update_data["dias_laborales"] = PersonalService._validar_dias_laborales_empresa(update_data.get("dias_laborales"))
        for field, value in update_data.items():
            setattr(db_empresa, field, value)
        db.commit()
        db.refresh(db_empresa)
        return db_empresa

    @staticmethod
    def delete_empresa(db: Session, empresa_id: int) -> bool:
        db_empresa = db.query(models.Empresa).filter(models.Empresa.id == empresa_id).first()
        if not db_empresa:
            return False
        db_empresa.activo = False
        db.commit()
        return True

    # ========== DEPARTAMENTOS ==========

    @staticmethod
    def _validar_padre_departamento(
        db: Session,
        *,
        empresa_id: int,
        padre_id: Optional[int],
        depto_id: Optional[int] = None,
    ) -> None:
        """Valida que el padre exista, sea de la misma empresa y no genere ciclos."""
        if padre_id is None:
            return
        if depto_id is not None and int(padre_id) == int(depto_id):
            raise ValueError("Un departamento no puede ser padre de sí mismo.")
        padre = (
            db.query(models.Departamento)
            .filter(models.Departamento.id == padre_id)
            .first()
        )
        if not padre:
            raise ValueError("El departamento padre no existe.")
        if int(padre.empresa_id) != int(empresa_id):
            raise ValueError("El departamento padre debe pertenecer a la misma empresa.")
        # Evitar ciclos: subir por la cadena de padres
        visto = set()
        cur_id: Optional[int] = padre_id
        while cur_id is not None:
            if depto_id is not None and int(cur_id) == int(depto_id):
                raise ValueError("No se puede asignar un subdepartamento (o descendiente) como padre.")
            if cur_id in visto:
                break
            visto.add(cur_id)
            row = db.query(models.Departamento.padre_id).filter(models.Departamento.id == cur_id).first()
            cur_id = row[0] if row else None

    @staticmethod
    def _validar_tipo_y_encargados(
        *,
        padre_id: Optional[int],
        tipo: Optional[str],
        encargados_ids: Optional[List[int]],
    ) -> tuple:
        """Normaliza tipo/encargados. Raíz: tipo null y sin encargados. Hijo: tipo requerido."""
        from app.modules.personal.schemas import TIPOS_HIJO_DEPTO

        if padre_id is None:
            return None, []
        t = (tipo or "subdepartamento").strip().lower()
        if t not in TIPOS_HIJO_DEPTO:
            raise ValueError("El tipo debe ser 'subdepartamento' o 'sucursal'.")
        ids = []
        seen = set()
        for eid in (encargados_ids or []):
            if eid is None:
                continue
            i = int(eid)
            if i in seen:
                continue
            seen.add(i)
            ids.append(i)
        return t, ids

    @staticmethod
    def _set_encargados(db: Session, depto: models.Departamento, empleado_ids: List[int]) -> None:
        depto.encargados_rel.clear()
        db.flush()
        for eid in empleado_ids:
            emp = db.query(models.Empleado).filter(models.Empleado.id == eid).first()
            if not emp:
                raise ValueError(f"El encargado (empleado id={eid}) no existe.")
            depto.encargados_rel.append(
                models.DepartamentoEncargado(departamento_id=depto.id, empleado_id=eid)
            )

    @staticmethod
    def create_departamento(db: Session, depto: schemas.DepartamentoCreate) -> models.Departamento:
        data = depto.dict()
        encargados_ids = data.pop("encargados_ids", None)
        PersonalService._validar_padre_departamento(
            db,
            empresa_id=data["empresa_id"],
            padre_id=data.get("padre_id"),
        )
        tipo, enc_ids = PersonalService._validar_tipo_y_encargados(
            padre_id=data.get("padre_id"),
            tipo=data.get("tipo"),
            encargados_ids=encargados_ids,
        )
        data["tipo"] = tipo
        db_depto = models.Departamento(**data)
        db.add(db_depto)
        db.flush()
        if enc_ids:
            PersonalService._set_encargados(db, db_depto, enc_ids)
        db.commit()
        db.refresh(db_depto)
        return db_depto

    @staticmethod
    def get_departamento(db: Session, depto_id: int) -> Optional[models.Departamento]:
        return db.query(models.Departamento).options(
            joinedload(models.Departamento.empresa),
            joinedload(models.Departamento.jefe),
            joinedload(models.Departamento.padre),
            selectinload(models.Departamento.encargados_rel).selectinload(models.DepartamentoEncargado.empleado),
        ).filter(models.Departamento.id == depto_id).first()

    @staticmethod
    def get_departamentos(
        db: Session, skip: int = 0, limit: int = 100,
        empresa_id: Optional[int] = None, activo: Optional[bool] = None
    ) -> List[models.Departamento]:
        query = db.query(models.Departamento).options(
            joinedload(models.Departamento.empresa),
            joinedload(models.Departamento.jefe),
            joinedload(models.Departamento.padre),
            selectinload(models.Departamento.encargados_rel).selectinload(models.DepartamentoEncargado.empleado),
        )
        if empresa_id is not None:
            query = query.filter(models.Departamento.empresa_id == empresa_id)
        if activo is not None:
            query = query.filter(models.Departamento.activo == activo)
        return query.offset(skip).limit(limit).all()

    @staticmethod
    def update_departamento(db: Session, depto_id: int, depto: schemas.DepartamentoUpdate) -> Optional[models.Departamento]:
        db_depto = db.query(models.Departamento).options(
            selectinload(models.Departamento.encargados_rel),
        ).filter(models.Departamento.id == depto_id).first()
        if not db_depto:
            return None
        data = depto.dict(exclude_unset=True)
        encargados_ids = data.pop("encargados_ids", None) if "encargados_ids" in data else None
        empresa_id = data.get("empresa_id", db_depto.empresa_id)
        if "padre_id" in data or "empresa_id" in data:
            padre_id = data["padre_id"] if "padre_id" in data else db_depto.padre_id
            PersonalService._validar_padre_departamento(
                db,
                empresa_id=int(empresa_id),
                padre_id=padre_id,
                depto_id=depto_id,
            )
        padre_id_final = data["padre_id"] if "padre_id" in data else db_depto.padre_id
        tipo_in = data["tipo"] if "tipo" in data else db_depto.tipo
        if "tipo" in data or "padre_id" in data or encargados_ids is not None:
            tipo, _ = PersonalService._validar_tipo_y_encargados(
                padre_id=padre_id_final,
                tipo=tipo_in,
                encargados_ids=encargados_ids if encargados_ids is not None else (db_depto.encargados_ids or []),
            )
            data["tipo"] = tipo
        for field, value in data.items():
            setattr(db_depto, field, value)
        if encargados_ids is not None:
            if padre_id_final is None and encargados_ids:
                raise ValueError("Los encargados solo aplican a sucursales/subdepartamentos.")
            _, enc_ids = PersonalService._validar_tipo_y_encargados(
                padre_id=padre_id_final,
                tipo=db_depto.tipo,
                encargados_ids=encargados_ids,
            )
            PersonalService._set_encargados(db, db_depto, enc_ids)
        db.commit()
        db.refresh(db_depto)
        return db_depto

    @staticmethod
    def delete_departamento(db: Session, depto_id: int) -> bool:
        db_depto = db.query(models.Departamento).filter(models.Departamento.id == depto_id).first()
        if not db_depto:
            return False
        db_depto.activo = False
        db.commit()
        return True

    # ========== PUESTOS ==========

    @staticmethod
    def get_puestos(
        db: Session,
        activo: Optional[bool] = None,
        empresa_id: Optional[int] = None,
        departamento_id: Optional[int] = None,
    ) -> List[models.Puesto]:
        query = db.query(models.Puesto).options(
            joinedload(models.Puesto.empresa),
            joinedload(models.Puesto.departamento),
        ).order_by(models.Puesto.orden.asc(), models.Puesto.id.asc())
        if activo is not None:
            query = query.filter(models.Puesto.activo == activo)
        if empresa_id is not None:
            query = query.filter(models.Puesto.empresa_id == empresa_id)
        if departamento_id is not None:
            query = query.filter(models.Puesto.departamento_id == departamento_id)
        return query.all()

    @staticmethod
    def get_puesto(db: Session, puesto_id: int) -> Optional[models.Puesto]:
        return db.query(models.Puesto).options(
            joinedload(models.Puesto.empresa),
            joinedload(models.Puesto.departamento),
        ).filter(models.Puesto.id == puesto_id).first()

    PUESTOS_RESERVADOS = {
        "director",  # legado; preferir "director general"
        "director general",
        "director general adjunto",
        "subdirector",
        "gerente general",  # legado; preferir "gerente administrativo y operaciones"
        "gerente administrativo y operaciones",
        "rh",
        "gerente",
        "supervisor",
    }
    PUESTOS_RESERVADOS_ORDEN = [
        ("director general", 1),
        ("director general adjunto", 2),
        ("subdirector", 3),
        ("gerente administrativo y operaciones", 4),
        ("rh", 5),
        ("gerente", 6),
        ("supervisor", 7),
    ]
    NOMBRE_GG_ACTUAL = "Gerente Administrativo y Operaciones"
    NOMBRES_GG_PUESTO = frozenset({
        "gerente general",
        "gerente administrativo y operaciones",
    })

    @staticmethod
    def _nombre_es_director_top(nombre: Optional[str]) -> bool:
        """Director General / Adjunto (incluye legado «Director»). Aprueba gerentes/supervisores."""
        n = (nombre or "").strip().lower()
        return n in ("director", "director general", "director general adjunto")

    @staticmethod
    def _nombre_es_gerente_general(nombre: Optional[str]) -> bool:
        """Puesto de liderazgo GG (incluye legado «Gerente General»)."""
        n = (nombre or "").strip().lower()
        return n in PersonalService.NOMBRES_GG_PUESTO

    @staticmethod
    def _nombre_reservado(nombre: str) -> bool:
        n = (nombre or "").strip().lower()
        return n in PersonalService.PUESTOS_RESERVADOS

    @staticmethod
    def ensure_puestos_reservados(db: Session) -> None:
        """Garantiza la existencia de puestos globales reservados del sistema."""
        globales = db.query(models.Puesto).filter(
            models.Puesto.empresa_id.is_(None),
            models.Puesto.departamento_id.is_(None),
        ).all()
        existentes = {(p.nombre or "").strip().lower(): p for p in globales}
        # Migrar legado «Director» → «Director General» (mismo registro, sin duplicar)
        if "director" in existentes and "director general" not in existentes:
            antiguos = existentes["director"]
            antiguos.nombre = "Director General"
            antiguos.orden = 1
            existentes["director general"] = antiguos
            del existentes["director"]
            db.commit()
        # Migrar legado «Gerente General» → «Gerente Administrativo y Operaciones»
        clave_gg = "gerente administrativo y operaciones"
        if "gerente general" in existentes and clave_gg not in existentes:
            antiguos = existentes["gerente general"]
            antiguos.nombre = PersonalService.NOMBRE_GG_ACTUAL
            antiguos.orden = 4
            existentes[clave_gg] = antiguos
            del existentes["gerente general"]
            db.commit()
        created = False
        for nombre, orden in PersonalService.PUESTOS_RESERVADOS_ORDEN:
            if nombre in existentes:
                continue
            if nombre == "rh":
                display = "RH"
            elif nombre == clave_gg:
                display = PersonalService.NOMBRE_GG_ACTUAL
            elif nombre == "director general":
                display = "Director General"
            elif nombre == "director general adjunto":
                display = "Director General Adjunto"
            else:
                display = nombre.title()
            db.add(models.Puesto(
                empresa_id=None,
                departamento_id=None,
                nombre=display,
                orden=orden,
                activo=True,
            ))
            created = True
        if created:
            db.commit()

    @staticmethod
    def _puesto_to_response(p: models.Puesto) -> dict:
        return {
            "id": p.id, "nombre": p.nombre, "orden": p.orden, "activo": p.activo,
            "empresa_id": p.empresa_id, "departamento_id": p.departamento_id,
            "empresa_nombre": p.empresa.nombre if p.empresa else None,
            "departamento_nombre": p.departamento.nombre if p.departamento else None,
            "created_at": p.created_at,
        }

    @staticmethod
    def create_puesto(db: Session, data: schemas.PuestoCreate) -> models.Puesto:
        if PersonalService._nombre_reservado(data.nombre):
            raise ValueError("No se puede crear el puesto: Director, Gerente General, RH, Gerente y Supervisor son asignados por el Administrador.")
        # Validar que departamento pertenezca a empresa
        depto = db.query(models.Departamento).filter(
            models.Departamento.id == data.departamento_id,
            models.Departamento.empresa_id == data.empresa_id,
        ).first()
        if not depto:
            raise ValueError("El departamento no pertenece a la empresa seleccionada.")
        existing = db.query(models.Puesto).filter(
            models.Puesto.empresa_id == data.empresa_id,
            models.Puesto.departamento_id == data.departamento_id,
            func.lower(func.trim(models.Puesto.nombre)) == data.nombre.strip().lower(),
        ).first()
        if existing:
            raise ValueError("Ya existe un puesto con ese nombre en este departamento.")
        p = models.Puesto(
            empresa_id=data.empresa_id,
            departamento_id=data.departamento_id,
            nombre=data.nombre.strip(),
            orden=data.orden,
            activo=data.activo,
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        return p

    @staticmethod
    def update_puesto(db: Session, puesto_id: int, data: schemas.PuestoUpdate) -> Optional[models.Puesto]:
        p = db.query(models.Puesto).filter(models.Puesto.id == puesto_id).first()
        if not p:
            return None
        if data.nombre is not None:
            if PersonalService._nombre_reservado(p.nombre):
                pass  # No cambiar nombre de puestos reservados
            elif PersonalService._nombre_reservado(data.nombre):
                raise ValueError("No se puede usar: Director, Gerente General, RH, Gerente y Supervisor son asignados por el Administrador.")
            else:
                # Unicidad dentro del mismo empresa+departamento (o global si ambos null)
                q = db.query(models.Puesto).filter(
                    models.Puesto.id != puesto_id,
                    func.lower(func.trim(models.Puesto.nombre)) == data.nombre.strip().lower(),
                )
                if p.empresa_id is not None and p.departamento_id is not None:
                    q = q.filter(
                        models.Puesto.empresa_id == p.empresa_id,
                        models.Puesto.departamento_id == p.departamento_id,
                    )
                else:
                    q = q.filter(
                        models.Puesto.empresa_id.is_(None),
                        models.Puesto.departamento_id.is_(None),
                    )
                if q.first():
                    raise ValueError("Ya existe un puesto con ese nombre.")
                p.nombre = data.nombre.strip()
        if data.orden is not None:
            p.orden = data.orden
        if data.activo is not None:
            if PersonalService._nombre_reservado(p.nombre) and not data.activo:
                raise ValueError(
                    "No se puede desactivar: Director, Gerente General, RH, Gerente y Supervisor son puestos del sistema."
                )
            p.activo = data.activo
        db.commit()
        db.refresh(p)
        return p

    @staticmethod
    def delete_puesto(db: Session, puesto_id: int) -> bool:
        p = db.query(models.Puesto).filter(models.Puesto.id == puesto_id).first()
        if not p:
            return False
        if PersonalService._nombre_reservado(p.nombre):
            raise ValueError("No se puede eliminar: Director, Gerente General, RH, Gerente y Supervisor son puestos del sistema.")
        count = db.query(models.Empleado).filter(models.Empleado.puesto_id == puesto_id).count()
        if count > 0:
            raise ValueError(f"No se puede eliminar: hay {count} empleado(s) con este puesto. Reasígnelos primero.")
        db.delete(p)
        db.commit()
        return True

    # ========== ROLES ==========
    
    @staticmethod
    def create_rol(db: Session, rol: schemas.RolCreate) -> models.Rol:
        """Crear nuevo rol"""
        db_rol = models.Rol(**rol.dict())
        db.add(db_rol)
        db.commit()
        db.refresh(db_rol)
        return db_rol
    
    @staticmethod
    def get_rol(db: Session, rol_id: int) -> Optional[models.Rol]:
        """Obtener rol por ID"""
        return db.query(models.Rol).filter(models.Rol.id == rol_id).first()
    
    @staticmethod
    def get_roles(db: Session, skip: int = 0, limit: int = 100, activo: Optional[bool] = None) -> List[models.Rol]:
        """Listar roles"""
        query = db.query(models.Rol)
        if activo is not None:
            query = query.filter(models.Rol.activo == activo)
        return query.offset(skip).limit(limit).all()
    
    @staticmethod
    def update_rol(db: Session, rol_id: int, rol: schemas.RolUpdate) -> Optional[models.Rol]:
        """Actualizar rol"""
        db_rol = db.query(models.Rol).filter(models.Rol.id == rol_id).first()
        if not db_rol:
            return None
        
        update_data = rol.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_rol, field, value)
        
        db.commit()
        db.refresh(db_rol)
        return db_rol
    
    @staticmethod
    def delete_rol(db: Session, rol_id: int) -> bool:
        """Eliminar rol (soft delete)"""
        db_rol = db.query(models.Rol).filter(models.Rol.id == rol_id).first()
        if not db_rol:
            return False
        
        db_rol.activo = False
        db.commit()
        return True
    
    # ========== EMPLEADOS ==========
    
    @staticmethod
    def _next_pin_global(db: Session) -> str:
        """Siguiente pin numérico global disponible (fallback)."""
        nums = [
            int(p.pin_checador)
            for p in db.query(models.Empleado.pin_checador)
            .filter(models.Empleado.pin_checador.isnot(None))
            .all()
            if p.pin_checador and str(p.pin_checador).isdigit()
        ]
        if not nums:
            return "1"
        return str(max(nums) + 1)

    @staticmethod
    def _next_pin_checador(db: Session, empresa_id: int) -> str:
        """Devuelve el siguiente pin_checador disponible dentro del rango de la empresa."""
        empresa = db.query(models.Empresa).filter(models.Empresa.id == empresa_id).first()
        if not empresa or empresa.rango_inicio is None:
            return None
        # Obtener todos los pines usados en este rango y encontrar el siguiente libre
        pines_usados = {
            int(p.pin_checador)
            for p in db.query(models.Empleado.pin_checador)
            .filter(
                models.Empleado.empresa_id == empresa_id,
                models.Empleado.pin_checador.isnot(None)
            ).all()
            if p.pin_checador and p.pin_checador.isdigit()
        }
        for candidate in range(empresa.rango_inicio, empresa.rango_fin + 1):
            if candidate not in pines_usados:
                return str(candidate)
        raise ValueError(f"La empresa ha alcanzado el límite de su pool de PINs ({empresa.rango_fin}). Contacte al administrador.")

    @staticmethod
    def create_empleado(db: Session, empleado: schemas.EmpleadoCreate) -> models.Empleado:
        """Crear nuevo empleado y usuario del sistema (acceso con número de empleado/username y contraseña)."""
        data = empleado.dict(exclude={
            "registrar_en_checador", "dispositivo_ids", "password",
            "horario_id", "horario_sabado_id", "empresas_supervision_ids",
        })
        # Resolver username único
        if not data.get("username") or not str(data["username"]).strip():
            data["username"] = _generate_unique_username(
                db, empleado.nombre, empleado.apellido_paterno or ""
            )
        else:
            exists = db.query(models.Empleado).filter(
                models.Empleado.username == data["username"]
            ).first()
            if exists:
                data["username"] = _generate_unique_username(
                    db, empleado.nombre, empleado.apellido_paterno or ""
                )
        # Asignar pin_checador desde el pool de la empresa
        pin = None
        if empleado.empresa_id:
            pin = PersonalService._next_pin_checador(db, empleado.empresa_id)
        data["pin_checador"] = pin  # puede ser None si no hay empresa (se actualiza post-insert)
        # Contraseña para acceso al sistema
        rfc_default = (empleado.rfc or '').strip()[:8]
        password_plain = (
            empleado.password if empleado.password and empleado.password.strip()
            else rfc_default if rfc_default
            else empleado.numero_empleado
        )

        db_empleado = None
        for intento in range(2):
            db_empleado = models.Empleado(**data)
            db_empleado.password_hash = get_password_hash(password_plain)
            # Alta: clave temporal (RFC/número o la indicada); debe cambiarla el colaborador.
            db_empleado.must_change_password = True
            db.add(db_empleado)
            try:
                db.commit()
                break
            except IntegrityError as e:
                db.rollback()
                msg = str(getattr(e, "orig", e)).lower()
                # Si colisiona el pin, reintenta sin pin para usar fallback global.
                if "pin_checador" in msg and intento == 0:
                    data["pin_checador"] = None
                    continue
                raise

        db.refresh(db_empleado)
        # Si no se pudo asignar pin_checador (sin empresa/rango), usar el id
        if not db_empleado.pin_checador:
            db_empleado.pin_checador = PersonalService._next_pin_global(db)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                db_empleado.pin_checador = PersonalService._next_pin_global(db)
                db.commit()
            db.refresh(db_empleado)
        # Asignar horario L-V si se proporcionó
        if empleado.horario_id:
            try:
                from app.modules.asistencia import models as asist_models
                from datetime import datetime, timezone
                eh = asist_models.EmpleadoHorario(
                    empleado_id=db_empleado.id,
                    horario_id=empleado.horario_id,
                    fecha_inicio=datetime.now(timezone.utc),
                    activo=True,
                    # Sin horario_sabado_id: no heredar sábado del L-V (coincide con checkbox Personal).
                    hora_salida_sabado="" if empleado.horario_sabado_id is None else None,
                )
                db.add(eh)
                db.commit()
            except Exception:
                pass
        # Guardar horario sabatino (puede ser None = no labora sábados)
        if empleado.horario_sabado_id is not None:
            db_empleado.horario_sabado_id = empleado.horario_sabado_id
            db.commit()
        # Director / Subdirector / GG: empresas visibles en organigrama
        if PersonalService._puesto_usa_supervision_empresas(db, db_empleado.puesto_id):
            ids = set(empleado.empresas_supervision_ids or [])
            if db_empleado.empresa_id:
                ids.add(db_empleado.empresa_id)
            if not ids and db_empleado.empresa_id:
                ids = {db_empleado.empresa_id}
            for eid in ids:
                if not PersonalService.get_empresa(db, eid):
                    raise ValueError(f"La empresa {eid} no existe")
                db.add(models.EmpleadoSupervisionEmpresa(
                    empleado_id=db_empleado.id, empresa_id=eid,
                ))
            db.commit()
            db.refresh(db_empleado)
        return db_empleado

    @staticmethod
    def _next_numero_especial(db: Session, empresa_id: int) -> str:
        """Genera número interno para usuario especial (no capturado en formulario)."""
        prefix = f"ESP-{empresa_id}-"
        existentes = db.query(models.Empleado.numero_empleado).filter(
            models.Empleado.empresa_id == empresa_id,
            models.Empleado.numero_empleado.like(f"{prefix}%"),
        ).all()
        nums = []
        for (num,) in existentes:
            if not num:
                continue
            suf = str(num).replace(prefix, "", 1)
            if suf.isdigit():
                nums.append(int(suf))
        siguiente = (max(nums) + 1) if nums else 1
        return f"{prefix}{str(siguiente).zfill(4)}"

    @staticmethod
    def _puesto_es_director(db: Session, puesto_id: int) -> bool:
        p = db.query(models.Puesto).filter(models.Puesto.id == puesto_id).first()
        return bool(p and PersonalService._nombre_es_director_top(p.nombre))

    PUESTOS_CON_SUPERVISION_EMPRESAS = frozenset({
        "director",
        "director general",
        "director general adjunto",
        "subdirector",
        "gerente general",
        "gerente administrativo y operaciones",
    })

    @staticmethod
    def _puesto_usa_supervision_empresas(db: Session, puesto_id: Optional[int]) -> bool:
        """Director, Subdirector y Gerente General pueden tener alcance multi-empresa."""
        if not puesto_id:
            return False
        p = db.query(models.Puesto).filter(models.Puesto.id == puesto_id).first()
        n = (p.nombre or "").strip().lower() if p else ""
        return n in PersonalService.PUESTOS_CON_SUPERVISION_EMPRESAS

    @staticmethod
    def create_usuario_especial(db: Session, data: schemas.UsuarioEspecialCreate) -> models.Empleado:
        """Crea un usuario especial exento de incidencias con alta simplificada."""
        numero = PersonalService._next_numero_especial(db, data.empresa_id)
        empleado = schemas.EmpleadoCreate(
            numero_empleado=numero,
            nombre=data.nombre.strip(),
            apellido_paterno=(data.apellido_paterno or "").strip() or None,
            apellido_materno=(data.apellido_materno or "").strip() or None,
            email=data.email,
            telefono=(data.telefono or "").strip() or None,
            username=(data.username or "").strip() or None,
            empresa_id=data.empresa_id,
            departamento_id=data.departamento_id,
            puesto_id=data.puesto_id,
            exento_incidencias=True,
            # Regla: usuarios especiales no deben registrar checadas.
            puede_checar_remoto=False,
            fecha_ingreso=data.fecha_ingreso,
            password=(data.password or "").strip() or None,
            # create_empleado persiste el alcance multi-empresa (evitar insertar dos veces).
            empresas_supervision_ids=data.empresas_supervision_ids,
        )
        return PersonalService.create_empleado(db, empleado)
    
    @staticmethod
    def get_empleado(db: Session, empleado_id: int) -> Optional[models.Empleado]:
        """Obtener empleado por ID"""
        return db.query(models.Empleado).options(
            joinedload(models.Empleado.empresa),
            joinedload(models.Empleado.departamento_rel).joinedload(models.Departamento.empresa),
            joinedload(models.Empleado.departamento_rel).joinedload(models.Departamento.jefe),
            joinedload(models.Empleado.departamento_rel).joinedload(models.Departamento.padre),
            joinedload(models.Empleado.puesto_rel),
            joinedload(models.Empleado.jefe).joinedload(models.Empleado.puesto_rel),
            joinedload(models.Empleado.horarios_asignados),
            selectinload(models.Empleado.supervision_empresas_rel),
        ).filter(models.Empleado.id == empleado_id).first()
    
    @staticmethod
    def get_empleado_by_numero(db: Session, numero_empleado: str) -> Optional[models.Empleado]:
        """Obtener empleado por número de empleado"""
        return db.query(models.Empleado).filter(models.Empleado.numero_empleado == numero_empleado).first()

    @staticmethod
    def check_username_available(db: Session, username: str, exclude_id: int = None) -> bool:
        """Devuelve True si el username no está en uso."""
        q = db.query(models.Empleado).filter(models.Empleado.username == username.strip().lower())
        if exclude_id:
            q = q.filter(models.Empleado.id != exclude_id)
        return q.first() is None

    @staticmethod
    def suggest_username(db: Session, nombre: str, apellido_paterno: str, exclude_id: int = None) -> str:
        """Genera y devuelve un username único."""
        return _generate_unique_username(db, nombre, apellido_paterno, exclude_id)

    @staticmethod
    def empleados_operativos_dashboard_query(
        db: Session,
        solo_mi_area: bool = False,
        depto_ids: Optional[List[int]] = None,
    ):
        """
        Misma base que el listado de personal (operativos): con empresa, no exentos
        (coalesce), sin cuentas Administrador/Superuser. Opcionalmente por departamento(es).
        """
        admin_rol_ids = [
            r.id for r in db.query(models.Rol.id).filter(
                models.Rol.nombre.in_(("Administrador", "Superuser"))
            ).all()
        ]
        q = db.query(models.Empleado).filter(
            models.Empleado.empresa_id.isnot(None),
            func.coalesce(models.Empleado.exento_incidencias, False) == False,
        )
        if admin_rol_ids:
            q = q.filter(
                or_(models.Empleado.rol_id.is_(None), models.Empleado.rol_id.notin_(admin_rol_ids))
            )
        if solo_mi_area:
            q = q.filter(models.Empleado.departamento_id.in_(depto_ids or []))
        return q

    @staticmethod
    def _empleados_filtered_query(
        db: Session,
        *,
        estado: Optional[str] = None,
        rol_id: Optional[int] = None,
        jefe_id: Optional[int] = None,
        departamento_id: Optional[int] = None,
        empresa_id: Optional[int] = None,
        search: Optional[str] = None,
        exento_incidencias: Optional[bool] = None,
        incluir_exentos: bool = False,
        with_relations: bool = True,
    ):
        """Query base de empleados con filtros (sin offset/limit)."""
        from sqlalchemy import or_

        admin_rol_ids = []
        if exento_incidencias is None:
            admin_rol_ids = [
                r.id for r in db.query(models.Rol.id).filter(
                    models.Rol.nombre.in_(("Administrador", "Superuser"))
                ).all()
            ]

        if with_relations:
            query = db.query(models.Empleado).options(
                joinedload(models.Empleado.empresa),
                joinedload(models.Empleado.departamento_rel).joinedload(models.Departamento.jefe),
                joinedload(models.Empleado.departamento_rel).joinedload(models.Departamento.padre),
                joinedload(models.Empleado.puesto_rel),
                selectinload(models.Empleado.jefe).selectinload(models.Empleado.puesto_rel),
                joinedload(models.Empleado.horarios_asignados),
                selectinload(models.Empleado.supervision_empresas_rel),
            )
        else:
            query = db.query(models.Empleado)

        query = query.filter(models.Empleado.empresa_id.isnot(None))

        def _no_es_usuario_especial():
            return func.coalesce(models.Empleado.exento_incidencias, False) == False

        if exento_incidencias is not None:
            if exento_incidencias is True:
                query = query.filter(models.Empleado.exento_incidencias == True)
            else:
                query = query.filter(_no_es_usuario_especial())
        elif not incluir_exentos:
            query = query.filter(_no_es_usuario_especial())

        if exento_incidencias is None and admin_rol_ids and not incluir_exentos:
            query = query.filter(
                or_(
                    models.Empleado.rol_id.is_(None),
                    models.Empleado.rol_id.notin_(admin_rol_ids)
                )
            )

        if estado:
            try:
                est_enum = models.EstadoEmpleado(estado.lower())
            except ValueError:
                est_enum = None
            if est_enum is not None:
                if est_enum == models.EstadoEmpleado.ACTIVO:
                    query = query.filter(
                        or_(
                            models.Empleado.estado == models.EstadoEmpleado.ACTIVO,
                            models.Empleado.estado.is_(None),
                        )
                    )
                else:
                    query = query.filter(models.Empleado.estado == est_enum)
        if rol_id:
            query = query.filter(models.Empleado.rol_id == rol_id)
        if jefe_id:
            query = query.filter(models.Empleado.jefe_id == jefe_id)
        if empresa_id:
            query = query.filter(models.Empleado.empresa_id == empresa_id)
        if departamento_id:
            # Incluir subdepartamentos (mismo criterio que organigrama / reportes).
            depto_ids = PersonalService.get_departamento_ids_con_descendientes(db, [departamento_id])
            query = query.filter(
                models.Empleado.departamento_id.in_(depto_ids or [departamento_id])
            )
        if search:
            search_filter = or_(
                models.Empleado.nombre.ilike(f"%{search}%"),
                models.Empleado.apellido_paterno.ilike(f"%{search}%"),
                models.Empleado.apellido_materno.ilike(f"%{search}%"),
                models.Empleado.numero_empleado.ilike(f"%{search}%"),
                models.Empleado.email.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)
        return query

    @staticmethod
    def get_empleados(
        db: Session,
        skip: int = 0,
        limit: int = 100,
        estado: Optional[str] = None,
        rol_id: Optional[int] = None,
        jefe_id: Optional[int] = None,
        departamento_id: Optional[int] = None,
        empresa_id: Optional[int] = None,
        search: Optional[str] = None,
        exento_incidencias: Optional[bool] = None,
        incluir_exentos: bool = False,
    ) -> List[models.Empleado]:
        """Listar empleados con filtros.
        Por defecto no incluye usuarios especiales (exento_incidencias=True); use incluir_exentos=True
        para listados que deben incluirlos (p. ej. candidatos a gerente de departamento).
        exento_incidencias=true lista solo especiales; false solo no especiales.
        """
        query = PersonalService._empleados_filtered_query(
            db,
            estado=estado,
            rol_id=rol_id,
            jefe_id=jefe_id,
            departamento_id=departamento_id,
            empresa_id=empresa_id,
            search=search,
            exento_incidencias=exento_incidencias,
            incluir_exentos=incluir_exentos,
            with_relations=True,
        )
        query = query.order_by(
            models.Empleado.apellido_paterno.asc(),
            models.Empleado.apellido_materno.asc(),
            models.Empleado.nombre.asc(),
        )
        return query.offset(skip).limit(limit).all()

    @staticmethod
    def count_empleados(
        db: Session,
        *,
        estado: Optional[str] = None,
        rol_id: Optional[int] = None,
        jefe_id: Optional[int] = None,
        departamento_id: Optional[int] = None,
        empresa_id: Optional[int] = None,
        search: Optional[str] = None,
        exento_incidencias: Optional[bool] = None,
        incluir_exentos: bool = False,
    ) -> int:
        q = PersonalService._empleados_filtered_query(
            db,
            estado=estado,
            rol_id=rol_id,
            jefe_id=jefe_id,
            departamento_id=departamento_id,
            empresa_id=empresa_id,
            search=search,
            exento_incidencias=exento_incidencias,
            incluir_exentos=incluir_exentos,
            with_relations=False,
        )
        return q.count()

    @staticmethod
    def conteos_empleados_por_estado(
        db: Session,
        *,
        departamento_id: Optional[int] = None,
        empresa_id: Optional[int] = None,
        search: Optional[str] = None,
        incluir_exentos: bool = False,
    ) -> dict:
        """Contadores Total/Activos/Inactivos/Bajas sin traer filas completas."""
        from sqlalchemy import case, or_

        q = PersonalService._empleados_filtered_query(
            db,
            estado=None,
            departamento_id=departamento_id,
            empresa_id=empresa_id,
            search=search,
            incluir_exentos=incluir_exentos,
            with_relations=False,
        )
        # estado NULL se trata como activo (misma regla que el listado)
        rows = q.with_entities(
            func.sum(
                case(
                    (
                        or_(
                            models.Empleado.estado == models.EstadoEmpleado.ACTIVO,
                            models.Empleado.estado.is_(None),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("activos"),
            func.sum(
                case((models.Empleado.estado == models.EstadoEmpleado.INACTIVO, 1), else_=0)
            ).label("inactivos"),
            func.sum(
                case((models.Empleado.estado == models.EstadoEmpleado.BAJA, 1), else_=0)
            ).label("bajas"),
            func.count().label("total"),
        ).one()
        return {
            "total": int(rows.total or 0),
            "activos": int(rows.activos or 0),
            "inactivos": int(rows.inactivos or 0),
            "bajas": int(rows.bajas or 0),
        }
    @staticmethod
    def update_empleado(db: Session, empleado_id: int, empleado: schemas.EmpleadoUpdate) -> Optional[models.Empleado]:
        """Actualizar empleado"""
        db_empleado = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
        if not db_empleado:
            return None

        update_data = empleado.dict(exclude_unset=True)
        # Fase A: Admin/RH no pueden fijar la contraseña definitiva por este endpoint.
        update_data.pop("password", None)

        empresas_supervision_ids = update_data.pop("empresas_supervision_ids", None)

        # horario_id y horario_sabado_id se manejan aparte
        horario_id_was_sent = "horario_id" in update_data
        horario_sabado_was_sent = "horario_sabado_id" in update_data
        horario_id = update_data.pop("horario_id", None) if horario_id_was_sent else None
        horario_sabado_id = update_data.pop("horario_sabado_id", None) if horario_sabado_was_sent else None

        for field, value in update_data.items():
            if hasattr(db_empleado, field):
                setattr(db_empleado, field, value)

        # Si pasó a baja/inactivo vía edición, revocar sesión de inmediato.
        if "estado" in update_data:
            est = update_data.get("estado")
            valor = getattr(est, "value", str(est) if est is not None else "").strip().lower()
            if valor in ("baja", "inactivo"):
                db_empleado.session_id = None
                if valor == "baja" and not db_empleado.fecha_baja:
                    from datetime import datetime, timezone
                    db_empleado.fecha_baja = datetime.now(timezone.utc)

        db.flush()

        puesto = db.query(models.Puesto).filter(models.Puesto.id == db_empleado.puesto_id).first()
        puesto_n = (puesto.nombre or "").strip().lower() if puesto else ""
        if puesto_n not in PersonalService.PUESTOS_CON_SUPERVISION_EMPRESAS:
            db.query(models.EmpleadoSupervisionEmpresa).filter(
                models.EmpleadoSupervisionEmpresa.empleado_id == empleado_id
            ).delete()
        elif empresas_supervision_ids is not None:
            ids = set(empresas_supervision_ids)
            if db_empleado.empresa_id:
                ids.add(db_empleado.empresa_id)
            for eid in ids:
                if not PersonalService.get_empresa(db, eid):
                    raise ValueError(f"La empresa {eid} no existe")
            db.query(models.EmpleadoSupervisionEmpresa).filter(
                models.EmpleadoSupervisionEmpresa.empleado_id == empleado_id
            ).delete()
            for eid in ids:
                db.add(models.EmpleadoSupervisionEmpresa(empleado_id=empleado_id, empresa_id=eid))

        from app.modules.asistencia.service import AsistenciaService

        if horario_id_was_sent:
            try:
                if horario_id is not None:
                    AsistenciaService.assign_horario_empleado(db, empleado_id, horario_id)
                else:
                    AsistenciaService.remove_horario_empleado(db, empleado_id)
            except Exception:
                pass

        if horario_sabado_was_sent:
            db_empleado.horario_sabado_id = horario_sabado_id
            # El checkbox de Personal debe ganar sobre hora_salida_sabado del horario L-V
            # (p. ej. General con sábado 14:00). "" = no labora sábado; NULL = heredar del L-V.
            from app.modules.asistencia import models as asist_models
            eh_activo = (
                db.query(asist_models.EmpleadoHorario)
                .filter(
                    asist_models.EmpleadoHorario.empleado_id == empleado_id,
                    asist_models.EmpleadoHorario.activo == True,
                )
                .order_by(asist_models.EmpleadoHorario.id.desc())
                .first()
            )
            if eh_activo:
                if horario_sabado_id is None:
                    eh_activo.hora_salida_sabado = ""
                elif eh_activo.hora_salida_sabado is not None and str(eh_activo.hora_salida_sabado).strip() == "":
                    eh_activo.hora_salida_sabado = None

        db.commit()
        return PersonalService.get_empleado(db, empleado_id)
    
    @staticmethod
    def delete_empleado(db: Session, empleado_id: int) -> bool:
        """Eliminar empleado (cambiar estado a baja) y encolar eliminacion en dispositivos"""
        db_empleado = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
        if not db_empleado:
            return False
        
        db_empleado.estado = models.EstadoEmpleado.BAJA
        from datetime import datetime, timezone
        db_empleado.fecha_baja = datetime.now(timezone.utc)
        # Revoca acceso a la app de inmediato (sesión activa + login bloqueado limpio).
        db_empleado.session_id = None
        db_empleado.login_fallos_consecutivos = 0
        db_empleado.login_bloqueado_hasta = None

        # Encolar borrado del empleado en cada reloj donde fue enviado.
        # IMPORTANTE: filtrar por pin_checador (único globalmente). Si filtramos solo por
        # numero_empleado podríamos borrar al empleado de otra empresa con el mismo número.
        from app.modules.asistencia import models as asist_models
        upd_filter = [
            asist_models.UsuarioPendienteDispositivo.numero_empleado == db_empleado.numero_empleado,
            asist_models.UsuarioPendienteDispositivo.enviado == True,
        ]
        if db_empleado.pin_checador:
            upd_filter.append(
                asist_models.UsuarioPendienteDispositivo.pin_checador == db_empleado.pin_checador
            )
        enviados = db.query(asist_models.UsuarioPendienteDispositivo).filter(*upd_filter).all()
        for env in enviados:
            existing = db.query(asist_models.PendingDelete).filter(
                asist_models.PendingDelete.dispositivo_id == env.dispositivo_id,
                asist_models.PendingDelete.numero_empleado == db_empleado.numero_empleado,
                asist_models.PendingDelete.procesado == False,
            ).first()
            if not existing:
                pd = asist_models.PendingDelete(
                    dispositivo_id=env.dispositivo_id,
                    numero_empleado=db_empleado.numero_empleado,
                )
                db.add(pd)

        db.commit()
        return True

    @staticmethod
    def generar_password_temporal() -> str:
        """Contraseña temporal legible (10 caracteres alfanuméricos)."""
        import secrets
        import string
        alphabet = string.ascii_letters + string.digits
        return "".join(secrets.choice(alphabet) for _ in range(10))

    @staticmethod
    def restablecer_password_temporal(db: Session, empleado_id: int) -> Optional[str]:
        """
        Asigna contraseña temporal aleatoria y marca must_change_password.
        Devuelve la clave en claro una sola vez, o None si no existe el empleado.
        """
        db_empleado = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
        if not db_empleado:
            return None
        temporal = PersonalService.generar_password_temporal()
        db_empleado.password_hash = get_password_hash(temporal)
        db_empleado.must_change_password = True
        # Invalida sesión activa: debe volver a entrar con la temporal.
        db_empleado.session_id = None
        db_empleado.login_fallos_consecutivos = 0
        db_empleado.login_bloqueado_hasta = None
        db.commit()
        return temporal

    @staticmethod
    def desbloquear_cuenta_login(db: Session, empleado_id: int) -> Optional[models.Empleado]:
        """Quita bloqueo anti-fuerza bruta (fallos + login_bloqueado_hasta). Solo Admin vía ruta."""
        db_empleado = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
        if not db_empleado:
            return None
        db_empleado.login_fallos_consecutivos = 0
        db_empleado.login_bloqueado_hasta = None
        db.commit()
        db.refresh(db_empleado)
        return db_empleado
    
    @staticmethod
    def get_subordinados(db: Session, jefe_id: int) -> List[models.Empleado]:
        """Obtener subordinados de un jefe"""
        return (
            db.query(models.Empleado)
            .filter(models.Empleado.jefe_id == jefe_id)
            .order_by(
                models.Empleado.apellido_paterno.asc(),
                models.Empleado.apellido_materno.asc(),
                models.Empleado.nombre.asc(),
            )
            .all()
        )

    # ========== GERENTES Y SUPERVISORES DE ÁREA ==========
    # Los gerentes (área a su cargo) y los supervisores en esa área pueden aprobar vacaciones y justificar incidencias.

    GERENTE_GENERAL_ROL_NAMES = ("Gerente General", "Gerente general")

    @staticmethod
    def get_es_gerente_general(db: Session, empleado_id: int) -> bool:
        """True si el empleado tiene rol o puesto Gerente General (aprueba vacaciones solo de gerentes/supervisores)."""
        emp = db.query(models.Empleado).options(joinedload(models.Empleado.puesto_rel)).filter(models.Empleado.id == empleado_id).first()
        if not emp:
            return False
        if emp.rol_id:
            rol = db.query(models.Rol).filter(models.Rol.id == emp.rol_id).first()
            if rol and rol.nombre in PersonalService.GERENTE_GENERAL_ROL_NAMES:
                return True
        if emp.puesto_rel and PersonalService._nombre_es_gerente_general(emp.puesto_rel.nombre):
            return True
        return False

    @staticmethod
    def get_es_director(db: Session, empleado_id: int) -> bool:
        """True si es Director General o Adjunto (aprueba vacaciones de gerentes/supervisores)."""
        emp = db.query(models.Empleado).options(joinedload(models.Empleado.puesto_rel)).filter(models.Empleado.id == empleado_id).first()
        return emp is not None and emp.puesto_rel is not None and PersonalService._nombre_es_director_top(emp.puesto_rel.nombre)

    @staticmethod
    def get_es_gerente_o_director(db: Session, empleado_id: int) -> bool:
        """True si puede aprobar solo vacaciones de gerentes/supervisores (Director o Gerente General)."""
        return PersonalService.get_es_gerente_general(db, empleado_id) or PersonalService.get_es_director(db, empleado_id)

    @staticmethod
    def _jefe_ids_en_cadena_departamento(db: Session, departamento_id: int) -> List[int]:
        """Jefes del departamento y de sus padres (p. ej. gerente de Ópticas aplica a sucursales)."""
        ids: List[int] = []
        cur_id: Optional[int] = departamento_id
        vistos: set = set()
        while cur_id is not None and cur_id not in vistos:
            vistos.add(cur_id)
            row = (
                db.query(models.Departamento.jefe_id, models.Departamento.padre_id)
                .filter(models.Departamento.id == cur_id)
                .first()
            )
            if not row:
                break
            if row[0] and row[0] not in ids:
                ids.append(int(row[0]))
            cur_id = int(row[1]) if row[1] is not None else None
        return ids

    @staticmethod
    def get_ids_gerentes_area(db: Session, departamento_id: Optional[int]) -> List[int]:
        """
        IDs de empleados que tienen rango de GERENTE en el área: jefe del departamento
        (y del padre si es subdepartamento) + empleados con 'gerente' en el puesto.
        Usado para aprobar vacaciones de supervisores y justificar sus incidencias.
        """
        if not departamento_id:
            return []
        depto = db.query(models.Departamento).filter(models.Departamento.id == departamento_id).first()
        if not depto:
            return []
        ids = PersonalService._jefe_ids_en_cadena_departamento(db, departamento_id)
        gerentes = (
            db.query(models.Empleado)
            .join(models.Puesto, models.Empleado.puesto_id == models.Puesto.id)
            .filter(
                models.Empleado.departamento_id == departamento_id,
                models.Puesto.nombre.ilike("%gerente%"),
            )
            .all()
        )
        for e in gerentes:
            if e.id not in ids:
                ids.append(e.id)
        return ids

    @staticmethod
    def get_ids_aprobadores_area(db: Session, departamento_id: Optional[int]) -> List[int]:
        """IDs de empleados que pueden aprobar vacaciones/justificar del área: jefe del departamento (y padre), gerentes y supervisores del mismo."""
        if not departamento_id:
            return []
        depto = db.query(models.Departamento).filter(models.Departamento.id == departamento_id).first()
        if not depto:
            return []
        ids = PersonalService._jefe_ids_en_cadena_departamento(db, departamento_id)
        # Gerentes y supervisores del departamento (por nombre de puesto)
        gerentes_supervisores = db.query(models.Empleado).join(models.Puesto, models.Empleado.puesto_id == models.Puesto.id).filter(
            models.Empleado.departamento_id == departamento_id,
            or_(
                models.Puesto.nombre.ilike("%gerente%"),
                models.Puesto.nombre.ilike("%supervisor%"),
            ),
        ).all()
        for e in gerentes_supervisores:
            if e.id not in ids:
                ids.append(e.id)
        return ids

    @staticmethod
    def get_departamento_ids_con_descendientes(db: Session, raiz_ids: List[int]) -> List[int]:
        """
        Incluye cada ID raíz y todos sus descendientes por padre_id (BFS, cualquier profundidad).
        Alineado al árbol del organigrama (departamento → subdepartamento → …).
        """
        roots = [int(x) for x in (raiz_ids or []) if x is not None]
        if not roots:
            return []
        seen: set[int] = set()
        ordered: List[int] = []
        queue: List[int] = []
        for rid in roots:
            if rid not in seen:
                seen.add(rid)
                ordered.append(rid)
                queue.append(rid)
        while queue:
            parent_id = queue.pop(0)
            hijos = (
                db.query(models.Departamento.id)
                .filter(models.Departamento.padre_id == parent_id)
                .all()
            )
            for (hid,) in hijos:
                if hid not in seen:
                    seen.add(hid)
                    ordered.append(hid)
                    queue.append(hid)
        return ordered

    @staticmethod
    def get_departamento_ids_que_administro(db: Session, empleado_id: int) -> List[int]:
        """
        Departamentos que este empleado administra (alineado al organigrama):
        - donde es jefe_id (incluye todos los descendientes por padre_id)
        - donde es encargado (encargados_ids / departamento_encargados), con descendientes
        - si el puesto es gerente/supervisor: su departamento_id + descendientes
        """
        raices: List[int] = []
        deptos_como_jefe = (
            db.query(models.Departamento.id)
            .filter(models.Departamento.jefe_id == empleado_id)
            .all()
        )
        for (did,) in deptos_como_jefe:
            raices.append(did)

        enc_deptos = (
            db.query(models.DepartamentoEncargado.departamento_id)
            .filter(models.DepartamentoEncargado.empleado_id == empleado_id)
            .all()
        )
        for (did,) in enc_deptos:
            raices.append(did)

        emp = db.query(models.Empleado).options(joinedload(models.Empleado.puesto_rel)).filter(
            models.Empleado.id == empleado_id
        ).first()
        if emp and emp.departamento_id:
            puesto_nombre = (emp.puesto_rel.nombre or "").strip().lower() if emp.puesto_rel else ""
            # Aceptar "Gerente", "Supervisor" o variantes (ej. "Gerente de Diseño", "Supervisor de Área")
            if "gerente" in puesto_nombre or "supervisor" in puesto_nombre:
                raices.append(emp.departamento_id)

        # Deduplicar preservando orden antes de expandir
        uniq: List[int] = []
        seen_r: set[int] = set()
        for rid in raices:
            if rid not in seen_r:
                seen_r.add(rid)
                uniq.append(rid)
        return PersonalService.get_departamento_ids_con_descendientes(db, uniq)
