from pydantic import BaseModel


class ChecadaRemotaRequest(BaseModel):
    empresa_id: int
    numero_empleado: str
    password: str


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
