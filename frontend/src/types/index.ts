// Tipos compartidos del sistema - alineados con backend

export type {
  DispositivoCreate,
  DispositivoResponse,
  AsistenciaResponse,
  EmpleadoResponse,
  EmpleadoCreate,
  EmpresaResponse,
  EmpresaCreate,
  EmpresaUpdate,
  DepartamentoResponse,
  DepartamentoCreate,
  DepartamentoUpdate,
  PuestoResponse,
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
  motivo?: string;
  estado: string;
  jefe_aprobador_id?: number;
  fecha_aprobacion?: string;
  comentarios_aprobacion?: string;
}
