from typing import Optional
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Enum, UniqueConstraint, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class EstadoEmpleado(str, enum.Enum):
    ACTIVO = "activo"
    INACTIVO = "inactivo"
    BAJA = "baja"


class Empresa(Base):
    __tablename__ = "empresas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)  # Denominación / razón social
    rfc = Column(String(13), nullable=True)
    direccion = Column(String(500), nullable=True)  # Legado; preferir domicilio + campos fiscales
    capital_social = Column(Numeric(20, 2), nullable=True)
    codigo_postal = Column(String(5), nullable=True)
    domicilio = Column(String(200), nullable=True)  # Calle / vía pública
    numero_exterior = Column(String(30), nullable=True)
    numero_interior = Column(String(30), nullable=True)
    colonia = Column(String(150), nullable=True)
    municipio = Column(String(150), nullable=True)
    estado = Column(String(100), nullable=True)
    regimen_fiscal = Column(String(3), nullable=True)  # c_RegimenFiscal SAT
    telefono = Column(String(20), nullable=True)
    activo = Column(Boolean, default=True)
    checadas_remotas = Column(Boolean, default=False)  # Si True, empleados pueden checar por portal web
    # Política laboral semanal base de la empresa:
    # - lun-sab: domingo no laborable
    # - lun-dom: domingo laborable
    dias_laborales = Column(String(20), nullable=False, default="lun-sab")
    # Si True, la empresa labora en días festivos del calendario global.
    trabaja_festivos = Column(Boolean, nullable=False, default=False)
    # Si True, sáb/dom laborables exigen 4 checadas (con comida), como entre semana.
    # Default False = jornada corta de fin de semana (entrada + salida).
    fin_semana_4_checadas = Column(Boolean, nullable=False, default=False)
    # Solo Optivisión/COF u otras lun-dom con rotación: descansos por fecha + domingo según horario.
    gestiona_descansos_rotativos = Column(Boolean, nullable=False, default=False)
    siglas = Column(String(20), nullable=True)
    rango_inicio = Column(Integer, nullable=True)
    rango_fin = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empleados = relationship("Empleado", back_populates="empresa")


class Rol(Base):
    __tablename__ = "roles"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)
    descripcion = Column(String(255))
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    empleados = relationship("Empleado", back_populates="rol")


class Departamento(Base):
    __tablename__ = "departamentos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False)
    jefe_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    # Subdepartamento: apunta al departamento padre (misma empresa). NULL = depto raíz.
    padre_id = Column(Integer, ForeignKey("departamentos.id"), nullable=True, index=True)
    # Solo hijos: 'subdepartamento' | 'sucursal'. Raíces: NULL.
    tipo = Column(String(20), nullable=True)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empresa = relationship("Empresa", backref="departamentos")
    jefe = relationship("Empleado", foreign_keys=[jefe_id], backref="departamento_a_cargo")
    empleados = relationship("Empleado", back_populates="departamento_rel", foreign_keys="Empleado.departamento_id")
    padre = relationship(
        "Departamento",
        remote_side=[id],
        foreign_keys=[padre_id],
        backref="subdepartamentos",
    )
    encargados_rel = relationship(
        "DepartamentoEncargado",
        back_populates="departamento",
        cascade="all, delete-orphan",
    )

    @property
    def jefe_nombre(self) -> Optional[str]:
        """Nombre del gerente/jefe del departamento (incluye usuarios especiales)."""
        if self.jefe:
            j = self.jefe
            return f"{j.nombre} {j.apellido_paterno or ''} {j.apellido_materno or ''}".strip()
        return None

    @property
    def padre_nombre(self) -> Optional[str]:
        if self.padre:
            return self.padre.nombre
        return None

    @property
    def encargados_ids(self):
        return [r.empleado_id for r in (self.encargados_rel or [])]

    @property
    def encargados_nombres(self):
        nombres = []
        for r in (self.encargados_rel or []):
            e = r.empleado
            if not e:
                continue
            nombres.append(f"{e.nombre} {e.apellido_paterno or ''} {e.apellido_materno or ''}".strip())
        return nombres


class DepartamentoEncargado(Base):
    """Encargados de una sucursal/subdepartamento (varios por área hija)."""
    __tablename__ = "departamento_encargados"

    departamento_id = Column(Integer, ForeignKey("departamentos.id", ondelete="CASCADE"), primary_key=True)
    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="CASCADE"), primary_key=True)

    departamento = relationship("Departamento", back_populates="encargados_rel")
    empleado = relationship("Empleado")


class Puesto(Base):
    """Catálogo de puestos por empresa y departamento. empresa_id/departamento_id null = puesto global (Director, Gerente General, RH)."""
    __tablename__ = "puestos"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=True)  # null = puesto global (Director, Gerente General, RH)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"), nullable=True)
    nombre = Column(String(150), nullable=False)
    orden = Column(Integer, nullable=False, default=0)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empresa = relationship("Empresa", backref="puestos")
    departamento = relationship("Departamento", backref="puestos")
    empleados = relationship("Empleado", back_populates="puesto_rel")


class Empleado(Base):
    __tablename__ = "empleados"
    __table_args__ = (
        UniqueConstraint('empresa_id', 'numero_empleado', name='uq_empresa_numero_empleado'),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=True)
    departamento_id = Column(Integer, ForeignKey("departamentos.id"), nullable=True)
    numero_empleado = Column(String(50), nullable=False, index=True)
    pin_checador = Column(String(20), unique=True, nullable=True, index=True)
    nombre = Column(String(100), nullable=False)
    apellido_paterno = Column(String(100))
    apellido_materno = Column(String(100))
    email = Column(String(255), unique=True, index=True)
    telefono = Column(String(20))
    # Línea o móvil que la empresa asigna al colaborador (p. ej. para WhatsApp en tickets de soporte).
    telefono_empresa_asignado = Column(String(20), nullable=True)
    username = Column(String(100), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=True)
    # Fase A alineación LFT: True tras alta o reset temporal; el colaborador debe cambiarla.
    must_change_password = Column(Boolean, default=False, nullable=False)
    # Anti-fuerza bruta (corto plazo): fallos consecutivos y bloqueo temporal de login.
    login_fallos_consecutivos = Column(Integer, nullable=False, default=0, server_default="0")
    login_bloqueado_hasta = Column(DateTime(timezone=True), nullable=True)

    puesto_id = Column(Integer, ForeignKey("puestos.id"), nullable=True)
    curp = Column(String(18), nullable=True)
    rfc = Column(String(13), nullable=True)
    nss = Column(String(11), nullable=True)
    direccion = Column(String(500), nullable=True)
    colonia = Column(String(200), nullable=True)
    cp = Column(String(10), nullable=True)
    ciudad = Column(String(200), nullable=True)
    fecha_nacimiento = Column(DateTime(timezone=True), nullable=True)
    contacto_emergencia = Column(String(200), nullable=True)
    telefono_emergencia = Column(String(20), nullable=True)

    rol_id = Column(Integer, ForeignKey("roles.id"))
    jefe_id = Column(Integer, ForeignKey("empleados.id"), nullable=True)
    # Horario sabatino: si es NULL el empleado no labora los sábados
    horario_sabado_id = Column(Integer, ForeignKey("horarios.id"), nullable=True)

    estado = Column(Enum(EstadoEmpleado), default=EstadoEmpleado.ACTIVO)
    fecha_ingreso = Column(DateTime(timezone=True))
    fecha_baja = Column(DateTime(timezone=True), nullable=True)

    # Usuario especial: no genera incidencias automáticas ni aparece en reportes de asistencia
    exento_incidencias = Column(Boolean, default=False, nullable=False)
    # Permiso para checar desde el portal web remoto (solo el admin lo puede otorgar)
    puede_checar_remoto = Column(Boolean, default=False, nullable=False)
    # Días LFT adeudados por vacaciones generales aplicadas antes de tener periodo vigente;
    # al generarse el primer periodo se descuentan automáticamente vía liquidación.
    dias_deuda_vacaciones_ley = Column(Numeric(10, 2), nullable=False, default=0)
    # Bolsa única de días fuera de la tabla LFT (ej. saldo heredado al adoptar el sistema).
    # No la recalcula ensure_periodos; se consume al aprobar RH (después de periodos LFT) y en vacaciones generales.
    dias_saldo_migracion_vacaciones = Column(Numeric(10, 2), nullable=False, default=0)
    # Token de sesión activa: al iniciar sesión se genera un UUID; si el token del JWT no coincide → 401.
    # Garantiza sesión única por usuario (el último login invalida el anterior).
    session_id = Column(String(64), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    empresa = relationship("Empresa", back_populates="empleados")
    departamento_rel = relationship("Departamento", back_populates="empleados", foreign_keys=[departamento_id])
    puesto_rel = relationship("Puesto", back_populates="empleados")
    rol = relationship("Rol", back_populates="empleados")
    jefe = relationship("Empleado", remote_side=[id], foreign_keys=[jefe_id], backref="subordinados")
    horario_sabado = relationship("Horario", foreign_keys=[horario_sabado_id])
    supervision_empresas_rel = relationship(
        "EmpleadoSupervisionEmpresa",
        back_populates="empleado",
        cascade="all, delete-orphan",
    )

    @property
    def horario_id(self) -> Optional[int]:
        """ID del horario L-V activo (empleado_horario)."""
        for eh in (self.horarios_asignados or []):
            if eh.activo and eh.horario_id:
                return eh.horario_id
        return None

    @property
    def departamento(self):
        return self.departamento_rel

    @property
    def puesto(self):
        return self.puesto_rel

    @property
    def empresas_supervisadas_ids(self):
        """Empresas donde este director tiene alcance (además de su empresa de registro)."""
        return [r.empresa_id for r in (self.supervision_empresas_rel or [])]


class EmpleadoSupervisionEmpresa(Base):
    """Alcance multi-empresa para puesto Director (un mismo director puede supervisar varias razones sociales)."""
    __tablename__ = "empleado_supervision_empresas"

    empleado_id = Column(Integer, ForeignKey("empleados.id", ondelete="CASCADE"), primary_key=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id", ondelete="CASCADE"), primary_key=True)

    empleado = relationship("Empleado", back_populates="supervision_empresas_rel")
    empresa = relationship("Empresa")
