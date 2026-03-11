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
