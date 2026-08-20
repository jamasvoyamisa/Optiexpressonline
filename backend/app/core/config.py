from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database - Configurar según tu entorno (local o remoto)
    DATABASE_URL: str  # Ejemplo: mysql+pymysql://user:password@localhost:3306/optiexpress_online

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 horas (jornada laboral completa)
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Application
    APP_NAME: str = "Optiexpress Sistema Gestión Interna"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    SOPORTE_ADJUNTOS_DIR: str = "/opt/optiexpress/storage/soporte/adjuntos"
    SOPORTE_PORTAL_BG_DIR: str = "/opt/optiexpress/storage/soporte/backgrounds"
    CHECADOR_PORTAL_BG_DIR: str = "/opt/optiexpress/storage/portal/checador-backgrounds"
    VACACIONES_FIRMADOS_DIR: str = "/opt/optiexpress/storage/vacaciones/firmados"
    PRESTAMOS_FIRMADOS_DIR: str = "/opt/optiexpress/storage/prestamos/firmados"

    # Módulo nómina (API /nomina). Desactivar con NOMINA_ENABLED=false en .env si hace falta.
    NOMINA_ENABLED: bool = True
    # Cálculo fiscal de prueba (POST .../periodos/{id}/calcular-prueba). Solo activar en local;
    # en producción debe ser false (valores ISR/IMSS ilustrativos).
    NOMINA_CALCULO_PRUEBAS: bool = False

    # ── FiscalAPI (timbrado nómina — sandbox por defecto) ─────────────────
    # Activar solo cuando tengas cuenta en https://test.fiscalapi.com
    NOMINA_FISCALAPI_ENABLED: bool = False
    FISCALAPI_API_URL: str = "https://test.fiscalapi.com"
    FISCALAPI_API_KEY: str = ""
    FISCALAPI_TENANT: str = ""
    # Certificados CSD de prueba (base64) — opcional si el emisor ya está en FiscalAPI
    FISCALAPI_CSD_CER_BASE64: str = ""
    FISCALAPI_CSD_KEY_BASE64: str = ""
    FISCALAPI_CSD_PASSWORD: str = ""
    FISCALAPI_ORIGIN_EMPLOYER_TIN: str = ""
    # Bloquea timbrado contra live.fiscalapi.com salvo opt-in explícito
    FISCALAPI_ALLOW_LIVE: bool = False
    # Si true, restringe login/refresh a Administrador, Gerente o Supervisor (bloqueo temporal).
    LOGIN_MAINTENANCE_RESTRICTED: bool = False

    # Contraseña del usuario admin creado automáticamente en el primer arranque (instalación
    # nueva sin empleados). Si se deja vacío, se genera una aleatoria y se imprime UNA VEZ en
    # el log de arranque; en ambos casos must_change_password queda en True.
    ADMIN_DEFAULT_PASSWORD: str = ""

    # CORS - Lista separada por comas. Incluye landing estática (puerto 8080) para cumpleañeros/API.
    CORS_ORIGINS: str = (
        "http://localhost:3000,http://localhost:5173,"
        "http://localhost:8080,http://127.0.0.1:8080"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        return [x.strip() for x in self.CORS_ORIGINS.split(",") if x.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
