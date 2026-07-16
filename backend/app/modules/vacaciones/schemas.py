from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import datetime, date
from decimal import Decimal
from .models import EstadoSolicitud


# Schemas para SolicitudVacaciones
class SolicitudVacacionesBase(BaseModel):
    fecha_inicio: datetime
    fecha_fin: datetime
    motivo: Optional[str] = None


class SolicitudVacacionesCreate(SolicitudVacacionesBase):
    empleado_id: int
    # Rellenados por la ruta /mis-solicitudes tras validar FES (no vienen del cliente admin genérico).
    aceptacion_solicitante_at: Optional[datetime] = None
    aceptacion_solicitante_ip: Optional[str] = None
    aceptacion_solicitante_texto: Optional[str] = None


class SolicitudVacacionesCreateMine(SolicitudVacacionesBase):
    """Para POST /mis-solicitudes: el empleado_id se toma del token."""
    acepto: bool = False
    password: str = ""


class SolicitudVacacionesUpdate(BaseModel):
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    motivo: Optional[str] = None
    estado: Optional[EstadoSolicitud] = None


class SolicitudVacacionesAprobar(BaseModel):
    aprobar: bool
    comentarios: Optional[str] = None
    # Fase B: confirmación con contraseña del aprobador/confirmador
    password: str = ""
    acepto: bool = False


class SolicitudVacacionesResponse(SolicitudVacacionesBase):
    id: int
    empleado_id: int
    dias_solicitados: int
    estado: EstadoSolicitud
    jefe_aprobador_id: Optional[int] = None
    jefe_aprobador_nombre: Optional[str] = None  # Quien autorizó (llenado en ruta)
    jefe_aprobador_puesto: Optional[str] = None  # Puesto del aprobador (catálogo), no confundir con rol sistema
    aprobador_es_jefe_directo: Optional[bool] = None  # True=jefe directo, False=admin/otro
    fecha_aprobacion: Optional[datetime] = None
    comentarios_aprobacion: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    # Fase B — constancia de aceptación
    aceptacion_solicitante_at: Optional[datetime] = None
    aceptacion_solicitante_ip: Optional[str] = None
    aceptacion_solicitante_texto: Optional[str] = None
    aceptacion_jefe_at: Optional[datetime] = None
    aceptacion_jefe_ip: Optional[str] = None
    aceptacion_rh_at: Optional[datetime] = None
    aceptacion_rh_ip: Optional[str] = None
    rh_confirmador_id: Optional[int] = None

    class Config:
        from_attributes = True


# Schemas para BalanceVacaciones
class BalanceVacacionesBase(BaseModel):
    año: int
    dias_disponibles: Decimal
    dias_tomados: Decimal
    dias_pendientes: Decimal


class BalanceVacacionesCreate(BaseModel):
    empleado_id: int
    año: int
    dias_disponibles: Decimal = Decimal("0")


class BalanceVacacionesUpdate(BaseModel):
    dias_disponibles: Optional[Decimal] = None
    dias_tomados: Optional[Decimal] = None
    dias_pendientes: Optional[Decimal] = None


class BalanceVacacionesResponse(BalanceVacacionesBase):
    id: int
    empleado_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    fecha_limite_goce: Optional[date] = None  # LFT: disfrute antes de 18 meses tras aniversario; pasado se prescriben
    
    class Config:
        from_attributes = True


class PeriodoVacacionesResponse(BaseModel):
    """Un periodo = derecho por un aniversario (ej. 12 días al cumplir 1 año)."""
    anios_antiguedad: int
    dias_derecho: int
    dias_tomados: float
    dias_disponibles: float
    dias_adelantados: float = 0  # tomados por encima del derecho (adelanto al próximo periodo)
    fecha_aniversario: Optional[str] = None
    fecha_limite_goce: Optional[str] = None  # después de esta fecha se prescriben
    # True si ya pasó la fecha límite de goce (18 m tras aniversario): no entra en saldo LFT vigente; solo referencia.
    prescrito_por_plazo: bool = False
    # Si prescrito_por_plazo: días que quedaban por tomar al vencer el plazo (informativo).
    dias_pendientes_historico: float = 0


class BalanceConPeriodosResponse(BaseModel):
    """Balance con periodo actual (más reciente) y periodo anterior (por vencer/perderse)."""
    empleado_id: int
    año: int
    periodo_actual: Optional[PeriodoVacacionesResponse] = None
    periodo_anterior: Optional[PeriodoVacacionesResponse] = None
    dias_disponibles: Decimal
    dias_tomados: Decimal
    dias_pendientes: Decimal
    fecha_limite_goce: Optional[str] = None  # del periodo que vence primero (anterior)
    # Adeudo por vacaciones generales (LFT) aplicadas sin periodo vigente; al generarse periodo se descuenta.
    dias_deuda_vacaciones_ley: Decimal = Decimal("0")
    # Suma periodos vigentes menos deuda; puede ser negativo si aún debe días.
    saldo_dias_lft_neto: Decimal
    # Días fuera de LFT (carga única típica de migración); ver docs/VACACIONES-LFT-MEXICO.md
    dias_saldo_migracion_vacaciones: Decimal = Decimal("0")
    # saldo_dias_lft_neto + dias_saldo_migracion_vacaciones (tope para nuevas solicitudes junto con pendientes).
    saldo_total_con_migracion: Decimal = Decimal("0")


class SaldoLftNetoAdminBody(BaseModel):
    """Ajuste manual del saldo LFT neto (solo administrador)."""
    saldo_lft_neto: Decimal


class SaldoMigracionVacacionesAdminBody(BaseModel):
    """Saldo de días de migración (fuera de LFT). Solo administrador; no sustituye periodos LFT en siguientes aniversarios."""
    dias_saldo_migracion_vacaciones: Decimal


# --- Vacaciones generales (días empresa / calendario) ---

class VacacionGeneralCreate(BaseModel):
    nombre: str
    fecha_inicio: date
    fecha_fin: date
    alcance: Literal["global", "empresa", "departamento"]
    empresa_id: Optional[int] = None
    departamento_id: Optional[int] = None
    empresa_excluida_id: Optional[int] = None
    dias_cuenta_ley: Decimal
    dias_regalo_empresa: Decimal = Decimal("0")
    activo: bool = True
    notas: Optional[str] = None


class VacacionGeneralResponse(BaseModel):
    id: int
    nombre: str
    fecha_inicio: date
    fecha_fin: date
    alcance: str
    empresa_id: Optional[int] = None
    departamento_id: Optional[int] = None
    empresa_excluida_id: Optional[int] = None
    dias_cuenta_ley: Decimal
    dias_regalo_empresa: Decimal
    activo: bool
    notas: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    aplicado: bool = False
    empleados_aplicados: int = 0

    class Config:
        from_attributes = True


class AplicarVacacionGeneralResultado(BaseModel):
    vacacion_general_id: int
    empleados_totales: int
    aplicados: int
    omitidos: List[dict]
    errores: List[dict]
