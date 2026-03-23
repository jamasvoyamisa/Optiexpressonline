/**
 * Tipos API - Contrato compartido con el backend.
 * Deben coincidir con los schemas Pydantic del backend.
 */

// ========== DISPOSITIVO ==========
export interface DispositivoCreate {
  nombre: string;
  ubicacion?: string | null;
  ip_local?: string | null;
  serial_number?: string | null;
}

export interface DispositivoResponse {
  id: number;
  nombre: string;
  ubicacion?: string | null;
  api_key: string;
  activo: boolean;
  ultima_sync_agente?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

// ========== ASISTENCIA ==========
export interface AsistenciaResponse {
  id: number;
  empleado_id: number;
  dispositivo_id: number;
  timestamp: string;
  tipo: 'entrada' | 'salida_comer' | 'regreso_comer' | 'salida';
  es_tiempo_extra?: boolean;
  sincronizado: boolean;
  created_at?: string;
  empleado_nombre?: string;
  empleado_numero?: string;
}

// ========== EMPRESA ==========
export interface EmpresaResponse {
  id: number;
  nombre: string;
  rfc?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  activo: boolean;
  checadas_remotas?: boolean;
  dias_laborales?: 'lun-sab' | 'lun-dom';
  trabaja_festivos?: boolean;
  rango_inicio?: number | null;
  rango_fin?: number | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface EmpresaCreate {
  nombre: string;
  rfc?: string;
  direccion?: string;
  telefono?: string;
  checadas_remotas?: boolean;
  dias_laborales?: 'lun-sab' | 'lun-dom';
  trabaja_festivos?: boolean;
}

export interface EmpresaUpdate {
  nombre?: string;
  rfc?: string;
  direccion?: string;
  telefono?: string;
  activo?: boolean;
  checadas_remotas?: boolean;
  dias_laborales?: 'lun-sab' | 'lun-dom';
  trabaja_festivos?: boolean;
}

// ========== PUESTO ==========
export interface PuestoResponse {
  id: number;
  nombre: string;
  orden: number;
  activo: boolean;
  empresa_id?: number | null;
  departamento_id?: number | null;
  empresa_nombre?: string | null;
  departamento_nombre?: string | null;
  created_at?: string;
}

export interface PuestoCreate {
  empresa_id: number;
  departamento_id: number;
  nombre: string;
  orden?: number;
  activo?: boolean;
}

// ========== DEPARTAMENTO ==========
export interface DepartamentoResponse {
  id: number;
  nombre: string;
  empresa_id: number;
  jefe_id?: number | null;
  jefe_nombre?: string | null;
  activo: boolean;
  empresa?: EmpresaResponse | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface DepartamentoCreate {
  nombre: string;
  empresa_id: number;
  jefe_id?: number | null;
}

export interface DepartamentoUpdate {
  nombre?: string;
  empresa_id?: number;
  jefe_id?: number | null;
  activo?: boolean;
}

// ========== EMPLEADO ==========
export interface EmpleadoResponse {
  id: number;
  numero_empleado: string;
  nombre: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  email?: string | null;
  telefono?: string | null;
  username?: string | null;
  empresa_id?: number | null;
  departamento_id?: number | null;
  puesto_id?: number | null;
  puesto?: PuestoResponse | null;
  curp?: string | null;
  rfc?: string | null;
  nss?: string | null;
  direccion?: string | null;
  colonia?: string | null;
  cp?: string | null;
  ciudad?: string | null;
  fecha_nacimiento?: string | null;
  contacto_emergencia?: string | null;
  telefono_emergencia?: string | null;
  rol_id?: number | null;
  jefe_id?: number | null;
  jefe?: { nombre: string; apellido_paterno?: string | null; apellido_materno?: string | null } | null;
  estado: string;
  pin_checador?: string | null;
  fecha_ingreso?: string | null;
  fecha_baja?: string | null;
  horario_id?: number | null;
  horario_sabado_id?: number | null;
  exento_incidencias?: boolean;
  puede_checar_remoto?: boolean;
  created_at?: string;
  updated_at?: string | null;
  empresa?: EmpresaResponse | null;
  departamento?: DepartamentoResponse | null;
}

export interface EmpleadoCreate {
  numero_empleado: string;
  nombre: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  email?: string;
  telefono?: string;
  username?: string;
  empresa_id?: number;
  departamento_id?: number;
  puesto_id?: number;
  curp?: string;
  rfc?: string;
  nss?: string;
  direccion?: string;
  colonia?: string;
  cp?: string;
  ciudad?: string;
  fecha_nacimiento?: string;
  contacto_emergencia?: string;
  telefono_emergencia?: string;
  fecha_ingreso?: string;
  registrar_en_checador?: boolean;
  dispositivo_ids?: number[];
  password?: string;
}

// ========== VACACIONES GENERALES (calendario / empresa) ==========
export type AlcanceVacacionGeneral = 'global' | 'empresa' | 'departamento';

export interface VacacionGeneralCreate {
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  alcance: AlcanceVacacionGeneral;
  empresa_id?: number | null;
  departamento_id?: number | null;
  dias_cuenta_ley: number;
  dias_regalo_empresa?: number;
  activo?: boolean;
  notas?: string | null;
}

export interface VacacionGeneralResponse {
  id: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  alcance: string;
  empresa_id?: number | null;
  departamento_id?: number | null;
  dias_cuenta_ley: string;
  dias_regalo_empresa: string;
  activo: boolean;
  notas?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AplicarVacacionGeneralResultado {
  vacacion_general_id: number;
  empleados_totales: number;
  aplicados: number;
  omitidos: { empleado_id: number; motivo: string }[];
  errores: { empleado_id: number; error: string }[];
}
