/**
 * Tipos API - Contrato compartido con el backend.
 * Deben coincidir con los schemas Pydantic del backend.
 */

// ========== DISPOSITIVO ==========
export interface DispositivoCreate {
  nombre: string;
  ubicacion?: string | null;
  serial_number?: string | null;
}

export interface DispositivoResponse {
  id: number;
  nombre: string;
  ip_local?: string | null;
  ubicacion?: string | null;
  serial_number?: string | null;
  api_key: string;
  activo: boolean;
  ultima_llamada_getrequest?: string | null;
  ultima_ip_conexion?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

// ========== ASISTENCIA ==========
export interface AsistenciaResponse {
  id: number;
  empleado_id: number;
  dispositivo_id: number;
  timestamp: string;
  tipo: 'entrada' | 'salida';
  sincronizado: boolean;
  created_at?: string;
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
  rol_id?: number | null;
  jefe_id?: number | null;
  estado: string;
  fecha_ingreso?: string | null;
  fecha_baja?: string | null;
  created_at?: string;
  updated_at?: string | null;
}
