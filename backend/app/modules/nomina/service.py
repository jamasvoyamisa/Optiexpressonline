"""Lógica de negocio para el módulo de Nómina (Fase 1)."""
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session

from sqlalchemy.exc import IntegrityError

from app.modules.personal.models import Empresa

from .models import (
    EmpresaNominaConfig,
    EmpleadoNomina,
    PeriodoNomina,
    DetalleNominaEmpleado,
    PeriodoEstado,
    PeriodoTipo,
)
from .catalogs import (
    TIPOS_CONTRATO, TIPOS_REGIMEN, TIPOS_PERCEPCION,
    TIPOS_DEDUCCION, BANCOS, ENTIDADES_FEDERATIVAS,
    RIESGOS_PUESTO, TIPOS_JORNADA, PERIODICIDAD_PAGO,
)


class NominaService:

    # ── Catálogos ─────────────────────────────────────────────────────────

    @staticmethod
    def get_catalogos() -> dict:
        def to_list(d: dict) -> list:
            return [{"clave": k, "descripcion": v} for k, v in d.items()]
        return {
            "tipos_contrato": to_list(TIPOS_CONTRATO),
            "tipos_regimen": to_list(TIPOS_REGIMEN),
            "tipos_percepcion": to_list(TIPOS_PERCEPCION),
            "tipos_deduccion": to_list(TIPOS_DEDUCCION),
            "bancos": to_list(BANCOS),
            "entidades_federativas": to_list(ENTIDADES_FEDERATIVAS),
            "riesgos_puesto": to_list(RIESGOS_PUESTO),
            "tipos_jornada": to_list(TIPOS_JORNADA),
            "periodicidad_pago": to_list(PERIODICIDAD_PAGO),
        }

    # ── Configuración empresa ──────────────────────────────────────────────

    @staticmethod
    def get_config_empresa(db: Session, empresa_id: int) -> Optional[EmpresaNominaConfig]:
        return db.query(EmpresaNominaConfig).filter(
            EmpresaNominaConfig.empresa_id == empresa_id
        ).first()

    @staticmethod
    def upsert_config_empresa(db: Session, empresa_id: int, data: dict) -> EmpresaNominaConfig:
        cfg = db.query(EmpresaNominaConfig).filter(
            EmpresaNominaConfig.empresa_id == empresa_id
        ).first()
        if cfg is None:
            cfg = EmpresaNominaConfig(empresa_id=empresa_id)
            db.add(cfg)
        for k, v in data.items():
            if hasattr(cfg, k):
                setattr(cfg, k, v)
        db.commit()
        db.refresh(cfg)
        return cfg

    # ── Datos empleado ─────────────────────────────────────────────────────

    @staticmethod
    def get_datos_empleado(db: Session, empleado_id: int) -> Optional[EmpleadoNomina]:
        return db.query(EmpleadoNomina).filter(
            EmpleadoNomina.empleado_id == empleado_id
        ).first()

    @staticmethod
    def upsert_datos_empleado(db: Session, empleado_id: int, data: dict) -> EmpleadoNomina:
        en = db.query(EmpleadoNomina).filter(
            EmpleadoNomina.empleado_id == empleado_id
        ).first()
        if en is None:
            en = EmpleadoNomina(empleado_id=empleado_id)
            db.add(en)
        for k, v in data.items():
            if hasattr(en, k):
                setattr(en, k, v)
        db.commit()
        db.refresh(en)
        return en

    @staticmethod
    def listar_datos_empleados(
        db: Session,
        empresa_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[EmpleadoNomina], int]:
        from app.modules.personal.models import Empleado
        q = db.query(EmpleadoNomina).join(
            Empleado, Empleado.id == EmpleadoNomina.empleado_id
        )
        if empresa_id is not None:
            q = q.filter(Empleado.empresa_id == empresa_id)
        total = q.count()
        items = q.order_by(EmpleadoNomina.id).offset(skip).limit(limit).all()
        return items, total

    # ── Periodos ───────────────────────────────────────────────────────────

    @staticmethod
    def crear_periodo(db: Session, data: dict, creado_por: int) -> PeriodoNomina:
        empresa_id = int(data["empresa_id"])
        if db.query(Empresa.id).filter(Empresa.id == empresa_id).first() is None:
            raise ValueError("La empresa indicada no existe.")

        tipo_raw = data.get("tipo") or "O"
        try:
            tipo = PeriodoTipo(tipo_raw) if isinstance(tipo_raw, str) else tipo_raw
        except ValueError:
            tipo = PeriodoTipo.ORDINARIA

        per = (data.get("periodicidad") or "").strip() or None
        if per is not None and len(per) > 2:
            per = per[:2]

        periodo = PeriodoNomina(
            empresa_id=empresa_id,
            fecha_inicio=data["fecha_inicio"],
            fecha_fin=data["fecha_fin"],
            tipo=tipo,
            periodicidad=per,
            notas=data.get("notas"),
            created_by=creado_por,
        )
        db.add(periodo)
        try:
            db.commit()
        except IntegrityError as e:
            db.rollback()
            raise ValueError("No se pudo crear el periodo (datos inválidos o empresa inexistente).") from e
        db.refresh(periodo)
        return periodo

    @staticmethod
    def listar_periodos(
        db: Session,
        empresa_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[PeriodoNomina], int]:
        q = db.query(PeriodoNomina)
        if empresa_id is not None:
            q = q.filter(PeriodoNomina.empresa_id == empresa_id)
        total = q.count()
        items = q.order_by(PeriodoNomina.fecha_inicio.desc()).offset(skip).limit(limit).all()
        return items, total

    @staticmethod
    def get_periodo(db: Session, periodo_id: int) -> Optional[PeriodoNomina]:
        return db.query(PeriodoNomina).filter(PeriodoNomina.id == periodo_id).first()

    @staticmethod
    def actualizar_periodo(db: Session, periodo_id: int, data: dict) -> Optional[PeriodoNomina]:
        periodo = db.query(PeriodoNomina).filter(PeriodoNomina.id == periodo_id).first()
        if not periodo:
            return None
        for k, v in data.items():
            if v is not None and hasattr(periodo, k):
                setattr(periodo, k, v)
        db.commit()
        db.refresh(periodo)
        return periodo

    @staticmethod
    def eliminar_periodo(db: Session, periodo_id: int) -> bool:
        periodo = db.query(PeriodoNomina).filter(PeriodoNomina.id == periodo_id).first()
        if not periodo or periodo.estado != PeriodoEstado.BORRADOR:
            return False
        db.delete(periodo)
        db.commit()
        return True

    # ── Detalles de periodo ────────────────────────────────────────────────

    @staticmethod
    def agregar_empleado_a_periodo(
        db: Session,
        periodo_id: int,
        empleado_id: int,
        data: dict,
    ) -> DetalleNominaEmpleado:
        detalle = db.query(DetalleNominaEmpleado).filter(
            DetalleNominaEmpleado.periodo_nomina_id == periodo_id,
            DetalleNominaEmpleado.empleado_id == empleado_id,
        ).first()
        if detalle is None:
            detalle = DetalleNominaEmpleado(periodo_nomina_id=periodo_id, empleado_id=empleado_id)
            db.add(detalle)
        for k, v in data.items():
            if hasattr(detalle, k):
                setattr(detalle, k, v)
        db.commit()
        db.refresh(detalle)
        return detalle

    @staticmethod
    def listar_detalles_periodo(
        db: Session, periodo_id: int
    ) -> List[DetalleNominaEmpleado]:
        return (
            db.query(DetalleNominaEmpleado)
            .filter(DetalleNominaEmpleado.periodo_nomina_id == periodo_id)
            .all()
        )
