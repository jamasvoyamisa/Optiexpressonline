"""Resolución de reglas de checada especial por empleado y fecha (México)."""
from datetime import date
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.modules.asistencia import models as asistencia_models
from app.modules.personal import models as personal_models


def _norm_ids(val) -> List[int]:
    if not val:
        return []
    if isinstance(val, list):
        return [int(x) for x in val if x is not None]
    return []


def empleado_aplica_checada_especial(
    ce: asistencia_models.ChecadaEspecial, emp: personal_models.Empleado
) -> bool:
    """True si la regla aplica a este empleado (empresa / exclusiones / legacy)."""
    if not emp:
        return False
    eid = emp.empresa_id
    excl = _norm_ids(ce.empresas_excluidas)
    if eid is not None and eid in excl:
        return False

    if ce.empresas_incluidas is not None:
        incl = _norm_ids(ce.empresas_incluidas)
        if len(incl) == 0:
            return eid is not None
        if eid is None:
            return False
        return eid in incl

    # Reglas antiguas (alcance / empresa / departamento)
    a = (ce.alcance or "").strip().lower()
    if a == "global":
        return True
    if a == "empresa" and ce.empresa_id is not None and ce.empresa_id == eid:
        return True
    if (
        a == "departamento"
        and ce.departamento_id is not None
        and ce.departamento_id == emp.departamento_id
    ):
        return True
    return False


def obtener_checada_especial_vigente(
    db: Session, empleado_id: int, fecha: date
) -> Optional[asistencia_models.ChecadaEspecial]:
    emp = (
        db.query(personal_models.Empleado)
        .filter(personal_models.Empleado.id == empleado_id)
        .first()
    )
    if not emp:
        return None
    rows = (
        db.query(asistencia_models.ChecadaEspecial)
        .filter(
            asistencia_models.ChecadaEspecial.activo == True,
            asistencia_models.ChecadaEspecial.fecha_inicio <= fecha,
            asistencia_models.ChecadaEspecial.fecha_fin >= fecha,
        )
        .all()
    )
    candidates: list[asistencia_models.ChecadaEspecial] = []
    for row in rows:
        if empleado_aplica_checada_especial(row, emp):
            candidates.append(row)
    if not candidates:
        return None
    return max(candidates, key=lambda r: r.id)


def tiempos_incidencia_entrada_salida(
    db: Session,
    empleado_id: int,
    ts_mex,
    horario_lv: asistencia_models.Horario,
    empleado: personal_models.Empleado,
) -> Tuple[Optional[str], Optional[str], int]:
    """
    Hora entrada, hora salida y tolerancia efectivas para retardo / salida anticipada.

    Devuelve (None, None, 0) cuando el empleado NO labora ese día
    (p. ej. sábado sin horario sabatino configurado, domingo fuera de lun-dom).
    """
    fecha = ts_mex.date()
    wd = fecha.weekday()
    ce = obtener_checada_especial_vigente(db, empleado_id, fecha)

    h_ent: Optional[str] = horario_lv.hora_entrada
    h_sal: Optional[str] = horario_lv.hora_salida
    tol = horario_lv.tolerancia_minutos or 0

    # ── Sábado (wd == 5) ──
    # Prioridad:
    #   1. EmpleadoHorario.hora_salida_sabado == "" → NO trabaja sábado (Personal desmarcado).
    #   2. EmpleadoHorario.hora_salida_sabado con hora → override de salida.
    #   3. empleado.horario_sabado_id → horario separado (legacy).
    #   4. horario_lv.hora_salida_sabado → hereda del horario L-V (p. ej. General).
    # Si ninguno aplica (y no hay checada especial), no hay incidencia sabatina.
    if wd == 5:
        trabaja_sabado = False
        eh = (
            db.query(asistencia_models.EmpleadoHorario)
            .filter(
                asistencia_models.EmpleadoHorario.empleado_id == empleado_id,
                asistencia_models.EmpleadoHorario.activo == True,
            )
            .first()
        )
        ov = getattr(eh, "hora_salida_sabado", None) if eh else None
        if ov is not None and str(ov).strip() == "":
            ce_define_sabado = bool(
                ce and (ce.hora_salida_sabado or ce.hora_entrada_sabado or ce.hora_salida or ce.hora_entrada)
            )
            if not ce_define_sabado:
                return None, None, 0
        elif ov is not None and str(ov).strip():
            h_sal = str(ov).strip()
            trabaja_sabado = True
        elif empleado and empleado.horario_sabado_id:
            hs = (
                db.query(asistencia_models.Horario)
                .filter(
                    asistencia_models.Horario.id == empleado.horario_sabado_id,
                    asistencia_models.Horario.activo == True,
                )
                .first()
            )
            if hs:
                h_ent = hs.hora_entrada
                h_sal = hs.hora_salida_sabado or hs.hora_salida
                tol = hs.tolerancia_minutos or 0
                trabaja_sabado = True
        elif getattr(horario_lv, "hora_salida_sabado", None):
            h_sal = horario_lv.hora_salida_sabado
            trabaja_sabado = True

        ce_define_sabado = bool(
            ce and (ce.hora_salida_sabado or ce.hora_entrada_sabado or ce.hora_salida or ce.hora_entrada)
        )
        if not trabaja_sabado and not ce_define_sabado:
            return None, None, 0

    # ── Domingo (wd == 6) ──
    if wd == 6:
        dias_lab = "lun-sab"
        if empleado and empleado.empresa:
            dias_lab = (empleado.empresa.dias_laborales or "lun-sab").strip().lower()
        if dias_lab == "lun-dom":
            gestiona = bool(getattr(empleado.empresa, "gestiona_descansos_rotativos", False)) if empleado.empresa else False
            if gestiona and horario_lv.dias_semana:
                dias_ok = [int(d.strip()) for d in horario_lv.dias_semana.split(",") if d.strip().isdigit()]
                if dias_ok and 7 not in dias_ok and not ce:
                    return None, None, 0
            h_ent = horario_lv.hora_entrada
            h_sal = horario_lv.hora_salida
            tol = horario_lv.tolerancia_minutos or 0
        elif not ce:
            return None, None, 0

    # ── Checada especial (override final) ──
    if ce:
        if ce.tolerancia_minutos is not None:
            tol = ce.tolerancia_minutos
        if wd == 5:
            if ce.hora_entrada_sabado:
                h_ent = ce.hora_entrada_sabado
            elif ce.hora_entrada:
                h_ent = ce.hora_entrada
            if ce.hora_salida_sabado:
                h_sal = ce.hora_salida_sabado
            elif ce.hora_salida:
                h_sal = ce.hora_salida
        else:
            if ce.hora_entrada:
                h_ent = ce.hora_entrada
            if ce.hora_salida:
                h_sal = ce.hora_salida

    return h_ent, h_sal, tol
