// Tipos compartidos del sistema - alineados con backend

export type {
  DispositivoCreate,
  DispositivoUpdate,
  DispositivoResponse,
  AsistenciaResponse,
  EmpleadoResponse,
  EmpleadoCreate,
  EmpresaResponse,
  EmpresaCreate,
  EmpresaUpdate,
  UsuarioEspecialCreate,
  SoporteTicketClaseResponse,
  SoporteTicketClaseCreate,
  SoporteTicketClaseUpdate,
  SoporteTicketTipoResponse,
  SoporteTicketTipoCreate,
  SoporteTicketTipoUpdate,
  ActividadLogResponse,
  ActividadLogListResponse,
  ActividadPurgeRequest,
  ActividadPurgeResponse,
  DepartamentoResponse,
  DepartamentoCreate,
  DepartamentoUpdate,
  PuestoResponse,
  PuestoCreate,
  VacacionGeneralCreate,
  VacacionGeneralResponse,
  VacacionGeneralAplicacionDetalle,
  AplicarVacacionGeneralResultado,
} from './api';

export type Dispositivo = import('./api').DispositivoResponse;
export type Asistencia = import('./api').AsistenciaResponse;
export type Empleado = import('./api').EmpleadoResponse;
export type Empresa = import('./api').EmpresaResponse;
export type Departamento = import('./api').DepartamentoResponse;
export type Puesto = import('./api').PuestoResponse;

export interface User {
  id: number;
  username: string;
  email: string;
}

export interface SolicitudVacaciones {
  id: number;
  empleado_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_solicitados: number;
  motivo?: string | null;
  estado: string;
  jefe_aprobador_id?: number | null;
  jefe_aprobador_nombre?: string | null;
  /** Puesto (catálogo RH) de quien autorizó la solicitud */
  jefe_aprobador_puesto?: string | null;
  aprobador_es_jefe_directo?: boolean | null;
  fecha_aprobacion?: string | null;
  comentarios_aprobacion?: string | null;
  created_at?: string;
}
