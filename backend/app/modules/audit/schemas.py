from pydantic import BaseModel, Field, model_validator, field_serializer
from typing import Optional, Any, List, Literal
from datetime import datetime
from zoneinfo import ZoneInfo

_TZ_MX = ZoneInfo("America/Mexico_City")


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
    empleado_empresa: Optional[str] = None
    ip_cliente: Optional[str] = None
    metodo_http: Optional[str] = None
    ruta: Optional[str] = None
    codigo_http: Optional[int] = None
    duracion_ms: Optional[int] = None

    @field_serializer("created_at")
    def serialize_created_at(self, v: datetime) -> str:
        # Los DATETIME naive en actividad_log son hora de muro México.
        if v.tzinfo is None:
            v = v.replace(tzinfo=_TZ_MX)
        else:
            v = v.astimezone(_TZ_MX)
        return v.isoformat()

    class Config:
        from_attributes = True


class ActividadLogListResponse(BaseModel):
    items: List[ActividadLogResponse]
    total: int


class ActividadPurgeRequest(BaseModel):
    """
    Purgar registros de actividad (solo administrador).
    Retención mínima: 2 años (730 días). No se admite vaciar todo el historial.
    """

    modo: Literal["categoria", "antiguos"]
    categoria: Optional[str] = Field(None, max_length=40)
    dias: Optional[int] = Field(None, ge=730, le=3650)
    confirmacion: Optional[str] = Field(None, max_length=80)

    @model_validator(mode="after")
    def validar_modo(self):
        if self.modo == "categoria":
            if not (self.categoria and self.categoria.strip()):
                raise ValueError("Para modo 'categoria' indique categoria")
        elif self.modo == "antiguos":
            if self.dias is None:
                raise ValueError("Para modo 'antiguos' indique dias (mínimo 730 = 2 años)")
            if int(self.dias) < 730:
                raise ValueError("Solo se pueden eliminar registros con más de 730 días (2 años)")
        return self


class ActividadPurgeResponse(BaseModel):
    eliminados: int
