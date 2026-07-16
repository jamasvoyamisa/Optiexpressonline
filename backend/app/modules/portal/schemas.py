from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator


MotivoRemoto = Literal["HO", "TFO", "OTRO"]


class ChecadaRemotaRequest(BaseModel):
    empresa_id: int
    username: str
    password: str
    # Fase D — motivo obligatorio + ubicación al checar
    motivo: Optional[MotivoRemoto] = None
    motivo_detalle: Optional[str] = Field(None, max_length=255)
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    geo_precision_m: Optional[float] = None

    @model_validator(mode="after")
    def validar_motivo_detalle(self):
        # estado-hoy no exige motivo; el registro sí lo valida en el servicio
        if self.motivo == "OTRO" and not (self.motivo_detalle or "").strip():
            raise ValueError("Indica el detalle del motivo «Otro».")
        return self


class ChecadaRemotaResponse(BaseModel):
    ok: bool
    mensaje: str
    tipo: str | None = None  # entrada, salida_comer, regreso_comer, salida
    timestamp: str | None = None
    nombre_empleado: str | None = None
    checadas_hoy: int | None = None
    requeridas_hoy: int | None = None
    completado: bool | None = None
    dia_no_laboral: bool | None = None


class EstadoChecadaRemotaResponse(BaseModel):
    ok: bool
    mensaje: str
    nombre_empleado: str | None = None
    checadas_hoy: int = 0
    requeridas_hoy: int = 0
    completado: bool = False
    dia_no_laboral: bool = False
