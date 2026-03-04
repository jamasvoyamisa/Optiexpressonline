from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    debug=settings.DEBUG
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    from app.core.database import engine, Base
    from app.modules.personal import models as _pm
    from app.modules.asistencia import models as _am
    Base.metadata.create_all(bind=engine)


@app.get("/")
async def root():
    return {
        "message": "Sistema de Gestion Interna Modular",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# Registrar módulos
from app.modules.auth.routes import router as auth_router
from app.modules.personal.routes import router as personal_router
from app.modules.vacaciones.routes import router as vacaciones_router
from app.modules.rh.routes import router as rh_router
from app.modules.asistencia.routes import router as asistencia_router
app.include_router(auth_router)
app.include_router(personal_router)
app.include_router(vacaciones_router)
app.include_router(rh_router)
app.include_router(asistencia_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9081)
