from pydantic import BaseModel, Field, model_validator
from typing import Optional, Any, List, Literal
from datetime import datetime


class ActividadLogResponse(BaseModel):
    id: int
    created_at: datetime
    nivel: str
    categoria: str
    mensaje: str
    contexto: Optional[str] = None
    empleado_id: Optional[int] = None
    empleado_numero: Optional[str] = None
    empleado_nombre: Optional[str] = None
    empleado_username: Optional[str] = None
    ip_cliente: Optional[str] = None
    metodo_http: Optional[str] = None
    ruta: Optional[str] = None
    codigo_http: Optional[int] = None
    duracion_ms: Optional[int] = None

    class Config:
        from_attributes = True


class ActividadLogListResponse(BaseModel):
    items: List[ActividadLogResponse]
    total: int


class ActividadPurgeRequest(BaseModel):
    """Purgar registros de actividad (solo administrador)."""

    modo: Literal["categoria", "antiguos", "todo"]
    categoria: Optional[str] = Field(None, max_length=40)
    dias: Optional[int] = Field(None, ge=1, le=3650)
    confirmacion: Optional[str] = Field(None, max_length=80)

    @model_validator(mode="after")
    def validar_modo(self):
        if self.modo == "categoria":
            if not (self.categoria and self.categoria.strip()):
                raise ValueError("Para modo 'categoria' indique categoria")
        elif self.modo == "antiguos":
            if self.dias is None:
                raise ValueError("Para modo 'antiguos' indique dias (1-3650)")
        elif self.modo == "todo":
            if (self.confirmacion or "").strip() != "BORRAR_TODO":
                raise ValueError("Para vaciar todo el historial envíe confirmacion: BORRAR_TODO")
        return self


class ActividadPurgeResponse(BaseModel):
    eliminados: int
