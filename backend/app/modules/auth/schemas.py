from pydantic import BaseModel, EmailStr
from typing import Optional


class LoginRequest(BaseModel):
    username: str  # Puede ser email o número de empleado
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict
    me: Optional[dict] = None  # Mismo payload que GET /auth/me, para no hacer otra petición


class UserInfo(BaseModel):
    id: int
    numero_empleado: str
    nombre: str
    apellido_paterno: Optional[str]
    apellido_materno: Optional[str]
    email: Optional[str]
    rol_id: Optional[int]
