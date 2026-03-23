from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, extract
from typing import List, Optional, Tuple
from datetime import datetime, timedelta, date
from decimal import Decimal
import calendar
from . import models, schemas
from app.modules.personal import models as personal_models
from app.modules.personal import service as personal_service

# Prescripción LFT: disfrute dentro de 18 meses tras el aniversario (pasado ese plazo se pierde el derecho)
MESES_PRESCRIPCION_VACACIONES = 18


def _add_months(d: date, months: int) -> date:
    """Suma meses a una fecha (respeta días válidos del mes)."""
    year, month, day = d.year, d.month, d.day
    month += months
    year += (month - 1) // 12
    month = (month - 1) % 12 + 1
    day = min(day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _dias_vacaciones_lft_mexico(anios_completos: int) -> int:
    """
    Días de vacaciones por antigüedad según LFT México (art. 76 y 78 - Vacaciones Dignas).
    Tras el 1er año = 12 días; +2 por año hasta 20 (años 2-5: 14,16,18,20);
    después +2 días por cada 5 años de servicio.
    """
    if anios_completos < 1:
        return 0
    if anios_completos <= 5:
        return 10 + 2 * anios_completos  # 12, 14, 16, 18, 20
    return 20 + 2 * ((anios_completos - 5) // 5)  # 6-9→20, 10-14→22, 15-19→24, etc.


def _anios_antiguedad(fecha_ingreso: Optional[datetime], fecha_referencia: date) -> int:
    """Años completos de antigüedad a una fecha de referencia (ej. fin del año del balance)."""
    if not fecha_ingreso:
        return 0
    if isinstance(fecha_ingreso, datetime):
        ingreso = fecha_ingreso.date()
    else:
        ingreso = fecha_ingreso
    if ingreso > fecha_referencia:
        return 0
    años = fecha_referencia.year - ingreso.year
    if (fecha_referencia.month, fecha_referencia.day) < (ingreso.month, ingreso.day):
        años -= 1
    return max(0, años)


def _fecha_aniversario(fecha_ingreso: Optional[datetime], anios: int) -> Optional[date]:
    """Fecha del aniversario (ej. cumplir anios años desde ingreso)."""
    if not fecha_ingreso or anios < 1:
        return None
    if isinstance(fecha_ingreso, datetime):
        ingreso = fecha_ingreso.date()
    else:
        ingreso = fecha_ingreso
    y, m, d = ingreso.year + anios, ingreso.month, ingreso.day
    _, max_day = calendar.monthrange(y, m)
    return date(y, m, min(d, max_day))


def _fecha_limite_goce(fecha_ingreso: Optional[datetime], año_balance: int) -> Optional[date]:
    """
    Fecha límite para gozar las vacaciones del balance de ese año (LFT: 18 meses tras el aniversario).
    El derecho se gana al cumplir N años; debe disfrutarse antes de aniversario_N + 18 meses.
    """
    if not fecha_ingreso:
        return None
    if isinstance(fecha_ingreso, datetime):
        ingreso = fecha_ingreso.date()
    else:
        ingreso = fecha_ingreso
    fin_previo = date(año_balance - 1, 12, 31)
    anios = _anios_antiguedad(fecha_ingreso, fin_previo)
    if anios < 1:
        return None
    # Aniversario del año que generó el derecho
    y, m, d = ingreso.year + anios, ingreso.month, ingreso.day
    _, max_day = calendar.monthrange(y, m)
    aniversario = date(y, m, min(d, max_day))
    return _add_months(aniversario, MESES_PRESCRIPCION_VACACIONES)


class VacacionesService:
    
    @staticmethod
    def dias_vacaciones_por_antiguedad(anios_completos: int) -> int:
        """Días de vacaciones según LFT México para los años indicados."""
        return _dias_vacaciones_lft_mexico(anios_completos)
    
    @staticmethod
    def fecha_limite_goce_balance(db: Session, empleado_id: int, año: int) -> Optional[date]:
        """Fecha límite para gozar las vacaciones de ese año (18 meses tras el aniversario). Sin fecha_ingreso retorna None."""
        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.id == empleado_id
        ).first()
        if not empleado or not empleado.fecha_ingreso:
            return None
        return _fecha_limite_goce(empleado.fecha_ingreso, año)
    
    @staticmethod
    def ensure_periodos_empleado(db: Session, empleado_id: int, año: Optional[int] = None) -> None:
        """Crea o actualiza los periodos de vacaciones (por aniversario) del empleado. Un periodo por cada año cumplido."""
        if año is None:
            año = datetime.now().year
        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.id == empleado_id
        ).first()
        if not empleado or not empleado.fecha_ingreso:
            return
        # Incluir aniversarios ya ocurridos en el año en curso (el derecho nace el día del aniversario, LFT)
        anios_max = max(
            _anios_antiguedad(empleado.fecha_ingreso, date(año - 1, 12, 31)),
            _anios_antiguedad(empleado.fecha_ingreso, date.today()),
        )
        if anios_max < 1:
            return
        for anios in range(1, anios_max + 1):
            fecha_aniv = _fecha_aniversario(empleado.fecha_ingreso, anios)
            if not fecha_aniv:
                continue
            fecha_limite = _add_months(fecha_aniv, MESES_PRESCRIPCION_VACACIONES)
            dias_derecho = _dias_vacaciones_lft_mexico(anios)
            existente = db.query(models.BalancePeriodoVacaciones).filter(
                models.BalancePeriodoVacaciones.empleado_id == empleado_id,
                models.BalancePeriodoVacaciones.anios_antiguedad == anios
            ).first()
            if not existente:
                p = models.BalancePeriodoVacaciones(
                    empleado_id=empleado_id,
                    anios_antiguedad=anios,
                    fecha_aniversario=fecha_aniv,
                    fecha_limite_goce=fecha_limite,
                    dias_derecho=dias_derecho,
                    dias_tomados=Decimal("0"),
                )
                db.add(p)
        db.commit()
    
    @staticmethod
    def get_balance_con_periodos(
        db: Session, empleado_id: int, año: Optional[int] = None
    ) -> dict:
        """
        Balance con periodo_actual y periodo_anterior.
        Periodo actual = más reciente (más anios) que aún no prescribe.
        Periodo anterior = el anterior en antigüedad (por vencer/perderse).
        """
        if año is None:
            año = datetime.now().year
        hoy = date.today()
        VacacionesService.ensure_periodos_empleado(db, empleado_id, año)
        periodos = (
            db.query(models.BalancePeriodoVacaciones)
            .filter(
                models.BalancePeriodoVacaciones.empleado_id == empleado_id,
                models.BalancePeriodoVacaciones.fecha_limite_goce >= hoy,
            )
            .order_by(models.BalancePeriodoVacaciones.anios_antiguedad.desc())
            .all()
        )
        solicitudes_pendientes = db.query(models.SolicitudVacaciones).filter(
            and_(
                models.SolicitudVacaciones.empleado_id == empleado_id,
                models.SolicitudVacaciones.estado.in_([
                    models.EstadoSolicitud.PENDIENTE,
                    models.EstadoSolicitud.APROBADA_JEFE,
                ])
            )
        ).all()
        dias_pendientes = sum(s.dias_solicitados for s in solicitudes_pendientes)
        
        def _periodo_a_dict(p: models.BalancePeriodoVacaciones) -> dict:
            der = Decimal(p.dias_derecho)
            tom = p.dias_tomados or Decimal("0")
            disp_raw = der - tom
            disp = max(Decimal("0"), disp_raw)
            adelanto = float(max(Decimal("0"), -disp_raw))  # consumo por encima del derecho (próximo periodo)
            return {
                "anios_antiguedad": p.anios_antiguedad,
                "dias_derecho": p.dias_derecho,
                "dias_tomados": float(tom),
                "dias_disponibles": float(disp),
                "dias_adelantados": adelanto,
                "fecha_aniversario": p.fecha_aniversario.isoformat() if p.fecha_aniversario else None,
                "fecha_limite_goce": p.fecha_limite_goce.isoformat() if p.fecha_limite_goce else None,
            }
        
        periodo_actual = _periodo_a_dict(periodos[0]) if periodos else None
        periodo_anterior = _periodo_a_dict(periodos[1]) if len(periodos) >= 2 else None
        total_disponibles = sum(
            max(0, float(p.dias_derecho) - float(p.dias_tomados or 0)) for p in periodos
        )
        total_tomados = sum(float(p.dias_tomados or 0) for p in periodos)
        return {
            "empleado_id": empleado_id,
            "año": año,
            "periodo_actual": periodo_actual,
            "periodo_anterior": periodo_anterior,
            "dias_disponibles": Decimal(str(round(total_disponibles, 2))),
            "dias_tomados": Decimal(str(round(total_tomados, 2))),
            "dias_pendientes": Decimal(str(dias_pendientes)),
            "fecha_limite_goce": periodo_anterior.get("fecha_limite_goce") if periodo_anterior else (periodo_actual.get("fecha_limite_goce") if periodo_actual else None),
        }
    
    @staticmethod
    def _descontar_dias_de_periodos(
        db: Session,
        empleado_id: int,
        dias_a_descontar: Decimal,
        *,
        estrategia: str = "vence_primero",
        permitir_adelanto: bool = False,
    ) -> Decimal:
        """
        Descuenta días de los periodos no prescritos.
        - vence_primero: primero el periodo cuya fecha límite de goce vence antes (comportamiento solicitudes RH).
        - vigente_primero: primero el periodo más reciente (mayor antigüedad), luego anteriores; si falta saldo,
          se puede adelantar del mismo periodo (tomados > derecho) con permitir_adelanto.
        Devuelve días que no se pudieron descontar (0 si todo aplicado o adelantado).
        """
        restante = Decimal(str(dias_a_descontar))
        if restante <= 0:
            return Decimal("0")
        hoy = date.today()
        q = db.query(models.BalancePeriodoVacaciones).filter(
            models.BalancePeriodoVacaciones.empleado_id == empleado_id,
            models.BalancePeriodoVacaciones.fecha_limite_goce >= hoy,
        )
        if estrategia == "vigente_primero":
            q = q.order_by(models.BalancePeriodoVacaciones.anios_antiguedad.desc())
        else:
            q = q.order_by(models.BalancePeriodoVacaciones.fecha_limite_goce.asc())
        periodos = q.all()
        for p in periodos:
            if restante <= 0:
                break
            disp = Decimal(p.dias_derecho) - (p.dias_tomados or Decimal("0"))
            if disp <= 0:
                continue
            a_descontar = min(restante, disp)
            p.dias_tomados = (p.dias_tomados or Decimal("0")) + a_descontar
            restante -= a_descontar
        if restante > 0 and permitir_adelanto and periodos:
            # Adelanto sobre el periodo más reciente (mayor años de antigüedad)
            target = max(periodos, key=lambda x: x.anios_antiguedad)
            target.dias_tomados = (target.dias_tomados or Decimal("0")) + restante
            restante = Decimal("0")
        db.commit()
        return restante
    
    @staticmethod
    def aplicar_prescription_si_corresponde(db: Session, balance: models.BalanceVacaciones) -> None:
        """Si pasó la fecha límite de goce, los días disponibles se consideran prescritos (se ponen en 0)."""
        limite = VacacionesService.fecha_limite_goce_balance(db, balance.empleado_id, balance.año)
        if limite is None or balance.dias_disponibles is None or balance.dias_disponibles <= 0:
            return
        hoy = date.today()
        if hoy > limite:
            balance.dias_disponibles = Decimal("0")
            db.commit()
    
    @staticmethod
    def dias_derecho_empleado(db: Session, empleado_id: int, año: Optional[int] = None) -> dict:
        """
        Días de vacaciones que corresponden a un empleado por antigüedad (LFT México).
        Útil al dar de alta o para mostrar en balance.
        """
        if año is None:
            año = datetime.now().year
        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.id == empleado_id
        ).first()
        if not empleado:
            return {"anios_antiguedad": 0, "dias_derecho": 0, "fecha_limite_goce": None}
        fin_ref = date(año - 1, 12, 31)
        anios = _anios_antiguedad(empleado.fecha_ingreso, fin_ref)
        dias = _dias_vacaciones_lft_mexico(anios)
        limite = _fecha_limite_goce(empleado.fecha_ingreso, año) if anios >= 1 else None
        return {"anios_antiguedad": anios, "dias_derecho": dias, "fecha_limite_goce": limite}
    
    @staticmethod
    def calcular_dias_entre_fechas(
        fecha_inicio: datetime,
        fecha_fin: datetime,
        db: "Session | None" = None,
    ) -> int:
        """
        Días laborables entre dos fechas (incluye ambas), excluyendo domingos y festivos activos.
        Si se pasa `db`, consulta automáticamente los festivos del rango.
        """
        if fecha_fin < fecha_inicio:
            return 0
        inicio = fecha_inicio.date() if isinstance(fecha_inicio, datetime) else fecha_inicio
        fin = fecha_fin.date() if isinstance(fecha_fin, datetime) else fecha_fin

        festivos_set: set = set()
        if db is not None:
            from app.modules.asistencia import models as asistencia_models
            rows = db.query(asistencia_models.DiaFestivo.fecha).filter(
                asistencia_models.DiaFestivo.activo == True,
                asistencia_models.DiaFestivo.fecha >= inicio,
                asistencia_models.DiaFestivo.fecha <= fin,
            ).all()
            festivos_set = {r.fecha for r in rows}

        count = 0
        current = inicio
        while current <= fin:
            if current.weekday() != 6 and current not in festivos_set:
                count += 1
            current += timedelta(days=1)
        return count
    
    @staticmethod
    def _dias_disponibles_para_solicitar(db: Session, empleado_id: int) -> Tuple[Decimal, Decimal]:
        """
        Retorna (dias_disponibles_totales, dias_ya_reservados).
        dias_ya_reservados = solicitudes PENDIENTE + APROBADA_JEFE.
        """
        VacacionesService.ensure_periodos_empleado(db, empleado_id)
        hoy = date.today()
        periodos = (
            db.query(models.BalancePeriodoVacaciones)
            .filter(
                models.BalancePeriodoVacaciones.empleado_id == empleado_id,
                models.BalancePeriodoVacaciones.fecha_limite_goce >= hoy,
            )
            .all()
        )
        total_disponibles = sum(
            max(Decimal("0"), Decimal(p.dias_derecho) - (p.dias_tomados or Decimal("0")))
            for p in periodos
        )
        solicitudes_reservadas = db.query(models.SolicitudVacaciones).filter(
            and_(
                models.SolicitudVacaciones.empleado_id == empleado_id,
                models.SolicitudVacaciones.estado.in_([
                    models.EstadoSolicitud.PENDIENTE,
                    models.EstadoSolicitud.APROBADA_JEFE,
                ])
            )
        ).all()
        dias_reservados = sum(Decimal(str(s.dias_solicitados)) for s in solicitudes_reservadas)
        return total_disponibles, dias_reservados

    @staticmethod
    def create_solicitud(db: Session, solicitud: schemas.SolicitudVacacionesCreate) -> models.SolicitudVacaciones:
        """Crear nueva solicitud de vacaciones"""
        # No permitir solicitar vacaciones para días ya pasados (solo desde la fecha actual en adelante)
        inicio_date = solicitud.fecha_inicio.date()
        if inicio_date < date.today():
            raise ValueError("No se pueden solicitar vacaciones para días ya pasados. La fecha de inicio debe ser hoy o una fecha futura.")

        # Validar que el empleado existe
        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.id == solicitud.empleado_id
        ).first()
        if not empleado:
            raise ValueError("Empleado no encontrado")
        
        # Calcular días solicitados (excluye domingos y festivos activos)
        dias_solicitados = VacacionesService.calcular_dias_entre_fechas(
            solicitud.fecha_inicio,
            solicitud.fecha_fin,
            db=db,
        )

        # Validar que no exceda los días disponibles
        total_disponibles, dias_reservados = VacacionesService._dias_disponibles_para_solicitar(db, solicitud.empleado_id)
        dias_poder_solicitar = total_disponibles - dias_reservados
        if dias_poder_solicitar <= 0:
            raise ValueError("No tienes días disponibles para solicitar. Tu balance de vacaciones es 0 o ya tienes solicitudes pendientes que consumen todos tus días.")
        if dias_solicitados > dias_poder_solicitar:
            raise ValueError(
                f"No puedes solicitar más de {int(dias_poder_solicitar)} días. "
                f"Tienes {int(total_disponibles)} días disponibles y ya tienes {int(dias_reservados)} días en solicitudes pendientes."
            )
        
        # Obtener jefe del empleado
        jefe_id = empleado.jefe_id
        
        # Crear solicitud
        db_solicitud = models.SolicitudVacaciones(
            empleado_id=solicitud.empleado_id,
            fecha_inicio=solicitud.fecha_inicio,
            fecha_fin=solicitud.fecha_fin,
            dias_solicitados=dias_solicitados,
            motivo=solicitud.motivo,
            jefe_aprobador_id=jefe_id,
            estado=models.EstadoSolicitud.PENDIENTE
        )
        
        db.add(db_solicitud)
        db.commit()
        db.refresh(db_solicitud)
        
        # Actualizar balance (días pendientes)
        VacacionesService._actualizar_balance_pendientes(db, solicitud.empleado_id)
        
        return db_solicitud
    
    @staticmethod
    def get_solicitud(db: Session, solicitud_id: int) -> Optional[models.SolicitudVacaciones]:
        """Obtener solicitud por ID"""
        return db.query(models.SolicitudVacaciones).options(
            joinedload(models.SolicitudVacaciones.jefe_aprobador)
        ).filter(
            models.SolicitudVacaciones.id == solicitud_id
        ).first()
    
    @staticmethod
    def get_solicitudes(
        db: Session,
        skip: int = 0,
        limit: int = 100,
        empleado_id: Optional[int] = None,
        estado: Optional[str] = None,
        jefe_id: Optional[int] = None,
        include_canceladas: bool = False,
    ) -> List[models.SolicitudVacaciones]:
        """Listar solicitudes con filtros"""
        query = db.query(models.SolicitudVacaciones).options(
            joinedload(models.SolicitudVacaciones.jefe_aprobador),
            joinedload(models.SolicitudVacaciones.empleado),
        )
        if empleado_id:
            query = query.filter(models.SolicitudVacaciones.empleado_id == empleado_id)
        if estado:
            # Convertir el string al enum para que SQLAlchemy genere el valor correcto (PENDIENTE, APROBADA, etc.)
            try:
                estado_enum = models.EstadoSolicitud(estado.lower())
            except ValueError:
                try:
                    estado_enum = models.EstadoSolicitud[estado.upper()]
                except KeyError:
                    estado_enum = None
            if estado_enum is not None:
                query = query.filter(models.SolicitudVacaciones.estado == estado_enum)
        if not include_canceladas:
            query = query.filter(models.SolicitudVacaciones.estado != models.EstadoSolicitud.CANCELADA)
        if jefe_id:
            # Solicitudes pendientes: área del jefe/gerente/supervisor, o (si es Director/Gerente General) de empleados con puesto gerente/supervisor
            es_gerente_o_director = personal_service.PersonalService.get_es_gerente_o_director(db, jefe_id)
            depto_ids = personal_service.PersonalService.get_departamento_ids_que_administro(db, jefe_id)
            cond_jefe = models.SolicitudVacaciones.jefe_aprobador_id == jefe_id
            query = query.join(personal_models.Empleado, models.SolicitudVacaciones.empleado_id == personal_models.Empleado.id)
            query = query.filter(models.SolicitudVacaciones.estado == models.EstadoSolicitud.PENDIENTE)
            cond_area = or_(cond_jefe, personal_models.Empleado.departamento_id.in_(depto_ids)) if depto_ids else cond_jefe
            if es_gerente_o_director:
                query = query.outerjoin(personal_models.Puesto, personal_models.Empleado.puesto_id == personal_models.Puesto.id)
                cond_puesto_gerente_supervisor = or_(
                    personal_models.Puesto.nombre.ilike("%gerente%"),
                    personal_models.Puesto.nombre.ilike("%supervisor%"),
                )
                query = query.filter(or_(cond_area, cond_puesto_gerente_supervisor))
            else:
                query = query.filter(cond_area)
        
        return query.order_by(models.SolicitudVacaciones.created_at.desc()).offset(skip).limit(limit).all()
    
    @staticmethod
    def aprobar_solicitud(
        db: Session,
        solicitud_id: int,
        jefe_id: int,
        aprobar: bool,
        comentarios: Optional[str] = None,
        bypass_permiso: bool = False,
        es_gerente_o_director: bool = False,
        es_gerente_general: bool = False,
        departamento_ids_que_administro: Optional[list] = None
    ) -> Optional[models.SolicitudVacaciones]:
        """Aprobar o rechazar. Solo Admin aprueba todo. Director y Gerente General aprueban gerentes/supervisores. Gerente General además aprueba empleados de su área."""
        solicitud = db.query(models.SolicitudVacaciones).filter(
            models.SolicitudVacaciones.id == solicitud_id
        ).first()
        
        if not solicitud:
            return None

        # Nadie puede aprobar sus propias vacaciones
        if jefe_id == solicitud.empleado_id:
            raise ValueError("No puedes aprobar tus propias vacaciones. Solicita a tu superior jerárquico que las apruebe.")
        
        empleado = db.query(personal_models.Empleado).options(
            joinedload(personal_models.Empleado.puesto_rel)
        ).filter(personal_models.Empleado.id == solicitud.empleado_id).first()
        
        puesto_n = (empleado.puesto_rel.nombre or "").strip().lower() if (empleado and empleado.puesto_rel) else ""
        solicitante_es_gerente = "gerente" in puesto_n
        solicitante_es_supervisor = "supervisor" in puesto_n
        
        if not bypass_permiso:
            if solicitante_es_gerente or solicitante_es_supervisor:
                # Las vacaciones de gerentes/supervisores solo las aprueban Admin, Director o Gerente General (el gerente de área no puede aprobar a otro gerente ni a sí mismo)
                if not es_gerente_o_director:
                    raise ValueError(
                        "Las vacaciones de gerentes y supervisores solo las puede aprobar Administrador, Director o Gerente General. "
                        "Los gerentes de área no pueden aprobar sus propias vacaciones ni las de otros gerentes."
                    )
            elif es_gerente_o_director:
                # Director y Gerente General aprueban gerentes/supervisores. Gerente General además aprueba empleados de su área.
                if solicitante_es_gerente or solicitante_es_supervisor:
                    pass  # OK
                elif es_gerente_general and departamento_ids_que_administro and empleado and empleado.departamento_id and empleado.departamento_id in departamento_ids_que_administro:
                    pass  # Gerente General aprueba empleados de su área
                else:
                    raise ValueError("Solo puedes aprobar vacaciones de gerentes y supervisores. Las de empleados regulares las aprueba el gerente de su área.")
            else:
                # Empleado regular: gerente/jefe de área puede aprobar
                aprobadores = personal_service.PersonalService.get_ids_aprobadores_area(db, empleado.departamento_id if empleado else None)
                if jefe_id not in aprobadores and solicitud.jefe_aprobador_id != jefe_id:
                    raise ValueError("No tienes permisos para aprobar esta solicitud")
        
        # Verificar que está pendiente
        if solicitud.estado != models.EstadoSolicitud.PENDIENTE:
            raise ValueError("La solicitud ya fue procesada")
        
        # Actualizar estado — toda aprobación de primer nivel (jefe, gerente o superadmin)
        # queda en APROBADA_JEFE para que RH dé la confirmación final.
        # Solo el rechazo es definitivo en este paso.
        if aprobar:
            solicitud.estado = models.EstadoSolicitud.APROBADA_JEFE
            # Los días siguen contando como pendientes hasta que RH confirme
        else:
            solicitud.estado = models.EstadoSolicitud.RECHAZADA
            balance = VacacionesService.get_or_create_balance(db, solicitud.empleado_id)
            balance.dias_pendientes -= Decimal(str(solicitud.dias_solicitados))
        
        solicitud.jefe_aprobador_id = jefe_id
        solicitud.fecha_aprobacion = datetime.utcnow()
        solicitud.comentarios_aprobacion = comentarios
        
        db.commit()
        db.refresh(solicitud)
        return solicitud

    @staticmethod
    def confirmar_rh(
        db: Session,
        solicitud_id: int,
        aprobador_id: int,
        aprobar: bool,
        comentarios: Optional[str] = None,
    ) -> models.SolicitudVacaciones:
        """
        Confirmación final de RH: solo puede aprobar (nunca rechazar).
        Esta función asume que el validador del endpoint ya rechazó cualquier intento de rechazo.
        """
        solicitud = db.query(models.SolicitudVacaciones).filter(
            models.SolicitudVacaciones.id == solicitud_id
        ).first()
        if not solicitud:
            raise ValueError("Solicitud no encontrada")
        if solicitud.estado != models.EstadoSolicitud.APROBADA_JEFE:
            raise ValueError("La solicitud no está en estado 'aprobada por jefe' — no puede ser procesada por RH")

        # Aprobación final: descontar días del balance (primero el que vence antes)
        solicitud.estado = models.EstadoSolicitud.APROBADA
        VacacionesService._descontar_dias_de_periodos(
            db,
            solicitud.empleado_id,
            Decimal(str(solicitud.dias_solicitados)),
            estrategia="vence_primero",
            permitir_adelanto=False,
        )
        balance = VacacionesService.get_or_create_balance(db, solicitud.empleado_id)
        balance.dias_pendientes = max(
            Decimal("0"),
            (balance.dias_pendientes or Decimal("0")) - Decimal(str(solicitud.dias_solicitados))
        )
        balance.dias_tomados = (balance.dias_tomados or Decimal("0")) + Decimal(str(solicitud.dias_solicitados))

        if comentarios:
            prev = solicitud.comentarios_aprobacion or ""
            solicitud.comentarios_aprobacion = (prev + f"\n[RH] {comentarios}").strip() if prev else f"[RH] {comentarios}"

        db.commit()
        db.refresh(solicitud)
        return solicitud
    
    @staticmethod
    def cancelar_solicitud(
        db: Session,
        solicitud_id: int,
        empleado_id: int,
    ) -> models.SolicitudVacaciones:
        """
        El propio empleado cancela su solicitud.
        Solo se permite si el estado es PENDIENTE (no ha sido aprobada aún).
        """
        solicitud = db.query(models.SolicitudVacaciones).filter(
            models.SolicitudVacaciones.id == solicitud_id
        ).first()
        if not solicitud:
            raise ValueError("Solicitud no encontrada")
        if solicitud.empleado_id != empleado_id:
            raise ValueError("No puedes cancelar una solicitud que no te pertenece")
        if solicitud.estado != models.EstadoSolicitud.PENDIENTE:
            raise ValueError("Solo puedes cancelar solicitudes que aún están pendientes de aprobación")

        solicitud.estado = models.EstadoSolicitud.CANCELADA
        # Devolver los días al balance pendiente
        balance = VacacionesService.get_or_create_balance(db, empleado_id)
        balance.dias_pendientes = max(
            Decimal("0"),
            (balance.dias_pendientes or Decimal("0")) - Decimal(str(solicitud.dias_solicitados))
        )
        db.commit()
        db.refresh(solicitud)
        return solicitud

    @staticmethod
    def _actualizar_balance_pendientes(db: Session, empleado_id: int):
        """Actualizar días pendientes en el balance"""
        balance = VacacionesService.get_or_create_balance(db, empleado_id)
        
        # Sumar solicitudes pendientes (tanto las que esperan al jefe como las que esperan a RH)
        solicitudes_pendientes = db.query(models.SolicitudVacaciones).filter(
            and_(
                models.SolicitudVacaciones.empleado_id == empleado_id,
                models.SolicitudVacaciones.estado.in_([
                    models.EstadoSolicitud.PENDIENTE,
                    models.EstadoSolicitud.APROBADA_JEFE,
                ])
            )
        ).all()
        
        total_pendientes = sum(s.dias_solicitados for s in solicitudes_pendientes)
        balance.dias_pendientes = Decimal(str(total_pendientes))
        db.commit()
    
    @staticmethod
    def get_or_create_balance(db: Session, empleado_id: int, año: Optional[int] = None) -> models.BalanceVacaciones:
        """
        Obtener o crear balance de vacaciones para un empleado.
        Al crear, los días disponibles se calculan por antigüedad según LFT México
        (12 días tras 1er año, +2 hasta 20, luego +2 cada 5 años).
        """
        if año is None:
            año = datetime.now().year
        
        balance = db.query(models.BalanceVacaciones).filter(
            and_(
                models.BalanceVacaciones.empleado_id == empleado_id,
                models.BalanceVacaciones.año == año
            )
        ).first()
        
        if not balance:
            # Calcular días por antigüedad (LFT México): al cumplir el año tiene derecho
            empleado = db.query(personal_models.Empleado).filter(
                personal_models.Empleado.id == empleado_id
            ).first()
            fin_año_anterior = date(año - 1, 12, 31) if empleado else date(año, 1, 1)
            fecha_ingreso = empleado.fecha_ingreso if empleado else None
            anios = _anios_antiguedad(fecha_ingreso, fin_año_anterior)
            dias_por_ley = _dias_vacaciones_lft_mexico(anios)
            balance = models.BalanceVacaciones(
                empleado_id=empleado_id,
                año=año,
                dias_disponibles=Decimal(str(dias_por_ley)),
                dias_tomados=Decimal("0"),
                dias_pendientes=Decimal("0")
            )
            db.add(balance)
            db.commit()
            db.refresh(balance)
            VacacionesService.ensure_periodos_empleado(db, empleado_id, año)
        
        VacacionesService.aplicar_prescription_si_corresponde(db, balance)
        return balance
    
    @staticmethod
    def get_balance(db: Session, empleado_id: int, año: Optional[int] = None) -> Optional[models.BalanceVacaciones]:
        """Obtener balance de vacaciones"""
        if año is None:
            año = datetime.now().year
        
        return db.query(models.BalanceVacaciones).filter(
            and_(
                models.BalanceVacaciones.empleado_id == empleado_id,
                models.BalanceVacaciones.año == año
            )
        ).first()
    
    @staticmethod
    def actualizar_dias_disponibles(db: Session, empleado_id: int, dias: Decimal, año: Optional[int] = None):
        """Actualizar días disponibles en el balance"""
        balance = VacacionesService.get_or_create_balance(db, empleado_id, año)
        balance.dias_disponibles = dias
        db.commit()
        db.refresh(balance)
        return balance

    # --- Vacaciones generales (empresa / departamento / global) ---

    @staticmethod
    def listar_empleados_ids_alcance(
        db: Session,
        alcance: str,
        empresa_id: Optional[int],
        departamento_id: Optional[int],
    ) -> List[int]:
        q = db.query(personal_models.Empleado.id).filter(
            personal_models.Empleado.estado == personal_models.EstadoEmpleado.ACTIVO
        )
        a = (alcance or "").strip().lower()
        if a == "global":
            pass
        elif a == "empresa":
            if not empresa_id:
                raise ValueError("empresa_id es obligatorio para alcance empresa")
            q = q.filter(personal_models.Empleado.empresa_id == empresa_id)
        elif a == "departamento":
            if not departamento_id:
                raise ValueError("departamento_id es obligatorio para alcance departamento")
            q = q.filter(personal_models.Empleado.departamento_id == departamento_id)
        else:
            raise ValueError("alcance debe ser global, empresa o departamento")
        return [row[0] for row in q.all()]

    @staticmethod
    def crear_vacacion_general(db: Session, data: schemas.VacacionGeneralCreate) -> models.VacacionGeneral:
        a = str(data.alcance)
        if a == "empresa" and not data.empresa_id:
            raise ValueError("empresa_id requerido")
        if a == "departamento" and not data.departamento_id:
            raise ValueError("departamento_id requerido")
        if data.fecha_fin < data.fecha_inicio:
            raise ValueError("fecha_fin debe ser >= fecha_inicio")
        vg = models.VacacionGeneral(
            nombre=data.nombre.strip(),
            fecha_inicio=data.fecha_inicio,
            fecha_fin=data.fecha_fin,
            alcance=a,
            empresa_id=data.empresa_id,
            departamento_id=data.departamento_id,
            dias_cuenta_ley=Decimal(str(data.dias_cuenta_ley)),
            dias_regalo_empresa=Decimal(str(data.dias_regalo_empresa or 0)),
            activo=data.activo if data.activo is not None else True,
            notas=data.notas,
        )
        db.add(vg)
        db.commit()
        db.refresh(vg)
        return vg

    @staticmethod
    def listar_vacaciones_generales(db: Session, solo_activos: bool = False) -> List[models.VacacionGeneral]:
        q = db.query(models.VacacionGeneral).order_by(models.VacacionGeneral.fecha_inicio.desc())
        if solo_activos:
            q = q.filter(models.VacacionGeneral.activo == True)
        return q.all()

    @staticmethod
    def aplicar_vacacion_general(db: Session, vacacion_general_id: int) -> dict:
        """
        Descuenta días LFT (estrategia vigente_primero; permite adelanto en el periodo más reciente).
        Registra días regalo por empleado sin tocar balance LFT.
        Idempotente: no vuelve a aplicar si ya existe registro.
        """
        vg = (
            db.query(models.VacacionGeneral)
            .filter(models.VacacionGeneral.id == vacacion_general_id)
            .first()
        )
        if not vg:
            raise ValueError("Vacación general no encontrada")
        if not vg.activo:
            raise ValueError("La vacación general está inactiva")
        ley = Decimal(str(vg.dias_cuenta_ley))
        regalo = Decimal(str(vg.dias_regalo_empresa or 0))
        if ley < 0 or regalo < 0:
            raise ValueError("Los días no pueden ser negativos")

        empleados_ids = VacacionesService.listar_empleados_ids_alcance(
            db, vg.alcance, vg.empresa_id, vg.departamento_id
        )
        aplicados: List[int] = []
        omitidos: List[dict] = []
        errores: List[dict] = []

        for eid in empleados_ids:
            ya = (
                db.query(models.VacacionGeneralAplicacion)
                .filter(
                    models.VacacionGeneralAplicacion.vacacion_general_id == vg.id,
                    models.VacacionGeneralAplicacion.empleado_id == eid,
                )
                .first()
            )
            if ya:
                omitidos.append({"empleado_id": eid, "motivo": "ya_aplicada"})
                continue
            try:
                VacacionesService.ensure_periodos_empleado(db, eid)
                periodos_count = (
                    db.query(models.BalancePeriodoVacaciones)
                    .filter(
                        models.BalancePeriodoVacaciones.empleado_id == eid,
                        models.BalancePeriodoVacaciones.fecha_limite_goce >= date.today(),
                    )
                    .count()
                )
                if ley > 0 and periodos_count == 0:
                    errores.append(
                        {
                            "empleado_id": eid,
                            "error": "Sin periodos de vacaciones vigentes (p. ej. menos de 1 año de antigüedad)",
                        }
                    )
                    continue
                restante = Decimal("0")
                if ley > 0:
                    restante = VacacionesService._descontar_dias_de_periodos(
                        db,
                        eid,
                        ley,
                        estrategia="vigente_primero",
                        permitir_adelanto=True,
                    )
                if ley > 0 and restante > 0:
                    errores.append(
                        {
                            "empleado_id": eid,
                            "error": f"No se pudieron descontar todos los días (restante {restante})",
                        }
                    )
                    continue
                ap = models.VacacionGeneralAplicacion(
                    vacacion_general_id=vg.id,
                    empleado_id=eid,
                    dias_ley_descontados=ley,
                    dias_regalo=regalo,
                )
                db.add(ap)
                db.commit()
                aplicados.append(eid)
            except Exception as ex:
                db.rollback()
                errores.append({"empleado_id": eid, "error": str(ex)})

        return {
            "vacacion_general_id": vg.id,
            "empleados_totales": len(empleados_ids),
            "aplicados": len(aplicados),
            "omitidos": omitidos,
            "errores": errores,
        }
