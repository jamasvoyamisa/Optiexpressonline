from fastapi import Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user


def get_database() -> Session:
    """Dependency para obtener sesión de base de datos"""
    return Depends(get_db)


def get_current_active_user():
    """Dependency para obtener usuario actual autenticado"""
    return Depends(get_current_user)
