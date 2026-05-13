"""Backfill: quitar es_tiempo_extra erróneo en domingos lun-dom y festivos con trabaja_festivos

Revision ID: t4u5v6w7x8y9
Revises: c9d0e1f2g3h4
Create Date: 2026-05-04

Antes, toda checada de domingo se guardaba como tiempo extra. Las empresas con
dias_laborales=lun-dom (y quienes laboran festivos) deben reflejar jornada normal.
"""
from alembic import op

revision = "t4u5v6w7x8y9"
down_revision = "c9d0e1f2g3h4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy.orm import Session, joinedload

    bind = op.get_bind()
    session = Session(bind=bind)
    try:
        from app.core.timezone_utils import to_mexico
        from app.modules.asistencia import models as asistencia_models
        from app.modules.asistencia.service import AsistenciaService
        from app.modules.personal import models as personal_models

        def _calcular_es_tiempo_extra(db, empleado, dia_mex) -> bool:
            es_domingo = dia_mex.weekday() == 6
            if empleado and empleado.empresa:
                emp = empleado.empresa
                dias_lab = (emp.dias_laborales or "lun-sab").strip().lower()
                trabaja_fest = bool(getattr(emp, "trabaja_festivos", False))
            else:
                dias_lab = "lun-sab"
                trabaja_fest = False
            if es_domingo and dias_lab != "lun-dom":
                return True
            if AsistenciaService.es_dia_festivo(db, dia_mex) and not trabaja_fest:
                return True
            return False

        q = (
            session.query(asistencia_models.Asistencia)
            .options(
                joinedload(asistencia_models.Asistencia.empleado).joinedload(
                    personal_models.Empleado.empresa
                )
            )
            .filter(asistencia_models.Asistencia.es_tiempo_extra.is_(True))
        )
        updated = 0
        for a in q.yield_per(500):
            dia_mex = (to_mexico(a.timestamp) or a.timestamp).date()
            if a.es_tiempo_extra and not _calcular_es_tiempo_extra(session, a.empleado, dia_mex):
                a.es_tiempo_extra = False
                updated += 1
        session.commit()
        print(f"[migration t4u5v6w7x8y9] asistencias es_tiempo_extra corregidas (True→False): {updated}")
    finally:
        session.close()


def downgrade() -> None:
    pass
