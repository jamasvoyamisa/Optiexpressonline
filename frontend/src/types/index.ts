// Tipos compartidos del sistema - alineados con backend

export {
  DispositivoCreate,
  DispositivoResponse,
  AsistenciaResponse,
  EmpleadoResponse,
} from './api';

export type Dispositivo = import('./api').DispositivoResponse;
export type Asistencia = import('./api').AsistenciaResponse;
export type Empleado = import('./api').EmpleadoResponse;

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
