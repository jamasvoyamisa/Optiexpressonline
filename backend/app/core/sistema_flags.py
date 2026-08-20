from typing import Optional

from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, func
from sqlalchemy.orm import Session

from app.core.database import Base

FLAG_VACACIONES_PDF_FIRMADO = "vacaciones_pdf_firmado"
FLAG_PRESTAMOS_PDF_FIRMADO = "prestamos_pdf_firmado"


class SistemaFlag(Base):
    __tablename__ = "sistema_flags"

    clave = Column(String(64), primary_key=True)
    valor = Column(String(32), nullable=False, default="0")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)


def get_flag_bool(db: Session, clave: str, default: bool = False) -> bool:
    row = db.query(SistemaFlag).filter(SistemaFlag.clave == clave).first()
    if not row:
        return default
    v = (row.valor or "").strip().lower()
    return v in ("1", "true", "yes", "si", "sí", "on")


def set_flag_bool(
    db: Session,
    clave: str,
    enabled: bool,
    updated_by_id: Optional[int] = None,
) -> bool:
    row = db.query(SistemaFlag).filter(SistemaFlag.clave == clave).first()
    valor = "1" if enabled else "0"
    if not row:
        row = SistemaFlag(clave=clave, valor=valor, updated_by_id=updated_by_id)
        db.add(row)
    else:
        row.valor = valor
        row.updated_by_id = updated_by_id
    db.commit()
    db.refresh(row)
    return enabled


def vacaciones_pdf_firmado_habilitado(db: Session) -> bool:
    return get_flag_bool(db, FLAG_VACACIONES_PDF_FIRMADO, default=False)


def prestamos_pdf_firmado_habilitado(db: Session) -> bool:
    return get_flag_bool(db, FLAG_PRESTAMOS_PDF_FIRMADO, default=False)
