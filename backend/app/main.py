from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from slowapi.errors import RateLimitExceeded
from app.core.config import settings
from app.core.rate_limit import limiter

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    debug=settings.DEBUG
)

# Rate limiting (slowapi) para endpoints sensibles a fuerza bruta (login, portal remoto).
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Demasiados intentos. Espera un momento e inténtalo de nuevo."},
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
    from app.modules.soporte import models as _sm      # noqa: F401 – registra la tabla
    from app.modules.audit import models as _audit_m  # noqa: F401 – actividad_log
    from app.modules.nomina import models as _nom_m   # noqa: F401 – nómina
    from app.core import sistema_flags as _sf  # noqa: F401 – sistema_flags
    from app.core.security import get_password_hash

    Base.metadata.create_all(bind=engine)

    # Columnas nuevas en tablas ya existentes (create_all no las agrega).
    try:
        from sqlalchemy import text, inspect as sa_inspect
        insp = sa_inspect(engine)
        emp_cols = {c["name"] for c in insp.get_columns("empleados")} if insp.has_table("empleados") else set()
        if "must_change_password" not in emp_cols:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE empleados ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0"
                ))
        vac_cols = (
            {c["name"] for c in insp.get_columns("solicitudes_vacaciones")}
            if insp.has_table("solicitudes_vacaciones") else set()
        )
        for col, ddl in (
            ("aceptacion_solicitante_at", "DATETIME NULL"),
            ("aceptacion_solicitante_ip", "VARCHAR(64) NULL"),
            ("aceptacion_solicitante_texto", "TEXT NULL"),
            ("aceptacion_jefe_at", "DATETIME NULL"),
            ("aceptacion_jefe_ip", "VARCHAR(64) NULL"),
            ("aceptacion_rh_at", "DATETIME NULL"),
            ("aceptacion_rh_ip", "VARCHAR(64) NULL"),
            ("rh_confirmador_id", "INT NULL"),
        ):
            if col not in vac_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE solicitudes_vacaciones ADD COLUMN {col} {ddl}"))
        asis_cols = (
            {c["name"] for c in insp.get_columns("asistencias")}
            if insp.has_table("asistencias") else set()
        )
        for col, ddl in (
            ("motivo_remoto", "VARCHAR(20) NULL"),
            ("motivo_remoto_detalle", "VARCHAR(255) NULL"),
            ("latitud", "DOUBLE NULL"),
            ("longitud", "DOUBLE NULL"),
            ("geo_precision_m", "DOUBLE NULL"),
        ):
            if col not in asis_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE asistencias ADD COLUMN {col} {ddl}"))
        depto_cols = (
            {c["name"] for c in insp.get_columns("departamentos")}
            if insp.has_table("departamentos") else set()
        )
        if "padre_id" not in depto_cols:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE departamentos ADD COLUMN padre_id INT NULL, "
                    "ADD INDEX ix_departamentos_padre_id (padre_id), "
                    "ADD CONSTRAINT fk_departamentos_padre_id "
                    "FOREIGN KEY (padre_id) REFERENCES departamentos(id)"
                ))
    except Exception:
        pass

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
        admin_empleado = db.query(pm.Empleado).filter(pm.Empleado.email == admin_email).first()
        if not admin_empleado:
            # Evitar INSERT duplicado si ya existe fila con username/numero "admin" y otro correo (índice único username).
            admin_empleado = (
                db.query(pm.Empleado)
                .filter(
                    (pm.Empleado.username == "admin") | (pm.Empleado.numero_empleado == "admin")
                )
                .first()
            )
        if not admin_empleado:
            # Sin contraseña fija en el código: se usa ADMIN_DEFAULT_PASSWORD si se definió
            # en el entorno, o se genera una aleatoria que solo queda en el log de arranque
            # (el admin debe cambiarla en el primer login, must_change_password=True).
            if settings.ADMIN_DEFAULT_PASSWORD:
                admin_password = settings.ADMIN_DEFAULT_PASSWORD
            else:
                import secrets as _secrets
                admin_password = _secrets.token_urlsafe(12)
                print(
                    "=" * 70 + "\n"
                    f"[startup] Usuario admin creado. Contraseña temporal (solo en este log): {admin_password}\n"
                    "Cámbiala de inmediato o define ADMIN_DEFAULT_PASSWORD en el .env.\n" + "=" * 70
                )
            admin_empleado = pm.Empleado(
                numero_empleado="admin",
                nombre="Administrador",
                apellido_paterno="Sistema",
                email=admin_email,
                username="admin",
                password_hash=get_password_hash(admin_password),
                must_change_password=True,
                rol_id=rol.id,
                estado=pm.EstadoEmpleado.ACTIVO,
            )
            db.add(admin_empleado)
            db.commit()
        else:
            # No sobrescribir la contraseña en cada arranque (el admin la cambia con scripts o la UI).
            admin_empleado.rol_id = rol.id
            admin_empleado.estado = pm.EstadoEmpleado.ACTIVO
            if not admin_empleado.username:
                admin_empleado.username = "admin"
            if not admin_empleado.email:
                admin_empleado.email = admin_email
            db.commit()
    finally:
        db.close()

    iniciar_scheduler()


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Registra errores 500 en actividad_log y delega el resto a los manejadores estándar."""
    from starlette.exceptions import HTTPException as StarletteHTTPException

    if isinstance(exc, HTTPException):
        return await http_exception_handler(request, exc)
    if isinstance(exc, StarletteHTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    if isinstance(exc, RequestValidationError):
        return await request_validation_exception_handler(request, exc)
    import asyncio
    import traceback
    from app.core.database import SessionLocal
    from app.modules.audit.service import ActividadService

    err_msg = str(exc)[:2000]
    tb = traceback.format_exc()[:8000]

    def _log():
        db = SessionLocal()
        try:
            ActividadService.registrar(
                db,
                nivel="error",
                categoria="sistema",
                mensaje=f"Excepción no controlada: {err_msg}",
                contexto={"traceback": tb},
                ruta=(request.url.path or "")[:500],
                metodo_http=(request.method or "")[:12],
            )
        finally:
            db.close()

    try:
        await asyncio.to_thread(_log)
    except Exception:
        pass
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor"},
    )


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


@app.get(f"{settings.API_V1_PREFIX}/health")
async def health_check_v1():
    """Mismo contrato que /health; útil detrás de /api/ y monitores que piden /api/v1/health."""
    return {"status": "healthy"}


# Portal de checadas remotas (acceso directo al backend, sin frontend React)
@app.get("/portal", response_class=HTMLResponse, include_in_schema=False)
def portal_checadas_remotas():
    """Página de checadas remotas: empresa + número de empleado + contraseña."""
    from pathlib import Path
    template = Path(__file__).resolve().parent / "modules" / "portal" / "templates" / "checadas_remotas.html"
    return template.read_text(encoding="utf-8")


# Portal público de tickets (HTML estático). NO usar /soporte: en producción esa ruta es la SPA React (Soporte TI).
@app.get("/ticket-soporte", response_class=HTMLResponse, include_in_schema=False)
def portal_ticket_soporte():
    """Página pública para levantar tickets de soporte."""
    from pathlib import Path
    template = Path(__file__).resolve().parent / "modules" / "soporte" / "templates" / "portal_soporte.html"
    return template.read_text(encoding="utf-8")


@app.get("/soporte", include_in_schema=False)
def portal_soporte_legacy_redirect():
    """Compatibilidad: antes el formulario vivía en /soporte; ahora la SPA usa esa ruta."""
    return RedirectResponse(url="/ticket-soporte", status_code=301)


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
from app.modules.soporte.routes import router as soporte_router
from app.modules.audit.routes import router as audit_router

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
app.include_router(soporte_router)
app.include_router(audit_router)
from app.modules.landing.routes import router as landing_router
app.include_router(landing_router)
if settings.NOMINA_ENABLED:
    from app.modules.nomina.routes import router as nomina_router

    app.include_router(nomina_router)
# ADMS (iclock) ya no se usa; solo el agente local sincroniza checadas

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9081)
