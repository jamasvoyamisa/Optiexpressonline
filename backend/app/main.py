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
    from app.core.database import engine, Base, SessionLocal
    from app.modules.personal import models as pm
    from app.modules.asistencia import models as _am
    from app.modules.notificaciones import models as _nm   # noqa: F401 – registra la tabla
    from app.modules.incapacidades import models as _im   # noqa: F401 – registra la tabla
    from app.core.security import get_password_hash

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        rol = db.query(pm.Rol).filter(pm.Rol.nombre == "Administrador").first()
        if not rol:
            rol = pm.Rol(nombre="Administrador", descripcion="Acceso total al sistema", activo=True)
            db.add(rol)
            db.commit()
            db.refresh(rol)

        admin_email = "admin@admin.com"
        admin_password = "Admin123!"
        admin_empleado = db.query(pm.Empleado).filter(pm.Empleado.email == admin_email).first()
        if not admin_empleado:
            admin_empleado = pm.Empleado(
                numero_empleado="admin",
                nombre="Administrador",
                apellido_paterno="Sistema",
                email=admin_email,
                username="admin",
                password_hash=get_password_hash(admin_password),
                rol_id=rol.id,
                estado=pm.EstadoEmpleado.ACTIVO,
            )
            db.add(admin_empleado)
            db.commit()
        else:
            # Asegurar que el admin siempre pueda entrar con la contraseña por defecto
            admin_empleado.password_hash = get_password_hash(admin_password)
            admin_empleado.rol_id = rol.id
            admin_empleado.estado = pm.EstadoEmpleado.ACTIVO
            if not admin_empleado.username:
                admin_empleado.username = "admin"
            db.commit()
    finally:
        db.close()


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
from app.modules.asistencia.biometric.iclock_routes import router as iclock_router
from app.modules.notificaciones.routes import router as notificaciones_router
from app.modules.incapacidades.routes import router as incapacidades_router

app.include_router(auth_router)
app.include_router(personal_router)
app.include_router(vacaciones_router)
app.include_router(rh_router)
app.include_router(asistencia_router)
app.include_router(notificaciones_router)
app.include_router(incapacidades_router)
# iClock/ADMS: el dispositivo llama a /iclock/getrequest y /iclock/cdata (sin prefijo /api/v1)
app.include_router(iclock_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9081)
