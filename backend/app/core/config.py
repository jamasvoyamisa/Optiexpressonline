from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database - Configurar según tu entorno (local o remoto)
    DATABASE_URL: str  # Ejemplo local: mysql+pymysql://user:password@localhost:3306/optiexpress_online
    
    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Application
    APP_NAME: str = "Optiexpress Sistema Gestión Interna"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    
    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
