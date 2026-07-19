"""Rate limiting compartido (slowapi) para endpoints sensibles a fuerza bruta
(login, portal de checadas remotas). Usa la misma lógica de IP real (X-Forwarded-For)
que el resto de la auditoría, para funcionar igual detrás de Nginx.
"""
from slowapi import Limiter
from starlette.requests import Request

from app.modules.audit.middleware import _client_ip


def _rate_limit_key(request: Request) -> str:
    return _client_ip(request) or "unknown"


limiter = Limiter(key_func=_rate_limit_key, default_limits=[])
