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

export interface DispositivoUpdate {
  nombre?: string;
  ubicacion?: string | null;
  ip_local?: string | null;
  serial_number?: string | null;
  activo?: boolean;
}

export interface DispositivoResponse {
  id: number;
  nombre: string;
  ubicacion?: string | null;
  ip_local?: string | null;
  serial_number?: string | null;
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
  empresa_nombre?: string | null;
  departamento_nombre?: string | null;
  /** Fase D — portal remoto */
  motivo_remoto?: string | null;
  motivo_remoto_detalle?: string | null;
  motivo_remoto_label?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  geo_precision_m?: number | null;
}

export interface ResumenAsistenciaEmpleado {
  empleado_id: number;
  total_dias_periodo: number;
  dias_periodo_evaluados: number;
  periodo_en_curso: boolean;
  dias_asistio: number;
  dias_completos: number;
  faltas: number;
  faltas_justificadas: number;
  incompletas?: number;
  retardos: number;
  salidas_anticipadas: number;
  dias_incapacidad: number;
  dias_vacaciones: number;
  puntualidad_pct: number;
}

/** Por día: contexto laboral (incapacidad, vacaciones, festivo, jornada…). Ver GET /asistencia/mis-contexto-dias */
export interface DiaContextoLaboral {
  fecha: string;
  tipo_dia: string;
  etiqueta: string;
  requiere_checadas: boolean;
  checadas_requeridas: number;
  motivo: string;
}

// ========== EMPRESA ==========
export interface EmpresaResponse {
  id: number;
  nombre: string;
  siglas?: string | null;
  rfc?: string | null;
  direccion?: string | null;
  capital_social?: string | null;
  codigo_postal?: string | null;
  domicilio?: string | null;
  numero_exterior?: string | null;
  numero_interior?: string | null;
  colonia?: string | null;
  municipio?: string | null;
  estado?: string | null;
  regimen_fiscal?: string | null;
  telefono?: string | null;
  activo: boolean;
  checadas_remotas?: boolean;
  dias_laborales?: 'lun-sab' | 'lun-dom';
  trabaja_festivos?: boolean;
  fin_semana_4_checadas?: boolean;
  gestiona_descansos_rotativos?: boolean;
  rango_inicio?: number | null;
  rango_fin?: number | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface EmpresaCreate {
  nombre: string;
  siglas?: string;
  rfc?: string;
  direccion?: string;
  capital_social?: number | string;
  codigo_postal?: string;
  domicilio?: string;
  numero_exterior?: string;
  numero_interior?: string;
  colonia?: string;
  municipio?: string;
  estado?: string;
  regimen_fiscal?: string;
  telefono?: string;
  checadas_remotas?: boolean;
  dias_laborales?: 'lun-sab' | 'lun-dom';
  trabaja_festivos?: boolean;
  fin_semana_4_checadas?: boolean;
  gestiona_descansos_rotativos?: boolean;
}

export interface EmpresaUpdate {
  nombre?: string;
  siglas?: string;
  rfc?: string;
  direccion?: string;
  capital_social?: number | string;
  codigo_postal?: string;
  domicilio?: string;
  numero_exterior?: string;
  numero_interior?: string;
  colonia?: string;
  municipio?: string;
  estado?: string;
  regimen_fiscal?: string;
  telefono?: string;
  activo?: boolean;
  checadas_remotas?: boolean;
  dias_laborales?: 'lun-sab' | 'lun-dom';
  trabaja_festivos?: boolean;
  fin_semana_4_checadas?: boolean;
  gestiona_descansos_rotativos?: boolean;
}

export interface UsuarioEspecialCreate {
  nombre: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  email?: string;
  telefono?: string;
  username?: string;
  password?: string;
  empresa_id: number;
  departamento_id: number;
  puesto_id: number;
  fecha_ingreso?: string;
  /** Si el puesto es Director: empresas que supervisa (la empresa principal siempre se incluye en backend). */
  empresas_supervision_ids?: number[];
}

/** Catálogo SAT c_RegimenFiscal (GET /personal/regimenes-fiscales-sat) */
export interface RegimenFiscalSatItem {
  code: string;
  descripcion: string;
}

export interface SoporteTicketClaseResponse {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface SoporteTicketClaseCreate {
  nombre: string;
  activo?: boolean;
}

export interface SoporteTicketClaseUpdate {
  nombre?: string;
  activo?: boolean;
}

export interface SoporteTicketTipoResponse {
  id: number;
  nombre: string;
  clase_id?: number | null;
  clase_nombre?: string | null;
  activo: boolean;
}

export interface SoporteTicketTipoCreate {
  nombre: string;
  clase_id?: number | null;
  activo?: boolean;
}

export interface SoporteTicketTipoUpdate {
  nombre?: string;
  clase_id?: number | null;
  activo?: boolean;
}

/** GET /audit/actividad (solo administrador) */
export interface ActividadLogResponse {
  id: number;
  created_at: string;
  nivel: string;
  categoria: string;
  mensaje: string;
  contexto?: string | null;
  empleado_id?: number | null;
  empleado_numero?: string | null;
  empleado_nombre?: string | null;
  empleado_username?: string | null;
  empleado_empresa?: string | null;
  ip_cliente?: string | null;
  metodo_http?: string | null;
  ruta?: string | null;
  codigo_http?: number | null;
  duracion_ms?: number | null;
}

export interface ActividadLogListResponse {
  items: ActividadLogResponse[];
  total: number;
}

export type ActividadPurgeModo = 'categoria' | 'antiguos';

export interface ActividadPurgeRequest {
  modo: ActividadPurgeModo;
  categoria?: string | null;
  /** Mínimo 730 (2 años): no se pueden borrar registros más recientes. */
  dias?: number | null;
  confirmacion?: string | null;
}

export interface ActividadPurgeResponse {
  eliminados: number;
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
  /** Departamento padre (subdepartamento). null = raíz. */
  padre_id?: number | null;
  padre_nombre?: string | null;
  /** Solo hijos: subdepartamento | sucursal */
  tipo?: 'subdepartamento' | 'sucursal' | string | null;
  encargados_ids?: number[] | null;
  encargados_nombres?: string[] | null;
  activo: boolean;
  empresa?: EmpresaResponse | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface DepartamentoCreate {
  nombre: string;
  empresa_id: number;
  jefe_id?: number | null;
  padre_id?: number | null;
  tipo?: 'subdepartamento' | 'sucursal' | null;
  encargados_ids?: number[] | null;
}

export interface DepartamentoUpdate {
  nombre?: string;
  empresa_id?: number;
  jefe_id?: number | null;
  padre_id?: number | null;
  tipo?: 'subdepartamento' | 'sucursal' | null;
  activo?: boolean;
  encargados_ids?: number[] | null;
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
  /** Línea o móvil que la empresa asigna al colaborador (prioritario en tickets de soporte / WhatsApp). */
  telefono_empresa_asignado?: string | null;
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
  /** Bloqueo anti-fuerza bruta (intentos fallidos de login). */
  cuenta_bloqueada?: boolean;
  login_bloqueado_hasta?: string | null;
  login_fallos_consecutivos?: number;
  created_at?: string;
  updated_at?: string | null;
  empresa?: EmpresaResponse | null;
  departamento?: DepartamentoResponse | null;
  /** Director: empresas donde tiene alcance (vacío si no aplica o legado sin filas). */
  empresas_supervisadas_ids?: number[] | null;
}

export interface EmpleadoCreate {
  numero_empleado: string;
  nombre: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  email?: string;
  telefono?: string;
  telefono_empresa_asignado?: string;
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
  /** Director / Subdirector / Gerente General: empresas donde aparece en organigrama. */
  empresas_supervision_ids?: number[];
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
  /** Empleados de esta empresa no entran en el alcance (p. ej. global menos una empresa). */
  empresa_excluida_id?: number | null;
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
  empresa_excluida_id?: number | null;
  dias_cuenta_ley: string;
  dias_regalo_empresa: string;
  activo: boolean;
  notas?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** True si ya se aplicó al menos a un empleado. */
  aplicado?: boolean;
  /** Cantidad de empleados con registro de aplicación. */
  empleados_aplicados?: number;
}

export interface VacacionGeneralAplicacionDetalle {
  empleado_id: number;
  motivo?: string;
  error?: string;
  nombre_empleado?: string | null;
  numero_empleado?: string | null;
  empresa_nombre?: string | null;
}

export interface AplicarVacacionGeneralResultado {
  vacacion_general_id: number;
  empleados_totales: number;
  aplicados: number;
  omitidos: VacacionGeneralAplicacionDetalle[];
  errores: VacacionGeneralAplicacionDetalle[];
}

// ========== CHECADAS ESPECIALES ==========
export type AlcanceChecadaEspecial = 'global' | 'empresa' | 'departamento';

export interface ChecadaEspecialCreate {
  nombre: string;
  fecha: string;
  hora_entrada?: string | null;
  hora_salida?: string | null;
  tolerancia_minutos?: number | null;
  checadas_requeridas: number;
  alcance: AlcanceChecadaEspecial;
  empresa_id?: number | null;
  departamento_id?: number | null;
  empresas_excluidas: number[];
  notas?: string | null;
  activo?: boolean;
}

export interface ChecadaEspecialResponse {
  id: number;
  nombre: string;
  fecha: string;
  fecha_fin?: string | null;
  hora_entrada?: string | null;
  hora_salida?: string | null;
  tolerancia_minutos?: number | null;
  checadas_requeridas: number;
  alcance: string;
  empresa_id?: number | null;
  departamento_id?: number | null;
  empresas_incluidas: number[];
  empresas_excluidas: number[];
  notas?: string | null;
  activo: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  alcance_legacy?: string | null;
  empresa_id_legacy?: number | null;
  departamento_id_legacy?: number | null;
}

export interface ChecadaEspecialUpdate {
  nombre?: string;
  fecha?: string;
  hora_entrada?: string | null;
  hora_salida?: string | null;
  tolerancia_minutos?: number | null;
  checadas_requeridas?: number;
  alcance?: AlcanceChecadaEspecial;
  empresa_id?: number | null;
  departamento_id?: number | null;
  empresas_excluidas?: number[];
  notas?: string | null;
  activo?: boolean;
}
