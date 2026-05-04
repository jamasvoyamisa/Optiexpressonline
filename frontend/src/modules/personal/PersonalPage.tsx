import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import api from '../../services/api';
import { descargarArchivo, XLSX_MIME } from '../../utils/download';
import { parseTimestampForMexico, toMexicoDateString } from '../../utils/date';
import {
  formatQuincenaLabel,
  getQuincenaActualMexico,
  getQuincenaRango,
  quincenaAnterior,
  quincenaSiguiente,
} from '../../utils/quincena';
import { fmtNombreEmpleado, cmpNombreEmpleado } from '../../utils/format';
import { useAuth } from '../../hooks/useAuth';
import { isNominaEnabled } from '../../config/features';
import { Empleado, EmpleadoCreate, Dispositivo, Asistencia, EmpresaResponse, DepartamentoResponse, PuestoResponse, SolicitudVacaciones } from '../../types';

interface FormData extends Omit<EmpleadoCreate, 'registrar_en_checador' | 'dispositivo_ids'> {
  registrar_en_checador: boolean;
  dispositivo_ids: number[];
  password?: string;
  username?: string;
  horario_id?: number;
  horario_sabado_id?: number | null;
}

interface NominaFormData {
  salario_base: string;
  salario_diario_integrado: string;
  tipo_contrato: string;
  regimen_tipo: string;
  periodicidad_pago: string;
  banco_clave: string;
  cuenta_bancaria: string;
  clabe_interbancaria: string;
  entidad_federativa: string;
  riesgo_puesto: string;
  tipo_jornada: string;
  sindicalizado: boolean;
  numero_credito_infonavit: string;
  descuento_infonavit: string;
  numero_credito_infonacot: string;
  descuento_infonacot: string;
}

const emptyNominaForm = (): NominaFormData => ({
  salario_base: '',
  salario_diario_integrado: '',
  tipo_contrato: '',
  regimen_tipo: '',
  periodicidad_pago: '',
  banco_clave: '',
  cuenta_bancaria: '',
  clabe_interbancaria: '',
  entidad_federativa: '',
  riesgo_puesto: '',
  tipo_jornada: '',
  sindicalizado: false,
  numero_credito_infonavit: '',
  descuento_infonavit: '',
  numero_credito_infonacot: '',
  descuento_infonacot: '',
});

type VacPeriodoInfo = {
  anios_antiguedad: number;
  dias_derecho: number;
  dias_tomados: number;
  dias_disponibles: number;
  dias_adelantados?: number;
  fecha_aniversario?: string | null;
  fecha_limite_goce?: string | null;
  /** True si ya pasó la fecha límite de goce (18 meses tras el aniversario de ese periodo). */
  prescrito_por_plazo?: boolean;
  dias_pendientes_historico?: number;
};

interface VacBalanceConPeriodos {
  empleado_id: number;
  año: number;
  periodo_actual?: VacPeriodoInfo | null;
  periodo_anterior?: VacPeriodoInfo | null;
  dias_disponibles: number;
  dias_tomados: number;
  dias_pendientes: number;
  fecha_limite_goce?: string | null;
  dias_deuda_vacaciones_ley?: number;
  saldo_dias_lft_neto: number;
  /** Días fuera de LFT (migración / saldo heredado). */
  dias_saldo_migracion_vacaciones?: number;
  /** saldo_dias_lft_neto + dias_saldo_migracion_vacaciones */
  saldo_total_con_migracion?: number;
}

type CatNominaBuckets = {
  tipos_contrato: { clave: string; descripcion: string }[];
  tipos_regimen: { clave: string; descripcion: string }[];
  periodicidad_pago: { clave: string; descripcion: string }[];
  bancos: { clave: string; descripcion: string }[];
  entidades_federativas: { clave: string; descripcion: string }[];
  riesgos_puesto: { clave: string; descripcion: string }[];
  tipos_jornada: { clave: string; descripcion: string }[];
};

function buildNominaApiPayload(nf: NominaFormData): Record<string, unknown> {
  const np: Record<string, unknown> = {};
  if (nf.salario_base.trim()) np.salario_base = parseFloat(nf.salario_base.replace(/,/g, ''));
  if (nf.salario_diario_integrado.trim()) np.salario_diario_integrado = parseFloat(nf.salario_diario_integrado.replace(/,/g, ''));
  if (nf.tipo_contrato) np.tipo_contrato = nf.tipo_contrato;
  if (nf.regimen_tipo) np.regimen_tipo = nf.regimen_tipo;
  if (nf.periodicidad_pago) np.periodicidad_pago = nf.periodicidad_pago;
  if (nf.banco_clave) np.banco_clave = nf.banco_clave;
  if (nf.cuenta_bancaria.trim()) np.cuenta_bancaria = nf.cuenta_bancaria.trim();
  if (nf.clabe_interbancaria.trim()) np.clabe_interbancaria = nf.clabe_interbancaria.trim();
  if (nf.entidad_federativa) np.entidad_federativa = nf.entidad_federativa;
  if (nf.riesgo_puesto) np.riesgo_puesto = nf.riesgo_puesto;
  if (nf.tipo_jornada) np.tipo_jornada = nf.tipo_jornada;
  np.sindicalizado = nf.sindicalizado;
  if (nf.numero_credito_infonavit.trim()) np.numero_credito_infonavit = nf.numero_credito_infonavit.trim();
  if (nf.descuento_infonavit.trim()) np.descuento_infonavit = parseFloat(nf.descuento_infonavit);
  if (nf.numero_credito_infonacot.trim()) np.numero_credito_infonacot = nf.numero_credito_infonacot.trim();
  if (nf.descuento_infonacot.trim()) np.descuento_infonacot = parseFloat(nf.descuento_infonacot);
  return np;
}

function NominaBancoFormFields({
  nominaForm,
  setNominaForm,
  catNomina,
}: {
  nominaForm: NominaFormData;
  setNominaForm: Dispatch<SetStateAction<NominaFormData>>;
  catNomina: CatNominaBuckets;
}) {
  return (
    <div style={{ padding: '4px 0 8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div>
          <label style={labelStyle}>Salario base mensual (MXN)</label>
          <input
            style={inputStyle}
            inputMode="decimal"
            value={nominaForm.salario_base}
            onChange={e => setNominaForm(p => ({ ...p, salario_base: e.target.value }))}
            placeholder="0.00"
          />
        </div>
        <div>
          <label style={labelStyle}>Salario Diario Integrado (SDI)</label>
          <input
            style={inputStyle}
            inputMode="decimal"
            value={nominaForm.salario_diario_integrado}
            onChange={e => setNominaForm(p => ({ ...p, salario_diario_integrado: e.target.value }))}
            placeholder="0.00"
          />
        </div>
        <div>
          <label style={labelStyle}>Tipo de contrato (SAT)</label>
          <select style={inputStyle} value={nominaForm.tipo_contrato} onChange={e => setNominaForm(p => ({ ...p, tipo_contrato: e.target.value }))}>
            <option value="">— Seleccionar —</option>
            {catNomina.tipos_contrato.map(c => <option key={c.clave} value={c.clave}>{c.clave} — {c.descripcion}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Régimen (SAT)</label>
          <select style={inputStyle} value={nominaForm.regimen_tipo} onChange={e => setNominaForm(p => ({ ...p, regimen_tipo: e.target.value }))}>
            <option value="">— Seleccionar —</option>
            {catNomina.tipos_regimen.map(c => <option key={c.clave} value={c.clave}>{c.clave} — {c.descripcion}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Periodicidad de pago</label>
          <select style={inputStyle} value={nominaForm.periodicidad_pago} onChange={e => setNominaForm(p => ({ ...p, periodicidad_pago: e.target.value }))}>
            <option value="">— Seleccionar —</option>
            {catNomina.periodicidad_pago.map(c => <option key={c.clave} value={c.clave}>{c.clave} — {c.descripcion}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Tipo de jornada (SAT)</label>
          <select style={inputStyle} value={nominaForm.tipo_jornada} onChange={e => setNominaForm(p => ({ ...p, tipo_jornada: e.target.value }))}>
            <option value="">— Seleccionar —</option>
            {catNomina.tipos_jornada.map(c => <option key={c.clave} value={c.clave}>{c.clave} — {c.descripcion}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Riesgo de puesto (SAT)</label>
          <select style={inputStyle} value={nominaForm.riesgo_puesto} onChange={e => setNominaForm(p => ({ ...p, riesgo_puesto: e.target.value }))}>
            <option value="">— Seleccionar —</option>
            {catNomina.riesgos_puesto.map(c => <option key={c.clave} value={c.clave}>{c.clave} — {c.descripcion}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Entidad federativa (SAT)</label>
          <select style={inputStyle} value={nominaForm.entidad_federativa} onChange={e => setNominaForm(p => ({ ...p, entidad_federativa: e.target.value }))}>
            <option value="">— Seleccionar —</option>
            {catNomina.entidades_federativas.map(c => <option key={c.clave} value={c.clave}>{c.clave} — {c.descripcion}</option>)}
          </select>
        </div>
      </div>

      <p style={{ margin: '18px 0 12px', fontWeight: 600, fontSize: '0.88rem', color: '#374151' }}>Datos bancarios</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div>
          <label style={labelStyle}>Banco</label>
          <select style={inputStyle} value={nominaForm.banco_clave} onChange={e => setNominaForm(p => ({ ...p, banco_clave: e.target.value }))}>
            <option value="">— Seleccionar —</option>
            {catNomina.bancos.map(c => <option key={c.clave} value={c.clave}>{c.clave} — {c.descripcion}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Cuenta bancaria</label>
          <input
            style={inputStyle}
            value={nominaForm.cuenta_bancaria}
            onChange={e => setNominaForm(p => ({ ...p, cuenta_bancaria: e.target.value }))}
            maxLength={20}
            placeholder="Número de cuenta"
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>CLABE interbancaria</label>
          <input
            style={inputStyle}
            value={nominaForm.clabe_interbancaria}
            onChange={e => setNominaForm(p => ({ ...p, clabe_interbancaria: e.target.value.replace(/\D/g, '').slice(0, 18) }))}
            maxLength={18}
            placeholder="18 dígitos"
          />
        </div>
      </div>

      <p style={{ margin: '18px 0 12px', fontWeight: 600, fontSize: '0.88rem', color: '#374151' }}>INFONAVIT / INFONACOT</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div>
          <label style={labelStyle}>No. crédito INFONAVIT</label>
          <input style={inputStyle} value={nominaForm.numero_credito_infonavit} onChange={e => setNominaForm(p => ({ ...p, numero_credito_infonavit: e.target.value }))} maxLength={20} />
        </div>
        <div>
          <label style={labelStyle}>Descuento INFONAVIT (%)</label>
          <input style={inputStyle} inputMode="decimal" value={nominaForm.descuento_infonavit} onChange={e => setNominaForm(p => ({ ...p, descuento_infonavit: e.target.value }))} placeholder="0.00" />
        </div>
        <div>
          <label style={labelStyle}>No. crédito INFONACOT</label>
          <input style={inputStyle} value={nominaForm.numero_credito_infonacot} onChange={e => setNominaForm(p => ({ ...p, numero_credito_infonacot: e.target.value }))} maxLength={20} />
        </div>
        <div>
          <label style={labelStyle}>Descuento INFONACOT (%)</label>
          <input style={inputStyle} inputMode="decimal" value={nominaForm.descuento_infonacot} onChange={e => setNominaForm(p => ({ ...p, descuento_infonacot: e.target.value }))} placeholder="0.00" />
        </div>
      </div>

      <div style={{ marginTop: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem', color: '#374151' }}>
          <input type="checkbox" checked={nominaForm.sindicalizado} onChange={e => setNominaForm(p => ({ ...p, sindicalizado: e.target.checked }))} style={{ width: '16px', height: '16px' }} />
          Empleado sindicalizado
        </label>
      </div>
    </div>
  );
}

interface HorarioSimple {
  id: number;
  nombre: string;
  hora_entrada: string;
  hora_salida: string;
  hora_salida_sabado?: string | null;
  activo: boolean;
}

const emptyForm: FormData = {
  numero_empleado: '', nombre: '', apellido_paterno: '', apellido_materno: '',
  email: '', telefono: '', username: '', empresa_id: undefined, departamento_id: undefined, puesto_id: undefined, curp: '', rfc: '', nss: '',
  direccion: '', colonia: '', cp: '', ciudad: '', fecha_nacimiento: '', contacto_emergencia: '', telefono_emergencia: '',
  fecha_ingreso: '', registrar_en_checador: false, dispositivo_ids: [], password: '', horario_id: undefined, horario_sabado_id: null,
};

const normalizeStr = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/** Elimina caracteres de control y nulos; no permite < > para prevenir inyección HTML. */
const sanitizeText = (val: string) =>
  val.replace(/[\u0000-\u001F\u007F]/g, '').replace(/[<>]/g, '');

const estadoBadge = (estado: string) => {
  const map: Record<string, { bg: string; text: string }> = {
    activo: { bg: '#d4edda', text: '#155724' },
    inactivo: { bg: '#fff3cd', text: '#856404' },
    baja: { bg: '#f8d7da', text: '#721c24' },
  };
  const c = map[estado] || map.activo;
  return (
    <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: c.bg, color: c.text, fontWeight: 500 }}>
      {estado.charAt(0).toUpperCase() + estado.slice(1)}
    </span>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%', height: '38px', padding: '0 12px', border: '1px solid #d1d5db', borderRadius: '6px',
  fontSize: '0.9rem', lineHeight: '38px', outline: 'none', boxSizing: 'border-box', backgroundColor: '#fff',
};

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 500, color: '#374151',
};

const cardStyle: React.CSSProperties = {
  padding: '24px', backgroundColor: 'white', borderRadius: '10px',
  border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

const btnPrimary: React.CSSProperties = {
  padding: '9px 20px', backgroundColor: '#0ea5e9', color: 'white', border: 'none',
  borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap',
};

const btnSuccess: React.CSSProperties = { ...btnPrimary, backgroundColor: '#28a745' };
const btnDanger: React.CSSProperties = { ...btnPrimary, backgroundColor: '#dc3545' };
const btnSecondary: React.CSSProperties = { ...btnPrimary, backgroundColor: '#6c757d' };

const checkboxDeviceStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
  borderRadius: '6px', border: '1px solid #d1d5db', cursor: 'pointer',
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

// Overlay para sub-modales que se abren encima del modal de detalle
const subModalOverlay: React.CSSProperties = {
  ...modalOverlay,
  zIndex: 1100,
  backgroundColor: 'rgba(0,0,0,0.55)',
};

const modalSmall: React.CSSProperties = {
  backgroundColor: 'white', borderRadius: '12px', padding: '28px',
  maxWidth: '500px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

const modalLarge: React.CSSProperties = {
  ...modalSmall,
  maxWidth: '800px',
  width: '92%',
  height: '90vh',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

/** Área desplazable del formulario empleado (tabs); minHeight:0 es necesario para que flex + overflow funcione. */
const empleadoFormScrollArea: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  WebkitOverflowScrolling: 'touch',
  paddingRight: '6px',
};


// ────────────────────────────────────────────────────────────────────────────
// Panel de permisos especiales (solo admin)
// ────────────────────────────────────────────────────────────────────────────
function PermisosEspecialesPanel({ emp, onUpdated }: { emp: Empleado; onUpdated: (updated: Empleado) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (campo: 'exento_incidencias' | 'puede_checar_remoto', valor: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch<Empleado>(`/personal/empleados/${emp.id}/permisos-especiales`, { [campo]: valor });
      onUpdated(res.data);
    } catch {
      setError('No se pudo guardar el cambio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p style={{ margin: '0 0 6px', fontSize: '0.8rem', fontWeight: 600, color: '#6c757d' }}>Permisos especiales</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.82rem', color: '#374151' }}>
          <input
            type="checkbox"
            checked={emp.exento_incidencias ?? false}
            disabled={saving}
            onChange={e => toggle('exento_incidencias', e.target.checked)}
          />
          Exento de incidencias
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.82rem', color: '#374151' }}>
          <input
            type="checkbox"
            checked={emp.puede_checar_remoto ?? false}
            disabled={saving}
            onChange={e => toggle('puede_checar_remoto', e.target.checked)}
          />
          Puede checar remotamente
        </label>
      </div>
      {error && <p style={{ margin: '4px 0 0', color: '#dc3545', fontSize: '0.78rem' }}>{error}</p>}
    </div>
  );
}


export const PersonalPage = () => {
  const { authMe } = useAuth();
  const isAdmin = authMe?.is_superuser === true;
  const isRH = authMe?.is_rh === true;
  const canExport = isAdmin || isRH;
  /** Solo administrador (API nómina restringida a require_superuser). */
  const canEditNomina = isAdmin;
  const [mainTab, setMainTab] = useState<'empleados' | 'departamentos' | 'puestos'>('empleados');
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  /** Incluye usuarios especiales (p. ej. directores) para asignar gerente de departamento. */
  const [empleadosCandidatosGerente, setEmpleadosCandidatosGerente] = useState<Empleado[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaResponse[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartamentoResponse[]>([]);
  const [puestos, setPuestos] = useState<PuestoResponse[]>([]);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [horarios, setHorarios] = useState<HorarioSimple[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('activo');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroDepto, setFiltroDepto] = useState('');
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 30;
  const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);
  const [showDetalle, setShowDetalle] = useState(false);
  const [detalleTab, setDetalleTab] = useState<'info' | 'asistencias' | 'vacaciones' | 'editar' | 'checadores' | 'huella'>('info');
  const [empChecadas, setEmpChecadas] = useState<Asistencia[]>([]);
  const [loadingChecadas, setLoadingChecadas] = useState(false);
  /** Quincena cuyas checadas se muestran en el modal (México, mismo criterio que Mi área). */
  const [empAsistQuincena, setEmpAsistQuincena] = useState<{ year: number; month: number; num: 1 | 2 }>(() =>
    getQuincenaActualMexico(),
  );

  const [vacBalance, setVacBalance] = useState<VacBalanceConPeriodos | null>(null);
  const [vacSolicitudes, setVacSolicitudes] = useState<SolicitudVacaciones[]>([]);
  const [loadingVacaciones, setLoadingVacaciones] = useState(false);
  const [vacSaldoEdit, setVacSaldoEdit] = useState('');
  const [savingVacSaldo, setSavingVacSaldo] = useState(false);
  const [vacMigracionEdit, setVacMigracionEdit] = useState('');
  const [savingVacMigracion, setSavingVacMigracion] = useState(false);
  const [vacError, setVacError] = useState<string | null>(null);

  // Catálogos nómina (cargados una vez)
  const [catNomina, setCatNomina] = useState<CatNominaBuckets>({
    tipos_contrato: [], tipos_regimen: [], periodicidad_pago: [],
    bancos: [], entidades_federativas: [], riesgos_puesto: [], tipos_jornada: [],
  });

  // Modal formulario empleado (crear / editar)
  const [showFormModal, setShowFormModal] = useState(false);
  const [formTab, setFormTab] = useState<'personales' | 'laborales' | 'nomina'>('personales');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [nominaForm, setNominaForm] = useState<NominaFormData>(emptyNominaForm());
  const [savingNomina, setSavingNomina] = useState(false);
  const [usernameManual, setUsernameManual] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [numeroManual, setNumeroManual] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importEmpresaId, setImportEmpresaId] = useState<number | ''>('');
  const [importActualizarExistentes, setImportActualizarExistentes] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Modal departamento (crear / editar)
  const [showDeptoModal, setShowDeptoModal] = useState(false);
  const [editingDeptoId, setEditingDeptoId] = useState<number | null>(null);
  const [deptoForm, setDeptoForm] = useState({ nombre: '', empresa_id: 0 as number | undefined, jefe_id: null as number | null });

  // Modal puesto (crear / editar)
  const [showPuestoModal, setShowPuestoModal] = useState(false);
  const [editingPuestoId, setEditingPuestoId] = useState<number | null>(null);
  const [puestoForm, setPuestoForm] = useState({ empresa_id: undefined as number | undefined, departamento_id: undefined as number | undefined, nombre: '', orden: 0, activo: true });
  const [filtroEmpresaDepto, setFiltroEmpresaDepto] = useState('');
  const [filtroEstadoDepto, setFiltroEstadoDepto] = useState<'todos' | 'activos' | 'inactivos'>('todos');
  const [filtroBusquedaDepto, setFiltroBusquedaDepto] = useState('');
  const [filtroEmpresaPuesto, setFiltroEmpresaPuesto] = useState('');
  const [filtroDeptoPuesto, setFiltroDeptoPuesto] = useState('');

  // Modal checadores
  const [showChecadorModal, setShowChecadorModal] = useState(false);
  const [checadorTarget, setChecadorTarget] = useState<Empleado | null>(null);
  const [checadorDevices, setChecadorDevices] = useState<number[]>([]);

  // Modal huella (solo registrar; cola de replicación eliminada)
  const [showHuellaModal, setShowHuellaModal] = useState(false);
  const [huellaTarget, setHuellaTarget] = useState<Empleado | null>(null);
  const [enrollDevice, setEnrollDevice] = useState<number | null>(null);
  const [tieneHuella, setTieneHuella] = useState(false);
  const [huellaTemplates, setHuellaTemplates] = useState<{ id: number; finger_index: number; source_device_nombre: string | null; updated_at: string | null }[]>([]);
  const [empleadoDispositivos, setEmpleadoDispositivos] = useState<{
    dispositivo_id: number;
    dispositivo_nombre: string;
    dispositivo_ubicacion: string | null;
    enviado: boolean;
    enviado_at: string | null;
    pending_user_id: number | null;
    pending_enroll_id: number | null;
    pending_delete_id: number | null;
    tiene_huella_en_bd: boolean;
    finger_indices: number[];
    checadas_total: number;
    ultima_checada: string | null;
  }[]>([]);
  const [loadingEmpDisp, setLoadingEmpDisp] = useState(false);
  const [borrandoCheckador, setBorrandoCheckador] = useState<number | null>(null);
  const [enrollingHuella, setEnrollingHuella] = useState(false);
  const [enrollStatus, setEnrollStatus] = useState<'idle' | 'completed'>('idle');
  // Replicación de huella
  const [replicaDevice, setReplicaDevice] = useState<number | null>(null);
  const [replicando, setReplicando] = useState(false);
  const [replicaOk, setReplicaOk] = useState<string | null>(null);
  const [, setEnrollId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (filtroEstado) params.append('estado', filtroEstado);
      params.append('limit', '500');
      // Incluir exento_incidencias: si no, al marcar la casilla el API deja de devolver al empleado y “desaparece” del listado.
      params.append('incluir_exentos', 'true');
      const candidatosParams = new URLSearchParams();
      candidatosParams.append('limit', '2000');
      candidatosParams.append('estado', 'activo');
      candidatosParams.append('incluir_exentos', 'true');
      const [empRes, empGerRes, devRes, emprsRes, deptosRes, puestosRes, horRes, catRes] = await Promise.all([
        api.get(`/personal/empleados?${params.toString()}`),
        api.get(`/personal/empleados?${candidatosParams.toString()}`),
        api.get('/asistencia/devices'),
        api.get('/personal/empresas?limit=500'),
        api.get('/personal/departamentos?limit=500'),
        api.get('/personal/puestos'), // sin activo = todos (para puestos tab); form filtra activos
        api.get('/asistencia/horarios?activo=true'),
        (isNominaEnabled && isAdmin ? api.get('/nomina/catalogos') : Promise.resolve({ data: null })).catch(() => ({ data: null })),
      ]);
      setEmpleados(empRes.data);
      setEmpleadosCandidatosGerente(Array.isArray(empGerRes.data) ? empGerRes.data : []);
      setDispositivos(devRes.data);
      setEmpresas(emprsRes.data);
      setDepartamentos(deptosRes.data);
      setPuestos(puestosRes.data);
      setHorarios(Array.isArray(horRes.data) ? horRes.data : []);
      if (catRes.data) {
        setCatNomina({
          tipos_contrato: catRes.data.tipos_contrato ?? [],
          tipos_regimen: catRes.data.tipos_regimen ?? [],
          periodicidad_pago: catRes.data.periodicidad_pago ?? [],
          bancos: catRes.data.bancos ?? [],
          entidades_federativas: catRes.data.entidades_federativas ?? [],
          riesgos_puesto: catRes.data.riesgos_puesto ?? [],
          tipos_jornada: catRes.data.tipos_jornada ?? [],
        });
      }
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  }, [search, filtroEstado, isNominaEnabled, isAdmin]);

  useEffect(() => {
    if ((!isNominaEnabled || !isAdmin) && formTab === 'nomina') setFormTab('personales');
  }, [isNominaEnabled, isAdmin, formTab]);

  useEffect(() => { loadData(); }, [loadData]);

  // Sincronizar selectedEmpleado cuando se recarga la lista (p.ej. después de editar)
  useEffect(() => {
    if (!selectedEmpleado) return;
    const updated = empleados.find(e => e.id === selectedEmpleado.id);
    if (updated) setSelectedEmpleado(updated);
  }, [empleados]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generar username al escribir nombre/apellido (solo en alta, no edición, no si el usuario lo editó manualmente)
  useEffect(() => {
    if (editingId || usernameManual) return;
    const letra = normalizeStr(form.nombre).charAt(0);
    const ap = normalizeStr(form.apellido_paterno || '');
    if (letra && ap) {
      setForm(prev => ({ ...prev, username: letra + ap }));
    }
  }, [form.nombre, form.apellido_paterno, editingId, usernameManual]);

  // Auto-rellenar numero_empleado al seleccionar empresa (solo en alta, no en edición, no si lo editó manualmente)
  useEffect(() => {
    if (editingId || numeroManual || !form.empresa_id) return;
    let cancelled = false;
    api.get(`/personal/empleados/next-numero?empresa_id=${form.empresa_id}`)
      .then(res => { if (!cancelled) setForm(prev => ({ ...prev, numero_empleado: res.data.numero_empleado })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [form.empresa_id, editingId, numeroManual]);

  // Verificar disponibilidad del username cuando cambia
  useEffect(() => {
    if (!form.username || !showFormModal) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ username: form.username! });
        if (editingId) params.append('exclude_id', String(editingId));
        const res = await api.get(`/personal/empleados/check-username?${params}`);
        setUsernameStatus(res.data.available ? 'available' : 'taken');
      } catch { setUsernameStatus('idle'); }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.username, editingId, showFormModal]);

  const handleChange = (field: keyof FormData, value: string | boolean | number | number[] | null | undefined) => {
    const sanitized = typeof value === 'string' ? sanitizeText(value) : value;
    setForm(prev => ({ ...prev, [field]: sanitized }));
  };

  const toggleDeviceInForm = (deviceId: number) => {
    setForm(prev => {
      const ids = prev.dispositivo_ids.includes(deviceId)
        ? prev.dispositivo_ids.filter(id => id !== deviceId)
        : [...prev.dispositivo_ids, deviceId];
      return { ...prev, dispositivo_ids: ids };
    });
  };

  const descargarPlantilla = async () => {
    try {
      await descargarArchivo('/personal/importar/plantilla', 'plantilla_empleados.xlsx', XLSX_MIME);
    } catch (e: any) {
      alert(e?.message || 'Error al descargar plantilla');
    }
  };

  const exportarEmpleadosXlsx = async () => {
    try {
      const params = new URLSearchParams();
      if (filtroEmpresa) params.append('empresa_id', filtroEmpresa);
      if (filtroEstado) params.append('estado', filtroEstado);
      const qs = params.toString();
      await descargarArchivo(
        `/personal/exportar/empleados${qs ? `?${qs}` : ''}`,
        'empleados_export.xlsx',
        XLSX_MIME,
      );
    } catch (e: any) {
      alert(e?.message || 'Error al exportar empleados (solo administradores).');
    }
  };

  const handleImport = async () => {
    if (!importFile || !importEmpresaId) return;
    setImporting(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append('file', importFile);
    fd.append('empresa_id', String(importEmpresaId));
    fd.append('actualizar_existentes', importActualizarExistentes ? 'true' : 'false');
    try {
      const res = await api.post('/personal/importar/xlsx', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
      if ((res.data.creados || 0) > 0 || (res.data.actualizados || 0) > 0) loadData();
    } catch (e: any) {
      const msg = e.response?.data?.detail || 'Error al importar';
      setImportResult({ error: msg });
    } finally {
      setImporting(false);
    }
  };

  const openNewForm = () => {
    setForm({ ...emptyForm });
    setNominaForm(emptyNominaForm());
    setEditingId(null);
    setUsernameManual(false);
    setUsernameStatus('idle');
    setNumeroManual(false);
    setFormTab('personales');
    setShowFormModal(true);
  };


  const formTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px', cursor: 'pointer', border: 'none',
    borderBottom: active ? '3px solid #0ea5e9' : '3px solid transparent',
    backgroundColor: active ? 'rgba(0,123,255,0.08)' : 'transparent',
    fontWeight: active ? 600 : 400, fontSize: '0.88rem', color: active ? '#0ea5e9' : '#555',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.numero_empleado.trim() || !form.nombre.trim() || !form.apellido_paterno?.trim() || !form.apellido_materno?.trim() || !form.fecha_nacimiento) {
      alert('Complete todos los datos personales obligatorios: No. empleado, nombre, apellidos y fecha de nacimiento.');
      return;
    }
    if (!form.empresa_id || !form.departamento_id || !form.puesto_id || !form.fecha_ingreso) {
      alert('Complete todos los datos laborales obligatorios: empresa, departamento, puesto y fecha de ingreso.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(form)) {
        if (key === 'dispositivo_ids') {
          if (Array.isArray(val) && val.length > 0) payload[key] = val;
        } else if (key === 'horario_id' || key === 'horario_sabado_id') {
          payload[key] = val ?? null;
        } else if (val !== '' && val !== null && val !== undefined && val !== false) {
          payload[key] = val;
        } else if (key === 'registrar_en_checador') {
          payload[key] = val;
        }
      }

      let savedEmpleadoId: number | null = editingId;
      if (editingId) {
        delete payload.numero_empleado;
        delete payload.registrar_en_checador;
        delete payload.dispositivo_ids;
        await api.put(`/personal/empleados/${editingId}`, payload);
      } else {
        const res = await api.post('/personal/empleados', payload);
        savedEmpleadoId = res.data?.id ?? null;
        const devCount = form.dispositivo_ids.length;
        const usuario = (form.username || form.numero_empleado || '').trim() || form.numero_empleado;
        const msgLogin = form.password?.trim()
          ? `Ya puede hacer login con usuario "${usuario}" (o número de empleado) y la contraseña indicada.`
          : `Ya puede hacer login con usuario y contraseña: ${form.numero_empleado}`;
        alert(
          (form.registrar_en_checador && devCount > 0 ? `Empleado creado y agregado a ${devCount} checador(es). ` : 'Empleado creado. ') + msgLogin
        );
      }
      if (savedEmpleadoId && isNominaEnabled && isAdmin) {
        setSavingNomina(true);
        try {
          await api.put(`/nomina/empleados/${savedEmpleadoId}/datos`, buildNominaApiPayload(nominaForm));
        } catch { /* silencioso, no bloquear flujo principal */ } finally {
          setSavingNomina(false);
        }
      }
      if (editingId) {
        alert(payload.password ? 'Empleado y contraseña actualizados' : 'Empleado actualizado');
        if (showDetalle) {
          setShowDetalle(false);
          loadData();
          return;
        }
      }
      setShowFormModal(false);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleBaja = async (emp: Empleado) => {
    if (!confirm(`Dar de baja a ${emp.nombre} ${emp.apellido_paterno || ''}?`)) return;
    try {
      await api.delete(`/personal/empleados/${emp.id}`);
      loadData();
      if (selectedEmpleado?.id === emp.id) { setSelectedEmpleado(null); setShowDetalle(false); }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al dar de baja');
    }
  };

  const enviarAChecadores = async () => {
    if (!checadorTarget || checadorDevices.length === 0) { alert('Selecciona al menos un dispositivo'); return; }
    const nombre = `${checadorTarget.nombre} ${checadorTarget.apellido_paterno || ''} ${checadorTarget.apellido_materno || ''}`.trim();
    try {
      const params = checadorDevices.map(id => `dispositivo_ids=${id}`).join('&');
      await api.post(`/asistencia/enqueue-user-multi?${params}`, {
        numero_empleado: checadorTarget.numero_empleado,
        nombre,
        empleado_id: checadorTarget.id,
        ...(checadorTarget.empresa_id != null && checadorTarget.empresa_id !== undefined
          ? { empresa_id: checadorTarget.empresa_id }
          : {}),
      });
      alert(`Empleado agregado a ${checadorDevices.length} checador(es). El agente lo enviara en ~30 segundos.`);
      setShowChecadorModal(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error');
    }
  };

  const iniciarEnrollHuella = async () => {
    if (!huellaTarget || !enrollDevice) { alert('Selecciona un dispositivo'); return; }
    setEnrollingHuella(true);
    try {
      await api.post(`/asistencia/devices/${enrollDevice}/start-enroll`, {
        numero_empleado: huellaTarget.numero_empleado,
        empleado_id: huellaTarget.id,
        ...(huellaTarget.empresa_id != null && huellaTarget.empresa_id !== undefined
          ? { empresa_id: huellaTarget.empresa_id }
          : {}),
      });
      setEnrollStatus('completed');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al enviar solicitud de registro de huella');
    } finally { setEnrollingHuella(false); }
  };

  const cerrarHuellaModal = () => {
    setEnrollStatus('idle');
    setEnrollId(null);
    setShowHuellaModal(false);
  };

  const replicarHuella = async (emp: Empleado) => {
    if (!replicaDevice) { alert('Selecciona un dispositivo destino'); return; }
    setReplicando(true);
    setReplicaOk(null);
    try {
      await api.post(`/asistencia/devices/${replicaDevice}/enqueue-replicate`, { numero_empleado: emp.numero_empleado });
      const devNombre = activeDevices.find(d => d.id === replicaDevice)?.nombre || replicaDevice;
      setReplicaOk(`Replicación encolada hacia "${devNombre}". El agente la procesará en el próximo ciclo.`);
      setReplicaDevice(null);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Error al encolar replicación de huella');
    } finally {
      setReplicando(false);
    }
  };

  const getEmpresaNombre = (empresaId?: number | null) => {
    if (!empresaId) return '-';
    const emp = empresas.find(e => e.id === empresaId);
    return emp ? emp.nombre : '-';
  };

  const getDeptoNombre = (deptoId?: number | null) => {
    if (!deptoId) return '-';
    const d = departamentos.find(dep => dep.id === deptoId);
    return d ? d.nombre : '-';
  };

  // ---- Departamento CRUD ----
  const openNewDepto = () => {
    setDeptoForm({ nombre: '', empresa_id: undefined, jefe_id: null });
    setEditingDeptoId(null);
    setShowDeptoModal(true);
  };

  const startEditDepto = (d: DepartamentoResponse) => {
    setDeptoForm({ nombre: d.nombre, empresa_id: d.empresa_id, jefe_id: d.jefe_id ?? null });
    setEditingDeptoId(d.id);
    setShowDeptoModal(true);
  };

  const handleDeptoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptoForm.nombre.trim() || !deptoForm.empresa_id) { alert('Nombre y empresa son obligatorios'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { nombre: deptoForm.nombre, empresa_id: deptoForm.empresa_id };
      if (deptoForm.jefe_id) payload.jefe_id = deptoForm.jefe_id;
      if (editingDeptoId) {
        await api.put(`/personal/departamentos/${editingDeptoId}`, payload);
        alert('Departamento actualizado');
      } else {
        await api.post('/personal/departamentos', payload);
        alert('Departamento creado');
      }
      setShowDeptoModal(false);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al guardar departamento');
    } finally { setSaving(false); }
  };

  const toggleDeptoActivo = async (d: DepartamentoResponse) => {
    try {
      await api.put(`/personal/departamentos/${d.id}`, { activo: !d.activo });
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error');
    }
  };

  // ---- Puesto CRUD ----
  const PUESTOS_RESERVADOS = ['director', 'gerente general', 'rh', 'gerente', 'supervisor'];
  const isPuestoReservado = (nombre: string) => PUESTOS_RESERVADOS.includes((nombre || '').trim().toLowerCase());

  const openNewPuesto = () => {
    const maxOrden = puestos.length > 0 ? Math.max(...puestos.map(p => p.orden), 0) + 1 : 0;
    const primeraEmpresa = activeEmpresas[0]?.id;
    const primerDepto = primeraEmpresa ? deptosForEmpresa(primeraEmpresa)[0]?.id : undefined;
    setPuestoForm({ empresa_id: primeraEmpresa, departamento_id: primerDepto, nombre: '', orden: maxOrden, activo: true });
    setEditingPuestoId(null);
    setShowPuestoModal(true);
  };

  const startEditPuesto = (p: PuestoResponse) => {
    setPuestoForm({
      empresa_id: p.empresa_id ?? undefined,
      departamento_id: p.departamento_id ?? undefined,
      nombre: p.nombre,
      orden: p.orden,
      activo: p.activo,
    });
    setEditingPuestoId(p.id);
    setShowPuestoModal(true);
  };

  const handlePuestoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puestoForm.nombre.trim()) { alert('Nombre es obligatorio'); return; }
    if (!editingPuestoId) {
      if (isPuestoReservado(puestoForm.nombre)) {
        alert('No se puede crear: Director, Gerente General, RH, Gerente y Supervisor son asignados por el Administrador.');
        return;
      }
      if (!puestoForm.empresa_id || !puestoForm.departamento_id) {
        alert('Selecciona empresa y departamento para crear el puesto.');
        return;
      }
    }
    setSaving(true);
    try {
      if (editingPuestoId) {
        await api.put(`/personal/puestos/${editingPuestoId}`, { nombre: puestoForm.nombre, orden: puestoForm.orden, activo: puestoForm.activo });
        alert('Puesto actualizado');
      } else {
        await api.post('/personal/puestos', {
          empresa_id: puestoForm.empresa_id,
          departamento_id: puestoForm.departamento_id,
          nombre: puestoForm.nombre.trim(),
          orden: puestoForm.orden,
          activo: puestoForm.activo,
        });
        alert('Puesto creado');
      }
      setShowPuestoModal(false);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al guardar puesto');
    } finally { setSaving(false); }
  };

  const togglePuestoActivo = async (p: PuestoResponse) => {
    if (isPuestoReservado(p.nombre)) { alert('No se puede desactivar: Director, Gerente General, RH, Gerente y Supervisor son puestos del sistema.'); return; }
    try {
      await api.put(`/personal/puestos/${p.id}`, { activo: !p.activo });
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error');
    }
  };

  const deletePuesto = async (p: PuestoResponse) => {
    if (isPuestoReservado(p.nombre)) { alert('No se puede eliminar: Director, Gerente General, RH, Gerente y Supervisor son puestos del sistema.'); return; }
    if (!confirm(`¿Eliminar el puesto "${p.nombre}"?`)) return;
    try {
      await api.delete(`/personal/puestos/${p.id}`);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al eliminar');
    }
  };

  const deptosForEmpresa = (empresaId?: number) => {
    if (!empresaId) return [];
    return departamentos.filter(d => d.empresa_id === empresaId && d.activo);
  };

  const directorRelacionadoConEmpresa = (emp: Empleado, empresaId: number) => {
    const pn = (emp.puesto?.nombre || '').trim().toLowerCase();
    if (pn !== 'director') return false;
    if (emp.empresa_id === empresaId) return true;
    return (emp.empresas_supervisadas_ids || []).includes(empresaId);
  };

  const empleadosParaGerenteDepto = (empresaId: number | undefined) => {
    const activos = empleadosCandidatosGerente.filter(e => e.estado === 'activo');
    if (!empresaId) return activos;
    const dirs = activos.filter(e => directorRelacionadoConEmpresa(e, empresaId));
    const dirIds = new Set(dirs.map(d => d.id));
    const rest = activos.filter(e => !dirIds.has(e.id));
    dirs.sort(cmpNombreEmpleado);
    return [...dirs, ...rest];
  };

  const filteredEmpleados = empleados
    .filter(e => {
      if (filtroEmpresa && String(e.empresa_id) !== filtroEmpresa) return false;
      if (filtroDepto && String(e.departamento_id) !== filtroDepto) return false;
      return true;
    })
    .sort(cmpNombreEmpleado);

  const loadChecadas = async (
    empleadoId: number,
    q: { year: number; month: number; num: 1 | 2 },
  ) => {
    setLoadingChecadas(true);
    try {
      const { inicio, fin } = getQuincenaRango(q.year, q.month, q.num);
      const res = await api.get('/asistencia/checadas', {
        params: {
          empleado_id: empleadoId,
          limit: 500,
          fecha_inicio: inicio,
          fecha_fin: fin,
        },
      });
      setEmpChecadas(Array.isArray(res.data) ? res.data : []);
    } catch {
      setEmpChecadas([]);
    } finally {
      setLoadingChecadas(false);
    }
  };

  const loadVacacionesForEmp = useCallback(async (empleadoId: number) => {
    setLoadingVacaciones(true);
    setVacError(null);
    try {
      const [balRes, solRes] = await Promise.all([
        api.get<VacBalanceConPeriodos>(`/vacaciones/balance/${empleadoId}`),
        api.get<SolicitudVacaciones[]>('/vacaciones/solicitudes', {
          params: { empleado_id: empleadoId, limit: 200 },
        }),
      ]);
      const b = balRes.data;
      setVacBalance(b ?? null);
      setVacSolicitudes(Array.isArray(solRes.data) ? solRes.data : []);
      if (b?.saldo_dias_lft_neto != null) {
        setVacSaldoEdit(String(Number(b.saldo_dias_lft_neto)));
      } else {
        setVacSaldoEdit('');
      }
      if (b?.dias_saldo_migracion_vacaciones != null) {
        setVacMigracionEdit(String(Number(b.dias_saldo_migracion_vacaciones)));
      } else {
        setVacMigracionEdit('');
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } };
      const d = ax.response?.data?.detail;
      setVacError(typeof d === 'string' ? d : 'No se pudieron cargar las vacaciones.');
      setVacBalance(null);
      setVacSolicitudes([]);
      setVacSaldoEdit('');
      setVacMigracionEdit('');
    } finally {
      setLoadingVacaciones(false);
    }
  }, []);

  const handleGuardarSaldoVac = async (empleadoId: number) => {
    const raw = vacSaldoEdit.replace(',', '.').trim();
    const n = parseFloat(raw);
    if (raw === '' || Number.isNaN(n)) {
      setVacError('Indica un valor numérico válido para el saldo.');
      return;
    }
    setSavingVacSaldo(true);
    setVacError(null);
    try {
      const r = await api.put<VacBalanceConPeriodos>(`/vacaciones/admin/empleado/${empleadoId}/saldo-lft-neto`, {
        saldo_lft_neto: n,
      });
      const b = r.data;
      setVacBalance(b ?? null);
      if (b?.saldo_dias_lft_neto != null) {
        setVacSaldoEdit(String(Number(b.saldo_dias_lft_neto)));
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } };
      const d = ax.response?.data?.detail;
      setVacError(typeof d === 'string' ? d : 'No se pudo guardar el saldo.');
    } finally {
      setSavingVacSaldo(false);
    }
  };

  const handleGuardarSaldoMigracionVac = async (empleadoId: number) => {
    const raw = vacMigracionEdit.replace(',', '.').trim();
    const n = parseFloat(raw);
    if (raw === '' || Number.isNaN(n) || n < 0) {
      setVacError('Indica un valor numérico ≥ 0 para el saldo de migración.');
      return;
    }
    setSavingVacMigracion(true);
    setVacError(null);
    try {
      const r = await api.put<VacBalanceConPeriodos>(
        `/vacaciones/admin/empleado/${empleadoId}/saldo-migracion-vacaciones`,
        { dias_saldo_migracion_vacaciones: n },
      );
      const b = r.data;
      setVacBalance(b ?? null);
      if (b?.dias_saldo_migracion_vacaciones != null) {
        setVacMigracionEdit(String(Number(b.dias_saldo_migracion_vacaciones)));
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } };
      const d = ax.response?.data?.detail;
      setVacError(typeof d === 'string' ? d : 'No se pudo guardar el saldo de migración.');
    } finally {
      setSavingVacMigracion(false);
    }
  };

  const loadEmpleadoDispositivos = async (emp: Empleado) => {
    setLoadingEmpDisp(true);
    try {
      const res = await api.get(`/asistencia/empleados/${emp.id}/dispositivos`);
      setEmpleadoDispositivos(Array.isArray(res.data) ? res.data : []);
    } catch {
      setEmpleadoDispositivos([]);
    } finally {
      setLoadingEmpDisp(false);
    }
  };

  const borrarDelChecador = async (emp: Empleado, dispositivoId: number, dispositivoNombre: string) => {
    if (!confirm(`¿Borrar a ${nombreCompleto(emp)} del dispositivo "${dispositivoNombre}"?\n\nEl agente eliminará el registro del checador en su próximo ciclo. Después podrás volver a darlo de alta y enrolar de nuevo.`)) {
      return;
    }
    setBorrandoCheckador(dispositivoId);
    try {
      await api.post(`/asistencia/devices/${dispositivoId}/queue-delete`, {
        empleado_id: emp.id,
      });
      await loadEmpleadoDispositivos(emp);
      await loadHuellaTemplates(emp);
    } catch (error) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al encolar el borrado');
    } finally {
      setBorrandoCheckador(null);
    }
  };

  const loadHuellaTemplates = async (emp: Empleado) => {
    setHuellaTemplates([]);
    setTieneHuella(false);
    setReplicaDevice(null);
    setReplicaOk(null);
    try {
      const res = await api.get(
        `/asistencia/fingerprint-templates/${emp.numero_empleado}?empleado_id=${emp.id}`
      );
      const templates = Array.isArray(res.data) ? res.data : [];
      setHuellaTemplates(templates);
      setTieneHuella(templates.length > 0);
    } catch {
      setTieneHuella(false);
      setHuellaTemplates([]);
    }
  };

  const viewDetail = (emp: Empleado) => {
    setSelectedEmpleado(emp);
    setDetalleTab('info');
    setEmpChecadas([]);
    setEmpAsistQuincena(getQuincenaActualMexico());
    setVacBalance(null);
    setVacSolicitudes([]);
    setVacError(null);
    setVacSaldoEdit('');
    setVacMigracionEdit('');
    setLoadingVacaciones(false);
    // Pre-poblar formulario de edición
    setForm({
      numero_empleado: emp.numero_empleado,
      nombre: emp.nombre,
      apellido_paterno: emp.apellido_paterno || '',
      apellido_materno: emp.apellido_materno || '',
      email: emp.email || '',
      telefono: emp.telefono || '',
      empresa_id: emp.empresa_id ?? undefined,
      departamento_id: emp.departamento_id ?? undefined,
      puesto_id: emp.puesto_id ?? undefined,
      curp: emp.curp || '',
      rfc: emp.rfc || '',
      nss: emp.nss || '',
      direccion: emp.direccion || '',
      colonia: emp.colonia || '',
      cp: emp.cp || '',
      ciudad: emp.ciudad || '',
      fecha_nacimiento: emp.fecha_nacimiento ? emp.fecha_nacimiento.slice(0, 10) : '',
      contacto_emergencia: emp.contacto_emergencia || '',
      telefono_emergencia: emp.telefono_emergencia || '',
      fecha_ingreso: emp.fecha_ingreso ? emp.fecha_ingreso.slice(0, 10) : '',
      registrar_en_checador: false,
      dispositivo_ids: [],
      password: '',
      username: emp.username || '',
      horario_id: emp.horario_id ?? undefined,
      horario_sabado_id: emp.horario_sabado_id ?? null,
    });
    setEditingId(emp.id);
    setUsernameManual(false);
    setUsernameStatus('idle');
    setFormTab('personales');
    setNominaForm(emptyNominaForm());
    if (isNominaEnabled && isAdmin) {
      api.get(`/nomina/empleados/${emp.id}/datos`)
        .then(r => {
          const d = r.data;
          setNominaForm({
            salario_base: d.salario_base != null ? String(d.salario_base) : '',
            salario_diario_integrado: d.salario_diario_integrado != null ? String(d.salario_diario_integrado) : '',
            tipo_contrato: d.tipo_contrato || '',
            regimen_tipo: d.regimen_tipo || '',
            periodicidad_pago: d.periodicidad_pago || '',
            banco_clave: d.banco_clave || '',
            cuenta_bancaria: d.cuenta_bancaria || '',
            clabe_interbancaria: d.clabe_interbancaria || '',
            entidad_federativa: d.entidad_federativa || '',
            riesgo_puesto: d.riesgo_puesto || '',
            tipo_jornada: d.tipo_jornada || '',
            sindicalizado: !!d.sindicalizado,
            numero_credito_infonavit: d.numero_credito_infonavit || '',
            descuento_infonavit: d.descuento_infonavit != null ? String(d.descuento_infonavit) : '',
            numero_credito_infonacot: d.numero_credito_infonacot || '',
            descuento_infonacot: d.descuento_infonacot != null ? String(d.descuento_infonacot) : '',
          });
        })
        .catch(() => {});
    }
    // Pre-poblar checadores
    setChecadorTarget(emp);
    setChecadorDevices([]);
    // Pre-poblar huella
    setHuellaTarget(emp);
    setEnrollDevice(null);
    setEnrollStatus('idle');
    setEnrollId(null);
    setShowDetalle(true);
  };

  const nombreCompleto = (emp: Empleado) => fmtNombreEmpleado(emp);

  /** Jefe directo (empleado.jefe) o, si no hay, gerente del departamento (incluye usuarios especiales). */
  const nombreJefeInmediato = (emp: Empleado) => {
    if (emp.jefe) {
      return fmtNombreEmpleado(emp.jefe);
    }
    const desdeApi = emp.departamento?.jefe_nombre?.trim();
    if (desdeApi) return desdeApi;
    const d = departamentos.find(x => x.id === emp.departamento_id);
    return (d?.jefe_nombre && d.jefe_nombre.trim()) || '—';
  };

  if (loading && empleados.length === 0) return <div style={{ padding: '20px' }}>Cargando...</div>;

  const stats = {
    total: filteredEmpleados.length,
    activos: filteredEmpleados.filter(e => e.estado === 'activo').length,
    inactivos: filteredEmpleados.filter(e => e.estado === 'inactivo').length,
    bajas: filteredEmpleados.filter(e => e.estado === 'baja').length,
  };

  const activeDevices = dispositivos.filter(d => d.activo);
  const activeEmpresas = empresas.filter(e => e.activo);
  // Puestos para el formulario de empleado: globales (Director, Gerente General, RH) + los del departamento seleccionado
  const activePuestos = puestos.filter(p => {
    if (!p.activo) return false;
    const esGlobal = p.empresa_id == null && p.departamento_id == null;
    const esDelDepto = form.empresa_id && form.departamento_id &&
      p.empresa_id === form.empresa_id && p.departamento_id === form.departamento_id;
    if (esGlobal || esDelDepto) {
      if (isAdmin) return true;
      if (editingId && form.puesto_id === p.id && isPuestoReservado(p.nombre)) return true;
      return !isPuestoReservado(p.nombre);
    }
    return false;
  });
  const filteredDepartamentos = departamentos.filter(d => {
    if (filtroEmpresaDepto && d.empresa_id !== Number(filtroEmpresaDepto)) return false;
    if (filtroEstadoDepto === 'activos' && !d.activo) return false;
    if (filtroEstadoDepto === 'inactivos' && d.activo) return false;
    if (filtroBusquedaDepto.trim()) {
      const q = filtroBusquedaDepto.trim().toLowerCase();
      const nombre = (d.nombre || '').toLowerCase();
      const empresa = (d.empresa?.nombre || getEmpresaNombre(d.empresa_id) || '').toLowerCase();
      const gerente = (d.jefe_nombre || '').toLowerCase();
      if (!nombre.includes(q) && !empresa.includes(q) && !gerente.includes(q)) return false;
    }
    return true;
  });

  const mainTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 28px', cursor: 'pointer', border: 'none',
    borderBottom: active ? '3px solid #0ea5e9' : '3px solid transparent',
    backgroundColor: 'transparent', fontWeight: active ? 700 : 400,
    fontSize: '1rem', color: active ? '#0ea5e9' : '#888',
  });

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ margin: 0 }}>Gestion de Personal</h1>
      </div>

      {/* Main Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '20px' }}>
        <button style={mainTabStyle(mainTab === 'empleados')} onClick={() => setMainTab('empleados')}>Empleados</button>
        <button style={mainTabStyle(mainTab === 'departamentos')} onClick={() => setMainTab('departamentos')}>Departamentos</button>
        <button style={mainTabStyle(mainTab === 'puestos')} onClick={() => setMainTab('puestos')}>Puestos</button>
      </div>

      {/* ====== TAB: DEPARTAMENTOS ====== */}
      {mainTab === 'departamentos' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'nowrap', overflowX: 'auto' }}>
              <p style={{ margin: 0, color: '#555' }}>{filteredDepartamentos.length} departamento(s) registrado(s)</p>
              <input
                type="text"
                value={filtroBusquedaDepto}
                onChange={e => setFiltroBusquedaDepto(e.target.value)}
                placeholder="Buscar departamento..."
                style={{ ...inputStyle, width: '220px' }}
              />
              <select
                value={filtroEmpresaDepto}
                onChange={e => setFiltroEmpresaDepto(e.target.value)}
                style={{ ...inputStyle, maxWidth: '220px' }}
              >
                <option value="">Todas las empresas</option>
                {activeEmpresas.map(emp => (
                  <option key={emp.id} value={String(emp.id)}>{emp.nombre}</option>
                ))}
              </select>
              <select
                value={filtroEstadoDepto}
                onChange={e => setFiltroEstadoDepto(e.target.value as 'todos' | 'activos' | 'inactivos')}
                style={{ ...inputStyle, maxWidth: '160px' }}
              >
                <option value="todos">Todos</option>
                <option value="activos">Activos</option>
                <option value="inactivos">Inactivos</option>
              </select>
            </div>
            <button onClick={openNewDepto} style={btnSuccess}>+ Nuevo Departamento</button>
          </div>
          {filteredDepartamentos.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No hay departamentos registrados.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    {['Nombre', 'Empresa', 'Gerente', 'Empleados', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDepartamentos.map(d => {
                    const count = empleados.filter(e => e.departamento_id === d.id).length;
                    return (
                      <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '11px 14px', fontWeight: 500 }}>{d.nombre}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{d.empresa?.nombre || getEmpresaNombre(d.empresa_id)}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{d.jefe_nombre || '-'}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 600 }}>{count}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: d.activo ? '#d4edda' : '#f8d7da', color: d.activo ? '#155724' : '#721c24', fontWeight: 500 }}>
                            {d.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => startEditDepto(d)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px' }}>Editar</button>
                            <button onClick={() => toggleDeptoActivo(d)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: d.activo ? '#dc3545' : '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>
                              {d.activo ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ====== TAB: PUESTOS ====== */}
      {mainTab === 'puestos' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <p style={{ margin: 0, color: '#555' }}>
                {puestos.filter(p => {
                  if (filtroEmpresaPuesto && p.empresa_id != null && (p.empresa_id !== Number(filtroEmpresaPuesto))) return false;
                  if (filtroDeptoPuesto && (p.departamento_id !== Number(filtroDeptoPuesto))) return false;
                  return true;
                }).length} puesto(s) registrado(s)
              </p>
              <select value={filtroEmpresaPuesto} onChange={e => { setFiltroEmpresaPuesto(e.target.value); setFiltroDeptoPuesto(''); }} style={{ ...inputStyle, maxWidth: '180px' }}>
                <option value="">Todas las empresas</option>
                {activeEmpresas.map(emp => (
                  <option key={emp.id} value={String(emp.id)}>{emp.nombre}</option>
                ))}
              </select>
              <select value={filtroDeptoPuesto} onChange={e => setFiltroDeptoPuesto(e.target.value)} style={{ ...inputStyle, maxWidth: '180px' }} disabled={!filtroEmpresaPuesto}>
                <option value="">Todos los departamentos</option>
                {deptosForEmpresa(filtroEmpresaPuesto ? Number(filtroEmpresaPuesto) : undefined).map(d => (
                  <option key={d.id} value={String(d.id)}>{d.nombre}</option>
                ))}
              </select>
            </div>
            <button onClick={openNewPuesto} style={btnSuccess}>+ Nuevo Puesto</button>
          </div>
          {puestos.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No hay puestos registrados.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    {['Nombre', 'Empresa', 'Departamento', 'Orden', 'Empleados', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {puestos
                    .filter(p => {
                      if (filtroEmpresaPuesto && p.empresa_id != null && (p.empresa_id !== Number(filtroEmpresaPuesto))) return false;
                      if (filtroDeptoPuesto && (p.departamento_id !== Number(filtroDeptoPuesto))) return false;
                      return true;
                    })
                    .map(p => {
                    const count = empleados.filter(e => e.puesto_id === p.id).length;
                    const reservado = isPuestoReservado(p.nombre);
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '11px 14px', fontWeight: 500 }}>{p.nombre}{reservado ? ' (sistema)' : ''}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{p.empresa_nombre ?? '—'}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{p.departamento_nombre ?? '—'}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{p.orden}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 600 }}>{count}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: p.activo ? '#d4edda' : '#f8d7da', color: p.activo ? '#155724' : '#721c24', fontWeight: 500 }}>
                            {p.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => startEditPuesto(p)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px' }}>Editar</button>
                            {!reservado && (
                              <>
                                <button onClick={() => togglePuestoActivo(p)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: p.activo ? '#dc3545' : '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>
                                  {p.activo ? 'Desactivar' : 'Activar'}
                                </button>
                                <button onClick={() => deletePuesto(p)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>Eliminar</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ====== TAB: EMPLEADOS ====== */}
      {mainTab === 'empleados' && (
        <>
          {/* Stats + botón en la misma línea */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
            {[
              { label: 'Total', value: stats.total, color: '#333' },
              { label: 'Activos', value: stats.activos, color: '#28a745' },
              { label: 'Inactivos', value: stats.inactivos, color: '#ffc107' },
              { label: 'Bajas', value: stats.bajas, color: '#dc3545' },
            ].map(s => (
              <div key={s.label} style={{ ...cardStyle, padding: '12px 16px', minWidth: '90px', flex: '1 1 90px', maxWidth: '140px' }}>
                <div style={{ color: '#888', fontSize: '0.78rem', marginBottom: '2px' }}>{s.label}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: s.color }}>{s.value}</div>
              </div>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canExport && (
                <>
                  <button type="button" onClick={exportarEmpleadosXlsx} style={{ ...btnSuccess, backgroundColor: '#0d9488' }}>⬇ Exportar XLSX</button>
                </>
              )}
              {isAdmin && (
                <>
                  <button type="button" onClick={() => setShowImport(true)} style={{ ...btnSuccess, backgroundColor: '#6366f1' }}>⬆ Importar XLSX</button>
                </>
              )}
              <button onClick={openNewForm} style={btnSuccess}>+ Nuevo Empleado</button>
            </div>
          </div>

          {/* Search + Filters */}
          <div style={{ ...cardStyle, marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Buscar por nombre, numero o email..."
              value={search} onChange={e => { setSearch(e.target.value); setPagina(1); }}
              onKeyDown={e => e.key === 'Enter' && loadData()}
              style={{ ...inputStyle, maxWidth: '300px' }} />
            <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }} style={{ ...inputStyle, maxWidth: '160px' }}>
              <option value="">Todos los estados</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
              <option value="baja">Bajas</option>
            </select>
            <select value={filtroEmpresa} onChange={e => { setFiltroEmpresa(e.target.value); setFiltroDepto(''); setPagina(1); }} style={{ ...inputStyle, maxWidth: '200px' }}>
              <option value="">Todas las empresas</option>
              {activeEmpresas.map(emp => (
                <option key={emp.id} value={String(emp.id)}>{emp.nombre}</option>
              ))}
            </select>
            <select
              value={filtroDepto}
              onChange={e => { setFiltroDepto(e.target.value); setPagina(1); }}
              style={{ ...inputStyle, maxWidth: '200px' }}
              disabled={!filtroEmpresa}
            >
              <option value="">Todos los departamentos</option>
              {departamentos
                .filter(d => !filtroEmpresa || String(d.empresa_id) === filtroEmpresa)
                .map(d => (
                  <option key={d.id} value={String(d.id)}>{d.nombre}</option>
                ))
              }
            </select>
            <button onClick={loadData} style={btnPrimary}>Buscar</button>
          </div>

          {/* Table */}
          {(() => {
            const totalPaginas = Math.max(1, Math.ceil(filteredEmpleados.length / POR_PAGINA));
            const paginaReal = Math.min(pagina, totalPaginas);
            const inicio = (paginaReal - 1) * POR_PAGINA;
            const empPagina = filteredEmpleados.slice(inicio, inicio + POR_PAGINA);

            const btnPag = (activo: boolean): React.CSSProperties => ({
              padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: '5px',
              backgroundColor: activo ? '#0ea5e9' : 'white',
              color: activo ? 'white' : '#374151',
              cursor: activo ? 'default' : 'pointer', fontSize: '0.82rem', fontWeight: activo ? 700 : 400,
            });

            return filteredEmpleados.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No se encontraron empleados.</p>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8f9fa' }}>
                        {['No.', 'Nombre completo', 'Empresa', 'Depto.', 'Puesto', 'Jefe inmediato', 'Telefono', 'Estado', 'Acciones'].map(h => (
                          <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {empPagina.map(emp => (
                        <tr key={emp.id} style={{ borderBottom: '1px solid #eee' }} onDoubleClick={() => viewDetail(emp)}>
                          <td style={{ padding: '11px 14px', fontWeight: 500 }}>{emp.numero_empleado}</td>
                          <td style={{ padding: '11px 14px' }}>{nombreCompleto(emp)}</td>
                          <td style={{ padding: '11px 14px', color: '#555' }}>{emp.empresa?.nombre || getEmpresaNombre(emp.empresa_id)}</td>
                          <td style={{ padding: '11px 14px', color: '#555' }}>{emp.departamento?.nombre || getDeptoNombre(emp.departamento_id)}</td>
                          <td style={{ padding: '11px 14px', color: '#555' }}>{emp.puesto?.nombre || '-'}</td>
                          <td style={{ padding: '11px 14px', color: '#555' }}>{nombreJefeInmediato(emp)}</td>
                          <td style={{ padding: '11px 14px', color: '#555' }}>{emp.telefono || '-'}</td>
                          <td style={{ padding: '11px 14px' }}>{estadoBadge(emp.estado)}</td>
                          <td style={{ padding: '11px 14px' }}>
                            <button onClick={() => viewDetail(emp)} style={{ padding: '4px 12px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px' }}>Ver</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Paginación */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                    {filteredEmpleados.length} empleado(s) · mostrando {inicio + 1}–{Math.min(inicio + POR_PAGINA, filteredEmpleados.length)}
                  </span>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button style={{ ...btnPag(false), opacity: paginaReal === 1 ? 0.4 : 1 }} disabled={paginaReal === 1} onClick={() => setPagina(1)}>«</button>
                    <button style={{ ...btnPag(false), opacity: paginaReal === 1 ? 0.4 : 1 }} disabled={paginaReal === 1} onClick={() => setPagina(p => p - 1)}>‹</button>
                    {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPaginas || Math.abs(p - paginaReal) <= 2)
                      .reduce<(number | 'sep')[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('sep');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === 'sep'
                          ? <span key={`s${i}`} style={{ padding: '5px 4px', color: '#9ca3af', fontSize: '0.82rem' }}>…</span>
                          : <button key={p} style={btnPag(p === paginaReal)} onClick={() => setPagina(p as number)}>{p}</button>
                      )
                    }
                    <button style={{ ...btnPag(false), opacity: paginaReal === totalPaginas ? 0.4 : 1 }} disabled={paginaReal === totalPaginas} onClick={() => setPagina(p => p + 1)}>›</button>
                    <button style={{ ...btnPag(false), opacity: paginaReal === totalPaginas ? 0.4 : 1 }} disabled={paginaReal === totalPaginas} onClick={() => setPagina(totalPaginas)}>»</button>
                  </div>
                </div>
              </>
            );
          })()}
        </>
      )}

      {/* ========== MODAL: FORMULARIO CREAR/EDITAR ========== */}
      {showFormModal && (
        <div style={subModalOverlay} onClick={() => setShowFormModal(false)}>
          <div style={modalLarge} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
              <h3 style={{ margin: 0 }}>{editingId ? 'Editar Empleado' : 'Alta de Empleado'}</h3>
              <button onClick={() => setShowFormModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
            </div>
            <form
              onSubmit={handleSubmit}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', borderBottom: '2px solid #e5e7eb', marginBottom: '12px', flexShrink: 0 }}>
                <button type="button" style={formTabStyle(formTab === 'personales')} onClick={() => setFormTab('personales')}>
                  Datos personales
                </button>
                <button type="button" style={formTabStyle(formTab === 'laborales')} onClick={() => setFormTab('laborales')}>
                  Datos laborales
                </button>
                {isNominaEnabled && isAdmin && (
                  <button type="button" style={formTabStyle(formTab === 'nomina')} onClick={() => setFormTab('nomina')}>
                    Nómina / Banco
                  </button>
                )}
              </div>

              <div style={empleadoFormScrollArea}>
              {formTab === 'personales' && (
                <div style={{ padding: '8px 0 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                    <div>
                      <label style={labelStyle}>Nombre *</label>
                      <input style={inputStyle} value={form.nombre} onChange={e => handleChange('nombre', e.target.value)} required maxLength={100} />
                    </div>
                    <div>
                      <label style={labelStyle}>Apellido Paterno *</label>
                      <input style={inputStyle} value={form.apellido_paterno} onChange={e => handleChange('apellido_paterno', e.target.value)} required maxLength={100} />
                    </div>
                    <div>
                      <label style={labelStyle}>Apellido Materno *</label>
                      <input style={inputStyle} value={form.apellido_materno} onChange={e => handleChange('apellido_materno', e.target.value)} required maxLength={100} />
                    </div>
                    <div>
                      <label style={labelStyle}>Fecha de Nacimiento *</label>
                      <input type="date" style={inputStyle} value={form.fecha_nacimiento} onChange={e => handleChange('fecha_nacimiento', e.target.value)} required />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Direccion</label>
                      <input style={inputStyle} value={form.direccion} onChange={e => handleChange('direccion', e.target.value)} placeholder="Calle y numero" maxLength={200} />
                    </div>
                    <div>
                      <label style={labelStyle}>Colonia</label>
                      <input style={inputStyle} value={form.colonia} onChange={e => handleChange('colonia', e.target.value)} maxLength={100} />
                    </div>
                    <div>
                      <label style={labelStyle}>CP</label>
                      <input style={inputStyle} value={form.cp} onChange={e => handleChange('cp', e.target.value.replace(/\D/g, ''))} placeholder="5 digitos" maxLength={5} />
                    </div>
                    <div>
                      <label style={labelStyle}>Ciudad</label>
                      <input style={inputStyle} value={form.ciudad} onChange={e => handleChange('ciudad', e.target.value)} maxLength={100} />
                    </div>
                    <div>
                      <label style={labelStyle}>Telefono</label>
                      <input style={inputStyle} value={form.telefono} onChange={e => handleChange('telefono', e.target.value.replace(/\D/g, ''))} placeholder="10 digitos" maxLength={15} />
                    </div>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input type="email" style={inputStyle} value={form.email} onChange={e => handleChange('email', e.target.value)} maxLength={255} />
                    </div>
                    <div>
                      <label style={labelStyle}>Contacto de emergencia</label>
                      <input style={inputStyle} value={form.contacto_emergencia} onChange={e => handleChange('contacto_emergencia', e.target.value)} maxLength={150} />
                    </div>
                    <div>
                      <label style={labelStyle}>Telefono de emergencia</label>
                      <input style={inputStyle} value={form.telefono_emergencia} onChange={e => handleChange('telefono_emergencia', e.target.value.replace(/\D/g, ''))} maxLength={15} />
                    </div>
                  </div>
                </div>
              )}

              {formTab === 'laborales' && (
                <div style={{ padding: '8px 0 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                    <div>
                      <label style={labelStyle}>Empresa *</label>
                      <select style={inputStyle}
                        value={form.empresa_id ?? ''}
                        onChange={e => {
                          setNumeroManual(false);
                          handleChange('empresa_id', e.target.value ? Number(e.target.value) : undefined);
                        }}
                        required>
                        <option value="">-- Seleccione empresa --</option>
                        {activeEmpresas.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>No. Empleado *</label>
                      <input
                        style={inputStyle}
                        value={form.numero_empleado}
                        onChange={e => { setNumeroManual(true); handleChange('numero_empleado', e.target.value); }}
                        required
                        disabled={!!editingId}
                        placeholder={form.empresa_id ? 'Siguiente al último en la empresa' : 'Seleccione empresa primero'}
                      />
                      {!editingId && form.empresa_id ? (
                        <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                          Se propone el número inmediato al último registrado en esta empresa; puede editarlo si lo necesita.
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label style={labelStyle}>Departamento *</label>
                      <select style={inputStyle}
                        value={form.departamento_id ?? ''}
                        onChange={e => handleChange('departamento_id', e.target.value ? Number(e.target.value) : undefined)}
                        required>
                        <option value="">-- Seleccione departamento --</option>
                        {deptosForEmpresa(form.empresa_id).map(d => (
                          <option key={d.id} value={d.id}>{d.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Puesto *</label>
                      <select style={inputStyle}
                        value={form.puesto_id ?? ''}
                        onChange={e => handleChange('puesto_id', e.target.value ? Number(e.target.value) : undefined)}
                        required>
                        <option value="">-- Seleccione puesto --</option>
                        {activePuestos.map(p => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Horario de trabajo (Lun–Vie)</label>
                      <select
                        style={inputStyle}
                        value={form.horario_id ?? ''}
                        onChange={e => handleChange('horario_id', e.target.value ? Number(e.target.value) : undefined)}
                      >
                        <option value="">-- Sin horario asignado --</option>
                        {horarios.map(h => (
                          <option key={h.id} value={h.id}>{h.nombre} ({h.hora_entrada} – {h.hora_salida})</option>
                        ))}
                      </select>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                        Se usa para detectar retardos y faltas automáticamente
                      </span>
                    </div>
                    <div>
                      <label style={labelStyle}>Horario sábado</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <input
                          type="checkbox"
                          id="chk-trabaja-sabado"
                          checked={form.horario_sabado_id !== null && form.horario_sabado_id !== undefined}
                          onChange={e => handleChange('horario_sabado_id', e.target.checked ? (horarios[0]?.id ?? null) : null)}
                          style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                        />
                        <label htmlFor="chk-trabaja-sabado" style={{ fontSize: '0.85rem', color: '#374151', cursor: 'pointer', margin: 0 }}>
                          ¿Trabaja los sábados?
                        </label>
                      </div>
                      {(form.horario_sabado_id !== null && form.horario_sabado_id !== undefined) ? (
                        <select
                          style={{ ...inputStyle, borderColor: '#d97706' }}
                          value={form.horario_sabado_id ?? ''}
                          onChange={e => handleChange('horario_sabado_id', e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">-- Selecciona horario sábado --</option>
                          {horarios.map(h => (
                            <option key={h.id} value={h.id}>
                              {h.nombre} ({h.hora_entrada} – {h.hora_salida_sabado || h.hora_salida})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                          No se generarán incidencias los sábados
                        </span>
                      )}
                    </div>
                    <div>
                      <label style={labelStyle}>Fecha de ingreso *</label>
                      <input type="date" style={inputStyle} value={form.fecha_ingreso} onChange={e => handleChange('fecha_ingreso', e.target.value)} required />
                    </div>
                    <div>
                      <label style={labelStyle}>CURP</label>
                      <input style={inputStyle} value={form.curp} onChange={e => handleChange('curp', e.target.value.toUpperCase())} maxLength={18} placeholder="18 caracteres" />
                    </div>
                    <div>
                      <label style={labelStyle}>RFC</label>
                      <input style={inputStyle} value={form.rfc} onChange={e => handleChange('rfc', e.target.value.toUpperCase())} maxLength={13} placeholder="13 caracteres" />
                    </div>
                    <div>
                      <label style={labelStyle}>NSS (IMSS)</label>
                      <input style={inputStyle} value={form.nss} onChange={e => handleChange('nss', e.target.value)} maxLength={11} placeholder="11 digitos" />
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginBottom: '16px' }}>
                    <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '0.88rem', color: '#374151' }}>Acceso al sistema</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', maxWidth: '520px' }}>
                      <div>
                        <label style={labelStyle}>Usuario</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            style={{ ...inputStyle, paddingRight: '28px', borderColor: usernameStatus === 'taken' ? '#dc3545' : usernameStatus === 'available' ? '#28a745' : undefined }}
                            value={form.username || ''}
                            onChange={e => {
                              setUsernameManual(true);
                              handleChange('username', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                            }}
                            placeholder="Auto-generado"
                            autoComplete="off"
                          />
                          {usernameStatus === 'checking' && (
                            <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#6b7280' }}>...</span>
                          )}
                          {usernameStatus === 'available' && (
                            <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#28a745', fontWeight: 700 }}>✓</span>
                          )}
                          {usernameStatus === 'taken' && (
                            <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#dc3545', fontWeight: 700 }}>✗</span>
                          )}
                        </div>
                        {usernameStatus === 'taken' && (
                          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#dc3545' }}>Usuario ya en uso</p>
                        )}
                        <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                          1a letra del nombre + apellido paterno
                        </p>
                      </div>
                      <div>
                        <label style={labelStyle}>
                          {editingId ? 'Nueva contraseña' : 'Contraseña inicial'}
                        </label>
                        <input
                          type="password"
                          style={inputStyle}
                          value={form.password || ''}
                          onChange={e => handleChange('password', e.target.value)}
                          placeholder={editingId ? 'Dejar vacio para no cambiar' : 'Por defecto: primeros 8 del RFC'}
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                  </div>
                  {!editingId && (
                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '10px' }}>
                        <input type="checkbox" checked={form.registrar_en_checador}
                          onChange={e => handleChange('registrar_en_checador', e.target.checked)}
                          style={{ width: '18px', height: '18px' }} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Dar de alta en checadores biometricos al crear</span>
                      </label>
                      {form.registrar_en_checador && (
                        <div>
                          <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: '#555' }}>Selecciona los dispositivos:</p>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {activeDevices.map(d => (
                              <label key={d.id} style={{
                                ...checkboxDeviceStyle,
                                backgroundColor: form.dispositivo_ids.includes(d.id) ? '#e8f5e9' : 'white',
                                borderColor: form.dispositivo_ids.includes(d.id) ? '#4caf50' : '#d1d5db',
                              }}>
                                <input type="checkbox" checked={form.dispositivo_ids.includes(d.id)}
                                  onChange={() => toggleDeviceInForm(d.id)}
                                  style={{ width: '16px', height: '16px' }} />
                                <div>
                                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{d.nombre}</div>
                                  {d.ubicacion && <div style={{ fontSize: '0.78rem', color: '#666' }}>{d.ubicacion}</div>}
                                </div>
                              </label>
                            ))}
                          </div>
                          {activeDevices.length === 0 && <p style={{ color: '#999', fontSize: '0.85rem' }}>No hay dispositivos activos.</p>}
                          {form.dispositivo_ids.length > 0 && (
                            <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: '#2e7d32', fontWeight: 500 }}>
                              {form.dispositivo_ids.length} dispositivo(s) seleccionado(s)
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isNominaEnabled && isAdmin && formTab === 'nomina' && (
                <>
                  <NominaBancoFormFields nominaForm={nominaForm} setNominaForm={setNominaForm} catNomina={catNomina} />
                  {savingNomina && <p style={{ marginTop: '8px', fontSize: '0.78rem', color: '#6b7280' }}>Guardando datos de nómina…</p>}
                </>
              )}
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #e5e7eb', flexShrink: 0, background: '#fff' }}>
                <button type="button" onClick={() => setShowFormModal(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                  {saving ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Crear Empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== MODAL UNIFICADO: VER EMPLEADO ========== */}
      {showDetalle && selectedEmpleado && (() => {
        const emp = selectedEmpleado;

        const sections: { title: string; rows: [string, string | undefined | null][] }[] = [
          {
            title: 'Datos Personales',
            rows: [
              ['No. Empleado', emp.numero_empleado],
              ['Nombre', nombreCompleto(emp)],
              ['Fecha de Nacimiento', emp.fecha_nacimiento ? new Date(emp.fecha_nacimiento).toLocaleDateString('es-MX') : undefined],
              ['CURP', emp.curp],
              ['RFC', emp.rfc],
              ['NSS (IMSS)', emp.nss],
            ],
          },
          {
            title: 'Contacto',
            rows: [
              ['Email', emp.email],
              ['Telefono', emp.telefono],
              ['Direccion', emp.direccion],
              ['Colonia', emp.colonia],
              ['CP', emp.cp],
              ['Ciudad', emp.ciudad],
              ['Contacto emergencia', emp.contacto_emergencia],
              ['Tel. emergencia', emp.telefono_emergencia],
            ],
          },
          {
            title: 'Datos Laborales',
            rows: [
              ['Empresa', emp.empresa?.nombre || getEmpresaNombre(emp.empresa_id)],
              ['Departamento', emp.departamento?.nombre || getDeptoNombre(emp.departamento_id)],
              ['Jefe inmediato', nombreJefeInmediato(emp)],
              ['Puesto', emp.puesto?.nombre],
              ['Estado', emp.estado],
              ['Fecha de ingreso (empresa)', emp.fecha_ingreso ? new Date(emp.fecha_ingreso).toLocaleDateString('es-MX') : undefined],
              ['Fecha de Baja', emp.fecha_baja ? new Date(emp.fecha_baja).toLocaleDateString('es-MX') : undefined],
              ['Alta en este sistema (expediente)', emp.created_at ? new Date(emp.created_at).toLocaleString('es-MX') : undefined],
              ['Última modificación del expediente', emp.updated_at ? new Date(emp.updated_at).toLocaleString('es-MX') : undefined],
            ],
          },
        ];

        type EmpDayRow = { key: string; fecha: string; fechaSort: string; entrada?: string; salida_comer?: string; regreso_comer?: string; salida?: string; esTiempoExtra: boolean };
        const empDayRows: EmpDayRow[] = (() => {
          const map = new Map<string, EmpDayRow>();
          for (const c of empChecadas) {
            const d = parseTimestampForMexico(c.timestamp);
            // Misma lógica que Mis asistencias: agrupar por día laboral en México (no UTC).
            // toISOString().slice(0,10) partía la noche del 17: salida ~18:00 quedaba en "día" UTC 18.
            const fechaSort = toMexicoDateString(d);
            const fechaStr = d.toLocaleDateString('es-MX', {
              weekday: 'short',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              timeZone: 'America/Mexico_City',
            });
            if (!map.has(fechaSort)) map.set(fechaSort, { key: fechaSort, fecha: fechaStr, fechaSort, esTiempoExtra: false });
            const row = map.get(fechaSort)!;
            if (c.es_tiempo_extra) row.esTiempoExtra = true;
            const hora = d.toLocaleTimeString('es-MX', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Mexico_City',
            });
            if (c.tipo === 'entrada' && !row.entrada) row.entrada = hora;
            else if (c.tipo === 'salida_comer' && !row.salida_comer) row.salida_comer = hora;
            else if (c.tipo === 'regreso_comer' && !row.regreso_comer) row.regreso_comer = hora;
            else if (c.tipo === 'salida' && !row.salida) row.salida = hora;
          }
          return Array.from(map.values()).sort((a, b) => b.fechaSort.localeCompare(a.fechaSort));
        })();

        const detTabStyle = (active: boolean): React.CSSProperties => ({
          padding: '9px 16px', cursor: 'pointer', border: 'none',
          borderBottom: active ? '3px solid #0ea5e9' : '3px solid transparent',
          backgroundColor: active ? 'rgba(14,165,233,0.07)' : 'transparent',
          fontWeight: active ? 600 : 400,
          fontSize: '0.88rem', color: active ? '#0ea5e9' : '#666',
          whiteSpace: 'nowrap',
        });

        return (
          <div style={modalOverlay} onClick={() => setShowDetalle(false)}>
            <div style={{ ...modalLarge, maxWidth: '920px' }} onClick={e => e.stopPropagation()}>

              {/* Header: cierre arriba a la derecha; «Dar de Baja» abajo para no confundirlo con la X */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <h2 style={{ margin: '0 0 3px 0', fontSize: '1.2rem' }}>{nombreCompleto(emp)}</h2>
                    <p style={{ margin: 0, color: '#666', fontSize: '0.88rem' }}>
                      No. {emp.numero_empleado} &middot; {emp.departamento?.nombre || 'Sin departamento'} &middot; {emp.puesto?.nombre || 'Sin puesto'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, marginLeft: 'auto' }}>
                    {estadoBadge(emp.estado)}
                    <button
                      type="button"
                      onClick={() => setShowDetalle(false)}
                      aria-label="Cerrar ventana"
                      style={{
                        background: '#f3f4f6',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '1.35rem',
                        lineHeight: 1,
                        cursor: 'pointer',
                        color: '#64748b',
                        padding: '6px 14px',
                        minWidth: '44px',
                        minHeight: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      &times;
                    </button>
                  </div>
                </div>
                {emp.estado !== 'baja' && (
                  <div
                    style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid #e5e7eb',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '10px 16px',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: '480px', lineHeight: 1.4 }}>
                      Baja definitiva en el sistema; confirme en el cuadro que aparecerá al pulsar.
                    </span>
                    <button type="button" onClick={() => handleBaja(emp)} style={{ ...btnDanger, padding: '8px 18px', fontSize: '0.88rem', flexShrink: 0 }}>
                      Dar de Baja
                    </button>
                  </div>
                )}
              </div>

              {/* Tabs unificadas */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '18px', overflowX: 'auto', flexShrink: 0 }}>
                <button style={detTabStyle(detalleTab === 'info')} onClick={() => setDetalleTab('info')}>
                  Informacion
                </button>
                <button style={detTabStyle(detalleTab === 'asistencias')} onClick={() => {
                  setDetalleTab('asistencias');
                  void loadChecadas(emp.id, empAsistQuincena);
                }}>
                  Asistencias
                </button>
                <button
                  style={detTabStyle(detalleTab === 'vacaciones')}
                  onClick={() => {
                    setDetalleTab('vacaciones');
                    void loadVacacionesForEmp(emp.id);
                  }}
                >
                  Vacaciones
                </button>
                <button style={detTabStyle(detalleTab === 'editar')} onClick={() => setDetalleTab('editar')}>
                  Editar
                </button>
                {isAdmin && (
                  <button style={detTabStyle(detalleTab === 'checadores')} onClick={() => setDetalleTab('checadores')}>
                    Checadores
                  </button>
                )}
                <button style={detTabStyle(detalleTab === 'huella')} onClick={() => {
                  setDetalleTab('huella');
                  loadHuellaTemplates(emp);
                  loadEmpleadoDispositivos(emp);
                }}>
                  Huella
                </button>
              </div>

              {/* Área de contenido con scroll */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

              {/* ── TAB: INFORMACIÓN ── */}
              {detalleTab === 'info' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                    {sections.map(section => (
                      <div key={section.title} style={{ padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <h4 style={{ margin: '0 0 12px 0', color: '#0ea5e9', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', fontSize: '0.95rem' }}>{section.title}</h4>
                        {section.rows.map(([label, val]) => (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f3f4f6' }}>
                            <span style={{ color: '#666', fontSize: '0.85rem' }}>{label}</span>
                            <span style={{ fontWeight: 500, fontSize: '0.85rem', textAlign: 'right' }}>{val || '-'}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '16px', fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5 }}>
                    <strong>Nota:</strong> la fecha de ingreso es la laboral (contrato / nómina). “Alta en este sistema” es cuando se creó el expediente en esta aplicación; las checadas del reloj no deben ser anteriores a ninguna de las dos.
                  </div>
                </>
              )}

              {/* ── TAB: ASISTENCIAS ── */}
              {detalleTab === 'asistencias' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                    <div />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <button
                        type="button"
                        title="Quincena anterior"
                        onClick={() => {
                          const q = quincenaAnterior(empAsistQuincena.year, empAsistQuincena.month, empAsistQuincena.num);
                          setEmpAsistQuincena(q);
                          void loadChecadas(emp.id, q);
                        }}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: '#0ea5e9',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '1.1rem',
                          lineHeight: 1,
                          fontWeight: 600,
                          boxShadow: '0 1px 3px rgba(14,165,233,0.4)',
                        }}
                      >
                        ←
                      </button>
                      <span style={{ color: '#374151', fontSize: '0.88rem', fontWeight: 600, textAlign: 'center', maxWidth: 'min(360px, 92vw)' }}>
                        {formatQuincenaLabel(empAsistQuincena.year, empAsistQuincena.month, empAsistQuincena.num)}
                      </span>
                      <button
                        type="button"
                        title="Quincena siguiente"
                        onClick={() => {
                          const q = quincenaSiguiente(empAsistQuincena.year, empAsistQuincena.month, empAsistQuincena.num);
                          setEmpAsistQuincena(q);
                          void loadChecadas(emp.id, q);
                        }}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: '#0ea5e9',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '1.1rem',
                          lineHeight: 1,
                          fontWeight: 600,
                          boxShadow: '0 1px 3px rgba(14,165,233,0.4)',
                        }}
                      >
                        →
                      </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => loadChecadas(emp.id, empAsistQuincena)}
                        style={{ ...btnPrimary, padding: '6px 14px', fontSize: '0.8rem' }}
                        disabled={loadingChecadas}
                      >
                        {loadingChecadas ? 'Cargando...' : 'Actualizar'}
                      </button>
                    </div>
                  </div>
                  <p style={{ margin: '0 0 10px 0', color: '#666', fontSize: '0.82rem' }}>
                    Solo esta quincena (calendario México).{' '}
                    <strong>{empChecadas.length}</strong> marca{empChecadas.length !== 1 ? 's' : ''} ·{' '}
                    <strong>{empDayRows.length}</strong> día{empDayRows.length !== 1 ? 's' : ''} con registro.
                    {empChecadas.length >= 500 && (
                      <span style={{ color: '#b45309' }}> Hay más de 500 marcas en el periodo; revisa reporte de asistencia.</span>
                    )}
                  </p>
                  {loadingChecadas && empChecadas.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#888', padding: '20px 0' }}>Cargando asistencias...</p>
                  ) : empDayRows.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#888', padding: '20px 0' }}>No hay asistencias en esta quincena.</p>
                  ) : (
                    <div style={{ overflowX: 'auto', maxHeight: '440px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0, zIndex: 1 }}>
                            <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 600, color: '#555' }}>Fecha</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontWeight: 600, color: '#155724', backgroundColor: '#e8f5e9' }}>Entrada</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontWeight: 600, color: '#856404', backgroundColor: '#fff8e1' }}>Salida Comer</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontWeight: 600, color: '#004085', backgroundColor: '#e3f2fd' }}>Regreso Comer</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontWeight: 600, color: '#721c24', backgroundColor: '#fce4ec' }}>Salida</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empDayRows.map((row) => (
                            <tr key={row.key} style={{ borderBottom: '1px solid #eee', backgroundColor: row.esTiempoExtra ? '#fff8e1' : 'transparent' }}>
                              <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                {row.fecha}
                                {row.esTiempoExtra && (
                                  <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, backgroundColor: '#ff9800', color: 'white' }}>T. EXTRA</span>
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: row.entrada ? '#155724' : '#ccc' }}>{row.entrada || '--:--'}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: row.salida_comer ? '#856404' : '#ccc' }}>{row.salida_comer || '--:--'}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: row.regreso_comer ? '#004085' : '#ccc' }}>{row.regreso_comer || '--:--'}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: row.salida ? '#721c24' : '#ccc' }}>{row.salida || '--:--'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: VACACIONES ── */}
              {detalleTab === 'vacaciones' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                    <button
                      type="button"
                      onClick={() => void loadVacacionesForEmp(emp.id)}
                      style={{ ...btnPrimary, padding: '6px 14px', fontSize: '0.8rem' }}
                      disabled={loadingVacaciones}
                    >
                      {loadingVacaciones ? 'Cargando...' : 'Actualizar'}
                    </button>
                  </div>
                  {loadingVacaciones && !vacBalance && !vacError ? (
                    <p style={{ textAlign: 'center', color: '#888', padding: '20px 0' }}>Cargando vacaciones...</p>
                  ) : vacError && !vacBalance ? (
                    <p style={{ textAlign: 'center', color: '#dc3545', padding: '16px 0' }}>{vacError}</p>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ padding: '14px', borderRadius: '8px', border: '1px solid #bae6fd', backgroundColor: '#f0f9ff' }}>
                          <div style={{ fontSize: '0.78rem', color: '#0369a1', marginBottom: '4px' }}>Saldo LFT</div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#0c4a6e' }}>
                            {vacBalance
                              ? Number(
                                  vacBalance.saldo_total_con_migracion
                                    ?? Number(vacBalance.saldo_dias_lft_neto) + Number(vacBalance.dias_saldo_migracion_vacaciones ?? 0),
                                ).toFixed(2)
                              : '—'}{' '}
                            <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>días</span>
                          </div>
                          {vacBalance && (
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '8px', lineHeight: 1.45 }}>
                              LFT neto: {Number(vacBalance.saldo_dias_lft_neto).toFixed(2)} · Bolsa manual:{' '}
                              {Number(vacBalance.dias_saldo_migracion_vacaciones ?? 0).toFixed(2)} · Adeudo ley:{' '}
                              {Number(vacBalance.dias_deuda_vacaciones_ley ?? 0).toFixed(2)}
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '14px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                          <div style={{ fontSize: '0.78rem', color: '#666', marginBottom: '4px' }}>Días en periodos vigentes</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{vacBalance ? Number(vacBalance.dias_disponibles).toFixed(2) : '—'}</div>
                        </div>
                        <div style={{ padding: '14px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                          <div style={{ fontSize: '0.78rem', color: '#666', marginBottom: '4px' }}>Días pendientes (solicitudes)</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{vacBalance ? Number(vacBalance.dias_pendientes).toFixed(2) : '—'}</div>
                        </div>
                      </div>

                      {(vacBalance?.periodo_actual || vacBalance?.periodo_anterior) && (
                        <div style={{ marginBottom: '16px' }}>
                          <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#374151' }}>Periodos LFT</h4>
                          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                              <thead>
                                <tr style={{ backgroundColor: '#f8f9fa' }}>
                                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Periodo</th>
                                  <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Derecho</th>
                                  <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Tomados</th>
                                  <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Disponibles</th>
                                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Límite goce</th>
                                </tr>
                              </thead>
                              <tbody>
                                {vacBalance?.periodo_anterior && (
                                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '8px 10px' }}>
                                      {vacBalance.periodo_anterior.prescrito_por_plazo
                                        ? `Año de servicio ${vacBalance.periodo_anterior.anios_antiguedad} (fuera de plazo de goce)`
                                        : 'Anterior (por vencer)'}
                                      {vacBalance.periodo_anterior.prescrito_por_plazo && (
                                        <div style={{ fontSize: '0.72rem', color: '#92400e', marginTop: '4px', lineHeight: 1.35 }}>
                                          No suma al saldo LFT vigente. Límite: 18 meses tras el aniversario de ese periodo.
                                          {(vacBalance.periodo_anterior.dias_pendientes_historico ?? 0) > 0 && (
                                            <> Días no tomados al vencer el plazo (referencia): {Number(vacBalance.periodo_anterior.dias_pendientes_historico).toFixed(2)}.</>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{vacBalance.periodo_anterior.dias_derecho}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{Number(vacBalance.periodo_anterior.dias_tomados).toFixed(2)}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{Number(vacBalance.periodo_anterior.dias_disponibles).toFixed(2)}</td>
                                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                      {vacBalance.periodo_anterior.fecha_limite_goce
                                        ? new Date(vacBalance.periodo_anterior.fecha_limite_goce).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })
                                        : '—'}
                                    </td>
                                  </tr>
                                )}
                                {vacBalance?.periodo_actual && (
                                  <tr>
                                    <td style={{ padding: '8px 10px' }}>Actual</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{vacBalance.periodo_actual.dias_derecho}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{Number(vacBalance.periodo_actual.dias_tomados).toFixed(2)}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{Number(vacBalance.periodo_actual.dias_disponibles).toFixed(2)}</td>
                                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                      {vacBalance.periodo_actual.fecha_limite_goce
                                        ? new Date(vacBalance.periodo_actual.fecha_limite_goce).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })
                                        : '—'}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {isAdmin ? (
                        <div style={{ marginBottom: '18px', padding: '14px', borderRadius: '8px', border: '1px solid #fde68a', backgroundColor: '#fffbeb' }}>
                          <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#92400e' }}>Ajuste manual de saldo (administrador)</h4>
                          <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', color: '#92400e', lineHeight: 1.45 }}>
                            El número grande arriba es LFT neto + bolsa manual. Los días de bolsa se guardan aparte y se suman al saldo mostrado; el LFT neto sigue la misma regla que el import de empleados (puede ser negativo).
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                              <label style={{ fontSize: '0.85rem', color: '#374151', minWidth: '140px' }}>Saldo LFT neto</label>
                              <input
                                type="text"
                                value={vacSaldoEdit}
                                onChange={(e) => setVacSaldoEdit(e.target.value)}
                                style={{ width: '120px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
                              />
                              <button
                                type="button"
                                onClick={() => void handleGuardarSaldoVac(emp.id)}
                                disabled={savingVacSaldo}
                                style={savingVacSaldo ? { ...btnPrimary, opacity: 0.65, cursor: 'not-allowed' } : btnPrimary}
                              >
                                {savingVacSaldo ? 'Guardando...' : 'Guardar'}
                              </button>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                              <label style={{ fontSize: '0.85rem', color: '#374151', minWidth: '140px' }}>Días bolsa (suman al saldo)</label>
                              <input
                                type="text"
                                value={vacMigracionEdit}
                                onChange={(e) => setVacMigracionEdit(e.target.value)}
                                style={{ width: '120px', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.9rem' }}
                              />
                              <button
                                type="button"
                                onClick={() => void handleGuardarSaldoMigracionVac(emp.id)}
                                disabled={savingVacMigracion}
                                style={savingVacMigracion ? { ...btnPrimary, opacity: 0.65, cursor: 'not-allowed' } : btnPrimary}
                              >
                                {savingVacMigracion ? 'Guardando...' : 'Guardar'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p style={{ margin: '0 0 16px 0', fontSize: '0.78rem', color: '#6b7280' }}>
                          El ajuste manual del saldo LFT solo puede hacerlo un administrador.
                        </p>
                      )}

                      <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#374151' }}>Solicitudes</h4>
                      {vacSolicitudes.length === 0 ? (
                        <p style={{ color: '#888', fontSize: '0.88rem' }}>No hay solicitudes registradas para este empleado.</p>
                      ) : (
                        <div style={{ overflowX: 'auto', maxHeight: '320px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0, zIndex: 1 }}>
                                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Inicio</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Fin</th>
                                <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Días</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Estado</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Alta</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vacSolicitudes.map((s) => (
                                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                    {s.fecha_inicio ? new Date(s.fecha_inicio).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }) : '—'}
                                  </td>
                                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                    {s.fecha_fin ? new Date(s.fecha_fin).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }) : '—'}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{s.dias_solicitados}</td>
                                  <td style={{ padding: '8px 10px' }}>{(s.estado || '').replace(/_/g, ' ')}</td>
                                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontSize: '0.78rem', color: '#666' }}>
                                    {s.created_at ? new Date(s.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                  {vacError && vacBalance && (
                    <p style={{ color: '#b45309', fontSize: '0.82rem', marginTop: '10px' }}>{vacError}</p>
                  )}
                </div>
              )}

              {/* ── TAB: EDITAR ── */}
              {detalleTab === 'editar' && (
                <form onSubmit={handleSubmit}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', borderBottom: '2px solid #e5e7eb', marginBottom: '16px' }}>
                    <button type="button" style={formTabStyle(formTab === 'personales')} onClick={() => setFormTab('personales')}>Datos personales</button>
                    <button type="button" style={formTabStyle(formTab === 'laborales')} onClick={() => setFormTab('laborales')}>Datos laborales</button>
                    {canEditNomina && isNominaEnabled && (
                      <button
                        type="button"
                        style={formTabStyle(formTab === 'nomina')}
                        onClick={() => {
                          setFormTab('nomina');
                          api.get(`/nomina/empleados/${emp.id}/datos`)
                            .then(r => {
                              const d = r.data;
                              setNominaForm({
                                salario_base: d.salario_base != null ? String(d.salario_base) : '',
                                salario_diario_integrado: d.salario_diario_integrado != null ? String(d.salario_diario_integrado) : '',
                                tipo_contrato: d.tipo_contrato || '',
                                regimen_tipo: d.regimen_tipo || '',
                                periodicidad_pago: d.periodicidad_pago || '',
                                banco_clave: d.banco_clave || '',
                                cuenta_bancaria: d.cuenta_bancaria || '',
                                clabe_interbancaria: d.clabe_interbancaria || '',
                                entidad_federativa: d.entidad_federativa || '',
                                riesgo_puesto: d.riesgo_puesto || '',
                                tipo_jornada: d.tipo_jornada || '',
                                sindicalizado: !!d.sindicalizado,
                                numero_credito_infonavit: d.numero_credito_infonavit || '',
                                descuento_infonavit: d.descuento_infonavit != null ? String(d.descuento_infonavit) : '',
                                numero_credito_infonacot: d.numero_credito_infonacot || '',
                                descuento_infonacot: d.descuento_infonacot != null ? String(d.descuento_infonacot) : '',
                              });
                            })
                            .catch(() => setNominaForm(emptyNominaForm()));
                        }}
                      >
                        Nómina / Banco
                      </button>
                    )}
                  </div>

                  {formTab === 'personales' && (
                    <div style={{ padding: '8px 0 20px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                        <div>
                          <label style={labelStyle}>Nombre *</label>
                          <input style={inputStyle} value={form.nombre} onChange={e => handleChange('nombre', e.target.value)} required />
                        </div>
                        <div>
                          <label style={labelStyle}>Apellido Paterno *</label>
                          <input style={inputStyle} value={form.apellido_paterno} onChange={e => handleChange('apellido_paterno', e.target.value)} required />
                        </div>
                        <div>
                          <label style={labelStyle}>Apellido Materno *</label>
                          <input style={inputStyle} value={form.apellido_materno} onChange={e => handleChange('apellido_materno', e.target.value)} required />
                        </div>
                        <div>
                          <label style={labelStyle}>Fecha de Nacimiento *</label>
                          <input type="date" style={inputStyle} value={form.fecha_nacimiento} onChange={e => handleChange('fecha_nacimiento', e.target.value)} required />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={labelStyle}>Direccion</label>
                          <input style={inputStyle} value={form.direccion} onChange={e => handleChange('direccion', e.target.value)} placeholder="Calle y numero" />
                        </div>
                        <div>
                          <label style={labelStyle}>Colonia</label>
                          <input style={inputStyle} value={form.colonia} onChange={e => handleChange('colonia', e.target.value)} />
                        </div>
                        <div>
                          <label style={labelStyle}>CP</label>
                          <input style={inputStyle} value={form.cp} onChange={e => handleChange('cp', e.target.value)} placeholder="5 digitos" maxLength={5} />
                        </div>
                        <div>
                          <label style={labelStyle}>Ciudad</label>
                          <input style={inputStyle} value={form.ciudad} onChange={e => handleChange('ciudad', e.target.value)} />
                        </div>
                        <div>
                          <label style={labelStyle}>Telefono</label>
                          <input style={inputStyle} value={form.telefono} onChange={e => handleChange('telefono', e.target.value)} placeholder="10 digitos" />
                        </div>
                        <div>
                          <label style={labelStyle}>Email</label>
                          <input type="email" style={inputStyle} value={form.email} onChange={e => handleChange('email', e.target.value)} />
                        </div>
                        <div>
                          <label style={labelStyle}>Contacto de emergencia</label>
                          <input style={inputStyle} value={form.contacto_emergencia} onChange={e => handleChange('contacto_emergencia', e.target.value)} />
                        </div>
                        <div>
                          <label style={labelStyle}>Telefono de emergencia</label>
                          <input style={inputStyle} value={form.telefono_emergencia} onChange={e => handleChange('telefono_emergencia', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  {formTab === 'laborales' && (
                    <div style={{ padding: '8px 0 20px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                        <div>
                          <label style={labelStyle}>Empresa *</label>
                          <select style={inputStyle} value={form.empresa_id ?? ''} onChange={e => { setNumeroManual(false); handleChange('empresa_id', e.target.value ? Number(e.target.value) : undefined); }} required>
                            <option value="">-- Seleccione empresa --</option>
                            {activeEmpresas.map(e2 => <option key={e2.id} value={e2.id}>{e2.nombre}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Departamento *</label>
                          <select style={inputStyle} value={form.departamento_id ?? ''} onChange={e => handleChange('departamento_id', e.target.value ? Number(e.target.value) : undefined)} required>
                            <option value="">-- Seleccione departamento --</option>
                            {deptosForEmpresa(form.empresa_id).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Puesto *</label>
                          <select style={inputStyle} value={form.puesto_id ?? ''} onChange={e => handleChange('puesto_id', e.target.value ? Number(e.target.value) : undefined)} required>
                            <option value="">-- Seleccione puesto --</option>
                            {activePuestos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Horario de trabajo (Lun–Vie)</label>
                          <select style={inputStyle} value={form.horario_id ?? ''} onChange={e => handleChange('horario_id', e.target.value ? Number(e.target.value) : undefined)}>
                            <option value="">-- Sin horario asignado --</option>
                            {horarios.map(h => <option key={h.id} value={h.id}>{h.nombre} ({h.hora_entrada} – {h.hora_salida})</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Horario sábado</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <input type="checkbox" id="chk-trabaja-sabado-det" checked={form.horario_sabado_id !== null && form.horario_sabado_id !== undefined}
                              onChange={e => handleChange('horario_sabado_id', e.target.checked ? (horarios[0]?.id ?? null) : null)}
                              style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
                            <label htmlFor="chk-trabaja-sabado-det" style={{ fontSize: '0.85rem', color: '#374151', cursor: 'pointer', margin: 0 }}>¿Trabaja los sábados?</label>
                          </div>
                          {(form.horario_sabado_id !== null && form.horario_sabado_id !== undefined) && (
                            <select style={{ ...inputStyle, borderColor: '#d97706' }} value={form.horario_sabado_id ?? ''} onChange={e => handleChange('horario_sabado_id', e.target.value ? Number(e.target.value) : null)}>
                              <option value="">-- Selecciona horario sábado --</option>
                              {horarios.map(h => <option key={h.id} value={h.id}>{h.nombre} ({h.hora_entrada} – {h.hora_salida_sabado || h.hora_salida})</option>)}
                            </select>
                          )}
                        </div>
                        <div>
                          <label style={labelStyle}>Fecha de ingreso *</label>
                          <input type="date" style={inputStyle} value={form.fecha_ingreso} onChange={e => handleChange('fecha_ingreso', e.target.value)} required />
                        </div>
                        <div>
                          <label style={labelStyle}>CURP</label>
                          <input style={inputStyle} value={form.curp} onChange={e => handleChange('curp', e.target.value.toUpperCase())} maxLength={18} placeholder="18 caracteres" />
                        </div>
                        <div>
                          <label style={labelStyle}>RFC</label>
                          <input style={inputStyle} value={form.rfc} onChange={e => handleChange('rfc', e.target.value.toUpperCase())} maxLength={13} placeholder="13 caracteres" />
                        </div>
                        <div>
                          <label style={labelStyle}>NSS (IMSS)</label>
                          <input style={inputStyle} value={form.nss} onChange={e => handleChange('nss', e.target.value)} maxLength={11} placeholder="11 digitos" />
                        </div>
                      </div>
                      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                        <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '0.88rem', color: '#374151' }}>Acceso al sistema</p>
                        <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr 1fr' : '1fr 1fr', gap: '14px' }}>
                          <div>
                            <label style={labelStyle}>Usuario</label>
                            <div style={{ position: 'relative' }}>
                              <input
                                style={{ ...inputStyle, paddingRight: '28px', borderColor: usernameStatus === 'taken' ? '#dc3545' : usernameStatus === 'available' ? '#28a745' : undefined }}
                                value={form.username || ''}
                                onChange={e => { setUsernameManual(true); handleChange('username', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '')); }}
                                placeholder="Auto-generado" autoComplete="off"
                              />
                              {usernameStatus === 'checking' && <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#6b7280' }}>...</span>}
                              {usernameStatus === 'available' && <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#28a745', fontWeight: 700 }}>✓</span>}
                              {usernameStatus === 'taken' && <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#dc3545', fontWeight: 700 }}>✗</span>}
                            </div>
                            {usernameStatus === 'taken' && <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#dc3545' }}>Usuario ya en uso</p>}
                          </div>
                          <div>
                            <label style={labelStyle}>Nueva contraseña</label>
                            <input type="password" style={inputStyle} value={form.password || ''} onChange={e => handleChange('password', e.target.value)} placeholder="Dejar vacio para no cambiar" autoComplete="new-password" />
                          </div>
                          {isAdmin && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: '2px' }}>
                              <PermisosEspecialesPanel
                                emp={emp}
                                onUpdated={(updated) => {
                                  setEmpleados((prev) => prev.map((e) => e.id === updated.id ? updated : e));
                                  setSelectedEmpleado(updated);
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {formTab === 'nomina' && canEditNomina && isNominaEnabled && (
                    <div style={{ padding: '8px 0 4px' }}>
                      <NominaBancoFormFields nominaForm={nominaForm} setNominaForm={setNominaForm} catNomina={catNomina} />
                      <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: '#6b7280' }}>
                        Guarda con el botón inferior junto al resto del expediente.
                      </p>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                    <button type="button" onClick={() => setDetalleTab('info')} style={btnSecondary}>Cancelar</button>
                    <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                      {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                  </div>
                </form>
              )}

              {/* ── TAB: CHECADORES (solo admin) ── */}
              {detalleTab === 'checadores' && isAdmin && (
                <div>
                  <p style={{ color: '#555', margin: '0 0 14px', fontSize: '0.9rem' }}>
                    Selecciona los dispositivos a los que deseas enviar al empleado:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                    {activeDevices.filter(d => !d.nombre.toLowerCase().includes('portal')).map(d => (
                      <label key={d.id} style={{
                        ...checkboxDeviceStyle,
                        backgroundColor: checadorDevices.includes(d.id) ? '#e8f5e9' : 'white',
                        borderColor: checadorDevices.includes(d.id) ? '#4caf50' : '#d1d5db',
                      }}>
                        <input type="checkbox" checked={checadorDevices.includes(d.id)}
                          onChange={() => setChecadorDevices(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
                          style={{ width: '16px', height: '16px' }} />
                        <div>
                          <div style={{ fontWeight: 500 }}>{d.nombre}</div>
                          {d.ubicacion && <div style={{ fontSize: '0.78rem', color: '#666' }}>{d.ubicacion}</div>}
                        </div>
                      </label>
                    ))}
                    {activeDevices.filter(d => !d.nombre.toLowerCase().includes('portal')).length === 0 && <p style={{ color: '#999' }}>No hay dispositivos activos.</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button onClick={enviarAChecadores} style={checadorDevices.length === 0 ? { ...btnSuccess, opacity: 0.5, cursor: 'not-allowed' } : btnSuccess} disabled={checadorDevices.length === 0}>
                      Enviar a {checadorDevices.length} dispositivo(s)
                    </button>
                  </div>
                </div>
              )}

              {/* ── TAB: HUELLA ── */}
              {detalleTab === 'huella' && (
                <div>
                  {tieneHuella ? (
                    <div style={{ padding: '12px 14px', borderRadius: '8px', marginBottom: '16px', backgroundColor: '#d4edda', border: '1px solid #c3e6cb' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: huellaTemplates.length > 0 ? '8px' : 0 }}>
                        <span style={{ color: '#155724', fontWeight: 700, fontSize: '1rem' }}>&#10003;</span>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#155724' }}>
                          {huellaTemplates.length} huella{huellaTemplates.length !== 1 ? 's' : ''} guardada{huellaTemplates.length !== 1 ? 's' : ''} para replicación
                        </span>
                      </div>
                      {huellaTemplates.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {huellaTemplates.map(t => (
                            <span key={t.id} style={{ padding: '3px 10px', borderRadius: '20px', backgroundColor: '#b8dfc8', color: '#155724', fontSize: '0.78rem', fontWeight: 500 }}>
                              Dedo {t.finger_index + 1}{t.source_device_nombre ? ` · ${t.source_device_nombre}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', backgroundColor: '#fff3cd', border: '1px solid #ffeeba' }}>
                      <span style={{ fontWeight: 500, fontSize: '0.9rem', color: '#856404' }}>Sin plantilla guardada para replicación. (No impide checar si está enrolado en algún checador.)</span>
                    </div>
                  )}

                  {/* ── Estado por dispositivo ── */}
                  <div style={{ marginBottom: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                    <p style={{ fontWeight: 600, fontSize: '0.95rem', margin: '0 0 6px', color: '#111827' }}>
                      Estado en cada checador
                    </p>
                    <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: '#6b7280' }}>
                      Aquí se ve dónde está dado de alta el empleado y dónde checa físicamente.
                    </p>
                    {loadingEmpDisp ? (
                      <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Cargando…</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f3f4f6', textAlign: 'left' }}>
                              <th style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>Dispositivo</th>
                              <th style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>Estado</th>
                              <th style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>Última checada</th>
                              <th style={{ padding: '8px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {empleadoDispositivos
                              .filter(d => !d.dispositivo_nombre.toLowerCase().includes('portal'))
                              .map(d => {
                                const tieneActividad = d.enviado || d.checadas_total > 0 || d.tiene_huella_en_bd;
                                return (
                                  <tr key={d.dispositivo_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                                      <div style={{ fontWeight: 500 }}>{d.dispositivo_nombre}</div>
                                      {d.dispositivo_ubicacion && (
                                        <div style={{ fontSize: '0.78rem', color: '#666' }}>{d.dispositivo_ubicacion}</div>
                                      )}
                                    </td>
                                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {d.enviado ? (
                                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#d1fae5', color: '#065f46', fontSize: '0.75rem', fontWeight: 600, alignSelf: 'flex-start' }}>
                                            Dado de alta
                                          </span>
                                        ) : (
                                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#f3f4f6', color: '#6b7280', fontSize: '0.75rem', alignSelf: 'flex-start' }}>
                                            Sin alta
                                          </span>
                                        )}
                                        {d.tiene_huella_en_bd && (
                                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#dbeafe', color: '#1e40af', fontSize: '0.75rem', alignSelf: 'flex-start' }}>
                                            Huella guardada ({d.finger_indices.map(f => f + 1).join(', ')})
                                          </span>
                                        )}
                                        {d.pending_enroll_id != null && (
                                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.75rem', alignSelf: 'flex-start' }}>
                                            Enroll pendiente
                                          </span>
                                        )}
                                        {d.pending_delete_id != null && (
                                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#fee2e2', color: '#991b1b', fontSize: '0.75rem', alignSelf: 'flex-start' }}>
                                            Borrado pendiente
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td style={{ padding: '8px', verticalAlign: 'top', color: '#374151' }}>
                                      {d.ultima_checada ? (
                                        <>
                                          <div>{new Date(d.ultima_checada).toLocaleString('es-MX')}</div>
                                          <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                                            {d.checadas_total} checada{d.checadas_total === 1 ? '' : 's'}
                                          </div>
                                        </>
                                      ) : (
                                        <span style={{ color: '#9ca3af' }}>—</span>
                                      )}
                                    </td>
                                    <td style={{ padding: '8px', verticalAlign: 'top', textAlign: 'right' }}>
                                      {tieneActividad && d.pending_delete_id == null && (
                                        <button
                                          onClick={() => borrarDelChecador(emp, d.dispositivo_id, d.dispositivo_nombre)}
                                          disabled={borrandoCheckador === d.dispositivo_id}
                                          style={{
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid #fecaca',
                                            backgroundColor: '#fef2f2',
                                            color: '#991b1b',
                                            fontSize: '0.78rem',
                                            cursor: borrandoCheckador === d.dispositivo_id ? 'not-allowed' : 'pointer',
                                            opacity: borrandoCheckador === d.dispositivo_id ? 0.6 : 1,
                                          }}
                                        >
                                          {borrandoCheckador === d.dispositivo_id ? 'Encolando…' : 'Borrar del checador'}
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            {empleadoDispositivos.filter(d => !d.dispositivo_nombre.toLowerCase().includes('portal')).length === 0 && (
                              <tr>
                                <td colSpan={4} style={{ padding: '12px', color: '#9ca3af', textAlign: 'center' }}>
                                  Sin dispositivos activos.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {enrollStatus === 'completed' && (
                    <div style={{ padding: '16px', backgroundColor: '#d4edda', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <span style={{ fontSize: '1.4rem', color: '#155724', lineHeight: 1 }}>&#10003;</span>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: '0.95rem', color: '#155724', margin: '0 0 4px' }}>Solicitud de registro enviada</p>
                        <p style={{ color: '#155724', fontSize: '0.85rem', margin: 0 }}>
                          El agente procesara el registro de huella en el siguiente ciclo. Pide al empleado que coloque el dedo en el checador cuando el dispositivo lo solicite.
                        </p>
                      </div>
                    </div>
                  )}

                  {enrollStatus === 'idle' && (
                    <>
                      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#555' }}>
                        Selecciona el dispositivo donde el empleado registrara su huella. Debe estar presente fisicamente frente al checador.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        {activeDevices.filter(d => !d.nombre.toLowerCase().includes('portal')).map(d => (
                          <label key={d.id} style={{
                            ...checkboxDeviceStyle,
                            backgroundColor: enrollDevice === d.id ? '#e0f2f1' : 'white',
                            borderColor: enrollDevice === d.id ? '#20c997' : '#d1d5db',
                          }}>
                            <input type="radio" name="enrollDevice" checked={enrollDevice === d.id}
                              onChange={() => setEnrollDevice(d.id)}
                              style={{ width: '16px', height: '16px' }} />
                            <div>
                              <div style={{ fontWeight: 500 }}>{d.nombre}</div>
                              {d.ubicacion && <div style={{ fontSize: '0.78rem', color: '#666' }}>{d.ubicacion}</div>}
                            </div>
                          </label>
                        ))}
                        {activeDevices.filter(d => !d.nombre.toLowerCase().includes('portal')).length === 0 && <p style={{ color: '#999', fontSize: '0.85rem' }}>No hay dispositivos activos.</p>}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button onClick={iniciarEnrollHuella}
                          style={enrollingHuella || !enrollDevice ? { ...btnPrimary, backgroundColor: '#20c997', opacity: 0.6, cursor: 'not-allowed' } : { ...btnPrimary, backgroundColor: '#20c997' }}
                          disabled={enrollingHuella || !enrollDevice}>
                          {enrollingHuella ? 'Iniciando...' : 'Iniciar Registro de Huella'}
                        </button>
                      </div>
                    </>
                  )}

                  {/* ── Sección Replicar Huella ── */}
                  {tieneHuella && activeDevices.filter(d => !d.nombre.toLowerCase().includes('portal')).length > 1 && (
                    <div style={{ marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: '0 0 6px', color: '#374151' }}>
                        Replicar huella a otro dispositivo
                      </p>
                      <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: '#6b7280' }}>
                        Copia la huella almacenada a un segundo checador del mismo modelo. El agente lo procesará en el próximo ciclo.
                      </p>

                      {replicaOk && (
                        <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#d4edda', border: '1px solid #c3e6cb', marginBottom: '12px', fontSize: '0.85rem', color: '#155724' }}>
                          ✓ {replicaOk}
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                        {activeDevices
                          .filter(d => !d.nombre.toLowerCase().includes('portal'))
                          .map(d => (
                            <label key={d.id} style={{
                              ...checkboxDeviceStyle,
                              backgroundColor: replicaDevice === d.id ? '#eff6ff' : 'white',
                              borderColor: replicaDevice === d.id ? '#3b82f6' : '#d1d5db',
                            }}>
                              <input type="radio" name="replicaDevice" checked={replicaDevice === d.id}
                                onChange={() => { setReplicaDevice(d.id); setReplicaOk(null); }}
                                style={{ width: '16px', height: '16px' }} />
                              <div>
                                <div style={{ fontWeight: 500 }}>{d.nombre}</div>
                                {d.ubicacion && <div style={{ fontSize: '0.78rem', color: '#666' }}>{d.ubicacion}</div>}
                              </div>
                            </label>
                          ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => replicarHuella(emp)}
                          disabled={replicando || !replicaDevice}
                          style={replicando || !replicaDevice
                            ? { ...btnPrimary, backgroundColor: '#3b82f6', opacity: 0.6, cursor: 'not-allowed' }
                            : { ...btnPrimary, backgroundColor: '#3b82f6' }}>
                          {replicando ? 'Encolando...' : 'Replicar Huella'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              </div>{/* fin área scroll */}
              </div>{/* fin flex column tabs */}
            </div>
          </div>
        );
      })()}

      {/* ========== MODAL: ENVIAR A CHECADORES ========== */}
      {showChecadorModal && checadorTarget && (
        <div style={subModalOverlay} onClick={() => setShowChecadorModal(false)}>
          <div style={modalSmall} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px' }}>Enviar a Checadores</h3>
            <p style={{ color: '#666', margin: '0 0 16px', fontSize: '0.9rem' }}>
              {nombreCompleto(checadorTarget)} ({checadorTarget.numero_empleado})
            </p>
            <p style={{ fontSize: '0.85rem', color: '#555', margin: '0 0 12px' }}>Selecciona los dispositivos:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {activeDevices.filter(d => !d.nombre.toLowerCase().includes('portal')).map(d => (
                <label key={d.id} style={{
                  ...checkboxDeviceStyle,
                  backgroundColor: checadorDevices.includes(d.id) ? '#e8f5e9' : 'white',
                  borderColor: checadorDevices.includes(d.id) ? '#4caf50' : '#d1d5db',
                }}>
                  <input type="checkbox" checked={checadorDevices.includes(d.id)}
                    onChange={() => setChecadorDevices(prev =>
                      prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id]
                    )}
                    style={{ width: '16px', height: '16px' }} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{d.nombre}</div>
                    {d.ubicacion && <div style={{ fontSize: '0.78rem', color: '#666' }}>{d.ubicacion}</div>}
                  </div>
                </label>
              ))}
              {activeDevices.filter(d => !d.nombre.toLowerCase().includes('portal')).length === 0 && <p style={{ color: '#999' }}>No hay dispositivos activos.</p>}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowChecadorModal(false)} style={btnSecondary}>Cancelar</button>
              <button onClick={enviarAChecadores} style={btnSuccess} disabled={checadorDevices.length === 0}>
                Enviar a {checadorDevices.length} dispositivo(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL: REGISTRAR HUELLA ========== */}
      {showHuellaModal && huellaTarget && (() => {
        return (
          <div style={subModalOverlay} onClick={cerrarHuellaModal}>
            <div style={{ ...modalSmall, maxWidth: '550px' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0 }}>Registrar Huella</h3>
                <button onClick={cerrarHuellaModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
              </div>
              <p style={{ color: '#666', margin: '0 0 16px', fontSize: '0.9rem' }}>
                {nombreCompleto(huellaTarget)} ({huellaTarget.numero_empleado})
              </p>

              {/* Estado de huella */}
              {tieneHuella ? (
                <div style={{ padding: '12px 14px', borderRadius: '8px', marginBottom: '16px', backgroundColor: '#d4edda', border: '1px solid #c3e6cb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: huellaTemplates.length > 0 ? '8px' : 0 }}>
                    <span style={{ color: '#155724', fontWeight: 700, fontSize: '1rem' }}>&#10003;</span>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#155724' }}>
                      {huellaTemplates.length} huella{huellaTemplates.length !== 1 ? 's' : ''} registrada{huellaTemplates.length !== 1 ? 's' : ''} en el sistema
                    </span>
                  </div>
                  {huellaTemplates.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {huellaTemplates.map(t => (
                        <span key={t.id} style={{ padding: '3px 10px', borderRadius: '20px', backgroundColor: '#b8dfc8', color: '#155724', fontSize: '0.78rem', fontWeight: 500 }}>
                          Dedo {t.finger_index + 1}{t.source_device_nombre ? ` · ${t.source_device_nombre}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', backgroundColor: '#fff3cd', border: '1px solid #ffeeba' }}>
                  <span style={{ fontWeight: 500, fontSize: '0.9rem', color: '#856404' }}>Sin huella registrada en el sistema</span>
                </div>
              )}

              <div>
                  {/* Confirmacion: solicitud enviada al agente */}
                  {enrollStatus === 'completed' && (
                    <div style={{ padding: '16px', backgroundColor: '#d4edda', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <span style={{ fontSize: '1.4rem', color: '#155724', lineHeight: 1 }}>&#10003;</span>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: '0.95rem', color: '#155724', margin: '0 0 4px' }}>
                          Solicitud de registro enviada
                        </p>
                        <p style={{ color: '#155724', fontSize: '0.85rem', margin: 0 }}>
                          El agente procesara el registro de huella en el siguiente ciclo. Pide al empleado que coloque el dedo en el checador cuando el dispositivo lo solicite.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Formulario de seleccion de dispositivo */}
                  {enrollStatus === 'idle' && (
                    <>
                      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#555' }}>
                        Selecciona el dispositivo donde el empleado registrara su huella. Debe estar presente fisicamente frente al checador.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        {activeDevices.map(d => (
                          <label key={d.id} style={{
                            ...checkboxDeviceStyle,
                            backgroundColor: enrollDevice === d.id ? '#e0f2f1' : 'white',
                            borderColor: enrollDevice === d.id ? '#20c997' : '#d1d5db',
                          }}>
                            <input type="radio" name="enrollDevice" checked={enrollDevice === d.id}
                              onChange={() => setEnrollDevice(d.id)}
                              style={{ width: '16px', height: '16px' }} />
                            <div>
                              <div style={{ fontWeight: 500 }}>{d.nombre}</div>
                              {d.ubicacion && <div style={{ fontSize: '0.78rem', color: '#666' }}>{d.ubicacion}</div>}
                            </div>
                          </label>
                        ))}
                        {activeDevices.length === 0 && <p style={{ color: '#999', fontSize: '0.85rem' }}>No hay dispositivos activos.</p>}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button onClick={cerrarHuellaModal} style={btnSecondary}>Cancelar</button>
                        <button onClick={iniciarEnrollHuella}
                          style={enrollingHuella || !enrollDevice ? { ...btnPrimary, backgroundColor: '#20c997', opacity: 0.6, cursor: 'not-allowed' } : { ...btnPrimary, backgroundColor: '#20c997' }}
                          disabled={enrollingHuella || !enrollDevice}>
                          {enrollingHuella ? 'Iniciando...' : 'Iniciar Registro de Huella'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
            </div>
          </div>
        );
      })()}

      {/* ========== MODAL: CREAR/EDITAR DEPARTAMENTO ========== */}
      {showDeptoModal && (
        <div style={subModalOverlay} onClick={() => setShowDeptoModal(false)}>
          <div style={modalSmall} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{editingDeptoId ? 'Editar Departamento' : 'Nuevo Departamento'}</h3>
              <button onClick={() => setShowDeptoModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleDeptoSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>Nombre del departamento *</label>
                  <input style={inputStyle} value={deptoForm.nombre}
                    onChange={e => setDeptoForm(p => ({ ...p, nombre: e.target.value }))} required />
                </div>
                <div>
                  <label style={labelStyle}>Empresa *</label>
                  <select style={inputStyle} value={deptoForm.empresa_id ?? ''}
                    onChange={e => setDeptoForm(p => ({ ...p, empresa_id: e.target.value ? Number(e.target.value) : undefined, jefe_id: null }))} required>
                    <option value="">-- Seleccionar empresa --</option>
                    {activeEmpresas.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Gerente del departamento</label>
                  <select style={inputStyle} value={deptoForm.jefe_id ?? ''}
                    onChange={e => setDeptoForm(p => ({ ...p, jefe_id: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">-- Sin gerente asignado --</option>
                    {empleadosParaGerenteDepto(deptoForm.empresa_id).map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {(deptoForm.empresa_id && directorRelacionadoConEmpresa(emp, deptoForm.empresa_id) ? '★ Director — ' : '')}{emp.numero_empleado} - {emp.nombre} {emp.apellido_paterno || ''} ({getEmpresaNombre(emp.empresa_id)} / {getDeptoNombre(emp.departamento_id)})
                      </option>
                    ))}
                  </select>
                  <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#6b7280' }}>
                    Los directores con alcance en esta empresa aparecen primero (★). Puedes asignar gerente de cualquier empresa.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowDeptoModal(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                  {saving ? 'Guardando...' : editingDeptoId ? 'Guardar Cambios' : 'Crear Departamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== MODAL: CREAR/EDITAR PUESTO ========== */}
      {showPuestoModal && (
        <div style={subModalOverlay} onClick={() => setShowPuestoModal(false)}>
          <div style={modalSmall} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{editingPuestoId ? 'Editar Puesto' : 'Nuevo Puesto'}</h3>
              <button onClick={() => setShowPuestoModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handlePuestoSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                {!editingPuestoId && (
                  <>
                    <div>
                      <label style={labelStyle}>Empresa *</label>
                      <select style={inputStyle} value={puestoForm.empresa_id ?? ''}
                        onChange={e => setPuestoForm(p => ({ ...p, empresa_id: e.target.value ? Number(e.target.value) : undefined, departamento_id: undefined }))} required>
                        <option value="">-- Seleccionar empresa --</option>
                        {activeEmpresas.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Departamento *</label>
                      <select style={inputStyle} value={puestoForm.departamento_id ?? ''}
                        onChange={e => setPuestoForm(p => ({ ...p, departamento_id: e.target.value ? Number(e.target.value) : undefined }))}
                        required disabled={!puestoForm.empresa_id}>
                        <option value="">-- Seleccionar departamento --</option>
                        {deptosForEmpresa(puestoForm.empresa_id).map(d => (
                          <option key={d.id} value={d.id}>{d.nombre}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                {editingPuestoId && (puestoForm.empresa_id != null || puestoForm.departamento_id != null) && (
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
                    {puestos.find(x => x.id === editingPuestoId)?.empresa_nombre || '—'} / {puestos.find(x => x.id === editingPuestoId)?.departamento_nombre || '—'}
                  </p>
                )}
                <div>
                  <label style={labelStyle}>Nombre del puesto *</label>
                  <input style={inputStyle} value={puestoForm.nombre}
                    onChange={e => setPuestoForm(p => ({ ...p, nombre: e.target.value }))}
                    placeholder="Ej: Operador, Vendedor" required disabled={!!editingPuestoId && isPuestoReservado(puestoForm.nombre)} />
                  {!editingPuestoId && (
                    <p style={{ fontSize: '0.78rem', color: '#666', margin: '4px 0 0' }}>No se pueden crear: Director, Gerente General, RH, Gerente y Supervisor</p>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Orden</label>
                  <input type="number" style={inputStyle} value={puestoForm.orden}
                    onChange={e => setPuestoForm(p => ({ ...p, orden: parseInt(e.target.value, 10) || 0 }))} min={0} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" id="puesto-activo" checked={puestoForm.activo}
                    onChange={e => setPuestoForm(p => ({ ...p, activo: e.target.checked }))}
                    disabled={!!editingPuestoId && isPuestoReservado(puestoForm.nombre)} />
                  <label htmlFor="puesto-activo" style={{ cursor: 'pointer', fontSize: '0.9rem' }}>Activo</label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowPuestoModal(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                  {saving ? 'Guardando...' : editingPuestoId ? 'Guardar Cambios' : 'Crear Puesto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Modal Importar XLSX (solo admin) ── */}
      {isAdmin && showImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { setShowImport(false); setImportFile(null); setImportEmpresaId(''); setImportActualizarExistentes(false); setImportResult(null); }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, minWidth: 420, maxWidth: 600, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.15rem' }}>Importar Empleados desde XLSX</h3>

            <button type="button" onClick={descargarPlantilla} style={{ background: 'none', border: '1px solid #6366f1', color: '#6366f1', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', marginBottom: 16 }}>
              ⬇ Descargar Plantilla
            </button>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#64748b', marginBottom: 4 }}>
                Empresa destino *
              </label>
              <select
                value={importEmpresaId === '' ? '' : String(importEmpresaId)}
                onChange={e => { setImportEmpresaId(e.target.value ? Number(e.target.value) : ''); setImportResult(null); }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1' }}
              >
                <option value="">Seleccione...</option>
                {empresas.map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>

            <div style={{ border: '2px dashed #cbd5e1', borderRadius: 10, padding: 20, textAlign: 'center', marginBottom: 16, background: '#f8fafc' }}>
              <input
                type="file"
                accept=".xlsx"
                onChange={e => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }}
                style={{ ...inputStyle, height: 'auto', lineHeight: 'normal', padding: '8px 10px' }}
              />
              {importFile && <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#475569' }}>{importFile.name}</p>}
            </div>

            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="import-actualizar-existentes"
                type="checkbox"
                checked={importActualizarExistentes}
                onChange={e => { setImportActualizarExistentes(e.target.checked); setImportResult(null); }}
              />
              <label htmlFor="import-actualizar-existentes" style={{ fontSize: '0.88rem', color: '#334155', cursor: 'pointer' }}>
                Actualizar existentes (completar campos vacíos)
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowImport(false); setImportFile(null); setImportEmpresaId(''); setImportActualizarExistentes(false); setImportResult(null); }} style={btnSecondary}>Cerrar</button>
              <button onClick={handleImport} disabled={!importFile || !importEmpresaId || importing}
                style={!importFile || !importEmpresaId || importing ? { ...btnSuccess, backgroundColor: '#6366f1', opacity: 0.6, cursor: 'not-allowed' } : { ...btnSuccess, backgroundColor: '#6366f1' }}>
                {importing ? 'Importando...' : 'Importar'}
              </button>
            </div>

            {importResult && !importResult.error && (
              <div style={{ marginTop: 16, fontSize: '0.88rem', lineHeight: 1.7 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 10px', borderRadius: 6, fontWeight: 600 }}>Creados: {importResult.creados}</span>
                  <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '3px 10px', borderRadius: 6, fontWeight: 600 }}>Actualizados: {importResult.actualizados || 0}</span>
                  <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: 6, fontWeight: 600 }}>Omitidos: {importResult.omitidos}</span>
                  <span style={{ background: '#fee2e2', color: '#991b1b', padding: '3px 10px', borderRadius: 6, fontWeight: 600 }}>Errores: {importResult.errores_count}</span>
                </div>
                {importResult.detalle_errores?.length > 0 && (
                  <div style={{ background: '#fef2f2', borderRadius: 8, padding: 10, maxHeight: 200, overflowY: 'auto' }}>
                    <strong style={{ color: '#991b1b', fontSize: '0.82rem' }}>Errores:</strong>
                    {importResult.detalle_errores.map((err: any, i: number) => (
                      <div key={i} style={{ fontSize: '0.8rem', color: '#7f1d1d', padding: '2px 0' }}>Fila {err.fila}: {err.error}</div>
                    ))}
                  </div>
                )}
                {importResult.detalle_omitidos?.length > 0 && (
                  <div style={{ background: '#fffbeb', borderRadius: 8, padding: 10, maxHeight: 150, overflowY: 'auto', marginTop: 8 }}>
                    <strong style={{ color: '#92400e', fontSize: '0.82rem' }}>Omitidos (ya existen):</strong>
                    {importResult.detalle_omitidos.map((o: any, i: number) => (
                      <div key={i} style={{ fontSize: '0.8rem', color: '#78350f', padding: '2px 0' }}>Fila {o.fila}: {o.numero_empleado} – {o.nombre}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {importResult?.error && (
              <div style={{ marginTop: 16, background: '#fef2f2', borderRadius: 8, padding: 12, color: '#991b1b', fontSize: '0.88rem' }}>
                {importResult.error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
