"""Descuento retroactivo: solicitudes aprobada_jefe antes del cambio de reglas

Revision ID: c9d0e1f2g3h4
Revises: b3c4d5e6f7a8
Create Date: 2026-04-29

Las solicitudes en APROBADA_JEFE no habían descontado periodos LFT hasta confirmación RH.
Al mover el descuento al paso del jefe, se aplican una vez esos descuentos pendientes.
"""
from alembic import op

revision = "c9d0e1f2g3h4"
down_revision = "b3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy.orm import Session

    bind = op.get_bind()
    session = Session(bind=bind)
    try:
        from app.modules.vacaciones.models import SolicitudVacaciones, EstadoSolicitud
        from app.modules.vacaciones.service import VacacionesService

        rows = (
            session.query(SolicitudVacaciones)
            .filter(SolicitudVacaciones.estado == EstadoSolicitud.APROBADA_JEFE)
            .all()
        )
        errs = []
        for sol in rows:
            try:
                VacacionesService._aplicar_descuento_solicitud_confirmada(
                    session, sol, do_commit=False
                )
            except ValueError as e:
                errs.append((sol.id, str(e)))
        for eid in {s.empleado_id for s in rows}:
            VacacionesService._actualizar_balance_pendientes(session, int(eid), do_commit=False)
        session.commit()
        if errs:
            print(f"[migration c9d0e1f2g3h4] Omitidas por saldo insuficiente: {errs}")
    finally:
        session.close()


def downgrade() -> None:
    pass
