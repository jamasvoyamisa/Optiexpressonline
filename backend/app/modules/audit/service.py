import json
import traceback
from typing import Optional, Any, List, Tuple
from sqlalchemy.orm import Session
from .models import ActividadLog


class ActividadService:
    MAX_MSG = 4000
    MAX_CTX = 8000

    @staticmethod
    def registrar(
        db: Session,
        *,
        nivel: str,
        categoria: str,
        mensaje: str,
        contexto: Optional[Any] = None,
        empleado_id: Optional[int] = None,
        ip_cliente: Optional[str] = None,
        metodo_http: Optional[str] = None,
        ruta: Optional[str] = None,
        codigo_http: Optional[int] = None,
        duracion_ms: Optional[int] = None,
    ) -> None:
        if (categoria or "").strip().lower() == "request":
            return
        try:
            ctx_str = None
            if contexto is not None:
                if isinstance(contexto, str):
                    ctx_str = contexto[: ActividadService.MAX_CTX]
                else:
                    ctx_str = json.dumps(contexto, ensure_ascii=False, default=str)[: ActividadService.MAX_CTX]
            row = ActividadLog(
                nivel=nivel[:20],
                categoria=categoria[:40],
                mensaje=(mensaje or "")[: ActividadService.MAX_MSG],
                contexto=ctx_str,
                empleado_id=empleado_id,
                ip_cliente=(ip_cliente or "")[:45] or None,
                metodo_http=(metodo_http or "")[:12] or None,
                ruta=(ruta or "")[:500] or None,
                codigo_http=codigo_http,
                duracion_ms=duracion_ms,
            )
            db.add(row)
            db.commit()
        except Exception:
            db.rollback()
            # No relanzar: el registro de auditoría no debe tumbar la petición principal

    @staticmethod
    def listar(
        db: Session,
        *,
        skip: int = 0,
        limit: int = 50,
        nivel: Optional[str] = None,
        categoria: Optional[str] = None,
        desde_iso: Optional[str] = None,
        hasta_iso: Optional[str] = None,
    ) -> Tuple[List[ActividadLog], int]:
        q = db.query(ActividadLog)
        if nivel:
            q = q.filter(ActividadLog.nivel == nivel)
        if categoria:
            q = q.filter(ActividadLog.categoria == categoria)
        if desde_iso:
            try:
                from datetime import datetime, timezone
                d = datetime.fromisoformat(desde_iso.replace("Z", "+00:00"))
                q = q.filter(ActividadLog.created_at >= d)
            except Exception:
                pass
        if hasta_iso:
            try:
                from datetime import datetime, timezone, timedelta
                d = datetime.fromisoformat(hasta_iso.replace("Z", "+00:00"))
                q = q.filter(ActividadLog.created_at < d + timedelta(days=1))
            except Exception:
                pass
        total = q.count()
        rows = (
            q.order_by(ActividadLog.created_at.desc())
            .offset(skip)
            .limit(min(limit, 200))
            .all()
        )
        return rows, total

    @staticmethod
    def purgar(
        db: Session,
        *,
        modo: str,
        categoria: Optional[str] = None,
        dias: Optional[int] = None,
    ) -> int:
        """Elimina filas de actividad_log según modo. Devuelve cantidad borrada."""
        from datetime import datetime, timedelta, timezone

        q = db.query(ActividadLog)
        if modo == "todo":
            n = q.delete(synchronize_session=False)
        elif modo == "categoria":
            cat = (categoria or "").strip()[:40]
            n = q.filter(ActividadLog.categoria == cat).delete(synchronize_session=False)
        elif modo == "antiguos":
            if not dias or dias < 1:
                return 0
            cutoff = datetime.now(timezone.utc) - timedelta(days=int(dias))
            q2 = db.query(ActividadLog).filter(ActividadLog.created_at < cutoff)
            if categoria and str(categoria).strip():
                q2 = q2.filter(ActividadLog.categoria == str(categoria).strip()[:40])
            n = q2.delete(synchronize_session=False)
        else:
            return 0
        db.commit()
        return int(n or 0)
