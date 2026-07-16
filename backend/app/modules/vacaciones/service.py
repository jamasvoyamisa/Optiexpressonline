from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, extract, func
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta, date, timezone
from decimal import Decimal
import calendar
import logging

logger = logging.getLogger(__name__)
from . import models, schemas
from app.modules.personal import models as personal_models
from app.modules.personal import service as personal_service
from app.core.timezone_utils import hoy_mexico, to_mexico

# Prescripción LFT: disfrute dentro de 18 meses tras el aniversario (pasado ese plazo se pierde el derecho)
MESES_PRESCRIPCION_VACACIONES = 18


def compute_aprobador_es_jefe_directo(solicitud: models.SolicitudVacaciones) -> Optional[bool]:
    """
    True si quien autorizó corresponde a la jerarquía inmediata del solicitante para fines de UI.

    No basta con comparar solo `empleado.jefe_id`: a veces el colaborante tiene como jefe en expediente
    a un supervisor y autoriza el gerente del área (misma regla que `aprobar_solicitud` para empleados regulares).
    """
    if not solicitud.jefe_aprobador_id or not solicitud.empleado:
        return None
    emp = solicitud.empleado
    apid = solicitud.jefe_aprobador_id
    jef_ap = solicitud.jefe_aprobador
    if jef_ap is None:
        return None

    if emp.jefe_id and apid == emp.jefe_id:
        return True

    depto_rel = getattr(emp, "departamento_rel", None)
    if depto_rel and getattr(depto_rel, "jefe_id", None) and apid == depto_rel.jefe_id:
        return True

    p_solic = (getattr(getattr(emp, "puesto_rel", None), "nombre", None) or "").strip().lower()
    solicitante_es_gerente = "gerente" in p_solic

    p_ap = (getattr(getattr(jef_ap, "puesto_rel", None), "nombre", None) or "").strip().lower()
    aprobador_es_gerente = "gerente" in p_ap
    mismo_depto = bool(
        emp.departamento_id
        and jef_ap.departamento_id
        and emp.departamento_id == jef_ap.departamento_id
    )

    # Empleado de línea (no gerente de área): gerente del mismo departamento cuenta como jefe jerárquico del área
    if not solicitante_es_gerente and aprobador_es_gerente and mismo_depto:
        return True

    return False


def _ingreso_dia_mexico(fecha_ingreso) -> Optional[date]:
    """
    Día de ingreso en calendario México. Si `fecha_ingreso` es datetime con TZ UTC,
    usar solo `.date()` en UTC desplaza el día y la antigüedad puede quedar mal un año.
    """
    if fecha_ingreso is None:
        return None
    if isinstance(fecha_ingreso, datetime):
        mx = to_mexico(fecha_ingreso)
        return mx.date() if mx else fecha_ingreso.date()
    if isinstance(fecha_ingreso, date):
        return fecha_ingreso
    return None


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
    Días mínimos de vacaciones por antigüedad (LFT art. 76, reforma vacaciones dignas).
    Años 1–5: +2 por año (12…20). A partir del 6.º año: +2 por cada bloque de 5 años
    (tabla oficial: 6–10→22, 11–15→24, 16–20→26, …).
    """
    if anios_completos < 1:
        return 0
    if anios_completos <= 5:
        return 10 + 2 * anios_completos  # 12, 14, 16, 18, 20
    # 20 + 2 * floor((años-1)/5): año 6–10 →22, 11–15→24, 16–20→26 (no confundir con (años-5)//5, que dejaba 6–9 en 20)
    return 20 + 2 * ((anios_completos - 1) // 5)


def _anios_antiguedad(fecha_ingreso: Optional[datetime], fecha_referencia: date) -> int:
    """Años completos de antigüedad a una fecha de referencia (ej. fin del año del balance)."""
    ingreso = _ingreso_dia_mexico(fecha_ingreso)
    if not ingreso:
        return 0
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
    ingreso = _ingreso_dia_mexico(fecha_ingreso)
    if not ingreso:
        return None
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
    ingreso = _ingreso_dia_mexico(fecha_ingreso)
    if not ingreso:
        return None
    fin_previo = date(año_balance - 1, 12, 31)
    anios = _anios_antiguedad(fecha_ingreso, fin_previo)
    if anios < 1:
        return None
    # Aniversario del año que generó el derecho
    y, m, d = ingreso.year + anios, ingreso.month, ingreso.day
    _, max_day = calendar.monthrange(y, m)
    aniversario = date(y, m, min(d, max_day))
    return _add_months(aniversario, MESES_PRESCRIPCION_VACACIONES)


def _contexto_empleado_vacacion_general(db: Session, empleado_id: int) -> Dict[str, Optional[str]]:
    """Nombre, empresa y número de empleado para mensajes de aplicación de vacaciones generales."""
    emp = (
        db.query(personal_models.Empleado)
        .options(joinedload(personal_models.Empleado.empresa))
        .filter(personal_models.Empleado.id == empleado_id)
        .first()
    )
    if not emp:
        return {"nombre_empleado": None, "numero_empleado": None, "empresa_nombre": None}
    nombre = f"{emp.nombre} {emp.apellido_paterno or ''}".strip()
    num = getattr(emp, "numero_empleado", None)
    num_s = str(num).strip() if num is not None and str(num).strip() else None
    empresa_n = None
    if emp.empresa:
        empresa_n = emp.empresa.nombre
    return {
        "nombre_empleado": nombre or None,
        "numero_empleado": num_s,
        "empresa_nombre": empresa_n,
    }


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
    def liquidar_deuda_vacaciones_ley(db: Session, empleado_id: int) -> None:
        """Descuenta deuda LFT contra días disponibles en periodos vigentes; sin adelanto (no borra saldo neto negativo)."""
        emp = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.id == empleado_id
        ).first()
        if not emp:
            return
        debt = Decimal(str(emp.dias_deuda_vacaciones_ley or 0))
        if debt <= 0:
            return
        hoy = hoy_mexico()
        n = (
            db.query(models.BalancePeriodoVacaciones)
            .filter(
                models.BalancePeriodoVacaciones.empleado_id == empleado_id,
                models.BalancePeriodoVacaciones.fecha_limite_goce >= hoy,
            )
            .count()
        )
        if n == 0:
            return
        restante = VacacionesService._descontar_dias_de_periodos(
            db,
            empleado_id,
            debt,
            estrategia="vigente_primero",
            permitir_adelanto=False,
        )
        emp = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.id == empleado_id
        ).first()
        if emp:
            emp.dias_deuda_vacaciones_ley = restante
            db.commit()

    @staticmethod
    def ensure_periodos_empleado(db: Session, empleado_id: int, año: Optional[int] = None) -> None:
        """Crea o actualiza los periodos de vacaciones (por aniversario) del empleado. Un periodo por cada año cumplido."""
        if año is None:
            año = datetime.now().year
        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.id == empleado_id
        ).first()
        if not empleado or not empleado.fecha_ingreso:
            VacacionesService.liquidar_deuda_vacaciones_ley(db, empleado_id)
            return
        # Incluir aniversarios ya ocurridos en el año en curso (el derecho nace el día del aniversario, LFT)
        anios_max = max(
            _anios_antiguedad(empleado.fecha_ingreso, date(año - 1, 12, 31)),
            _anios_antiguedad(empleado.fecha_ingreso, hoy_mexico()),
        )
        if anios_max < 1:
            VacacionesService.liquidar_deuda_vacaciones_ley(db, empleado_id)
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
            else:
                # Siempre recalcular: evita que quede obsoleto (LFT, TZ de ingreso, o migraciones viejas).
                existente.dias_derecho = dias_derecho
                existente.fecha_limite_goce = fecha_limite
                existente.fecha_aniversario = fecha_aniv
        db.commit()
        VacacionesService.liquidar_deuda_vacaciones_ley(db, empleado_id)

    @staticmethod
    def ensure_periodos_empleados_activos_job(db: Session) -> dict:
        """
        Crea o actualiza periodos LFT para todos los empleados activos con fecha de ingreso.
        Ejecutar una vez al día (scheduler) para que al cumplirse un aniversario exista el periodo
        aunque nadie abra el módulo de vacaciones.
        """
        año = hoy_mexico().year
        rows = (
            db.query(personal_models.Empleado.id)
            .filter(
                personal_models.Empleado.estado == personal_models.EstadoEmpleado.ACTIVO,
                personal_models.Empleado.fecha_ingreso.isnot(None),
            )
            .all()
        )
        procesados = 0
        errores = 0
        for (eid,) in rows:
            try:
                VacacionesService.ensure_periodos_empleado(db, int(eid), año)
                procesados += 1
            except Exception:
                errores += 1
                logger.exception("ensure_periodos_empleado falló empleado_id=%s", eid)
        logger.info(
            "Job periodos vacaciones LFT: total=%s ok=%s errores=%s año=%s",
            len(rows),
            procesados,
            errores,
            año,
        )
        return {"total": len(rows), "procesados": procesados, "errores": errores, "año": año}
    
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
        hoy = hoy_mexico()
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
        # Solo solicitudes que aún esperan al jefe (no las ya aprobadas por jefe: saldo ya descontado).
        solicitudes_pendientes = db.query(models.SolicitudVacaciones).filter(
            and_(
                models.SolicitudVacaciones.empleado_id == empleado_id,
                models.SolicitudVacaciones.estado == models.EstadoSolicitud.PENDIENTE,
            )
        ).all()
        dias_pendientes = sum(s.dias_solicitados for s in solicitudes_pendientes)
        
        def _periodo_a_dict(
            p: models.BalancePeriodoVacaciones,
            *,
            prescrito_por_plazo: bool = False,
        ) -> dict:
            der = Decimal(p.dias_derecho)
            tom = p.dias_tomados or Decimal("0")
            disp_raw = der - tom
            if prescrito_por_plazo:
                disp = Decimal("0")
                hist = max(Decimal("0"), disp_raw)
            else:
                disp = max(Decimal("0"), disp_raw)
                hist = Decimal("0")
            adelanto = float(max(Decimal("0"), -disp_raw))  # consumo por encima del derecho (próximo periodo)
            return {
                "anios_antiguedad": p.anios_antiguedad,
                "dias_derecho": p.dias_derecho,
                "dias_tomados": float(tom),
                "dias_disponibles": float(disp),
                "dias_adelantados": adelanto,
                "fecha_aniversario": p.fecha_aniversario.isoformat() if p.fecha_aniversario else None,
                "fecha_limite_goce": p.fecha_limite_goce.isoformat() if p.fecha_limite_goce else None,
                "prescrito_por_plazo": prescrito_por_plazo,
                "dias_pendientes_historico": float(hist),
            }
        
        periodo_actual = _periodo_a_dict(periodos[0]) if periodos else None
        periodo_anterior = _periodo_a_dict(periodos[1]) if len(periodos) >= 2 else None
        # Con 18 meses por aniversario, a menudo solo queda un periodo "vigente" en el filtro; el año de servicio
        # inmediato anterior sigue siendo útil como referencia (y puede explicar huecos en el saldo).
        if periodo_actual and not periodo_anterior:
            top = periodos[0]
            prev_anios = int(top.anios_antiguedad) - 1
            if prev_anios >= 1:
                prev = (
                    db.query(models.BalancePeriodoVacaciones)
                    .filter(
                        models.BalancePeriodoVacaciones.empleado_id == empleado_id,
                        models.BalancePeriodoVacaciones.anios_antiguedad == prev_anios,
                    )
                    .first()
                )
                if prev is not None:
                    es_prescrito = prev.fecha_limite_goce is None or prev.fecha_limite_goce < hoy
                    periodo_anterior = _periodo_a_dict(prev, prescrito_por_plazo=es_prescrito)
        total_disponibles = sum(
            max(0, float(p.dias_derecho) - float(p.dias_tomados or 0)) for p in periodos
        )
        total_tomados = sum(float(p.dias_tomados or 0) for p in periodos)
        emp_bal = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.id == empleado_id
        ).first()
        debt = Decimal(str(emp_bal.dias_deuda_vacaciones_ley or 0)) if emp_bal else Decimal("0")
        mig = Decimal(str(emp_bal.dias_saldo_migracion_vacaciones or 0)) if emp_bal else Decimal("0")
        total_disp_dec = Decimal(str(round(total_disponibles, 2)))
        saldo_neto = total_disp_dec - debt
        saldo_total_mig = saldo_neto + mig
        return {
            "empleado_id": empleado_id,
            "año": año,
            "periodo_actual": periodo_actual,
            "periodo_anterior": periodo_anterior,
            "dias_disponibles": total_disp_dec,
            "dias_tomados": Decimal(str(round(total_tomados, 2))),
            "dias_pendientes": Decimal(str(dias_pendientes)),
            "fecha_limite_goce": periodo_anterior.get("fecha_limite_goce") if periodo_anterior else (periodo_actual.get("fecha_limite_goce") if periodo_actual else None),
            "dias_deuda_vacaciones_ley": debt,
            "saldo_dias_lft_neto": saldo_neto,
            "dias_saldo_migracion_vacaciones": mig,
            "saldo_total_con_migracion": saldo_total_mig,
        }

    @staticmethod
    def saldo_lft_neto_por_empleados(db: Session, emp_ids: List[int]) -> Dict[int, Decimal]:
        """
        Igual que get_balance_con_periodos: suma de max(0, der−tom) en periodos con
        fecha_limite_goce >= hoy, menos dias_deuda_vacaciones_ley. Puede ser negativo.
        """
        from collections import defaultdict

        if not emp_ids:
            return {}
        ids_u = list({int(x) for x in emp_ids})
        hoy = hoy_mexico()
        disp_por_emp: Dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
        for p in (
            db.query(models.BalancePeriodoVacaciones)
            .filter(
                models.BalancePeriodoVacaciones.empleado_id.in_(ids_u),
                models.BalancePeriodoVacaciones.fecha_limite_goce >= hoy,
            )
            .all()
        ):
            der = Decimal(str(p.dias_derecho))
            tom = p.dias_tomados or Decimal("0")
            disp_por_emp[p.empleado_id] += max(Decimal("0"), der - tom)
        debt_rows = (
            db.query(
                personal_models.Empleado.id,
                personal_models.Empleado.dias_deuda_vacaciones_ley,
            )
            .filter(personal_models.Empleado.id.in_(ids_u))
            .all()
        )
        debt_map = {eid: Decimal(str(d or 0)) for eid, d in debt_rows}
        out: Dict[int, Decimal] = {}
        for eid in ids_u:
            td = disp_por_emp[eid]
            debt = debt_map.get(eid, Decimal("0"))
            total_disp = Decimal(str(round(float(td), 2)))
            out[eid] = total_disp - debt
        return out
    
    @staticmethod
    def _descontar_dias_de_periodos(
        db: Session,
        empleado_id: int,
        dias_a_descontar: Decimal,
        *,
        estrategia: str = "vence_primero",
        permitir_adelanto: bool = False,
        do_commit: bool = True,
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
        hoy = hoy_mexico()
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
        if do_commit:
            db.commit()
        else:
            db.flush()
        return restante

    @staticmethod
    def _descontar_desde_saldo_migracion(
        db: Session,
        empleado_id: int,
        restante: Decimal,
        *,
        do_commit: bool = True,
    ) -> Decimal:
        """
        Descuenta hasta `restante` desde dias_saldo_migracion_vacaciones (no altera periodos LFT).
        Devuelve días que aún faltaron por descontar.
        """
        restante = Decimal(str(restante))
        if restante <= 0:
            return Decimal("0")
        emp = (
            db.query(personal_models.Empleado)
            .filter(personal_models.Empleado.id == empleado_id)
            .first()
        )
        if not emp:
            return restante
        mig = max(Decimal("0"), Decimal(str(emp.dias_saldo_migracion_vacaciones or 0)))
        usar = min(restante, mig)
        emp.dias_saldo_migracion_vacaciones = mig - usar
        if do_commit:
            db.commit()
        else:
            db.flush()
        return restante - usar
    
    @staticmethod
    def _aplicar_descuento_solicitud_confirmada(
        db: Session,
        solicitud: models.SolicitudVacaciones,
        *,
        do_commit: bool = False,
    ) -> None:
        """
        Descuenta periodos LFT + bolsa de migración y suma a balance anual `dias_tomados`.
        Usar al aprobar el jefe (saldo real). Sin cambiar el estado de la solicitud.
        """
        dias_aprob = Decimal(str(solicitud.dias_solicitados))
        restante = VacacionesService._descontar_dias_de_periodos(
            db,
            solicitud.empleado_id,
            dias_aprob,
            estrategia="vence_primero",
            permitir_adelanto=False,
            do_commit=False,
        )
        restante = VacacionesService._descontar_desde_saldo_migracion(
            db, solicitud.empleado_id, restante, do_commit=False
        )
        if restante > 0:
            raise ValueError(
                "No hay días suficientes en periodos LFT ni en saldo de migración para confirmar esta solicitud. "
                "Es posible que el saldo haya cambiado desde que el colaborador solicitó."
            )
        balance = VacacionesService.get_or_create_balance(db, solicitud.empleado_id)
        balance.dias_tomados = (balance.dias_tomados or Decimal("0")) + Decimal(
            str(solicitud.dias_solicitados)
        )
        if do_commit:
            db.commit()
        else:
            db.flush()
    
    @staticmethod
    def aplicar_prescription_si_corresponde(db: Session, balance: models.BalanceVacaciones) -> None:
        """Si pasó la fecha límite de goce, los días disponibles se consideran prescritos (se ponen en 0)."""
        limite = VacacionesService.fecha_limite_goce_balance(db, balance.empleado_id, balance.año)
        if limite is None or balance.dias_disponibles is None or balance.dias_disponibles <= 0:
            return
        hoy = hoy_mexico()
        if hoy > limite:
            balance.dias_disponibles = Decimal("0")
            db.commit()
    
    @staticmethod
    def dias_derecho_empleado(db: Session, empleado_id: int, año: Optional[int] = None) -> dict:
        """
        Días de vacaciones que corresponden a un empleado por antigüedad (LFT México).
        Útil al dar de alta o para mostrar en balance.

        La antigüedad se mide a una fecha de referencia coherente con ensure_periodos:
        - Año en curso: hasta hoy (México), para contar aniversarios ya ocurridos en el año.
        - Años pasados: al 31/12 de ese año.
        - Años futuros: al 31/12 de ese año (proyección al cierre del ejercicio).
        """
        if año is None:
            año = datetime.now().year
        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.id == empleado_id
        ).first()
        if not empleado:
            return {"anios_antiguedad": 0, "dias_derecho": 0, "fecha_limite_goce": None}
        hoy = hoy_mexico()
        if año < hoy.year:
            fecha_ref = date(año, 12, 31)
        elif año == hoy.year:
            fecha_ref = hoy
        else:
            fecha_ref = date(año, 12, 31)
        anios = _anios_antiguedad(empleado.fecha_ingreso, fecha_ref)
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
        Retorna (días disponibles netos para solicitar, días ya reservados).
        Disponible = suma periodos vigentes menos adeudo por vacaciones generales sin periodo,
        más dias_saldo_migracion_vacaciones (bolsa fuera de LFT).
        dias_ya_reservados = solo solicitudes PENDIENTE (esperando al jefe). Las APROBADA_JEFE ya descontaron saldo.
        """
        VacacionesService.ensure_periodos_empleado(db, empleado_id)
        hoy = hoy_mexico()
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
                models.SolicitudVacaciones.estado == models.EstadoSolicitud.PENDIENTE,
            )
        ).all()
        dias_reservados = sum(Decimal(str(s.dias_solicitados)) for s in solicitudes_reservadas)
        emp = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.id == empleado_id
        ).first()
        debt = Decimal(str(emp.dias_deuda_vacaciones_ley or 0)) if emp else Decimal("0")
        mig = Decimal(str(emp.dias_saldo_migracion_vacaciones or 0)) if emp else Decimal("0")
        total_disponibles = total_disponibles - debt + mig
        return total_disponibles, dias_reservados

    @staticmethod
    def create_solicitud(db: Session, solicitud: schemas.SolicitudVacacionesCreate) -> models.SolicitudVacaciones:
        """Crear nueva solicitud de vacaciones"""
        # No permitir solicitar vacaciones para días ya pasados (solo desde la fecha actual en adelante)
        inicio_date = solicitud.fecha_inicio.date()
        if inicio_date < hoy_mexico():
            raise ValueError("No se pueden solicitar vacaciones para días ya pasados. La fecha de inicio debe ser hoy o una fecha futura.")

        # Validar que el empleado existe
        empleado = db.query(personal_models.Empleado).filter(
            personal_models.Empleado.id == solicitud.empleado_id
        ).first()
        if not empleado:
            raise ValueError("Empleado no encontrado")
        if getattr(empleado, "exento_incidencias", False):
            raise ValueError("Los usuarios especiales no pueden solicitar vacaciones.")

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
            raise ValueError(
                "No tienes días disponibles para solicitar. Tu saldo total (LFT neto + migración) es 0 o negativo, "
                "o ya tienes solicitudes pendientes que consumen todos tus días (incluye adeudo por vacaciones de ley si aplica)."
            )
        if dias_solicitados > dias_poder_solicitar:
            raise ValueError(
                f"No puedes solicitar más de {int(dias_poder_solicitar)} días. "
                f"Tienes {int(total_disponibles)} días disponibles netos (LFT + migración) y ya tienes {int(dias_reservados)} días en solicitudes pendientes."
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
            estado=models.EstadoSolicitud.PENDIENTE,
            aceptacion_solicitante_at=getattr(solicitud, "aceptacion_solicitante_at", None),
            aceptacion_solicitante_ip=getattr(solicitud, "aceptacion_solicitante_ip", None),
            aceptacion_solicitante_texto=getattr(solicitud, "aceptacion_solicitante_texto", None),
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
            joinedload(models.SolicitudVacaciones.jefe_aprobador).joinedload(
                personal_models.Empleado.puesto_rel
            ),
            joinedload(models.SolicitudVacaciones.empleado).joinedload(
                personal_models.Empleado.puesto_rel
            ),
            joinedload(models.SolicitudVacaciones.empleado).joinedload(
                personal_models.Empleado.departamento_rel
            ),
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
        departamento_id: Optional[int] = None,
    ) -> List[models.SolicitudVacaciones]:
        """Listar solicitudes con filtros. departamento_id: filtra por departamento del solicitante (uso típico: admin Mi Área)."""
        query = db.query(models.SolicitudVacaciones).options(
            joinedload(models.SolicitudVacaciones.jefe_aprobador).joinedload(
                personal_models.Empleado.puesto_rel
            ),
            joinedload(models.SolicitudVacaciones.empleado).joinedload(
                personal_models.Empleado.puesto_rel
            ),
            joinedload(models.SolicitudVacaciones.empleado).joinedload(
                personal_models.Empleado.departamento_rel
            ),
        )
        joined_empleado = False
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
            joined_empleado = True
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

        if departamento_id is not None:
            if not joined_empleado:
                query = query.join(personal_models.Empleado, models.SolicitudVacaciones.empleado_id == personal_models.Empleado.id)
            query = query.filter(personal_models.Empleado.departamento_id == departamento_id)

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
        departamento_ids_que_administro: Optional[list] = None,
        aceptacion_jefe_at=None,
        aceptacion_jefe_ip: Optional[str] = None,
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
            if solicitante_es_gerente:
                # Las vacaciones de gerentes solo las aprueba Director, Gerente General o Superadmin
                if not es_gerente_o_director:
                    raise ValueError(
                        "Las vacaciones de gerentes solo las puede aprobar el Director, Gerente General o Administrador."
                    )
            elif solicitante_es_supervisor:
                # Las vacaciones de supervisores las puede aprobar el GERENTE del área, Director, Gerente General o Superadmin
                # (un supervisor NO puede aprobar las vacaciones de otro supervisor)
                if not es_gerente_o_director:
                    gerentes_area = personal_service.PersonalService.get_ids_gerentes_area(
                        db, empleado.departamento_id if empleado else None
                    )
                    if jefe_id not in gerentes_area and solicitud.jefe_aprobador_id != jefe_id:
                        raise ValueError(
                            "Las vacaciones de supervisores las puede aprobar el gerente del área, Director o Gerente General."
                        )
            elif es_gerente_o_director:
                # Director y Gerente General: aprueban solo gerentes/supervisores (ya manejados arriba).
                # Gerente General además aprueba empleados de su propia área.
                if es_gerente_general and departamento_ids_que_administro and empleado and empleado.departamento_id and empleado.departamento_id in departamento_ids_que_administro:
                    pass  # Gerente General aprueba empleados de su área
                else:
                    raise ValueError("Solo puedes aprobar vacaciones de gerentes y supervisores. Las de empleados regulares las aprueba el gerente de su área.")
            else:
                # Empleado regular: gerente o supervisor del área puede aprobar
                aprobadores = personal_service.PersonalService.get_ids_aprobadores_area(db, empleado.departamento_id if empleado else None)
                if jefe_id not in aprobadores and solicitud.jefe_aprobador_id != jefe_id:
                    raise ValueError("No tienes permisos para aprobar esta solicitud")
        
        # Verificar que está pendiente
        if solicitud.estado != models.EstadoSolicitud.PENDIENTE:
            raise ValueError("La solicitud ya fue procesada")
        
        # Aprobación de jefe: descuenta saldo LFT/migración de inmediato; RH solo registra confirmación formal.
        if aprobar:
            try:
                VacacionesService._aplicar_descuento_solicitud_confirmada(db, solicitud, do_commit=False)
            except ValueError:
                db.rollback()
                raise
            solicitud.estado = models.EstadoSolicitud.APROBADA_JEFE
        else:
            solicitud.estado = models.EstadoSolicitud.RECHAZADA
        
        solicitud.jefe_aprobador_id = jefe_id
        solicitud.fecha_aprobacion = datetime.now(timezone.utc)
        solicitud.comentarios_aprobacion = comentarios
        if aceptacion_jefe_at is not None:
            solicitud.aceptacion_jefe_at = aceptacion_jefe_at
            solicitud.aceptacion_jefe_ip = aceptacion_jefe_ip
        
        VacacionesService._actualizar_balance_pendientes(db, solicitud.empleado_id, do_commit=False)
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
        aceptacion_rh_at=None,
        aceptacion_rh_ip: Optional[str] = None,
    ) -> models.SolicitudVacaciones:
        """
        Registro formal de RH: el saldo ya se descontó al aprobar el jefe.
        Solo pasa a APROBADA (sin volver a descontar). Idempotente si ya estaba APROBADA.
        """
        solicitud = db.query(models.SolicitudVacaciones).filter(
            models.SolicitudVacaciones.id == solicitud_id
        ).first()
        if not solicitud:
            raise ValueError("Solicitud no encontrada")
        if solicitud.estado == models.EstadoSolicitud.APROBADA:
            return solicitud
        if solicitud.estado != models.EstadoSolicitud.APROBADA_JEFE:
            raise ValueError("La solicitud no está en estado 'aprobada por jefe' — no puede ser procesada por RH")

        solicitud.estado = models.EstadoSolicitud.APROBADA
        solicitud.rh_confirmador_id = aprobador_id
        if aceptacion_rh_at is not None:
            solicitud.aceptacion_rh_at = aceptacion_rh_at
            solicitud.aceptacion_rh_ip = aceptacion_rh_ip

        if comentarios:
            prev = solicitud.comentarios_aprobacion or ""
            solicitud.comentarios_aprobacion = (prev + f"\n[RH] {comentarios}").strip() if prev else f"[RH] {comentarios}"

        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        db.refresh(solicitud)
        return solicitud

    @staticmethod
    def auto_confirmar_rh_si_plazo_24h(db: Session) -> dict:
        """
        Si RH no registra confirmación formal, pasa APROBADA_JEFE → APROBADA cuando
        la hora actual (UTC) ya alcanzó 24 h antes de fecha_inicio de la solicitud.
        """
        from datetime import timezone as tz

        now = datetime.now(tz.utc)
        rows = (
            db.query(models.SolicitudVacaciones)
            .filter(models.SolicitudVacaciones.estado == models.EstadoSolicitud.APROBADA_JEFE)
            .all()
        )
        n = 0
        for sol in rows:
            fi = sol.fecha_inicio
            if fi is None:
                continue
            if fi.tzinfo is None:
                fi = fi.replace(tzinfo=tz.utc)
            fi_utc = fi.astimezone(tz.utc)
            if now < fi_utc - timedelta(hours=24):
                continue
            sol.estado = models.EstadoSolicitud.APROBADA
            prev = sol.comentarios_aprobacion or ""
            marca = "[RH] Confirmación automática (24 h antes del inicio; registro formal)."
            sol.comentarios_aprobacion = f"{prev}\n{marca}".strip() if prev else marca
            n += 1
        if n:
            db.commit()
        return {"auto_confirmadas": n, "candidatas": len(rows)}

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
        VacacionesService._actualizar_balance_pendientes(db, empleado_id, do_commit=False)
        db.commit()
        db.refresh(solicitud)
        return solicitud

    @staticmethod
    def _actualizar_balance_pendientes(db: Session, empleado_id: int, do_commit: bool = True):
        """Sincroniza `balance_vacaciones.dias_pendientes` con solicitudes PENDIENTE (esperando al jefe)."""
        balance = VacacionesService.get_or_create_balance(db, empleado_id)
        
        solicitudes_pendientes = db.query(models.SolicitudVacaciones).filter(
            and_(
                models.SolicitudVacaciones.empleado_id == empleado_id,
                models.SolicitudVacaciones.estado == models.EstadoSolicitud.PENDIENTE,
            )
        ).all()
        
        total_pendientes = sum(s.dias_solicitados for s in solicitudes_pendientes)
        balance.dias_pendientes = Decimal(str(total_pendientes))
        if do_commit:
            db.commit()
        else:
            db.flush()
    
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

    @staticmethod
    def aplicar_saldo_migracion_vacaciones_admin(
        db: Session,
        empleado_id: int,
        dias_objetivo: Decimal,
        *,
        do_commit: bool = True,
    ) -> None:
        """
        Fija dias_saldo_migracion_vacaciones (≥ 0). No altera periodos LFT; sirve para carga única de saldo heredado.
        """
        v = max(Decimal("0"), Decimal(str(dias_objetivo)))
        emp = (
            db.query(personal_models.Empleado)
            .filter(personal_models.Empleado.id == empleado_id)
            .first()
        )
        if not emp:
            raise ValueError("Empleado no encontrado")
        emp.dias_saldo_migracion_vacaciones = v
        if do_commit:
            db.commit()

    @staticmethod
    def aplicar_saldo_lft_neto_import(
        db: Session,
        empleado_id: int,
        saldo_neto_objetivo: Decimal,
        *,
        do_commit: bool = True,
    ) -> None:
        """
        Iguala el saldo LFT neto (como en Mi Vacaciones) al valor objetivo.
        Misma lógica que el import masivo de personal (columna saldo LFT neto).
        """
        valor = Decimal(str(saldo_neto_objetivo))
        VacacionesService.ensure_periodos_empleado(db, empleado_id)
        emp = db.query(personal_models.Empleado).filter(personal_models.Empleado.id == empleado_id).first()
        if not emp:
            raise ValueError("Empleado no encontrado")

        hoy = hoy_mexico()
        periodos = (
            db.query(models.BalancePeriodoVacaciones)
            .filter(
                models.BalancePeriodoVacaciones.empleado_id == empleado_id,
                models.BalancePeriodoVacaciones.fecha_limite_goce >= hoy,
            )
            .order_by(models.BalancePeriodoVacaciones.fecha_limite_goce.asc())
            .all()
        )

        if valor < 0:
            for p in periodos:
                p.dias_tomados = Decimal(str(p.dias_derecho or 0))
            emp.dias_deuda_vacaciones_ley = -valor
            if do_commit:
                db.commit()
            return

        emp.dias_deuda_vacaciones_ley = Decimal("0")
        if not periodos:
            if valor > 0:
                raise ValueError("El empleado aún no tiene periodos vigentes para asignar vacaciones")
            if do_commit:
                db.commit()
            return

        total_derecho = sum(Decimal(str(p.dias_derecho or 0)) for p in periodos)
        if valor > total_derecho:
            raise ValueError(
                f"Saldo LFT neto ({valor}) no puede exceder el derecho vigente ({total_derecho})"
            )

        dias_tomados_total = total_derecho - valor
        restante = dias_tomados_total
        for p in periodos:
            derecho = Decimal(str(p.dias_derecho or 0))
            tomar = min(restante, derecho)
            p.dias_tomados = tomar
            restante -= tomar
        if do_commit:
            db.commit()

    # --- Vacaciones generales (empresa / departamento / global) ---

    @staticmethod
    def listar_empleados_ids_alcance(
        db: Session,
        alcance: str,
        empresa_id: Optional[int],
        departamento_id: Optional[int],
        empresa_excluida_id: Optional[int] = None,
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
        if empresa_excluida_id is not None:
            q = q.filter(personal_models.Empleado.empresa_id != empresa_excluida_id)
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
        if data.empresa_excluida_id is not None:
            ex = db.query(personal_models.Empresa).filter(
                personal_models.Empresa.id == data.empresa_excluida_id
            ).first()
            if not ex:
                raise ValueError("empresa_excluida_id no corresponde a una empresa existente")
        vg = models.VacacionGeneral(
            nombre=data.nombre.strip(),
            fecha_inicio=data.fecha_inicio,
            fecha_fin=data.fecha_fin,
            alcance=a,
            empresa_id=data.empresa_id,
            departamento_id=data.departamento_id,
            empresa_excluida_id=data.empresa_excluida_id,
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
    def conteos_aplicaciones_vacaciones_generales(db: Session, vacacion_ids: List[int]) -> Dict[int, int]:
        if not vacacion_ids:
            return {}
        rows = (
            db.query(
                models.VacacionGeneralAplicacion.vacacion_general_id,
                func.count(models.VacacionGeneralAplicacion.id),
            )
            .filter(models.VacacionGeneralAplicacion.vacacion_general_id.in_(vacacion_ids))
            .group_by(models.VacacionGeneralAplicacion.vacacion_general_id)
            .all()
        )
        return {int(vid): int(c) for vid, c in rows}

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
            db,
            vg.alcance,
            vg.empresa_id,
            vg.departamento_id,
            vg.empresa_excluida_id,
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
                omitidos.append(
                    {
                        "empleado_id": eid,
                        "motivo": "ya_aplicada",
                        **_contexto_empleado_vacacion_general(db, eid),
                    }
                )
                continue
            try:
                VacacionesService.ensure_periodos_empleado(db, eid)
                periodos_count = (
                    db.query(models.BalancePeriodoVacaciones)
                    .filter(
                        models.BalancePeriodoVacaciones.empleado_id == eid,
                        models.BalancePeriodoVacaciones.fecha_limite_goce >= hoy_mexico(),
                    )
                    .count()
                )
                if ley > 0 and periodos_count == 0:
                    emp = db.query(personal_models.Empleado).filter(
                        personal_models.Empleado.id == eid
                    ).first()
                    if not emp:
                        errores.append(
                            {
                                "empleado_id": eid,
                                "error": "Empleado no encontrado",
                                **_contexto_empleado_vacacion_general(db, eid),
                            }
                        )
                        continue
                    emp.dias_deuda_vacaciones_ley = (
                        Decimal(str(emp.dias_deuda_vacaciones_ley or 0)) + ley
                    )
                    ap = models.VacacionGeneralAplicacion(
                        vacacion_general_id=vg.id,
                        empleado_id=eid,
                        dias_ley_descontados=ley,
                        dias_regalo=regalo,
                    )
                    db.add(ap)
                    db.commit()
                    aplicados.append(eid)
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
                    restante = VacacionesService._descontar_desde_saldo_migracion(db, eid, restante)
                if ley > 0 and restante > 0:
                    emp = db.query(personal_models.Empleado).filter(
                        personal_models.Empleado.id == eid
                    ).first()
                    if emp:
                        emp.dias_deuda_vacaciones_ley = (
                            Decimal(str(emp.dias_deuda_vacaciones_ley or 0)) + restante
                        )
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
                errores.append(
                    {
                        "empleado_id": eid,
                        "error": str(ex),
                        **_contexto_empleado_vacacion_general(db, eid),
                    }
                )

        return {
            "vacacion_general_id": vg.id,
            "empleados_totales": len(empleados_ids),
            "aplicados": len(aplicados),
            "omitidos": omitidos,
            "errores": errores,
        }
