from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from app.core.config import settings

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    debug=settings.DEBUG
)

# Configurar CORS (incluye red interna: 192.168.x.x, 10.x.x.x)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"http://(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    from app.core.database import engine, Base, SessionLocal
    from app.core.scheduler import iniciar_scheduler
    from app.modules.personal import models as pm
    from app.modules.asistencia import models as _am
    from app.modules.notificaciones import models as _nm   # noqa: F401 – registra la tabla
    from app.modules.incapacidades import models as _im   # noqa: F401 – registra la tabla
    from app.modules.prestamos import models as _pm   # noqa: F401 – registra la tabla
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

        # Crear puestos globales Director, Gerente General, RH si no existen (empresa_id/departamento_id null)
        for nombre, orden in [("Director", 1), ("Gerente General", 2), ("RH", 3)]:
            if not db.query(pm.Puesto).filter(
                pm.Puesto.nombre == nombre,
                pm.Puesto.empresa_id.is_(None),
                pm.Puesto.departamento_id.is_(None),
            ).first():
                db.add(pm.Puesto(nombre=nombre, orden=orden, activo=True, empresa_id=None, departamento_id=None))
        db.commit()

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

    iniciar_scheduler()


@app.on_event("shutdown")
def on_shutdown():
    from app.core.scheduler import detener_scheduler
    detener_scheduler()


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


# Portal de checadas remotas (acceso directo al backend, sin frontend React)
@app.get("/portal", response_class=HTMLResponse, include_in_schema=False)
def portal_checadas_remotas():
    """Página de checadas remotas: empresa + número de empleado + contraseña."""
    from pathlib import Path
    template = Path(__file__).resolve().parent / "modules" / "portal" / "templates" / "checadas_remotas.html"
    return template.read_text(encoding="utf-8")


# Cargar modelos de asistencia antes de los routers (para relaciones Empleado.horarios_asignados)
from app.modules.asistencia import models as _am  # noqa: F401

# Registrar módulos
from app.modules.auth.routes import router as auth_router
from app.modules.personal.routes import router as personal_router
from app.modules.vacaciones.routes import router as vacaciones_router
from app.modules.rh.routes import router as rh_router
from app.modules.asistencia.routes import router as asistencia_router
from app.modules.notificaciones.routes import router as notificaciones_router
from app.modules.incapacidades.routes import router as incapacidades_router
from app.modules.portal.routes import router as portal_router

app.include_router(auth_router)
app.include_router(personal_router)
app.include_router(vacaciones_router)
app.include_router(rh_router)
app.include_router(asistencia_router)
app.include_router(notificaciones_router)
app.include_router(incapacidades_router)
from app.modules.prestamos.routes import router as prestamos_router
app.include_router(prestamos_router)
app.include_router(portal_router)
# ADMS (iclock) ya no se usa; solo el agente local sincroniza checadas

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9081)
