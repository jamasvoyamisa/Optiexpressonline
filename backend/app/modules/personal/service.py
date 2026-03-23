import unicodedata
import re
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func
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
        payload = empresa.dict()
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
        update_data = empresa.dict(exclude_unset=True)
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
    def create_departamento(db: Session, depto: schemas.DepartamentoCreate) -> models.Departamento:
        db_depto = models.Departamento(**depto.dict())
        db.add(db_depto)
        db.commit()
        db.refresh(db_depto)
        return db_depto

    @staticmethod
    def get_departamento(db: Session, depto_id: int) -> Optional[models.Departamento]:
        return db.query(models.Departamento).options(
            joinedload(models.Departamento.empresa),
            joinedload(models.Departamento.jefe),
        ).filter(models.Departamento.id == depto_id).first()

    @staticmethod
    def get_departamentos(
        db: Session, skip: int = 0, limit: int = 100,
        empresa_id: Optional[int] = None, activo: Optional[bool] = None
    ) -> List[models.Departamento]:
        query = db.query(models.Departamento).options(
            joinedload(models.Departamento.empresa),
            joinedload(models.Departamento.jefe),
        )
        if empresa_id is not None:
            query = query.filter(models.Departamento.empresa_id == empresa_id)
        if activo is not None:
            query = query.filter(models.Departamento.activo == activo)
        return query.offset(skip).limit(limit).all()

    @staticmethod
    def update_departamento(db: Session, depto_id: int, depto: schemas.DepartamentoUpdate) -> Optional[models.Departamento]:
        db_depto = db.query(models.Departamento).filter(models.Departamento.id == depto_id).first()
        if not db_depto:
            return None
        for field, value in depto.dict(exclude_unset=True).items():
            setattr(db_depto, field, value)
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

    PUESTOS_RESERVADOS = {"director", "gerente general", "rh"}

    @staticmethod
    def _nombre_reservado(nombre: str) -> bool:
        n = (nombre or "").strip().lower()
        return n in PersonalService.PUESTOS_RESERVADOS

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
            raise ValueError("No se puede crear el puesto: Director, Gerente General y RH son asignados por el Administrador.")
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
                raise ValueError("No se puede usar: Director, Gerente General y RH son asignados por el Administrador.")
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
            raise ValueError("No se puede eliminar: Director, Gerente General y RH son puestos del sistema.")
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
        data = empleado.dict(exclude={"registrar_en_checador", "dispositivo_ids", "password", "horario_id", "horario_sabado_id"})
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
        db_empleado = models.Empleado(**data)
        # Contraseña para acceso al sistema
        rfc_default = (empleado.rfc or '').strip()[:8]
        password_plain = (
            empleado.password if empleado.password and empleado.password.strip()
            else rfc_default if rfc_default
            else empleado.numero_empleado
        )
        db_empleado.password_hash = get_password_hash(password_plain)
        db.add(db_empleado)
        db.commit()
        db.refresh(db_empleado)
        # Si no se pudo asignar pin_checador (sin empresa/rango), usar el id
        if not db_empleado.pin_checador:
            db_empleado.pin_checador = str(db_empleado.id)
            db.commit()
            db.refresh(db_empleado)
        # Asignar horario L-V si se proporcionó
        if empleado.horario_id:
            try:
                from app.modules.asistencia import models as asist_models
                from datetime import datetime
                eh = asist_models.EmpleadoHorario(
                    empleado_id=db_empleado.id,
                    horario_id=empleado.horario_id,
                    fecha_inicio=datetime.utcnow(),
                    activo=True,
                )
                db.add(eh)
                db.commit()
            except Exception:
                pass
        # Guardar horario sabatino (puede ser None = no labora sábados)
        if empleado.horario_sabado_id is not None:
            db_empleado.horario_sabado_id = empleado.horario_sabado_id
            db.commit()
        return db_empleado
    
    @staticmethod
    def get_empleado(db: Session, empleado_id: int) -> Optional[models.Empleado]:
        """Obtener empleado por ID"""
        return db.query(models.Empleado).options(
            joinedload(models.Empleado.empresa),
            joinedload(models.Empleado.departamento_rel).joinedload(models.Departamento.empresa),
            joinedload(models.Empleado.puesto_rel),
            joinedload(models.Empleado.horarios_asignados),
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
    def get_empleados(
        db: Session,
        skip: int = 0,
        limit: int = 100,
        estado: Optional[str] = None,
        rol_id: Optional[int] = None,
        jefe_id: Optional[int] = None,
        departamento_id: Optional[int] = None,
        search: Optional[str] = None,
        exento_incidencias: Optional[bool] = None,
    ) -> List[models.Empleado]:
        """Listar empleados con filtros. exento_incidencias filtra usuarios especiales."""
        from sqlalchemy import or_

        # IDs de roles de administrador/superuser (solo excluir cuando no filtramos por exento)
        admin_rol_ids = []
        if exento_incidencias is None:
            admin_rol_ids = [
                r.id for r in db.query(models.Rol.id).filter(
                    models.Rol.nombre.in_(("Administrador", "Superuser"))
                ).all()
            ]

        query = db.query(models.Empleado).options(
            joinedload(models.Empleado.empresa),
            joinedload(models.Empleado.departamento_rel),
            joinedload(models.Empleado.puesto_rel),
            joinedload(models.Empleado.jefe),
            joinedload(models.Empleado.horarios_asignados),
        )

        # Excluir siempre cuentas de sistema (sin empresa asignada)
        query = query.filter(models.Empleado.empresa_id.isnot(None))

        if exento_incidencias is not None:
            query = query.filter(models.Empleado.exento_incidencias == exento_incidencias)
        elif admin_rol_ids:
            query = query.filter(
                or_(
                    models.Empleado.rol_id.is_(None),
                    models.Empleado.rol_id.notin_(admin_rol_ids)
                )
            )

        if estado:
            query = query.filter(models.Empleado.estado == estado)
        if rol_id:
            query = query.filter(models.Empleado.rol_id == rol_id)
        if jefe_id:
            query = query.filter(models.Empleado.jefe_id == jefe_id)
        if departamento_id:
            query = query.filter(models.Empleado.departamento_id == departamento_id)
        if search:
            search_filter = or_(
                models.Empleado.nombre.ilike(f"%{search}%"),
                models.Empleado.apellido_paterno.ilike(f"%{search}%"),
                models.Empleado.apellido_materno.ilike(f"%{search}%"),
                models.Empleado.numero_empleado.ilike(f"%{search}%"),
                models.Empleado.email.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)
        
        return query.offset(skip).limit(limit).all()
    
    @staticmethod
    def update_empleado(db: Session, empleado_id: int, empleado: schemas.EmpleadoUpdate) -> Optional[models.Empleado]:
        """Actualizar empleado"""
        db_empleado = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
        if not db_empleado:
            return None

        update_data = empleado.dict(exclude_unset=True)
        if "password" in update_data:
            password = update_data.pop("password")
            if password and str(password).strip():
                db_empleado.password_hash = get_password_hash(password)

        # horario_id y horario_sabado_id se manejan aparte
        horario_id_was_sent = "horario_id" in update_data
        horario_sabado_was_sent = "horario_sabado_id" in update_data
        horario_id = update_data.pop("horario_id", None) if horario_id_was_sent else None
        horario_sabado_id = update_data.pop("horario_sabado_id", None) if horario_sabado_was_sent else None

        for field, value in update_data.items():
            if hasattr(db_empleado, field):
                setattr(db_empleado, field, value)

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

        db.commit()
        db.refresh(db_empleado)
        return db_empleado
    
    @staticmethod
    def delete_empleado(db: Session, empleado_id: int) -> bool:
        """Eliminar empleado (cambiar estado a baja) y encolar eliminacion en dispositivos"""
        db_empleado = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
        if not db_empleado:
            return False
        
        db_empleado.estado = models.EstadoEmpleado.BAJA
        from datetime import datetime
        db_empleado.fecha_baja = datetime.utcnow()

        from app.modules.asistencia import models as asist_models
        enviados = db.query(asist_models.UsuarioPendienteDispositivo).filter(
            asist_models.UsuarioPendienteDispositivo.numero_empleado == db_empleado.numero_empleado,
            asist_models.UsuarioPendienteDispositivo.enviado == True,
        ).all()
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
    def get_subordinados(db: Session, jefe_id: int) -> List[models.Empleado]:
        """Obtener subordinados de un jefe"""
        return db.query(models.Empleado).filter(models.Empleado.jefe_id == jefe_id).all()

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
        if emp.puesto_rel and (emp.puesto_rel.nombre or "").strip().lower() == "gerente general":
            return True
        return False

    @staticmethod
    def get_es_director(db: Session, empleado_id: int) -> bool:
        """True si el empleado tiene puesto Director (aprueba vacaciones solo de gerentes/supervisores)."""
        emp = db.query(models.Empleado).options(joinedload(models.Empleado.puesto_rel)).filter(models.Empleado.id == empleado_id).first()
        return emp is not None and emp.puesto_rel is not None and (emp.puesto_rel.nombre or "").strip().lower() == "director"

    @staticmethod
    def get_es_gerente_o_director(db: Session, empleado_id: int) -> bool:
        """True si puede aprobar solo vacaciones de gerentes/supervisores (Director o Gerente General)."""
        return PersonalService.get_es_gerente_general(db, empleado_id) or PersonalService.get_es_director(db, empleado_id)

    @staticmethod
    def get_ids_aprobadores_area(db: Session, departamento_id: Optional[int]) -> List[int]:
        """IDs de empleados que pueden aprobar vacaciones/justificar del área: jefe del departamento, gerentes y supervisores del mismo."""
        if not departamento_id:
            return []
        depto = db.query(models.Departamento).filter(models.Departamento.id == departamento_id).first()
        if not depto:
            return []
        ids = []
        if depto.jefe_id:
            ids.append(depto.jefe_id)
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
    def get_departamento_ids_que_administro(db: Session, empleado_id: int) -> List[int]:
        """Departamentos que este empleado administra: donde es jefe, o donde es supervisor/gerente (por puesto) en ese departamento."""
        deptos_como_jefe = db.query(models.Departamento.id).filter(
            models.Departamento.jefe_id == empleado_id
        ).all()
        ids = [r[0] for r in deptos_como_jefe]
        emp = db.query(models.Empleado).options(joinedload(models.Empleado.puesto_rel)).filter(
            models.Empleado.id == empleado_id
        ).first()
        if emp and emp.departamento_id and emp.departamento_id not in ids:
            puesto_nombre = (emp.puesto_rel.nombre or "").strip().lower() if emp.puesto_rel else ""
            # Aceptar "Gerente", "Supervisor" o variantes (ej. "Gerente de Diseño", "Supervisor de Área")
            if "gerente" in puesto_nombre or "supervisor" in puesto_nombre:
                ids.append(emp.departamento_id)
        return ids
