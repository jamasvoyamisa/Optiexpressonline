from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database - Configurar según tu entorno (local o remoto)
    DATABASE_URL: str  # Ejemplo: mysql+pymysql://user:password@localhost:3306/optiexpress_online

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Application
    APP_NAME: str = "Optiexpress Sistema Gestión Interna"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # CORS - Lista separada por comas. Ej: "http://localhost:3000,http://192.168.1.100"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origins_list(self) -> List[str]:
        return [x.strip() for x in self.CORS_ORIGINS.split(",") if x.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
