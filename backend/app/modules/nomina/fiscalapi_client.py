"""Cliente FiscalAPI (PAC) — solo ambiente de pruebas por defecto."""
from __future__ import annotations

from functools import lru_cache

from fastapi import HTTPException, status

from app.core.config import settings

SANDBOX_URL = "https://test.fiscalapi.com"
LIVE_URL = "https://live.fiscalapi.com"


def fiscalapi_habilitado() -> bool:
    return bool(
        settings.NOMINA_FISCALAPI_ENABLED
        and settings.FISCALAPI_API_KEY
        and settings.FISCALAPI_TENANT
    )


def fiscalapi_es_sandbox() -> bool:
    url = (settings.FISCALAPI_API_URL or SANDBOX_URL).strip().lower()
    return LIVE_URL not in url


def assert_fiscalapi_timbrado_permitido() -> None:
    """Bloquea timbrado si no hay credenciales o si se intenta producción sin opt-in."""
    if not settings.NOMINA_FISCALAPI_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Timbrado FiscalAPI desactivado. Activa NOMINA_FISCALAPI_ENABLED=true "
                "y configura FISCALAPI_API_KEY y FISCALAPI_TENANT en backend/.env."
            ),
        )
    if not settings.FISCALAPI_API_KEY or not settings.FISCALAPI_TENANT:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Faltan credenciales FiscalAPI (FISCALAPI_API_KEY, FISCALAPI_TENANT). "
                "Créalas en https://test.fiscalapi.com tras activar la suscripción de prueba."
            ),
        )
    url = (settings.FISCALAPI_API_URL or SANDBOX_URL).strip()
    if LIVE_URL in url.lower() and not settings.FISCALAPI_ALLOW_LIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Timbrado en producción (live.fiscalapi.com) bloqueado. "
                "Usa FISCALAPI_API_URL=https://test.fiscalapi.com o "
                "FISCALAPI_ALLOW_LIVE=true cuando estés listo para producción."
            ),
        )


@lru_cache(maxsize=1)
def get_fiscalapi_client():
    """Instancia singleton del SDK (credenciales desde settings)."""
    from fiscalapi.models.common_models import FiscalApiSettings
    from fiscalapi.services.fiscalapi_client import FiscalApiClient

    assert_fiscalapi_timbrado_permitido()
    api_settings = FiscalApiSettings(
        api_url=(settings.FISCALAPI_API_URL or SANDBOX_URL).strip(),
        api_key=settings.FISCALAPI_API_KEY,
        tenant=settings.FISCALAPI_TENANT,
        debug=settings.DEBUG,
    )
    return FiscalApiClient(settings=api_settings)


def fiscalapi_status_publico() -> dict:
    """Estado de configuración (sin secretos) para el frontend."""
    return {
        "habilitado": fiscalapi_habilitado(),
        "sandbox": fiscalapi_es_sandbox(),
        "api_url": (settings.FISCALAPI_API_URL or SANDBOX_URL).strip(),
        "tiene_csd": bool(
            settings.FISCALAPI_CSD_CER_BASE64
            and settings.FISCALAPI_CSD_KEY_BASE64
            and settings.FISCALAPI_CSD_PASSWORD
        ),
        "modo": "sandbox" if fiscalapi_es_sandbox() else "live",
        "mensaje": (
            "Ambiente de pruebas FiscalAPI: recibos sin validez fiscal ante el SAT."
            if fiscalapi_es_sandbox()
            else "Ambiente de producción FiscalAPI."
        ),
    }
