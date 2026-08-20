import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { fmtNombreEmpleado } from '../../utils/format';
import { useAuth } from '../../hooks/useAuth';
import { ActividadLogResponse, ActividadPurgeRequest, DepartamentoResponse, Dispositivo, DispositivoCreate, DispositivoUpdate, EmpresaResponse, EmpleadoResponse, PuestoResponse, SoporteTicketClaseResponse, SoporteTicketTipoResponse, UsuarioEspecialCreate } from '../../types';
import { VacacionesGeneralesPage } from '../vacaciones/VacacionesGeneralesPage';
import { ChecadasEspecialesPage } from './ChecadasEspecialesPage';
import DescansosProgramadosPage from '../asistencia/DescansosProgramadosPage';
import { isNominaEnabled } from '../../config/features';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  rhMobileBadge,
  rhMobileBtnPrimary,
  rhMobileBtnSecondary,
  rhMobileCard,
  rhMobileCardRow,
  rhMobileCardSub,
  rhMobileCardTitle,
  rhMobileContentShell,
  rhMobileHero,
  rhMobileTabPill,
  rhMobileTabScroll,
} from '../rh/rhMobileStyles';

/** Parsea ISO del API: con offset/Z tal cual; sin zona se asume UTC (BD). */
const parseApiDate = (iso: string) => {
  const s = String(iso);
  const hasTz = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s);
  return new Date(hasTz ? s : `${s}Z`);
};

/** Fecha/hora de actividad: siempre en zona México. */
const fmtDate = (iso: string) => {
  const d = parseApiDate(iso);
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Mexico_City',
  });
};

/** Texto relativo para ver latidos del agente (cada ~30s). */
const fmtHace = (iso: string) => {
  const sec = Math.max(0, Math.floor((Date.now() - parseApiDate(iso).getTime()) / 1000));
  if (sec < 60) return `hace ${sec}s`;
  if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`;
  return `hace ${Math.floor(sec / 86400)} d`;
};

/** Extrae la empresa del empleado afectado desde el contexto (JSON) del log, si existe. */
const extraerEmpresaContexto = (contexto?: string | null): string | null => {
  if (!contexto) return null;
  try {
    const obj = JSON.parse(contexto);
    const empresa = obj?.empleado_afectado_empresa;
    return typeof empresa === 'string' && empresa.trim() ? empresa.trim() : null;
  } catch {
    return null;
  }
};

const ACTIVIDAD_PAGE_SIZE = 50;

/** Dispositivo virtual del flujo de importación histórica (no se muestra en Configuración). */
const NOMBRE_DISPOSITIVO_IMPORTACION_HISTORICA = 'Importación Histórica';

type DeviceFormState = {
  nombre: string;
  ubicacion: string;
  ip_local: string;
  serial_number: string;
  activo: boolean;
};

const emptyDeviceForm = (): DeviceFormState => ({
  nombre: '',
  ubicacion: '',
  ip_local: '',
  serial_number: '',
  activo: true,
});

function filtrarDispositivosConfiguracion(list: Dispositivo[]): Dispositivo[] {
  return (Array.isArray(list) ? list : []).filter(
    (d) => (d.nombre || '').trim() !== NOMBRE_DISPOSITIVO_IMPORTACION_HISTORICA,
  );
}

type ConfigTab = 'dispositivos' | 'empresas' | 'horarios' | 'eventos_especiales' | 'usuarios_especiales' | 'soporte' | 'actividad';
type EventosEspecialesTab = 'festivos' | 'vacaciones_generales' | 'checadas_especiales' | 'descansos_programados';

const CONFIG_TABS: { key: ConfigTab; label: string; short: string; superOnly?: boolean }[] = [
  { key: 'dispositivos', label: 'Dispositivos', short: 'Disp.' },
  { key: 'empresas', label: 'Empresas', short: 'Empresas' },
  { key: 'horarios', label: 'Horarios', short: 'Horarios' },
  { key: 'eventos_especiales', label: 'Eventos especiales', short: 'Eventos', superOnly: true },
  { key: 'usuarios_especiales', label: 'Usuarios especiales', short: 'Usuarios' },
  { key: 'soporte', label: 'Soporte', short: 'Soporte', superOnly: true },
  { key: 'actividad', label: 'Actividad', short: 'Actividad', superOnly: true },
];

const EVENTOS_TABS: { key: EventosEspecialesTab; label: string; short: string }[] = [
  { key: 'festivos', label: 'Días festivos', short: 'Festivos' },
  { key: 'vacaciones_generales', label: 'Vacaciones generales', short: 'Vac. gen.' },
  { key: 'checadas_especiales', label: 'Checadas especiales', short: 'Checadas' },
  { key: 'descansos_programados', label: 'Descansos programados', short: 'Descansos' },
];

function configTabSubtitle(tab: ConfigTab): string {
  switch (tab) {
    case 'dispositivos':
      return 'Dispositivos Biometricos';
    case 'empresas':
      return 'Empresas';
    case 'horarios':
      return 'Horarios de Trabajo';
    case 'eventos_especiales':
      return 'Eventos especiales: festivos, vacaciones generales y checadas especiales';
    case 'usuarios_especiales':
      return 'Usuarios Especiales';
    case 'soporte':
      return 'Catálogo de tipos de ticket de soporte';
    case 'actividad':
      return 'Actividad: accesos, solicitudes, errores (sin tráfico HTTP de empleados)';
    default:
      return '';
  }
}

interface DiaFestivo {
  id: number;
  fecha: string;
  nombre: string;
  tipo: string;
  activo: boolean;
}

interface Horario {
  id: number;
  nombre: string;
  hora_entrada: string;
  hora_salida: string;
  hora_salida_sabado: string | null;
  dias_semana: string | null;
  tolerancia_minutos: number;
  activo: boolean;
}

type UsuarioEspecialFormState = {
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  email: string;
  telefono: string;
  username: string;
  password: string;
  /** Si es true, solo se muestran casillas de empresas (alcance del director). */
  esDirector: boolean;
  empresa_id: number | '';
  departamento_id: number | '';
  puesto_id: number | '';
  /** Empresas que supervisa (solo modo director). */
  empresas_supervision_ids: number[];
};

const emptyUsuarioEspecialForm = (): UsuarioEspecialFormState => ({
  nombre: '',
  apellido_paterno: '',
  apellido_materno: '',
  email: '',
  telefono: '',
  username: '',
  password: '',
  esDirector: false,
  empresa_id: '',
  departamento_id: '',
  puesto_id: '',
  empresas_supervision_ids: [],
});

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 28px', cursor: 'pointer', border: 'none',
  borderBottom: active ? '3px solid #0ea5e9' : '3px solid transparent',
  backgroundColor: 'transparent', fontWeight: active ? 700 : 400,
  fontSize: '1rem', color: active ? '#0ea5e9' : '#888',
});

const modalOverlay: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const modalSmall: React.CSSProperties = {
  backgroundColor: 'white', borderRadius: '12px', padding: '28px',
  maxWidth: '500px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

const modalEmpresa: React.CSSProperties = {
  backgroundColor: 'white', borderRadius: '12px', padding: '28px',
  maxWidth: '720px', width: '94%', maxHeight: '92vh', overflowY: 'auto',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

type EmpresaFormState = {
  nombre: string;
  siglas: string;
  rfc: string;
  capital_social: string;
  codigo_postal: string;
  domicilio: string;
  numero_exterior: string;
  numero_interior: string;
  colonia: string;
  municipio: string;
  estado: string;
  regimen_fiscal: string;
  telefono: string;
  dias_laborales: 'lun-sab' | 'lun-dom';
  trabaja_festivos: boolean;
  fin_semana_4_checadas: boolean;
  gestiona_descansos_rotativos: boolean;
  // Nómina / timbrado
  registro_patronal: string;
  codigo_postal_expedicion: string;
  periodicidad_nomina: string;
};

const emptyEmpresaForm = (): EmpresaFormState => ({
  nombre: '',
  siglas: '',
  rfc: '',
  capital_social: '',
  codigo_postal: '',
  domicilio: '',
  numero_exterior: '',
  numero_interior: '',
  colonia: '',
  municipio: '',
  estado: '',
  regimen_fiscal: '',
  telefono: '',
  dias_laborales: 'lun-sab',
  trabaja_festivos: false,
  fin_semana_4_checadas: false,
  gestiona_descansos_rotativos: false,
  registro_patronal: '',
  codigo_postal_expedicion: '',
  periodicidad_nomina: '04',
});

function formatEmpresaDomicilioFiscal(emp: EmpresaResponse): string {
  const parts = [
    emp.domicilio,
    emp.numero_exterior ? `No. ext. ${emp.numero_exterior}` : '',
    emp.numero_interior ? `Int. ${emp.numero_interior}` : '',
    emp.colonia,
    emp.municipio,
    emp.estado,
    emp.codigo_postal ? `C.P. ${emp.codigo_postal}` : '',
  ].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return emp.direccion || '—';
}

const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 500, color: '#374151' };
const inputStyle: React.CSSProperties = { width: '100%', height: '38px', padding: '0 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' };
const btnSuccess: React.CSSProperties = { padding: '9px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap' };
const btnSecondary: React.CSSProperties = { padding: '9px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap' };
/** Categorías visibles en Configuración → Actividad (filtros y limpieza). */
const ACTIVIDAD_CATEGORIAS = ['auth', 'negocio', 'sistema', 'checador', 'asistencia'] as const;
const ACTIVIDAD_CATEGORIA_ICON: Record<string, string> = {
  auth: '🔐',
  negocio: '💼',
  sistema: '⚙️',
  checador: '🕐',
  asistencia: '📋',
  request: '🌐',
};
/** Fila de herramientas: etiqueta + select + botón en la misma línea (actividad / limpieza). */
const actividadToolbarRow: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'nowrap',
  minWidth: 'min-content',
};
const actividadToolbarScroll: React.CSSProperties = {
  width: '100%',
  overflowX: 'auto',
  paddingBottom: '4px',
  WebkitOverflowScrolling: 'touch',
};
const actividadToolbarLabel: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 500,
  color: '#374151',
  flexShrink: 0,
};
const actividadSelectInline: React.CSSProperties = {
  ...inputStyle,
  width: 'auto',
  minWidth: '140px',
  flex: '0 1 auto',
};

export const ConfiguracionPage = () => {
  const { authMe, refreshAuthMe } = useAuth();
  const isMobile = useIsMobile();
  const isSuperuser = authMe?.is_superuser === true;
  const [savingPdfFlag, setSavingPdfFlag] = useState(false);
  const [savingPdfPrestamosFlag, setSavingPdfPrestamosFlag] = useState(false);

  const togglePdfFirmado = async (habilitado: boolean) => {
    if (!isSuperuser) return;
    setSavingPdfFlag(true);
    try {
      await api.put('/vacaciones/config/pdf-firmado', { habilitado });
      await refreshAuthMe();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'No se pudo guardar el interruptor';
      alert(typeof msg === 'string' ? msg : 'No se pudo guardar el interruptor');
    } finally {
      setSavingPdfFlag(false);
    }
  };

  const togglePdfFirmadoPrestamos = async (habilitado: boolean) => {
    if (!isSuperuser) return;
    setSavingPdfPrestamosFlag(true);
    try {
      await api.put('/prestamos/config/pdf-firmado', { habilitado });
      await refreshAuthMe();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'No se pudo guardar el interruptor de préstamos';
      alert(typeof msg === 'string' ? msg : 'No se pudo guardar el interruptor de préstamos');
    } finally {
      setSavingPdfPrestamosFlag(false);
    }
  };

  const [configTab, setConfigTab] = useState<ConfigTab>('dispositivos');
  const [eventosEspecialesTab, setEventosEspecialesTab] = useState<EventosEspecialesTab>('festivos');

  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaResponse[]>([]);
  const [empleados, setEmpleados] = useState<{ id: number; empresa_id?: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [showDeviceEditModal, setShowDeviceEditModal] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null);
  const [deviceEditForm, setDeviceEditForm] = useState<DeviceFormState>(() => emptyDeviceForm());
  const [savingDevice, setSavingDevice] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<number, boolean>>({});
  const [showEmpresaModal, setShowEmpresaModal] = useState(false);
  const [editingEmpresaId, setEditingEmpresaId] = useState<number | null>(null);
  const [empresaForm, setEmpresaForm] = useState<EmpresaFormState>(emptyEmpresaForm());
  const [regimenesSat, setRegimenesSat] = useState<{ code: string; descripcion: string }[]>([]);
  // Catálogo periodicidad nómina (traído del módulo nómina)
  const [periodicidadCat, setPeriodicidadCat] = useState<{ clave: string; descripcion: string }[]>([]);
  // Indica si los campos nómina de empresa ya se guardaron (para PUT separado)
  const [savingNominaEmpresa, setSavingNominaEmpresa] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tiposSoporte, setTiposSoporte] = useState<SoporteTicketTipoResponse[]>([]);
  const [showTipoSoporteModal, setShowTipoSoporteModal] = useState(false);
  const [editingTipoSoporte, setEditingTipoSoporte] = useState<SoporteTicketTipoResponse | null>(null);
  const [tipoSoporteForm, setTipoSoporteForm] = useState<{ nombre: string; clase_id: number | ''; activo: boolean }>({ nombre: '', clase_id: '', activo: true });
  const [clasesSoporte, setClasesSoporte] = useState<SoporteTicketClaseResponse[]>([]);
  const [showClaseSoporteModal, setShowClaseSoporteModal] = useState(false);
  const [editingClaseSoporte, setEditingClaseSoporte] = useState<SoporteTicketClaseResponse | null>(null);
  const [claseSoporteForm, setClaseSoporteForm] = useState({ nombre: '', activo: true });

  // Festivos state
  const [festivos, setFestivos] = useState<DiaFestivo[]>([]);
  const [festivoAño, setFestivoAño] = useState<number>(new Date().getFullYear());
  const [showFestivoModal, setShowFestivoModal] = useState(false);
  const [festivoForm, setFestivoForm] = useState({ fecha: '', nombre: '', tipo: 'LFT' });
  const [generandoFestivos, setGenerandoFestivos] = useState(false);

  // Horarios state
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [showHorarioModal, setShowHorarioModal] = useState(false);
  const [editingHorarioId, setEditingHorarioId] = useState<number | null>(null);
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const emptyHorario = { nombre: '', hora_entrada: '08:00', hora_salida: '17:00', hora_salida_sabado: '', tolerancia_minutos: 15, dias_semana: '1,2,3,4,5' };
  const [horarioForm, setHorarioForm] = useState(emptyHorario);
  const [diasSeleccionados, setDiasSeleccionados] = useState<number[]>([1, 2, 3, 4, 5]);
  const [trabajaSabado, setTrabajaSabado] = useState(false);
  const [trabajaDomingo, setTrabajaDomingo] = useState(false);

  // Usuarios especiales (exento de incidencias)
  const [usuariosEspeciales, setUsuariosEspeciales] = useState<EmpleadoResponse[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartamentoResponse[]>([]);
  const [puestos, setPuestos] = useState<PuestoResponse[]>([]);
  const [loadingUsuariosEspeciales, setLoadingUsuariosEspeciales] = useState(false);
  const [showUsuarioEspecialModal, setShowUsuarioEspecialModal] = useState(false);
  const [usuarioEspecialModalMode, setUsuarioEspecialModalMode] = useState<'create' | 'edit'>('create');
  const [editingUsuarioEspecialId, setEditingUsuarioEspecialId] = useState<number | null>(null);
  const [loadingUsuarioEspecialDetalle, setLoadingUsuarioEspecialDetalle] = useState(false);
  /** Copia inicial al abrir «Ver» (evita perder empresa/depto/puesto al desmarcar director). */
  const [usuarioEspecialEditSnapshot, setUsuarioEspecialEditSnapshot] = useState<UsuarioEspecialFormState | null>(null);
  const [passwordTemporalInfo, setPasswordTemporalInfo] = useState<{
    nombre: string;
    password: string;
    mensaje: string;
  } | null>(null);
  const [passwordCopiada, setPasswordCopiada] = useState(false);
  const [usuarioEspecialForm, setUsuarioEspecialForm] = useState<UsuarioEspecialFormState>(emptyUsuarioEspecialForm());
  const [togglingEspecial, setTogglingEspecial] = useState<number | null>(null);

  const [actividadItems, setActividadItems] = useState<ActividadLogResponse[]>([]);
  const [actividadTotal, setActividadTotal] = useState(0);
  const [actividadSkip, setActividadSkip] = useState(0);
  const [actividadFiltroNivel, setActividadFiltroNivel] = useState('');
  const [actividadFiltroCategoria, setActividadFiltroCategoria] = useState('');
  const [loadingActividad, setLoadingActividad] = useState(false);
  const [purgingActividad, setPurgingActividad] = useState(false);
  const [limpiezaCategoria, setLimpiezaCategoria] = useState('');
  const [limpiezaDias, setLimpiezaDias] = useState(730);
  const [limpiezaAntiguosSoloCat, setLimpiezaAntiguosSoloCat] = useState('');

  // ── Métricas (dentro de Actividad) ───────────────────────────────────────────
  interface MetricasData {
    dias: number;
    total: number;
    por_nivel: Record<string, number>;
    por_categoria: Record<string, number>;
    eventos_por_dia: { dia: string; error: number; warning: number; info: number }[];
    logins_por_dia: { dia: string; n: number }[];
    top_errores: { ruta: string; n: number }[];
    top_empleados: { empleado_id: number; nombre: string; numero: string; n: number }[];
  }
  const [actividadVista, setActividadVista] = useState<'logs' | 'metricas'>('logs');
  const [metricasData, setMetricasData] = useState<MetricasData | null>(null);
  const [loadingMetricas, setLoadingMetricas] = useState(false);
  const [metricasDias, setMetricasDias] = useState(30);
  const [metricasFiltroNivel, setMetricasFiltroNivel] = useState('');
  const [metricasFiltroCategoria, setMetricasFiltroCategoria] = useState('');

  const loadActividad = useCallback(async () => {
    setLoadingActividad(true);
    try {
      const res = await api.get<{ items: ActividadLogResponse[]; total: number }>('/audit/actividad', {
        params: {
          skip: actividadSkip,
          limit: ACTIVIDAD_PAGE_SIZE,
          ...(actividadFiltroNivel ? { nivel: actividadFiltroNivel } : {}),
          ...(actividadFiltroCategoria ? { categoria: actividadFiltroCategoria } : {}),
        },
      });
      setActividadItems(Array.isArray(res.data?.items) ? res.data.items : []);
      setActividadTotal(typeof res.data?.total === 'number' ? res.data.total : 0);
    } catch {
      setActividadItems([]);
      setActividadTotal(0);
    } finally {
      setLoadingActividad(false);
    }
  }, [actividadSkip, actividadFiltroNivel, actividadFiltroCategoria]);

  const ejecutarPurgarActividad = async (body: ActividadPurgeRequest): Promise<boolean> => {
    setPurgingActividad(true);
    try {
      const res = await api.post<{ eliminados: number }>('/audit/actividad/purgar', body);
      const n = res.data?.eliminados ?? 0;
      alert(`Se eliminaron ${n} registro(s).`);
      setActividadSkip(0);
      await loadActividad();
      return true;
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string | unknown } } };
      const d = e.response?.data?.detail;
      let msg = 'No se pudo limpiar';
      if (typeof d === 'string') msg = d;
      else if (Array.isArray(d)) msg = d.map((x: { msg?: string }) => x.msg || x).join(', ');
      alert(msg);
      return false;
    } finally {
      setPurgingActividad(false);
    }
  };

  useEffect(() => {
    loadData();
    loadFestivos();
  }, []);

  useEffect(() => {
    if (configTab !== 'empresas') return;
    api.get<{ code: string; descripcion: string }[]>('/personal/regimenes-fiscales-sat')
      .then((res) => setRegimenesSat(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRegimenesSat([]));
    if (isNominaEnabled) {
      api.get('/nomina/catalogos')
        .then((res) => setPeriodicidadCat(Array.isArray(res.data?.periodicidad_pago) ? res.data.periodicidad_pago : []))
        .catch(() => {});
    } else {
      setPeriodicidadCat([]);
    }
  }, [configTab]);

  /** Solo administrador ve / usa pestañas Eventos especiales, Soporte y Actividad */
  useEffect(() => {
    if (!isSuperuser && (configTab === 'eventos_especiales' || configTab === 'soporte' || configTab === 'actividad')) {
      setConfigTab('dispositivos');
    }
  }, [isSuperuser, configTab]);

  // Refresco frecuente de dispositivos (última conexión del agente) mientras está en esta pestaña
  useEffect(() => {
    if (configTab !== 'dispositivos') return;
    const cargarSoloDispositivos = () => {
      api.get('/asistencia/devices')
        .then(res => { setDispositivos(filtrarDispositivosConfiguracion(Array.isArray(res.data) ? res.data : [])); })
        .catch(() => {});
    };
    cargarSoloDispositivos();
    const interval = setInterval(cargarSoloDispositivos, 10000);
    return () => clearInterval(interval);
  }, [configTab]);

  // Reloj local para que el texto «hace Xs» avance entre refrescos del API
  const [, setConnTick] = useState(0);
  useEffect(() => {
    if (configTab !== 'dispositivos') return;
    const t = setInterval(() => setConnTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [configTab]);

  const loadUsuariosEspeciales = async () => {
    setLoadingUsuariosEspeciales(true);
    try {
      const res = await api.get<EmpleadoResponse[]>('/personal/empleados', { params: { exento_incidencias: true, limit: 500 } });
      setUsuariosEspeciales(Array.isArray(res.data) ? res.data : []);
    } catch {
      setUsuariosEspeciales([]);
    } finally {
      setLoadingUsuariosEspeciales(false);
    }
  };

  useEffect(() => {
    if (configTab === 'usuarios_especiales') loadUsuariosEspeciales();
  }, [configTab]);

  useEffect(() => {
    if (configTab === 'soporte' && isSuperuser) {
      loadClasesSoporte();
      loadTiposSoporte();
    }
  }, [configTab, isSuperuser]);

  useEffect(() => {
    if (configTab !== 'actividad' || !isSuperuser) return;
    void loadActividad();
  }, [configTab, isSuperuser, loadActividad]);

  useEffect(() => {
    if (configTab !== 'actividad' || actividadVista !== 'metricas' || !isSuperuser) return;
    setLoadingMetricas(true);
    const params: Record<string, string | number> = { dias: metricasDias };
    if (metricasFiltroNivel) params.nivel = metricasFiltroNivel;
    if (metricasFiltroCategoria) params.categoria = metricasFiltroCategoria;
    api.get('/audit/metricas', { params })
      .then(res => setMetricasData(res.data))
      .catch(() => setMetricasData(null))
      .finally(() => setLoadingMetricas(false));
  }, [configTab, isSuperuser, actividadVista, metricasDias, metricasFiltroNivel, metricasFiltroCategoria]);

  const toggleExentoIncidencias = async (emp: EmpleadoResponse, valor: boolean) => {
    setTogglingEspecial(emp.id);
    try {
      await api.put(`/personal/empleados/${emp.id}`, { exento_incidencias: valor });
      loadUsuariosEspeciales();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || 'Error al actualizar');
    } finally {
      setTogglingEspecial(null);
    }
  };

  const departamentosPorEmpresaEspecial = usuarioEspecialForm.empresa_id === ''
    ? []
    : departamentos.filter((d) => d.activo && d.empresa_id === Number(usuarioEspecialForm.empresa_id));

  const puestosPorEmpresaDeptoEspecial = usuarioEspecialForm.empresa_id === '' || usuarioEspecialForm.departamento_id === ''
    ? []
    : puestos.filter((p) => {
        if (!p.activo) return false;
        const esGlobal = p.empresa_id == null && p.departamento_id == null;
        const esDelDepto = p.empresa_id === Number(usuarioEspecialForm.empresa_id) && p.departamento_id === Number(usuarioEspecialForm.departamento_id);
        return esGlobal || esDelDepto;
      });

  const puestoDirectorGlobalId = () => {
    const d = puestos.find(
      (p) =>
        p.activo &&
        p.empresa_id == null &&
        p.departamento_id == null &&
        (p.nombre || '').trim().toLowerCase() === 'director',
    );
    return d?.id;
  };

  const primerDepartamentoActivoEmpresa = (empresaId: number) => {
    const deps = departamentos
      .filter((d) => d.activo && d.empresa_id === empresaId)
      .sort((a, b) => a.id - b.id);
    return deps[0]?.id;
  };

  const toggleEmpresaSupervision = (empId: number) => {
    setUsuarioEspecialForm((p) => {
      const s = new Set(p.empresas_supervision_ids);
      if (s.has(empId)) s.delete(empId);
      else s.add(empId);
      return { ...p, empresas_supervision_ids: [...s] };
    });
  };

  const populateUsuarioEspecialFormFromEmpleado = (emp: EmpleadoResponse): UsuarioEspecialFormState => {
    const puestoN = (emp.puesto?.nombre || '').trim().toLowerCase();
    const esDir = puestoN === 'director' || puestoN === 'director general' || puestoN === 'director general adjunto';
    const usaSupervision =
      esDir ||
      puestoN === 'subdirector' ||
      puestoN === 'gerente general' ||
      puestoN === 'gerente administrativo y operaciones';
    const sup =
      emp.empresas_supervisadas_ids && emp.empresas_supervisadas_ids.length > 0
        ? [...emp.empresas_supervisadas_ids]
        : usaSupervision && emp.empresa_id
          ? [emp.empresa_id]
          : [];
    return {
      nombre: emp.nombre || '',
      apellido_paterno: emp.apellido_paterno || '',
      apellido_materno: emp.apellido_materno || '',
      email: emp.email || '',
      telefono: emp.telefono || '',
      username: emp.username || '',
      password: '',
      esDirector: esDir,
      empresa_id: emp.empresa_id ?? '',
      departamento_id: emp.departamento_id ?? '',
      puesto_id: emp.puesto_id ?? '',
      empresas_supervision_ids: sup,
    };
  };

  const openCrearUsuarioEspecial = () => {
    setUsuarioEspecialModalMode('create');
    setEditingUsuarioEspecialId(null);
    setUsuarioEspecialEditSnapshot(null);
    setUsuarioEspecialForm(emptyUsuarioEspecialForm());
    setShowUsuarioEspecialModal(true);
  };

  const openVerUsuarioEspecial = async (emp: EmpleadoResponse) => {
    setLoadingUsuarioEspecialDetalle(true);
    try {
      const res = await api.get<EmpleadoResponse>(`/personal/empleados/${emp.id}`);
      const populated = populateUsuarioEspecialFormFromEmpleado(res.data);
      setUsuarioEspecialForm(populated);
      setUsuarioEspecialEditSnapshot({ ...populated });
      setUsuarioEspecialModalMode('edit');
      setEditingUsuarioEspecialId(emp.id);
      setShowUsuarioEspecialModal(true);
    } catch {
      alert('No se pudo cargar el usuario.');
    } finally {
      setLoadingUsuarioEspecialDetalle(false);
    }
  };

  const closeUsuarioEspecialModal = () => {
    setShowUsuarioEspecialModal(false);
    setEditingUsuarioEspecialId(null);
    setUsuarioEspecialModalMode('create');
    setUsuarioEspecialEditSnapshot(null);
    setUsuarioEspecialForm(emptyUsuarioEspecialForm());
  };

  const handleGuardarUsuarioEspecial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuarioEspecialForm.nombre.trim()) { alert('El nombre es obligatorio'); return; }
    if (usuarioEspecialModalMode === 'edit' && editingUsuarioEspecialId == null) return;
    setSaving(true);
    try {
      const base = {
        nombre: usuarioEspecialForm.nombre.trim(),
        apellido_paterno: usuarioEspecialForm.apellido_paterno.trim() || undefined,
        apellido_materno: usuarioEspecialForm.apellido_materno.trim() || undefined,
        email: usuarioEspecialForm.email.trim() || undefined,
        telefono: usuarioEspecialForm.telefono.trim() || undefined,
        username: usuarioEspecialForm.username.trim() || undefined,
      };

      if (usuarioEspecialForm.esDirector) {
        const ids = usuarioEspecialForm.empresas_supervision_ids;
        if (ids.length === 0) {
          alert('Marca al menos una empresa que supervise el director.');
          setSaving(false);
          return;
        }
        const pid = puestoDirectorGlobalId();
        if (!pid) {
          alert('No existe el puesto global «Director» en el catálogo. Contacte al administrador del sistema.');
          setSaving(false);
          return;
        }
        for (const eid of ids) {
          if (!primerDepartamentoActivoEmpresa(eid)) {
            const nom = empresas.find((e) => e.id === eid)?.nombre || String(eid);
            alert(`La empresa «${nom}» no tiene departamento activo. Crea al menos un departamento antes.`);
            setSaving(false);
            return;
          }
        }
        const empresaPrimaria = Math.min(...ids);
        const deptId = primerDepartamentoActivoEmpresa(empresaPrimaria)!;
        const payload: UsuarioEspecialCreate = {
          ...base,
          empresa_id: empresaPrimaria,
          departamento_id: deptId,
          puesto_id: pid,
          empresas_supervision_ids: [...ids],
        };
        if (usuarioEspecialModalMode === 'create') {
          await api.post('/personal/usuarios-especiales', payload);
          alert('Usuario especial creado. Debe cambiar la contraseña temporal al primer ingreso.');
        } else {
          const putBody: Record<string, unknown> = {
            ...base,
            empresa_id: empresaPrimaria,
            departamento_id: deptId,
            puesto_id: pid,
            empresas_supervision_ids: [...ids],
          };
          await api.put(`/personal/empleados/${editingUsuarioEspecialId}`, putBody);
          alert('Usuario especial actualizado');
        }
      } else {
        if (usuarioEspecialForm.empresa_id === '' || usuarioEspecialForm.departamento_id === '' || usuarioEspecialForm.puesto_id === '') {
          alert('Empresa, departamento y puesto son obligatorios');
          setSaving(false);
          return;
        }
        const pr = puestos.find((x) => x.id === Number(usuarioEspecialForm.puesto_id));
        const puestoN = (pr?.nombre || '').trim().toLowerCase();
        const usaSupervision =
          puestoN === 'director' ||
          puestoN === 'director general' ||
          puestoN === 'director general adjunto' ||
          puestoN === 'subdirector' ||
          puestoN === 'gerente general' ||
          puestoN === 'gerente administrativo y operaciones';
        const payload: UsuarioEspecialCreate = {
          ...base,
          empresa_id: Number(usuarioEspecialForm.empresa_id),
          departamento_id: Number(usuarioEspecialForm.departamento_id),
          puesto_id: Number(usuarioEspecialForm.puesto_id),
        };
        if (usaSupervision) {
          const ids = usuarioEspecialForm.empresas_supervision_ids.length > 0
            ? [...usuarioEspecialForm.empresas_supervision_ids]
            : [Number(usuarioEspecialForm.empresa_id)];
          if (!ids.includes(Number(usuarioEspecialForm.empresa_id))) {
            ids.push(Number(usuarioEspecialForm.empresa_id));
          }
          payload.empresas_supervision_ids = ids;
        }
        if (usuarioEspecialModalMode === 'create') {
          await api.post('/personal/usuarios-especiales', payload);
          alert('Usuario especial creado. Debe cambiar la contraseña temporal al primer ingreso.');
        } else {
          const putBody: Record<string, unknown> = {
            ...base,
            empresa_id: Number(usuarioEspecialForm.empresa_id),
            departamento_id: Number(usuarioEspecialForm.departamento_id),
            puesto_id: Number(usuarioEspecialForm.puesto_id),
          };
          if (usaSupervision) {
            const ids = usuarioEspecialForm.empresas_supervision_ids.length > 0
              ? [...usuarioEspecialForm.empresas_supervision_ids]
              : [Number(usuarioEspecialForm.empresa_id)];
            if (!ids.includes(Number(usuarioEspecialForm.empresa_id))) {
              ids.push(Number(usuarioEspecialForm.empresa_id));
            }
            putBody.empresas_supervision_ids = ids;
          }
          await api.put(`/personal/empleados/${editingUsuarioEspecialId}`, putBody);
          alert('Usuario especial actualizado');
        }
      }

      closeUsuarioEspecialModal();
      loadUsuariosEspeciales();
      loadData();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      alert(e2.response?.data?.detail || 'Error al guardar usuario especial');
    } finally {
      setSaving(false);
    }
  };

  const loadTiposSoporte = async () => {
    try {
      const res = await api.get<SoporteTicketTipoResponse[]>('/soporte/tipos');
      setTiposSoporte(Array.isArray(res.data) ? res.data : []);
    } catch {
      setTiposSoporte([]);
    }
  };

  const loadClasesSoporte = async () => {
    try {
      const res = await api.get<SoporteTicketClaseResponse[]>('/soporte/clases');
      setClasesSoporte(Array.isArray(res.data) ? res.data : []);
    } catch {
      setClasesSoporte([]);
    }
  };

  const openNewClaseSoporte = () => {
    setEditingClaseSoporte(null);
    setClaseSoporteForm({ nombre: '', activo: true });
    setShowClaseSoporteModal(true);
  };

  const startEditClaseSoporte = (clase: SoporteTicketClaseResponse) => {
    setEditingClaseSoporte(clase);
    setClaseSoporteForm({ nombre: clase.nombre, activo: clase.activo });
    setShowClaseSoporteModal(true);
  };

  const handleClaseSoporteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claseSoporteForm.nombre.trim()) { alert('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      if (editingClaseSoporte) {
        await api.put(`/soporte/clases/${editingClaseSoporte.id}`, { nombre: claseSoporteForm.nombre.trim(), activo: claseSoporteForm.activo });
      } else {
        await api.post('/soporte/clases', { nombre: claseSoporteForm.nombre.trim(), activo: claseSoporteForm.activo });
      }
      setShowClaseSoporteModal(false);
      setEditingClaseSoporte(null);
      setClaseSoporteForm({ nombre: '', activo: true });
      loadClasesSoporte();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      alert(e2.response?.data?.detail || 'Error al guardar categoría');
    } finally {
      setSaving(false);
    }
  };

  const openNewTipoSoporte = () => {
    setEditingTipoSoporte(null);
    setTipoSoporteForm({ nombre: '', clase_id: '', activo: true });
    setShowTipoSoporteModal(true);
  };

  const startEditTipoSoporte = (tipo: SoporteTicketTipoResponse) => {
    setEditingTipoSoporte(tipo);
    setTipoSoporteForm({ nombre: tipo.nombre, clase_id: tipo.clase_id ?? '', activo: tipo.activo });
    setShowTipoSoporteModal(true);
  };

  const handleTipoSoporteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipoSoporteForm.nombre.trim()) {
      alert('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: tipoSoporteForm.nombre.trim(),
        clase_id: tipoSoporteForm.clase_id !== '' ? Number(tipoSoporteForm.clase_id) : null,
        activo: tipoSoporteForm.activo,
      };
      if (editingTipoSoporte) {
        await api.put(`/soporte/tipos/${editingTipoSoporte.id}`, payload);
      } else {
        await api.post('/soporte/tipos', payload);
      }
      setShowTipoSoporteModal(false);
      setEditingTipoSoporte(null);
      setTipoSoporteForm({ nombre: '', clase_id: '', activo: true });
      loadTiposSoporte();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      alert(e2.response?.data?.detail || 'Error al guardar tipo de ticket');
    } finally {
      setSaving(false);
    }
  };

  const loadFestivos = async (año?: number) => {
    const y = año ?? festivoAño;
    try {
      const res = await api.get(`/asistencia/festivos?año=${y}&solo_activos=false`);
      setFestivos(Array.isArray(res.data) ? res.data : []);
    } catch { /* silent */ }
  };

  const loadData = async () => {
    try {
      const [devRes, emprsRes, empRes, horRes, depRes, puestosRes] = await Promise.allSettled([
        api.get('/asistencia/devices'),
        api.get('/personal/empresas?limit=500'),
        api.get('/personal/empleados?limit=1000'),
        api.get('/asistencia/horarios'),
        api.get('/personal/departamentos?limit=1000'),
        api.get('/personal/puestos?limit=1000'),
      ]);
      if (devRes.status === 'fulfilled') setDispositivos(filtrarDispositivosConfiguracion(devRes.value?.data ?? []));
      if (emprsRes.status === 'fulfilled') setEmpresas(emprsRes.value?.data ?? []);
      if (empRes.status === 'fulfilled') setEmpleados(Array.isArray(empRes.value?.data) ? empRes.value.data : []);
      if (horRes.status === 'fulfilled') setHorarios(Array.isArray(horRes.value?.data) ? horRes.value.data : []);
      if (depRes.status === 'fulfilled') setDepartamentos(Array.isArray(depRes.value?.data) ? depRes.value.data : []);
      if (puestosRes.status === 'fulfilled') setPuestos(Array.isArray(puestosRes.value?.data) ? puestosRes.value.data : []);
    } catch (error) {
      console.error('Error en loadData:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerarFestivos = async () => {
    setGenerandoFestivos(true);
    try {
      const res = await api.post(`/asistencia/festivos/generar/${festivoAño}`);
      alert(`Año ${festivoAño}: ${res.data.creados} festivos creados, ${res.data.omitidos} ya existían.`);
      loadFestivos(festivoAño);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || 'Error al generar festivos');
    } finally {
      setGenerandoFestivos(false);
    }
  };

  const handleFestivoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!festivoForm.fecha || !festivoForm.nombre.trim()) { alert('Fecha y nombre son obligatorios'); return; }
    setSaving(true);
    try {
      await api.post('/asistencia/festivos', festivoForm);
      setShowFestivoModal(false);
      setFestivoForm({ fecha: '', nombre: '', tipo: 'LFT' });
      loadFestivos();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const toggleFestivoActivo = async (f: DiaFestivo) => {
    try {
      await api.patch(`/asistencia/festivos/${f.id}`, { activo: !f.activo });
      loadFestivos();
    } catch { alert('Error al actualizar'); }
  };

  const deleteFestivo = async (f: DiaFestivo) => {
    if (!confirm(`¿Eliminar "${f.nombre}" (${f.fecha})?`)) return;
    try {
      await api.delete(`/asistencia/festivos/${f.id}`);
      loadFestivos();
    } catch { alert('Error al eliminar'); }
  };

  const openNewHorario = () => {
    setHorarioForm(emptyHorario);
    setDiasSeleccionados([1, 2, 3, 4, 5]);
    setTrabajaSabado(false);
    setTrabajaDomingo(false);
    setEditingHorarioId(null);
    setShowHorarioModal(true);
  };

  const startEditHorario = (h: Horario) => {
    const tieneSabado = !!h.hora_salida_sabado;
    setTrabajaSabado(tieneSabado);
    const nums = h.dias_semana ? h.dias_semana.split(',').map(Number).filter(Boolean) : [];
    setTrabajaDomingo(nums.includes(7));
    const dias = nums.filter(d => d !== 6 && d !== 7);
    setDiasSeleccionados(dias.length ? dias : [1, 2, 3, 4, 5]);
    setHorarioForm({
      nombre: h.nombre,
      hora_entrada: h.hora_entrada,
      hora_salida: h.hora_salida,
      hora_salida_sabado: h.hora_salida_sabado || '',
      tolerancia_minutos: h.tolerancia_minutos,
      dias_semana: h.dias_semana || '',
    });
    setEditingHorarioId(h.id);
    setShowHorarioModal(true);
  };

  const handleHorarioSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!horarioForm.nombre.trim()) { alert('El nombre del horario es obligatorio'); return; }
    if (trabajaSabado && !horarioForm.hora_salida_sabado) { alert('Indica la hora de salida del sábado'); return; }
    setSaving(true);
    try {
      const diasBase = diasSeleccionados.filter(d => d !== 6 && d !== 7).sort();
      if (trabajaDomingo) diasBase.push(7);
      const payload = {
        ...horarioForm,
        hora_salida_sabado: trabajaSabado ? horarioForm.hora_salida_sabado : null,
        dias_semana: diasBase.join(','),
      };
      if (editingHorarioId) {
        await api.put(`/asistencia/horarios/${editingHorarioId}`, payload);
      } else {
        await api.post('/asistencia/horarios', payload);
      }
      setShowHorarioModal(false);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al guardar horario');
    } finally {
      setSaving(false);
    }
  };

  const toggleHorarioActivo = async (h: Horario) => {
    try {
      if (h.activo) {
        await api.delete(`/asistencia/horarios/${h.id}`);
      } else {
        await api.put(`/asistencia/horarios/${h.id}`, { activo: true });
      }
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error');
    }
  };

  const toggleDia = (num: number) => {
    setDiasSeleccionados(prev =>
      prev.includes(num) ? prev.filter(d => d !== num) : [...prev, num]
    );
  };

  const crearDispositivo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const nombre = (formData.get('nombre') as string)?.trim() || '';
    const ubicacion = (formData.get('ubicacion') as string)?.trim() || undefined;
    const ip_local = (formData.get('ip_local') as string)?.trim() || undefined;
    const serial_number = (formData.get('serial_number') as string)?.trim() || undefined;
    const payload: DispositivoCreate = { nombre, ubicacion, ip_local, serial_number };
    try {
      await api.post('/asistencia/devices', payload);
      setShowDeviceForm(false);
      loadData();
    } catch {
      alert('Error al crear dispositivo');
    }
  };

  const startEditDispositivo = (device: Dispositivo) => {
    setEditingDeviceId(device.id);
    setDeviceEditForm({
      nombre: device.nombre || '',
      ubicacion: device.ubicacion || '',
      ip_local: device.ip_local || '',
      serial_number: device.serial_number || '',
      activo: device.activo,
    });
    setShowDeviceEditModal(true);
  };

  const cerrarEditarDispositivo = () => {
    setShowDeviceEditModal(false);
    setEditingDeviceId(null);
    setDeviceEditForm(emptyDeviceForm());
  };

  const guardarDispositivo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeviceId) return;
    const nombre = deviceEditForm.nombre.trim();
    if (!nombre) {
      alert('El nombre del equipo es obligatorio');
      return;
    }
    const payload: DispositivoUpdate = {
      nombre,
      ubicacion: deviceEditForm.ubicacion.trim() || null,
      ip_local: deviceEditForm.ip_local.trim() || null,
      serial_number: deviceEditForm.serial_number.trim() || null,
      activo: deviceEditForm.activo,
    };
    setSavingDevice(true);
    try {
      await api.patch(`/asistencia/devices/${editingDeviceId}`, payload);
      cerrarEditarDispositivo();
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al guardar dispositivo');
    } finally {
      setSavingDevice(false);
    }
  };

  const eliminarDispositivo = async (deviceId: number, nombre: string) => {
    if (!confirm(`Eliminar el dispositivo "${nombre}"? No se puede deshacer.`)) return;
    try {
      await api.delete(`/asistencia/devices/${deviceId}`);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al eliminar');
    }
  };

  const probarComoAgente = async (deviceId: number) => {
    const dev = dispositivos.find(d => d.id === deviceId);
    if (!dev?.api_key) { alert('No hay API Key para este dispositivo'); return; }
    try {
      const base = api.defaults.baseURL || `${window.location.origin}/api/v1`;
      const url = `${base.replace(/\/$/, '')}/asistencia/agent/pending-users`;
      const res = await fetch(url, { headers: { 'X-API-Key': dev.api_key, 'Content-Type': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        const count = Array.isArray(data) ? data.length : 0;
        alert(`Conexion con agente OK\nDispositivo: ${dev.nombre}\nUsuarios pendientes: ${count}`);
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Error: ' + (err.detail || `HTTP ${res.status}`));
      }
    } catch (e: unknown) { alert('Error: ' + (e as Error).message); }
  };

  const copiarApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey).then(() => {
      alert('API Key copiada al portapapeles');
    }).catch(() => {
      prompt('Copia la API Key:', apiKey);
    });
  };

  const openNewEmpresa = () => {
    setEmpresaForm(emptyEmpresaForm());
    setEditingEmpresaId(null);
    setShowEmpresaModal(true);
  };

  const startEditEmpresa = (emp: EmpresaResponse) => {
    const base: EmpresaFormState = {
      nombre: emp.nombre,
      siglas: emp.siglas || '',
      rfc: emp.rfc || '',
      capital_social:
        emp.capital_social != null && String(emp.capital_social) !== '' ? String(emp.capital_social) : '',
      codigo_postal: emp.codigo_postal || '',
      domicilio: emp.domicilio || '',
      numero_exterior: emp.numero_exterior || '',
      numero_interior: emp.numero_interior || '',
      colonia: emp.colonia || '',
      municipio: emp.municipio || '',
      estado: emp.estado || '',
      regimen_fiscal: emp.regimen_fiscal || '',
      telefono: emp.telefono || '',
      dias_laborales: emp.dias_laborales === 'lun-dom' ? 'lun-dom' : 'lun-sab',
      trabaja_festivos: !!emp.trabaja_festivos,
      fin_semana_4_checadas: !!emp.fin_semana_4_checadas,
      gestiona_descansos_rotativos: !!emp.gestiona_descansos_rotativos,
      registro_patronal: '',
      codigo_postal_expedicion: '',
      periodicidad_nomina: '04',
    };
    setEmpresaForm(base);
    setEditingEmpresaId(emp.id);
    if (isNominaEnabled) {
      api.get(`/nomina/empresas/${emp.id}/config`)
        .then(r => {
          setEmpresaForm(prev => ({
            ...prev,
            registro_patronal: r.data.registro_patronal || '',
            codigo_postal_expedicion: r.data.codigo_postal_expedicion || '',
            periodicidad_nomina: r.data.periodicidad_defecto || '04',
          }));
        })
        .catch(() => {});
    }
    setShowEmpresaModal(true);
  };

  const regimenSatLabel = (code: string | null | undefined) => {
    if (!code) return '—';
    const r = regimenesSat.find((x) => x.code === code);
    return r ? `${code} — ${r.descripcion}` : code;
  };

  const handleEmpresaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaForm.nombre.trim()) { alert('La denominación o razón social es obligatoria'); return; }
    if (empresaForm.codigo_postal.trim() && !/^\d{5}$/.test(empresaForm.codigo_postal.trim())) {
      alert('El código postal debe tener 5 dígitos'); return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nombre: empresaForm.nombre.trim(),
        siglas: empresaForm.siglas.trim() || null,
      };
      if (empresaForm.rfc.trim()) payload.rfc = empresaForm.rfc.trim().toUpperCase();
      if (empresaForm.telefono.trim()) payload.telefono = empresaForm.telefono.trim();
      if (empresaForm.codigo_postal.trim()) payload.codigo_postal = empresaForm.codigo_postal.trim();
      if (empresaForm.domicilio.trim()) payload.domicilio = empresaForm.domicilio.trim();
      if (empresaForm.numero_exterior.trim()) payload.numero_exterior = empresaForm.numero_exterior.trim();
      if (empresaForm.numero_interior.trim()) payload.numero_interior = empresaForm.numero_interior.trim();
      if (empresaForm.colonia.trim()) payload.colonia = empresaForm.colonia.trim();
      if (empresaForm.municipio.trim()) payload.municipio = empresaForm.municipio.trim();
      if (empresaForm.estado.trim()) payload.estado = empresaForm.estado.trim();
      if (empresaForm.regimen_fiscal.trim()) payload.regimen_fiscal = empresaForm.regimen_fiscal.trim();
      const cap = empresaForm.capital_social.trim().replace(/,/g, '');
      if (cap) {
        const n = parseFloat(cap);
        if (!Number.isNaN(n)) payload.capital_social = n;
      }
      const dirParts = [
        empresaForm.domicilio.trim(),
        empresaForm.numero_exterior.trim() ? `No. ext. ${empresaForm.numero_exterior.trim()}` : '',
        empresaForm.numero_interior.trim() ? `Int. ${empresaForm.numero_interior.trim()}` : '',
        empresaForm.colonia.trim(),
        empresaForm.codigo_postal.trim(),
        empresaForm.municipio.trim(),
        empresaForm.estado.trim(),
      ].filter(Boolean);
      if (dirParts.length) payload.direccion = dirParts.join(', ');
      payload.dias_laborales = empresaForm.dias_laborales;
      payload.trabaja_festivos = empresaForm.trabaja_festivos;
      payload.fin_semana_4_checadas = empresaForm.fin_semana_4_checadas;
      payload.gestiona_descansos_rotativos = empresaForm.gestiona_descansos_rotativos;
      payload.checadas_remotas = true;
      let savedEmpresaId = editingEmpresaId;
      if (editingEmpresaId) {
        await api.put(`/personal/empresas/${editingEmpresaId}`, payload);
      } else {
        const res = await api.post('/personal/empresas', payload);
        savedEmpresaId = res.data.id ?? null;
      }
      if (savedEmpresaId && isNominaEnabled) {
        setSavingNominaEmpresa(true);
        try {
          const nominaPayload: Record<string, string> = {};
          if (empresaForm.registro_patronal.trim()) nominaPayload.registro_patronal = empresaForm.registro_patronal.trim();
          if (empresaForm.codigo_postal_expedicion.trim()) {
            nominaPayload.codigo_postal_expedicion = empresaForm.codigo_postal_expedicion.trim();
          }
          if (empresaForm.periodicidad_nomina) nominaPayload.periodicidad_defecto = empresaForm.periodicidad_nomina;
          await api.put(`/nomina/empresas/${savedEmpresaId}/config`, nominaPayload);
        } catch { /* si falla config nómina no bloqueamos */ } finally {
          setSavingNominaEmpresa(false);
        }
      }
      alert(editingEmpresaId ? 'Empresa actualizada' : 'Empresa creada');
      setShowEmpresaModal(false);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string | string[] } } };
      const d = err.response?.data?.detail;
      const msg = Array.isArray(d) ? d.map((x) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: string }).msg) : String(x))).join(' ') : (d || 'Error al guardar empresa');
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleEmpresaActivo = async (emp: EmpresaResponse) => {
    try {
      await api.put(`/personal/empresas/${emp.id}`, { activo: !emp.activo });
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error');
    }
  };

  if (loading) return <div style={{ padding: isMobile ? '14px' : '20px' }}>Cargando...</div>;

  const visibleTabs = CONFIG_TABS.filter(t => !t.superOnly || isSuperuser);
  const headerActions = (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', ...(isMobile ? { width: '100%' } : {}) }}>
      {configTab === 'dispositivos' && (
        <button
          type="button"
          onClick={() => setShowDeviceForm(!showDeviceForm)}
          style={isMobile
            ? { ...rhMobileBtnPrimary, backgroundColor: '#0ea5e9', flex: 1, minWidth: 0 }
            : { padding: '9px 20px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap' }}
        >
          {showDeviceForm ? 'Cancelar' : '+ Registrar Dispositivo'}
        </button>
      )}
      {configTab === 'empresas' && (
        <button type="button" onClick={openNewEmpresa} style={isMobile ? { ...rhMobileBtnPrimary, flex: 1 } : btnSuccess}>+ Nueva Empresa</button>
      )}
      {configTab === 'horarios' && (
        <button type="button" onClick={openNewHorario} style={isMobile ? { ...rhMobileBtnPrimary, flex: 1 } : btnSuccess}>+ Nuevo Horario</button>
      )}
      {configTab === 'eventos_especiales' && eventosEspecialesTab === 'festivos' && (
        <button type="button" onClick={() => setShowFestivoModal(true)} style={isMobile ? { ...rhMobileBtnPrimary, flex: 1 } : btnSuccess}>+ Agregar Festivo</button>
      )}
      {configTab === 'usuarios_especiales' && (
        <button type="button" onClick={openCrearUsuarioEspecial} style={isMobile ? { ...rhMobileBtnPrimary, flex: 1 } : btnSuccess}>+ Agregar usuario especial</button>
      )}
      {configTab === 'soporte' && isSuperuser && (
        <>
          <button type="button" onClick={openNewClaseSoporte} style={isMobile ? { ...rhMobileBtnPrimary, backgroundColor: '#7c3aed', flex: 1 } : { ...btnSuccess, background: '#7c3aed' }}>+ Categoría</button>
          <button type="button" onClick={openNewTipoSoporte} style={isMobile ? { ...rhMobileBtnPrimary, flex: 1 } : btnSuccess}>+ Tipo ticket</button>
        </>
      )}
      <button
        type="button"
        onClick={() => {
          if (configTab === 'actividad' && isSuperuser) {
            void loadActividad();
            return;
          }
          if (configTab === 'eventos_especiales' && eventosEspecialesTab === 'festivos' && isSuperuser) {
            void loadFestivos();
            return;
          }
          setLoading(true);
          loadData();
        }}
        disabled={loading || (configTab === 'actividad' && (loadingActividad || purgingActividad))}
        style={isMobile
          ? { ...rhMobileBtnSecondary, minHeight: 44, flex: configTab === 'soporte' ? '1 1 100%' : 1, opacity: loading || (configTab === 'actividad' && (loadingActividad || purgingActividad)) ? 0.6 : 1 }
          : { padding: '8px 18px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '5px', cursor: loading || (configTab === 'actividad' && (loadingActividad || purgingActividad)) ? 'not-allowed' : 'pointer', opacity: loading || (configTab === 'actividad' && (loadingActividad || purgingActividad)) ? 0.6 : 1 }}
      >
        Actualizar
      </button>
    </div>
  );

  const mainTabBar = isMobile ? (
    <div style={rhMobileTabScroll}>
      {visibleTabs.map(t => (
        <button
          key={t.key}
          type="button"
          style={rhMobileTabPill(configTab === t.key)}
          onClick={() => {
            setConfigTab(t.key);
            if (t.key === 'eventos_especiales') {
              setEventosEspecialesTab('festivos');
              void loadFestivos();
            }
          }}
        >
          {t.short}
        </button>
      ))}
    </div>
  ) : (
    <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '20px', overflowX: 'auto' }}>
      {visibleTabs.map(t => (
        <button
          key={t.key}
          style={tabStyle(configTab === t.key)}
          onClick={() => {
            setConfigTab(t.key);
            if (t.key === 'eventos_especiales') {
              setEventosEspecialesTab('festivos');
              void loadFestivos();
            }
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  const pageBody = (
    <>
      {!isMobile && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ margin: 0 }}>Configuracion</h1>
            <p style={{ margin: '4px 0 0', color: '#888', fontSize: '0.9rem' }}>
              {configTabSubtitle(configTab)}
            </p>
          </div>
          {headerActions}
        </div>
      )}

      {isMobile && (
        <div style={{ marginBottom: 12 }}>
          {headerActions}
        </div>
      )}

      {mainTabBar}

      {/* ====== TAB: DISPOSITIVOS ====== */}
      {configTab === 'dispositivos' && (
        <>
      {/* Modal nuevo dispositivo */}
      {showDeviceForm && (
        <div style={modalOverlay} onClick={() => setShowDeviceForm(false)}>
          <div style={{ ...modalSmall, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Registrar nuevo dispositivo</h3>
              <button type="button" onClick={() => setShowDeviceForm(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={crearDispositivo}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>Nombre del equipo *</label>
                  <input type="text" name="nombre" required placeholder="Ej: Checador Entrada" style={inputStyle} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>Identificador del dispositivo en el sistema</span>
                </div>
                <div>
                  <label style={labelStyle}>Ubicacion</label>
                  <input type="text" name="ubicacion" placeholder="Ej: Recepcion, Oficina 1" style={inputStyle} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>Lugar donde esta instalado</span>
                </div>
                <div>
                  <label style={labelStyle}>IP local</label>
                  <input type="text" name="ip_local" placeholder="Ej: 192.168.1.201" style={inputStyle} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>IP del checador en la red (para probar conexion)</span>
                </div>
                <div>
                  <label style={labelStyle}>Numero de serie (SN)</label>
                  <input type="text" name="serial_number" placeholder="No necesario para agente" style={inputStyle} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>Opcional. El agente local no lo requiere.</span>
                </div>
              </div>
              <div style={{ padding: '10px 12px', backgroundColor: '#f0f9ff', borderRadius: '6px', marginBottom: '20px', fontSize: '0.8rem', color: '#0369a1' }}>
                Al guardar se generara una API Key. Configurala en el <strong>config.yaml</strong> del agente en la PC que controla este dispositivo.
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowDeviceForm(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={btnSuccess}>Registrar dispositivo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal editar dispositivo */}
      {showDeviceEditModal && (
        <div style={modalOverlay} onClick={cerrarEditarDispositivo}>
          <div style={{ ...modalSmall, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Editar dispositivo</h3>
              <button type="button" onClick={cerrarEditarDispositivo} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={guardarDispositivo}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>Nombre del equipo *</label>
                  <input
                    type="text"
                    value={deviceEditForm.nombre}
                    onChange={(e) => setDeviceEditForm(p => ({ ...p, nombre: e.target.value }))}
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Ubicacion</label>
                  <input
                    type="text"
                    value={deviceEditForm.ubicacion}
                    onChange={(e) => setDeviceEditForm(p => ({ ...p, ubicacion: e.target.value }))}
                    placeholder="Ej: Recepcion, Oficina 1"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>IP local</label>
                  <input
                    type="text"
                    value={deviceEditForm.ip_local}
                    onChange={(e) => setDeviceEditForm(p => ({ ...p, ip_local: e.target.value }))}
                    placeholder="Ej: 192.168.1.201"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Numero de serie (SN)</label>
                  <input
                    type="text"
                    value={deviceEditForm.serial_number}
                    onChange={(e) => setDeviceEditForm(p => ({ ...p, serial_number: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={deviceEditForm.activo}
                    onChange={(e) => setDeviceEditForm(p => ({ ...p, activo: e.target.checked }))}
                  />
                  Dispositivo activo
                </label>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={cerrarEditarDispositivo} style={btnSecondary} disabled={savingDevice}>Cancelar</button>
                <button type="submit" style={savingDevice ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={savingDevice}>
                  {savingDevice ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: isMobile ? 8 : '16px', marginBottom: '24px' }}>
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Total</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#333' }}>{dispositivos.length}</div>
        </div>
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Activos</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#28a745' }}>{dispositivos.filter(d => d.activo).length}</div>
        </div>
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Inactivos</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#dc3545' }}>{dispositivos.filter(d => !d.activo).length}</div>
        </div>
      </div>

      {/* Lista de dispositivos */}
      {dispositivos.length === 0 ? (
        <p style={{ color: '#666', textAlign: 'center', padding: '40px 0' }}>No hay dispositivos. Registra uno para comenzar.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {dispositivos.map((device) => (
            <div key={device.id} style={{ padding: '18px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0 }}>{device.nombre}</h4>
                <span style={{
                  padding: '3px 8px', borderRadius: '4px', fontSize: '0.8rem',
                  backgroundColor: device.activo ? '#d4edda' : '#f8d7da',
                  color: device.activo ? '#155724' : '#721c24',
                }}>
                  {device.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              {device.ubicacion && <p style={{ margin: '4px 0', color: '#666', fontSize: '0.9rem' }}>Ubicacion: {device.ubicacion}</p>}
              {device.ip_local && <p style={{ margin: '4px 0', color: '#666', fontSize: '0.9rem' }}>IP local: {device.ip_local}</p>}
              {device.serial_number && <p style={{ margin: '4px 0', color: '#666', fontSize: '0.9rem' }}>SN: {device.serial_number}</p>}

              {/* Última conexión del agente (portal web no usa agente) */}
              <p style={{ margin: '6px 0', fontSize: '0.9rem' }}>
                <span style={{ color: '#666', fontWeight: 600 }}>Última conexión del agente: </span>
                {(device.nombre || '').trim() === 'Portal Checadas Remotas' ? (
                  <span style={{ color: '#6b7280', fontStyle: 'italic' }}>Portal web — no aplica</span>
                ) : device.ultima_sync_agente ? (
                  <span style={{ color: '#1565c0', fontWeight: 600 }}>
                    {fmtDate(device.ultima_sync_agente)}
                    <span style={{ color: '#64748b', fontWeight: 500, marginLeft: 8 }}>
                      ({fmtHace(device.ultima_sync_agente)})
                    </span>
                  </span>
                ) : (
                  <span style={{ color: '#e65100', fontWeight: 500 }}>Sin conexión — el agente no ha llamado al servidor</span>
                )}
              </p>

              {/* API Key con mostrar/ocultar y copiar */}
              <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ color: '#666', fontSize: '0.8rem', fontWeight: 500 }}>API Key para el agente</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setShowApiKey(prev => ({ ...prev, [device.id]: !prev[device.id] }))}
                      style={{ fontSize: '0.7rem', padding: '2px 8px', cursor: 'pointer', color: '#0ea5e9', background: 'none', border: '1px solid #0ea5e9', borderRadius: '3px' }}
                    >
                      {showApiKey[device.id] ? 'Ocultar' : 'Mostrar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => copiarApiKey(device.api_key)}
                      style={{ fontSize: '0.7rem', padding: '2px 8px', cursor: 'pointer', color: '#28a745', background: 'none', border: '1px solid #28a745', borderRadius: '3px' }}
                    >
                      Copiar
                    </button>
                  </div>
                </div>
                {showApiKey[device.id] ? (
                  <code style={{ wordBreak: 'break-all', fontSize: '0.75rem', color: '#333' }}>{device.api_key}</code>
                ) : (
                  <code style={{ fontSize: '0.75rem', color: '#999' }}>{'*'.repeat(32)}</code>
                )}
              </div>

              {/* Acciones */}
              <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => startEditDispositivo(device)}
                  style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Editar
                </button>
                {(device.nombre || '').trim() !== 'Portal Checadas Remotas' && (
                  <button onClick={() => probarComoAgente(device.id)} style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Probar agente
                  </button>
                )}
                <button onClick={() => eliminarDispositivo(device.id, device.nombre)} style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {/* ====== TAB: EMPRESAS ====== */}
      {configTab === 'empresas' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ margin: 0, color: '#555' }}>{empresas.length} empresa(s) registrada(s)</p>
          </div>
          {empresas.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No hay empresas registradas.</p>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {empresas.map(emp => {
                const count = empleados.filter(e => e.empresa_id === emp.id).length;
                return (
                  <div key={emp.id} style={rhMobileCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <div style={rhMobileCardTitle}>{emp.nombre}</div>
                      <span style={rhMobileBadge(emp.activo ? '#d4edda' : '#f8d7da', emp.activo ? '#155724' : '#721c24')}>
                        {emp.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    <div style={rhMobileCardSub}>{emp.rfc || 'Sin RFC'}</div>
                    <div style={rhMobileCardRow}><span>Empleados</span><span style={{ fontWeight: 700 }}>{count}</span></div>
                    <div style={rhMobileCardRow}><span>Jornada</span><span>{emp.dias_laborales === 'lun-dom' ? 'Lun-Dom' : 'Lun-Sáb'}</span></div>
                    <div style={rhMobileCardRow}><span>Sáb/Dom</span><span>{emp.fin_semana_4_checadas ? '4 checadas' : '2 checadas'}</span></div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button type="button" onClick={() => startEditEmpresa(emp)} style={{ ...rhMobileBtnSecondary, flex: 1 }}>Editar</button>
                      <button type="button" onClick={() => toggleEmpresaActivo(emp)} style={{ ...rhMobileBtnSecondary, flex: 1, color: emp.activo ? '#b91c1c' : '#15803d' }}>
                        {emp.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    {['Razón social', 'RFC', 'Domicilio fiscal', 'C.P.', 'Régimen fiscal', 'Teléfono', 'Jornada', 'Festivos', 'Sáb/Dom', 'Empleados', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {empresas.map(emp => {
                    const count = empleados.filter(e => e.empresa_id === emp.id).length;
                    return (
                      <tr key={emp.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '11px 14px', fontWeight: 500 }}>{emp.nombre}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{emp.rfc || '—'}</td>
                        <td style={{ padding: '11px 14px', color: '#555', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem' }} title={formatEmpresaDomicilioFiscal(emp)}>{formatEmpresaDomicilioFiscal(emp)}</td>
                        <td style={{ padding: '11px 14px', color: '#555', fontFamily: 'monospace' }}>{emp.codigo_postal || '—'}</td>
                        <td style={{ padding: '11px 14px', color: '#555', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem' }} title={regimenSatLabel(emp.regimen_fiscal)}>{regimenSatLabel(emp.regimen_fiscal)}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{emp.telefono || '—'}</td>
                        <td style={{ padding: '11px 14px', color: '#334155', fontWeight: 600 }}>
                          {emp.dias_laborales === 'lun-dom' ? 'Lun-Dom' : 'Lun-Sáb'}
                        </td>
                        <td style={{ padding: '11px 14px', color: emp.trabaja_festivos ? '#166534' : '#6b7280', fontWeight: 600 }}>
                          {emp.trabaja_festivos ? 'Sí' : 'No'}
                        </td>
                        <td style={{ padding: '11px 14px', color: emp.fin_semana_4_checadas ? '#166534' : '#6b7280', fontWeight: 600 }} title={emp.fin_semana_4_checadas ? '4 checadas (con comida)' : '2 checadas (entrada/salida)'}>
                          {emp.fin_semana_4_checadas ? '4' : '2'}
                        </td>
                        <td style={{ padding: '11px 14px', fontWeight: 600 }}>{count}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: emp.activo ? '#d4edda' : '#f8d7da', color: emp.activo ? '#155724' : '#721c24', fontWeight: 500 }}>
                            {emp.activo ? 'Activa' : 'Inactiva'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => startEditEmpresa(emp)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px' }}>Editar</button>
                            <button onClick={() => toggleEmpresaActivo(emp)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: emp.activo ? '#dc3545' : '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>
                              {emp.activo ? 'Desactivar' : 'Activar'}
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

      {/* ====== TAB: HORARIOS ====== */}
      {configTab === 'horarios' && (
        <>
          {horarios.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
              <p>No hay horarios registrados. Crea el primero.</p>
            </div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {horarios.map(h => {
                const dias = h.dias_semana ? h.dias_semana.split(',').map(Number).filter(d => d !== 6) : [];
                const diasLabel = dias.map(d => DIAS[d - 1] || '').filter(Boolean).join(', ') || 'L-V';
                return (
                  <div key={h.id} style={rhMobileCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <div style={rhMobileCardTitle}>{h.nombre}</div>
                      <span style={rhMobileBadge(h.activo ? '#d4edda' : '#f8d7da', h.activo ? '#155724' : '#721c24')}>
                        {h.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div style={rhMobileCardRow}><span>Entrada</span><span style={{ fontWeight: 700, color: '#059669' }}>{h.hora_entrada}</span></div>
                    <div style={rhMobileCardRow}><span>Salida L-V</span><span style={{ fontWeight: 700, color: '#dc2626' }}>{h.hora_salida}</span></div>
                    {h.hora_salida_sabado && (
                      <div style={rhMobileCardRow}><span>Salida sáb</span><span>{h.hora_salida_sabado}</span></div>
                    )}
                    <div style={rhMobileCardRow}><span>Tolerancia</span><span>{h.tolerancia_minutos} min · {diasLabel}</span></div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button type="button" onClick={() => startEditHorario(h)} style={{ ...rhMobileBtnSecondary, flex: 1 }}>Editar</button>
                      <button type="button" onClick={() => toggleHorarioActivo(h)} style={{ ...rhMobileBtnSecondary, flex: 1 }}>
                        {h.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    {['Nombre', 'Entrada', 'Salida L-V', 'Salida Sáb', 'Tolerancia', 'Días (L-V)', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {horarios.map(h => {
                    const dias = h.dias_semana ? h.dias_semana.split(',').map(Number).filter(d => d !== 6) : [];
                    const diasLabel = dias.map(d => DIAS[d - 1] || '').filter(Boolean).join(', ') || 'L-V';
                    return (
                      <tr key={h.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '11px 14px', fontWeight: 500 }}>{h.nombre}</td>
                        <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 600, color: '#059669' }}>{h.hora_entrada}</td>
                        <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 600, color: '#dc2626' }}>{h.hora_salida}</td>
                        <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 600, color: h.hora_salida_sabado ? '#d97706' : '#9ca3af' }}>
                          {h.hora_salida_sabado || '—'}
                        </td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{h.tolerancia_minutos} min</td>
                        <td style={{ padding: '11px 14px', color: '#555', fontSize: '0.85rem' }}>{diasLabel}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: h.activo ? '#d4edda' : '#f8d7da', color: h.activo ? '#155724' : '#721c24', fontWeight: 500 }}>
                            {h.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => startEditHorario(h)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px' }}>Editar</button>
                            <button onClick={() => toggleHorarioActivo(h)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: h.activo ? '#dc3545' : '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>
                              {h.activo ? 'Desactivar' : 'Activar'}
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

      {/* Modal Crear/Editar Horario */}
      {showHorarioModal && (
        <div style={modalOverlay} onClick={() => setShowHorarioModal(false)}>
          <div style={modalSmall} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{editingHorarioId ? 'Editar Horario' : 'Nuevo Horario'}</h3>
              <button onClick={() => setShowHorarioModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleHorarioSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>Nombre *</label>
                  <input style={inputStyle} value={horarioForm.nombre} onChange={e => setHorarioForm(p => ({ ...p, nombre: e.target.value }))} required placeholder="Ej: Turno General" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Hora de entrada *</label>
                    <input type="time" style={inputStyle} value={horarioForm.hora_entrada} onChange={e => setHorarioForm(p => ({ ...p, hora_entrada: e.target.value }))} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Hora de salida (Lun–Vie) *</label>
                    <input type="time" style={inputStyle} value={horarioForm.hora_salida} onChange={e => setHorarioForm(p => ({ ...p, hora_salida: e.target.value }))} required />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Tolerancia (minutos)</label>
                  <input type="number" min={0} max={60} style={inputStyle} value={horarioForm.tolerancia_minutos} onChange={e => setHorarioForm(p => ({ ...p, tolerancia_minutos: parseInt(e.target.value) || 0 }))} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>Aplica a retardo y salida anticipada (mismo valor para todos los días)</span>
                </div>
                <div>
                  <label style={labelStyle}>Días laborables (Lun–Vie)</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {DIAS.slice(0, 5).map((d, i) => {
                      const num = i + 1;
                      const active = diasSeleccionados.includes(num);
                      return (
                        <button type="button" key={num} onClick={() => toggleDia(num)} style={{ padding: '4px 10px', borderRadius: '4px', border: `1px solid ${active ? '#0ea5e9' : '#d1d5db'}`, backgroundColor: active ? '#0ea5e9' : 'white', color: active ? 'white' : '#374151', cursor: 'pointer', fontSize: '0.82rem', fontWeight: active ? 600 : 400 }}>
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Sección sábado ── */}
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', color: '#374151' }}>
                    <input
                      type="checkbox"
                      checked={trabajaSabado}
                      onChange={e => { setTrabajaSabado(e.target.checked); if (!e.target.checked) setHorarioForm(p => ({ ...p, hora_salida_sabado: '' })); }}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    ¿Trabaja los sábados?
                  </label>
                  {trabajaSabado && (
                    <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={labelStyle}>Hora de entrada sábado</label>
                        <span style={{ fontSize: '0.78rem', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Usa la misma hora de entrada general</span>
                        <input type="time" style={{ ...inputStyle, backgroundColor: '#f3f4f6', color: '#9ca3af' }} value={horarioForm.hora_entrada} disabled />
                      </div>
                      <div>
                        <label style={labelStyle}>Hora de salida sábado *</label>
                        <input type="time" style={{ ...inputStyle, borderColor: '#d97706' }} value={horarioForm.hora_salida_sabado || ''} onChange={e => setHorarioForm(p => ({ ...p, hora_salida_sabado: e.target.value }))} required={trabajaSabado} />
                      </div>
                    </div>
                  )}
                  {!trabajaSabado && (
                    <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '6px 0 0 24px' }}>
                      El sábado NO es laborable — no se generarán incidencias ese día.
                    </p>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', color: '#374151' }}>
                    <input
                      type="checkbox"
                      checked={trabajaDomingo}
                      onChange={e => setTrabajaDomingo(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    ¿Trabaja los domingos?
                  </label>
                  <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '6px 0 0 24px' }}>
                    Solo aplica en empresas lun–dom con «gestiona descansos rotativos». Si está desmarcado, no se genera falta el domingo para quien tenga este horario.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowHorarioModal(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                  {saving ? 'Guardando...' : editingHorarioId ? 'Guardar Cambios' : 'Crear Horario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear/Editar Empresa */}
      {showEmpresaModal && (
        <div style={modalOverlay} onClick={() => setShowEmpresaModal(false)}>
          <div style={modalEmpresa} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{editingEmpresaId ? 'Editar empresa' : 'Nueva empresa'}</h3>
              <button type="button" onClick={() => setShowEmpresaModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleEmpresaSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Datos fiscales</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
                  <div>
                    <label style={labelStyle}>Denominación o razón social *</label>
                    <input style={inputStyle} value={empresaForm.nombre}
                      onChange={e => setEmpresaForm(p => ({ ...p, nombre: e.target.value }))} required placeholder="Nombre legal ante el SAT" />
                  </div>
                  <div style={{ minWidth: 90 }}>
                    <label style={labelStyle}>Siglas</label>
                    <input style={{ ...inputStyle, textTransform: 'uppercase' }} value={empresaForm.siglas}
                      onChange={e => setEmpresaForm(p => ({ ...p, siglas: e.target.value.toUpperCase() }))}
                      maxLength={20} placeholder="DEA" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>RFC</label>
                    <input style={inputStyle} value={empresaForm.rfc}
                      onChange={e => setEmpresaForm(p => ({ ...p, rfc: e.target.value.toUpperCase() }))} maxLength={13} placeholder="12 o 13 caracteres" />
                  </div>
                  <div>
                    <label style={labelStyle}>Capital social (MXN)</label>
                    <input style={inputStyle} inputMode="decimal"
                      value={empresaForm.capital_social}
                      onChange={e => setEmpresaForm(p => ({ ...p, capital_social: e.target.value }))} placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Régimen fiscal (SAT)</label>
                  <select
                    style={inputStyle}
                    value={empresaForm.regimen_fiscal}
                    onChange={e => setEmpresaForm(p => ({ ...p, regimen_fiscal: e.target.value }))}
                  >
                    <option value="">— Seleccionar —</option>
                    {regimenesSat.map((r) => (
                      <option key={r.code} value={r.code}>{`${r.code} — ${r.descripcion}`}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginTop: 4 }}>Catálogo c_RegimenFiscal (CFDI 4.0)</span>
                </div>

                <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Domicilio fiscal</p>
                <div>
                  <label style={labelStyle}>Calle / domicilio</label>
                  <input style={inputStyle} value={empresaForm.domicilio}
                    onChange={e => setEmpresaForm(p => ({ ...p, domicilio: e.target.value }))} placeholder="Vía pública" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Núm. exterior</label>
                    <input style={inputStyle} value={empresaForm.numero_exterior}
                      onChange={e => setEmpresaForm(p => ({ ...p, numero_exterior: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Núm. interior</label>
                    <input style={inputStyle} value={empresaForm.numero_interior}
                      onChange={e => setEmpresaForm(p => ({ ...p, numero_interior: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Colonia</label>
                  <input style={inputStyle} value={empresaForm.colonia}
                    onChange={e => setEmpresaForm(p => ({ ...p, colonia: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Código postal</label>
                    <input style={inputStyle} value={empresaForm.codigo_postal} maxLength={5}
                      onChange={e => setEmpresaForm(p => ({ ...p, codigo_postal: e.target.value.replace(/\D/g, '').slice(0, 5) }))} placeholder="00000" />
                  </div>
                  <div>
                    <label style={labelStyle}>Municipio / alcaldía</label>
                    <input style={inputStyle} value={empresaForm.municipio}
                      onChange={e => setEmpresaForm(p => ({ ...p, municipio: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Estado</label>
                    <input style={inputStyle} value={empresaForm.estado}
                      onChange={e => setEmpresaForm(p => ({ ...p, estado: e.target.value }))} />
                  </div>
                </div>

                <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Contacto</p>
                <div>
                  <label style={labelStyle}>Teléfono</label>
                  <input style={inputStyle} value={empresaForm.telefono}
                    onChange={e => setEmpresaForm(p => ({ ...p, telefono: e.target.value }))} />
                </div>

                <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Jornada</p>
                <div>
                  <label style={labelStyle}>Días laborables de la empresa</label>
                  <select
                    style={inputStyle}
                    value={empresaForm.dias_laborales}
                    onChange={e => setEmpresaForm(p => ({ ...p, dias_laborales: (e.target.value as 'lun-sab' | 'lun-dom') }))}
                  >
                    <option value="lun-sab">Lunes a sábado</option>
                    <option value="lun-dom">Lunes a domingo</option>
                  </select>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                    Define si el domingo cuenta como día laborable para la lógica de checadas.
                  </span>
                </div>
                  <div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={empresaForm.trabaja_festivos}
                        onChange={e => setEmpresaForm(p => ({ ...p, trabaja_festivos: e.target.checked }))}
                      />
                      ¿La empresa trabaja días festivos?
                    </label>
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                      Si está activo, en festivos sí se consideran checadas para esta empresa.
                    </span>
                  </div>
                  <div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={empresaForm.fin_semana_4_checadas}
                        onChange={e => setEmpresaForm(p => ({ ...p, fin_semana_4_checadas: e.target.checked }))}
                      />
                      ¿Sábado/domingo laborable con 4 checadas?
                    </label>
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                      Por defecto el fin de semana laborable pide 2 (entrada y salida). Actívalo solo si
                      esa empresa también registra comida esos días (como entre semana).
                    </span>
                  </div>
                  <div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={empresaForm.gestiona_descansos_rotativos}
                        onChange={e => setEmpresaForm(p => ({ ...p, gestiona_descansos_rotativos: e.target.checked }))}
                      />
                      ¿Gestiona descansos rotativos?
                    </label>
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                      Solo Optivisión/COF (u otras lun–dom con rotación). Activa domingo según horario y la captura semanal de descansos. Empresas fijas: dejar apagado.
                    </span>
                  </div>

                {isNominaEnabled && (
                  <>
                    <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Nómina / Timbrado</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={labelStyle}>Registro patronal IMSS</label>
                        <input
                          style={inputStyle}
                          value={empresaForm.registro_patronal}
                          onChange={e => setEmpresaForm(p => ({ ...p, registro_patronal: e.target.value.toUpperCase() }))}
                          maxLength={20}
                          placeholder="Ej. Y99 00 00 000 0"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>CP expedición CFDI</label>
                        <input
                          style={inputStyle}
                          value={empresaForm.codigo_postal_expedicion}
                          onChange={e => setEmpresaForm(p => ({ ...p, codigo_postal_expedicion: e.target.value.replace(/\D/g, '').slice(0, 5) }))}
                          maxLength={5}
                          placeholder="5 dígitos (lugar de timbrado)"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Periodicidad de pago por defecto</label>
                        <select
                          style={inputStyle}
                          value={empresaForm.periodicidad_nomina}
                          onChange={e => setEmpresaForm(p => ({ ...p, periodicidad_nomina: e.target.value }))}
                        >
                          <option value="">— Sin definir —</option>
                          {periodicidadCat.length > 0
                            ? periodicidadCat.map(c => (
                                <option key={c.clave} value={c.clave}>{c.clave} — {c.descripcion}</option>
                              ))
                            : (
                              <>
                                <option value="04">04 — Quincenal</option>
                                <option value="05">05 — Mensual</option>
                                <option value="02">02 — Semanal</option>
                              </>
                            )
                          }
                        </select>
                      </div>
                    </div>
                    {savingNominaEmpresa && (
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>Guardando configuración de nómina…</p>
                    )}
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowEmpresaModal(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                  {saving ? 'Guardando...' : editingEmpresaId ? 'Guardar cambios' : 'Crear empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====== TAB: EVENTOS ESPECIALES (solo administrador) ====== */}
      {isSuperuser && configTab === 'eventos_especiales' && (
        <div style={{ marginBottom: '18px' }}>
          {isMobile ? (
            <div style={rhMobileTabScroll}>
              {EVENTOS_TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  style={rhMobileTabPill(eventosEspecialesTab === t.key)}
                  onClick={() => {
                    setEventosEspecialesTab(t.key);
                    if (t.key === 'festivos') void loadFestivos();
                  }}
                >
                  {t.short}
                </button>
              ))}
            </div>
          ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid #e5e7eb', paddingBottom: '10px' }}>
            <button
              type="button"
              style={tabStyle(eventosEspecialesTab === 'festivos')}
              onClick={() => {
                setEventosEspecialesTab('festivos');
                void loadFestivos();
              }}
            >
              Días festivos
            </button>
            <button
              type="button"
              style={tabStyle(eventosEspecialesTab === 'vacaciones_generales')}
              onClick={() => setEventosEspecialesTab('vacaciones_generales')}
            >
              Vacaciones generales
            </button>
            <button
              type="button"
              style={tabStyle(eventosEspecialesTab === 'checadas_especiales')}
              onClick={() => setEventosEspecialesTab('checadas_especiales')}
            >
              Checadas especiales
            </button>
            <button
              type="button"
              style={tabStyle(eventosEspecialesTab === 'descansos_programados')}
              onClick={() => setEventosEspecialesTab('descansos_programados')}
            >
              Descansos programados
            </button>
          </div>
          )}
        </div>
      )}

      {/* ====== SUBTAB: DÍAS FESTIVOS ====== */}
      {isSuperuser && configTab === 'eventos_especiales' && eventosEspecialesTab === 'festivos' && (
        <div>
          {/* Controles de año + auto-generar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontWeight: 600, color: '#374151' }}>Año:</label>
              <input
                type="number" min={2020} max={2099}
                value={festivoAño}
                onChange={e => { const y = Number(e.target.value); setFestivoAño(y); loadFestivos(y); }}
                style={{ width: '90px', height: '36px', padding: '0 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>
            <button
              onClick={handleGenerarFestivos}
              disabled={generandoFestivos}
              style={{ padding: '8px 18px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', cursor: generandoFestivos ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.875rem', opacity: generandoFestivos ? 0.6 : 1 }}
            >
              {generandoFestivos ? 'Generando...' : `⚡ Generar LFT ${festivoAño}`}
            </button>
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              Genera automáticamente los días de asueto del Art. 74 LFT + Semana Santa
            </span>
          </div>

          {/* Tabla / tarjetas de festivos */}
          {festivos.length === 0 ? (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: '28px 12px' }}>
              No hay días festivos para {festivoAño}. Usa &quot;Generar LFT&quot; para agregarlos automáticamente.
            </p>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {festivos.map((f) => {
                const fechaLocal = new Date(f.fecha + 'T12:00:00');
                const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
                const diaNombre = diasSemana[fechaLocal.getDay()];
                return (
                  <div key={f.id} style={{ ...rhMobileCard, opacity: f.activo ? 1 : 0.55 }}>
                    <div style={rhMobileCardTitle}>{f.nombre}</div>
                    <div style={rhMobileCardSub}>
                      {fechaLocal.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })} ({diaNombre})
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <span style={rhMobileBadge(f.tipo === 'LFT' ? '#e0f2fe' : '#fef9c3', f.tipo === 'LFT' ? '#0369a1' : '#854d0e')}>
                        {f.tipo === 'LFT' ? 'Obligatorio LFT' : 'Adicional'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button type="button" onClick={() => toggleFestivoActivo(f)} style={{ ...rhMobileBtnSecondary, flex: 1 }}>
                        {f.activo ? 'Activo' : 'Inactivo'}
                      </button>
                      <button type="button" onClick={() => deleteFestivo(f)} style={{ ...rhMobileBtnSecondary, flex: 1, color: '#dc2626', borderColor: '#fecaca' }}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
          <div style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Fecha</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Nombre</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Tipo</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Activo</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {festivos.map((f, i) => {
                  const fechaLocal = new Date(f.fecha + 'T12:00:00');
                  const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
                  const diaNombre = diasSemana[fechaLocal.getDay()];
                  return (
                    <tr key={f.id} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none', opacity: f.activo ? 1 : 0.45 }}>
                      <td style={{ padding: '12px 16px', fontSize: '0.9rem', fontWeight: 500 }}>
                        {fechaLocal.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
                        <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: '#6b7280' }}>({diaNombre})</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{f.nombre}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                          backgroundColor: f.tipo === 'LFT' ? '#e0f2fe' : '#fef9c3',
                          color: f.tipo === 'LFT' ? '#0369a1' : '#854d0e',
                        }}>
                          {f.tipo === 'LFT' ? 'Obligatorio LFT' : 'Adicional'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => toggleFestivoActivo(f)}
                          style={{ padding: '4px 14px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, backgroundColor: f.activo ? '#dcfce7' : '#f3f4f6', color: f.activo ? '#15803d' : '#6b7280' }}
                        >
                          {f.activo ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => deleteFestivo(f)}
                          style={{ padding: '4px 12px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', backgroundColor: '#fee2e2', color: '#dc2626' }}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {/* Modal agregar festivo manual */}
          {showFestivoModal && (
            <div style={modalOverlay} onClick={() => setShowFestivoModal(false)}>
              <div style={{ ...modalSmall, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Agregar día festivo</h3>
                  <button type="button" onClick={() => setShowFestivoModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9ca3af' }}>&times;</button>
                </div>
                <form onSubmit={handleFestivoSubmit}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                    <div>
                      <label style={labelStyle}>Fecha *</label>
                      <input type="date" style={inputStyle} value={festivoForm.fecha}
                        onChange={e => setFestivoForm(p => ({ ...p, fecha: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={labelStyle}>Nombre *</label>
                      <input style={inputStyle} placeholder="Ej. Fundación del municipio" value={festivoForm.nombre}
                        onChange={e => setFestivoForm(p => ({ ...p, nombre: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={labelStyle}>Tipo</label>
                      <select style={inputStyle} value={festivoForm.tipo}
                        onChange={e => setFestivoForm(p => ({ ...p, tipo: e.target.value }))}>
                        <option value="LFT">Obligatorio LFT</option>
                        <option value="adicional">Adicional / empresa</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setShowFestivoModal(false)} style={btnSecondary}>Cancelar</button>
                    <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====== SUBTAB: VACACIONES GENERALES ====== */}
      {isSuperuser && configTab === 'eventos_especiales' && eventosEspecialesTab === 'vacaciones_generales' && (
        <>
          <div
            style={{
              marginBottom: 16,
              padding: '14px 16px',
              backgroundColor: authMe?.vacaciones_pdf_firmado_habilitado ? '#ecfdf5' : '#fff7ed',
              border: `1px solid ${authMe?.vacaciones_pdf_firmado_habilitado ? '#6ee7b7' : '#fed7aa'}`,
              borderRadius: 8,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ flex: '1 1 240px' }}>
              <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: '0.95rem' }}>
                Subida de PDF firmado (vacaciones)
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                Si está desactivado, empleados/jefes/RH solo ven la plantilla HTML. Al activarlo aparece «Subir PDF firmado».
              </p>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: savingPdfFlag ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={authMe?.vacaciones_pdf_firmado_habilitado === true}
                disabled={savingPdfFlag}
                onChange={(e) => void togglePdfFirmado(e.target.checked)}
              />
              {authMe?.vacaciones_pdf_firmado_habilitado ? 'Habilitado' : 'Deshabilitado'}
            </label>
          </div>
          <div
            style={{
              marginBottom: 16,
              padding: '14px 16px',
              backgroundColor: authMe?.prestamos_pdf_firmado_habilitado ? '#ecfdf5' : '#fff7ed',
              border: `1px solid ${authMe?.prestamos_pdf_firmado_habilitado ? '#6ee7b7' : '#fed7aa'}`,
              borderRadius: 8,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ flex: '1 1 240px' }}>
              <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: '0.95rem' }}>
                PDF firmado y firma en pantalla (préstamos)
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                El solicitante puede firmar en pantalla (dibujar o subir imagen temporal). Solo se guarda el PDF final; no se resguardan firmas. También se puede subir un PDF escaneado.
              </p>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: savingPdfPrestamosFlag ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={authMe?.prestamos_pdf_firmado_habilitado === true}
                disabled={savingPdfPrestamosFlag}
                onChange={(e) => void togglePdfFirmadoPrestamos(e.target.checked)}
              />
              {authMe?.prestamos_pdf_firmado_habilitado ? 'Habilitado' : 'Deshabilitado'}
            </label>
          </div>
          <VacacionesGeneralesPage embedded />
        </>
      )}

      {isSuperuser && configTab === 'eventos_especiales' && eventosEspecialesTab === 'checadas_especiales' && (
        <ChecadasEspecialesPage embedded />
      )}

      {isSuperuser && configTab === 'eventos_especiales' && eventosEspecialesTab === 'descansos_programados' && (
        <DescansosProgramadosPage />
      )}

      {/* ====== TAB: USUARIOS ESPECIALES ====== */}
      {configTab === 'usuarios_especiales' && (
        <div>
          <div style={{ padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '8px', marginBottom: '20px', border: '1px solid #bae6fd' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#0369a1' }}>
              <strong>Usuarios especiales</strong> no generan incidencias automáticas (faltas, retardos, salida anticipada, incompleta). Útil para directivos, visitas o personal con horarios flexibles.
            </p>
          </div>
          {loadingUsuariosEspeciales ? (
            <p style={{ color: '#666' }}>Cargando usuarios especiales...</p>
          ) : usuariosEspeciales.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
              <p style={{ color: '#6b7280', margin: 0 }}>No hay usuarios especiales configurados.</p>
              <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: '8px 0 0' }}>Usa "Agregar usuario especial" para asignar empleados que no generen incidencias.</p>
            </div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {usuariosEspeciales.map(emp => (
                <div key={emp.id} style={rhMobileCard}>
                  <div style={rhMobileCardTitle}>{fmtNombreEmpleado(emp)}</div>
                  <div style={rhMobileCardSub}>{emp.departamento?.nombre || 'Sin departamento'}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" onClick={() => openVerUsuarioEspecial(emp)} disabled={loadingUsuarioEspecialDetalle} style={{ ...rhMobileBtnSecondary, flex: 1 }}>Ver</button>
                    <button type="button" onClick={() => toggleExentoIncidencias(emp, false)} disabled={togglingEspecial === emp.id} style={{ ...rhMobileBtnSecondary, flex: 1, color: '#dc2626', borderColor: '#fecaca' }}>
                      {togglingEspecial === emp.id ? '...' : 'Quitar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>No.</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>Nombre</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>Departamento</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {usuariosEspeciales.map(emp => (
                    <tr key={emp.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '11px 14px', fontWeight: 500 }}>{(emp.numero_empleado || '').startsWith('ESP-') ? '—' : emp.numero_empleado}</td>
                      <td style={{ padding: '11px 14px' }}>{fmtNombreEmpleado(emp)}</td>
                      <td style={{ padding: '11px 14px', color: '#555' }}>{emp.departamento?.nombre || '—'}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => openVerUsuarioEspecial(emp)}
                          disabled={loadingUsuarioEspecialDetalle}
                          style={{ padding: '4px 12px', fontSize: '0.8rem', backgroundColor: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '4px', cursor: loadingUsuarioEspecialDetalle ? 'not-allowed' : 'pointer', marginRight: 8 }}
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleExentoIncidencias(emp, false)}
                          disabled={togglingEspecial === emp.id}
                          style={{ padding: '4px 12px', fontSize: '0.8rem', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: togglingEspecial === emp.id ? 'not-allowed' : 'pointer' }}
                        >
                          {togglingEspecial === emp.id ? '...' : 'Quitar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal Crear / Editar usuario especial */}
          {showUsuarioEspecialModal && (
            <div style={modalOverlay} onClick={closeUsuarioEspecialModal}>
              <div style={{ ...modalSmall, maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                    {usuarioEspecialModalMode === 'edit' ? 'Ver / editar usuario especial' : 'Agregar usuario especial'}
                  </h3>
                  <button type="button" onClick={closeUsuarioEspecialModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9ca3af' }}>&times;</button>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#6b7280' }}>
                  Usuario especial: no genera incidencias automáticas. Si es director, marca la casilla y elige solo las empresas; en otro caso elige empresa, departamento y puesto.
                  {usuarioEspecialModalMode === 'edit' && (
                    <span style={{ display: 'block', marginTop: 6 }}>El número de empleado no se modifica desde aquí.</span>
                  )}
                </p>
                <form onSubmit={handleGuardarUsuarioEspecial}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={labelStyle}>Nombre *</label>
                      <input style={inputStyle} value={usuarioEspecialForm.nombre} onChange={e => setUsuarioEspecialForm(p => ({ ...p, nombre: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={labelStyle}>Apellido paterno</label>
                      <input style={inputStyle} value={usuarioEspecialForm.apellido_paterno} onChange={e => setUsuarioEspecialForm(p => ({ ...p, apellido_paterno: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Apellido materno</label>
                      <input style={inputStyle} value={usuarioEspecialForm.apellido_materno} onChange={e => setUsuarioEspecialForm(p => ({ ...p, apellido_materno: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input style={inputStyle} type="email" value={usuarioEspecialForm.email} onChange={e => setUsuarioEspecialForm(p => ({ ...p, email: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Teléfono</label>
                      <input style={inputStyle} value={usuarioEspecialForm.telefono} onChange={e => setUsuarioEspecialForm(p => ({ ...p, telefono: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Usuario (opcional)</label>
                      <input style={inputStyle} value={usuarioEspecialForm.username} onChange={e => setUsuarioEspecialForm(p => ({ ...p, username: e.target.value.toLowerCase() }))} placeholder="Se autogenera si se deja vacío" />
                    </div>
                    <div>
                      <label style={labelStyle}>Acceso (contraseña)</label>
                      {usuarioEspecialModalMode === 'edit' && editingUsuarioEspecialId != null ? (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm('¿Generar contraseña temporal? El usuario deberá cambiarla al entrar.')) return;
                              try {
                                const res = await api.post<{ password_temporal: string; mensaje: string }>(
                                  `/personal/empleados/${editingUsuarioEspecialId}/restablecer-password`,
                                );
                                setPasswordCopiada(false);
                                setPasswordTemporalInfo({
                                  nombre: `${usuarioEspecialForm.nombre} ${usuarioEspecialForm.apellido_paterno || ''}`.trim(),
                                  password: res.data.password_temporal,
                                  mensaje: res.data.mensaje,
                                });
                              } catch (err: unknown) {
                                const e2 = err as { response?: { data?: { detail?: string } } };
                                alert(e2.response?.data?.detail || 'No se pudo restablecer');
                              }
                            }}
                            style={{ ...btnSecondary, width: '100%', height: 38 }}
                          >
                            Restablecer temporal
                          </button>
                          <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                            No se fija la clave definitiva desde aquí.
                          </p>
                        </>
                      ) : (
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.4 }}>
                          Al crear se asigna contraseña temporal interna; el usuario debe cambiarla al entrar.
                        </p>
                      )}
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, color: '#374151' }}>
                        <input
                          type="checkbox"
                          checked={usuarioEspecialForm.esDirector}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setUsuarioEspecialForm((p) => {
                              if (checked) {
                                return {
                                  ...p,
                                  esDirector: true,
                                  empresa_id: '',
                                  departamento_id: '',
                                  puesto_id: '',
                                  empresas_supervision_ids: p.empresa_id ? [Number(p.empresa_id)] : [],
                                };
                              }
                              if (usuarioEspecialModalMode === 'edit' && usuarioEspecialEditSnapshot) {
                                return {
                                  ...usuarioEspecialEditSnapshot,
                                  esDirector: false,
                                  password: p.password,
                                };
                              }
                              return {
                                ...p,
                                esDirector: false,
                                empresa_id: '',
                                departamento_id: '',
                                puesto_id: '',
                                empresas_supervision_ids: [],
                              };
                            });
                          }}
                          style={{ marginTop: 3 }}
                        />
                        <span>
                          Es director
                          <span style={{ display: 'block', fontWeight: 400, fontSize: '0.82rem', color: '#6b7280', marginTop: 4 }}>
                            Actívalo para elegir únicamente las empresas que supervisa (sin departamento ni puesto en pantalla).
                          </span>
                        </span>
                      </label>
                    </div>
                    {usuarioEspecialForm.esDirector ? (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={labelStyle}>Empresas que supervisa *</label>
                        <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#6b7280' }}>
                          Marca todas las razones sociales bajo su dirección. El número de empleado especial usará la empresa con ID menor entre las elegidas como domicilio técnico.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: 220, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
                          {empresas.filter((em) => em.activo).map((em) => (
                            <label key={em.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                              <input
                                type="checkbox"
                                checked={usuarioEspecialForm.empresas_supervision_ids.includes(em.id)}
                                onChange={() => toggleEmpresaSupervision(em.id)}
                              />
                              <span>{em.nombre}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label style={labelStyle}>Empresa *</label>
                          <select
                            style={inputStyle}
                            value={usuarioEspecialForm.empresa_id}
                            onChange={e => setUsuarioEspecialForm(p => ({
                              ...p,
                              empresa_id: e.target.value ? Number(e.target.value) : '',
                              departamento_id: '',
                              puesto_id: '',
                            }))}
                            required
                          >
                            <option value="">-- Seleccionar empresa --</option>
                            {empresas.filter(e => e.activo).map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Departamento *</label>
                          <select
                            style={inputStyle}
                            value={usuarioEspecialForm.departamento_id}
                            onChange={e => setUsuarioEspecialForm(p => ({ ...p, departamento_id: e.target.value ? Number(e.target.value) : '', puesto_id: '' }))}
                            required
                            disabled={usuarioEspecialForm.empresa_id === ''}
                          >
                            <option value="">-- Seleccionar departamento --</option>
                            {departamentosPorEmpresaEspecial.map(dep => <option key={dep.id} value={dep.id}>{dep.nombre}</option>)}
                          </select>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={labelStyle}>Puesto *</label>
                          <select
                            style={inputStyle}
                            value={usuarioEspecialForm.puesto_id}
                            onChange={e => {
                              const pid = e.target.value ? Number(e.target.value) : '';
                              const pr = puestos.find((x) => x.id === pid);
                              const pn = (pr?.nombre || '').trim().toLowerCase();
                              const usaSup =
                                pn === 'subdirector' ||
                                pn === 'gerente general' ||
                                pn === 'gerente administrativo y operaciones' ||
                                pn === 'director' ||
                                pn === 'director general' ||
                                pn === 'director general adjunto';
                              setUsuarioEspecialForm(p => ({
                                ...p,
                                puesto_id: pid,
                                empresas_supervision_ids: usaSup && p.empresa_id
                                  ? (p.empresas_supervision_ids.length ? p.empresas_supervision_ids : [Number(p.empresa_id)])
                                  : [],
                              }));
                            }}
                            required
                            disabled={usuarioEspecialForm.empresa_id === '' || usuarioEspecialForm.departamento_id === ''}
                          >
                            <option value="">-- Seleccionar puesto --</option>
                            {puestosPorEmpresaDeptoEspecial.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                          </select>
                        </div>
                        {(() => {
                          const pr = puestos.find((x) => x.id === Number(usuarioEspecialForm.puesto_id));
                          const pn = (pr?.nombre || '').trim().toLowerCase();
                          const showSup =
                            pn === 'subdirector' ||
                            pn === 'gerente general' ||
                            pn === 'gerente administrativo y operaciones' ||
                            pn === 'director' ||
                            pn === 'director general' ||
                            pn === 'director general adjunto';
                          if (!showSup) return null;
                          return (
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label style={labelStyle}>Empresas que gerencia / supervisa *</label>
                              <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#6b7280' }}>
                                Marca las razones sociales bajo su alcance (igual que Directores). La empresa de registro siempre se incluye.
                              </p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: 220, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
                                {empresas.filter((em) => em.activo).map((em) => (
                                  <label key={em.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                                    <input
                                      type="checkbox"
                                      checked={usuarioEspecialForm.empresas_supervision_ids.includes(em.id)}
                                      onChange={() => toggleEmpresaSupervision(em.id)}
                                    />
                                    <span>{em.nombre}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#7c2d12', background: '#ffedd5', border: '1px solid #fdba74', borderRadius: 6, padding: '8px 10px' }}>
                    Usuario especial: no registra checadas (ni remotas ni de dispositivo).
                  </p>
                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" onClick={closeUsuarioEspecialModal} style={btnSecondary}>Cancelar</button>
                    <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                      {saving ? 'Guardando...' : usuarioEspecialModalMode === 'edit' ? 'Guardar cambios' : 'Crear usuario especial'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {passwordTemporalInfo && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setPasswordTemporalInfo(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', color: '#1e3a5f' }}>Contraseña temporal</h3>
            <p style={{ margin: '0 0 6px', fontSize: '0.88rem', color: '#374151' }}>
              Usuario: <strong>{passwordTemporalInfo.nombre}</strong>
            </p>
            <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.4 }}>
              {passwordTemporalInfo.mensaje} Cópiala ahora; no se volverá a mostrar.
            </p>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              Clave temporal
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                id="password-temporal-input-cfg"
                readOnly
                value={passwordTemporalInfo.password}
                onFocus={e => e.currentTarget.select()}
                style={{
                  flex: 1,
                  height: 40,
                  padding: '0 12px',
                  fontSize: '1.05rem',
                  fontFamily: 'ui-monospace, Consolas, monospace',
                  letterSpacing: '0.04em',
                  border: '1px solid #93c5fd',
                  borderRadius: 8,
                  background: '#f0f9ff',
                  color: '#0f172a',
                }}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(passwordTemporalInfo.password);
                    setPasswordCopiada(true);
                  } catch {
                    const el = document.getElementById('password-temporal-input-cfg') as HTMLInputElement | null;
                    el?.focus();
                    el?.select();
                  }
                }}
                style={{ ...btnSuccess, whiteSpace: 'nowrap', height: 40, padding: '0 14px' }}
              >
                {passwordCopiada ? 'Copiada' : 'Copiar'}
              </button>
            </div>
            <button type="button" onClick={() => setPasswordTemporalInfo(null)} style={{ ...btnSecondary, width: '100%' }}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* ====== TAB: SOPORTE (solo administrador) ====== */}
      {isSuperuser && configTab === 'soporte' && (
        <div>
          <div style={{ padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '8px', marginBottom: '20px', border: '1px solid #bae6fd' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#0369a1' }}>
              Define primero las <strong>categorías</strong> (ej. Hardware, Software, Redes) y luego los <strong>tipos de ticket</strong> dentro de cada categoría. El portal mostrará un selector en cascada: categoría → tipo.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: '0.85rem', color: '#0c4a6e' }}>
              Las categorías <strong>Mantenimiento</strong> y <strong>Ventanas</strong> (nombre con «mantenimiento» o «ventana») son solo para <strong>Soporte TI</strong> en la app interna; deben estar <strong>activas</strong> y con tipos activos.
            </p>
          </div>

          {isMobile ? (
            <>
              <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem', color: '#6d28d9' }}>Categorías</h4>
              {clasesSoporte.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: 20 }}>No hay categorías. Usa + Categoría arriba.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {clasesSoporte.map((clase) => {
                    const n = clase.nombre.trim().toLowerCase();
                    const esInternaTi = n.includes('mantenimiento') || n.includes('ventana');
                    return (
                      <div key={clase.id} style={rhMobileCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div style={rhMobileCardTitle}>{clase.nombre}</div>
                          <span style={rhMobileBadge(clase.activo ? '#d4edda' : '#f8d7da', clase.activo ? '#155724' : '#721c24')}>
                            {clase.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                        {esInternaTi && <div style={{ ...rhMobileCardSub, marginTop: 6 }}>Solo app TI</div>}
                        <button type="button" onClick={() => startEditClaseSoporte(clase)} style={{ ...rhMobileBtnSecondary, width: '100%', marginTop: 10 }}>Editar</button>
                      </div>
                    );
                  })}
                </div>
              )}
              <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem', color: '#374151' }}>Tipos de ticket</h4>
              {tiposSoporte.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>No hay tipos de ticket configurados.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tiposSoporte.map((tipo) => (
                    <div key={tipo.id} style={rhMobileCard}>
                      <div style={rhMobileCardTitle}>{tipo.nombre}</div>
                      <div style={rhMobileCardSub}>{tipo.clase_nombre || 'Sin categoría'}</div>
                      <div style={rhMobileCardRow}>
                        <span>Estado</span>
                        <span style={{ fontWeight: 600, color: tipo.activo ? '#15803d' : '#b91c1c' }}>{tipo.activo ? 'Activo' : 'Inactivo'}</span>
                      </div>
                      <button type="button" onClick={() => startEditTipoSoporte(tipo)} style={{ ...rhMobileBtnSecondary, width: '100%', marginTop: 10 }}>Editar</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
          {/* ── Categorías ── */}
          <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem', color: '#6d28d9' }}>Categorías</h4>
          {clasesSoporte.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: '10px', backgroundColor: '#fff', marginBottom: 20 }}>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>No hay categorías configuradas. Agrega la primera con el botón <strong>+ Nueva categoría</strong>.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f3ff' }}>
                    <th style={{ padding: '11px 14px', textAlign: 'left', borderBottom: '2px solid #ddd6fe', fontSize: '0.85rem', color: '#6d28d9', fontWeight: 600 }}>Categoría</th>
                    <th style={{ padding: '11px 14px', textAlign: 'left', borderBottom: '2px solid #ddd6fe', fontSize: '0.85rem', color: '#6d28d9', fontWeight: 600 }}>Estado</th>
                    <th style={{ padding: '11px 14px', textAlign: 'center', borderBottom: '2px solid #ddd6fe', fontSize: '0.85rem', color: '#6d28d9', fontWeight: 600 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clasesSoporte.map((clase) => {
                    const n = clase.nombre.trim().toLowerCase();
                    const esInternaTi = n.includes('mantenimiento') || n.includes('ventana');
                    return (
                    <tr key={clase.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '11px 14px', fontWeight: 500 }}>
                        {clase.nombre}
                        {esInternaTi ? (
                          <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>
                            Solo app TI
                          </span>
                        ) : null}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: clase.activo ? '#d4edda' : '#f8d7da', color: clase.activo ? '#155724' : '#721c24', fontWeight: 500 }}>
                          {clase.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                        <button onClick={() => startEditClaseSoporte(clase)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px' }}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Tipos de ticket ── */}
          <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem', color: '#374151' }}>Tipos de ticket</h4>
          {tiposSoporte.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: '10px', backgroundColor: '#fff' }}>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>No hay tipos de ticket configurados.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>Nombre</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>Categoría</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>Estado</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tiposSoporte.map((tipo) => (
                    <tr key={tipo.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '11px 14px', fontWeight: 500 }}>{tipo.nombre}</td>
                      <td style={{ padding: '11px 14px' }}>
                        {tipo.clase_nombre
                          ? <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: '#ede9fe', color: '#6d28d9', fontWeight: 500 }}>{tipo.clase_nombre}</span>
                          : <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Sin categoría</span>
                        }
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: tipo.activo ? '#d4edda' : '#f8d7da', color: tipo.activo ? '#155724' : '#721c24', fontWeight: 500 }}>
                          {tipo.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                        <button onClick={() => startEditTipoSoporte(tipo)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px' }}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

            </>
          )}

          {/* Modal: Categoría */}
          {showClaseSoporteModal && (
            <div style={modalOverlay} onClick={() => setShowClaseSoporteModal(false)}>
              <div style={{ ...modalSmall, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid #e5e7eb' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{editingClaseSoporte ? 'Editar categoría' : 'Nueva categoría'}</h3>
                  <button type="button" onClick={() => setShowClaseSoporteModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9ca3af' }}>&times;</button>
                </div>
                <form onSubmit={handleClaseSoporteSubmit}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <label style={labelStyle}>Nombre *</label>
                      <input style={inputStyle} value={claseSoporteForm.nombre} onChange={(e) => setClaseSoporteForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Hardware, Software, Redes" required />
                    </div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={claseSoporteForm.activo} onChange={(e) => setClaseSoporteForm(p => ({ ...p, activo: e.target.checked }))} />
                      Activo
                    </label>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" onClick={() => setShowClaseSoporteModal(false)} style={btnSecondary}>Cancelar</button>
                    <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal: Tipo de ticket */}
          {showTipoSoporteModal && (
            <div style={modalOverlay} onClick={() => setShowTipoSoporteModal(false)}>
              <div style={{ ...modalSmall, maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid #e5e7eb' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{editingTipoSoporte ? 'Editar tipo de ticket' : 'Nuevo tipo de ticket'}</h3>
                  <button type="button" onClick={() => setShowTipoSoporteModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9ca3af' }}>&times;</button>
                </div>
                <form onSubmit={handleTipoSoporteSubmit}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <label style={labelStyle}>Nombre *</label>
                      <input style={inputStyle} value={tipoSoporteForm.nombre} onChange={(e) => setTipoSoporteForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Instalación, Reparación" required />
                    </div>
                    <div>
                      <label style={labelStyle}>Categoría</label>
                      <select style={inputStyle} value={tipoSoporteForm.clase_id} onChange={(e) => setTipoSoporteForm(p => ({ ...p, clase_id: e.target.value === '' ? '' : Number(e.target.value) }))}>
                        <option value="">Sin categoría</option>
                        {clasesSoporte.filter(c => c.activo).map(c => (
                          <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={tipoSoporteForm.activo} onChange={(e) => setTipoSoporteForm((p) => ({ ...p, activo: e.target.checked }))} />
                      Activo
                    </label>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" onClick={() => setShowTipoSoporteModal(false)} style={btnSecondary}>Cancelar</button>
                    <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {isSuperuser && configTab === 'actividad' && (
        <div>
          {/* ── Sub-toggle Logs / Métricas ── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {(['logs', 'metricas'] as const).map(v => (
              <button key={v} onClick={() => setActividadVista(v)}
                style={{ padding: '7px 20px', borderRadius: 8, border: '1px solid', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  borderColor: actividadVista === v ? '#6366f1' : '#e2e8f0',
                  background: actividadVista === v ? '#6366f1' : '#f8fafc',
                  color: actividadVista === v ? '#fff' : '#475569' }}>
                {v === 'logs' ? '📋 Registros' : '📊 Métricas'}
              </button>
            ))}
          </div>

          {actividadVista === 'logs' && <>
          <div style={{ padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '8px', marginBottom: '20px', border: '1px solid #bbf7d0' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#166534' }}>
              <strong>negocio</strong>: solicitudes (vacaciones, préstamos, incapacidades). <strong>auth</strong>: inicios de sesión. <strong>sistema</strong>: errores graves.
            </p>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <div style={actividadToolbarScroll}>
              <div style={actividadToolbarRow}>
                <span style={actividadToolbarLabel}>Nivel</span>
                <select
                  style={{ ...actividadSelectInline, minWidth: '128px' }}
                  value={actividadFiltroNivel}
                  onChange={(e) => {
                    setActividadFiltroNivel(e.target.value);
                    setActividadSkip(0);
                  }}
                >
                  <option value="">Todos</option>
                  <option value="info">info</option>
                  <option value="warning">warning</option>
                  <option value="error">error</option>
                </select>
                <span style={actividadToolbarLabel}>Categoría</span>
                <select
                  style={{ ...actividadSelectInline, minWidth: '152px' }}
                  value={actividadFiltroCategoria}
                  onChange={(e) => {
                    setActividadFiltroCategoria(e.target.value);
                    setActividadSkip(0);
                  }}
                >
                  <option value="">Todas</option>
                  {ACTIVIDAD_CATEGORIAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div style={{ padding: '14px 16px', backgroundColor: '#fffbeb', borderRadius: '8px', marginBottom: '18px', border: '1px solid #fcd34d' }}>
            <p style={{ margin: '0 0 10px', fontSize: '0.88rem', fontWeight: 600, color: '#92400e' }}>Limpieza de registros</p>
            <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#78350f' }}>
              Se conserva evidencia mínima de <strong>2 años</strong>. Solo se pueden eliminar registros con más de 730 días. No es posible vaciar todo el historial.
            </p>
            <div style={actividadToolbarScroll}>
              <div style={actividadToolbarRow}>
                <span style={actividadToolbarLabel}>Borrar categoría (&gt;2 años)</span>
                <select
                  style={{ ...actividadSelectInline, minWidth: '140px' }}
                  value={limpiezaCategoria}
                  onChange={(e) => setLimpiezaCategoria(e.target.value)}
                >
                  <option value="">— Elegir —</option>
                  {ACTIVIDAD_CATEGORIAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={purgingActividad || !limpiezaCategoria}
                  onClick={() => {
                    if (!limpiezaCategoria) return;
                    if (!confirm(`¿Eliminar de la categoría «${limpiezaCategoria}» solo los registros con más de 2 años? Los más recientes se conservan.`)) return;
                    void ejecutarPurgarActividad({ modo: 'categoria', categoria: limpiezaCategoria });
                  }}
                  style={{ padding: '9px 14px', backgroundColor: '#ea580c', color: 'white', border: 'none', borderRadius: '7px', cursor: purgingActividad || !limpiezaCategoria ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.88rem', opacity: purgingActividad || !limpiezaCategoria ? 0.55 : 1, whiteSpace: 'nowrap' }}
                >
                  {purgingActividad ? '…' : 'Eliminar antiguos de categoría'}
                </button>
                <span aria-hidden style={{ width: 1, height: 26, background: '#fcd34d', flexShrink: 0, margin: '0 4px' }} />
                <span style={actividadToolbarLabel}>Antigüedad</span>
                <select
                  style={{ ...actividadSelectInline, minWidth: '140px' }}
                  value={String(limpiezaDias)}
                  onChange={(e) => setLimpiezaDias(Number(e.target.value))}
                >
                  <option value="730">2 años (730 días)</option>
                  <option value="1095">3 años</option>
                  <option value="1825">5 años</option>
                </select>
                <span style={actividadToolbarLabel}>Solo cat.</span>
                <select
                  style={{ ...actividadSelectInline, minWidth: '140px' }}
                  value={limpiezaAntiguosSoloCat}
                  onChange={(e) => setLimpiezaAntiguosSoloCat(e.target.value)}
                >
                  <option value="">Todas</option>
                  {ACTIVIDAD_CATEGORIAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={purgingActividad}
                  onClick={() => {
                    const solo = limpiezaAntiguosSoloCat
                      ? ` y categoría «${limpiezaAntiguosSoloCat}»`
                      : '';
                    if (!confirm(`¿Eliminar registros con más de ${limpiezaDias} días${solo}? Los de menos de 2 años nunca se borran.`)) return;
                    void ejecutarPurgarActividad({
                      modo: 'antiguos',
                      dias: limpiezaDias,
                      ...(limpiezaAntiguosSoloCat ? { categoria: limpiezaAntiguosSoloCat } : {}),
                    });
                  }}
                  style={{ padding: '9px 14px', backgroundColor: '#ea580c', color: 'white', border: 'none', borderRadius: '7px', cursor: purgingActividad ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.88rem', opacity: purgingActividad ? 0.55 : 1, whiteSpace: 'nowrap' }}
                >
                  {purgingActividad ? '…' : 'Eliminar antiguos'}
                </button>
              </div>
            </div>
          </div>
          {loadingActividad && actividadItems.length === 0 ? (
            <p style={{ color: '#666' }}>Cargando actividad...</p>
          ) : actividadItems.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
              <p style={{ color: '#6b7280', margin: 0 }}>No hay registros con los filtros actuales.</p>
            </div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {actividadItems.map((row) => {
                const nivelBg = row.nivel === 'error' ? '#fee2e2' : row.nivel === 'warning' ? '#fef3c7' : '#e0f2fe';
                const nivelFg = row.nivel === 'error' ? '#991b1b' : row.nivel === 'warning' ? '#92400e' : '#0369a1';
                const displayEmpleado = row.empleado_nombre
                  ? `${row.empleado_nombre}${row.empleado_numero ? ` (${row.empleado_numero})` : ''}`
                  : row.empleado_username || (row.empleado_id != null ? `ID ${row.empleado_id}` : '—');
                const empresaContexto = extraerEmpresaContexto(row.contexto);
                return (
                  <div key={row.id} style={rhMobileCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <span style={rhMobileBadge(nivelBg, nivelFg)}>{row.nivel}</span>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{row.categoria}</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#1f2937', lineHeight: 1.35, marginBottom: 6 }}>{row.mensaje}</div>
                    {empresaContexto ? (
                      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 6 }}>{empresaContexto}</div>
                    ) : null}
                    <div style={rhMobileCardSub}>{fmtDate(row.created_at)}</div>
                    <div style={rhMobileCardRow}><span>Empleado</span><span style={{ textAlign: 'right', maxWidth: '55%' }}>{displayEmpleado}</span></div>
                    {(row.ruta || row.metodo_http) && (
                      <div style={{ ...rhMobileCardSub, marginTop: 4, wordBreak: 'break-all' }}>
                        {row.metodo_http && row.codigo_http != null ? `${row.metodo_http} ${row.codigo_http}` : ''}{row.ruta ? ` · ${row.ruta}` : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#555', fontWeight: 600 }}>Fecha</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#555', fontWeight: 600 }}>Nivel</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#555', fontWeight: 600 }}>Cat.</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#555', fontWeight: 600 }}>Mensaje</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#555', fontWeight: 600 }}>Empleado</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#555', fontWeight: 600 }}>HTTP</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#555', fontWeight: 600 }}>Ruta</th>
                  </tr>
                </thead>
                <tbody>
                  {actividadItems.map((row) => {
                    const nivelBg =
                      row.nivel === 'error' ? '#fee2e2' : row.nivel === 'warning' ? '#fef3c7' : '#e0f2fe';
                    const nivelFg =
                      row.nivel === 'error' ? '#991b1b' : row.nivel === 'warning' ? '#92400e' : '#0369a1';
                    const displayEmpleado = row.empleado_nombre
                      ? `${row.empleado_nombre}${row.empleado_numero ? ` (${row.empleado_numero})` : ''}`
                      : row.empleado_username
                        ? row.empleado_username
                        : row.empleado_id != null
                          ? `ID ${row.empleado_id}`
                          : '—';
                    const empresaContexto = extraerEmpresaContexto(row.contexto);
                    return (
                      <tr key={row.id} style={{ borderBottom: '1px solid #eee', verticalAlign: 'top' }}>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{fmtDate(row.created_at)}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: nivelBg, color: nivelFg, fontWeight: 600, fontSize: '0.75rem' }}>
                            {row.nivel}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', color: '#444' }}>{row.categoria}</td>
                        <td style={{ padding: '9px 12px', maxWidth: '420px', wordBreak: 'break-word' }}>
                          <div>{row.mensaje}</div>
                          {empresaContexto ? (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>{empresaContexto}</div>
                          ) : null}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ fontWeight: 600, color: '#1f2937' }}>{displayEmpleado}</div>
                          {(row.empleado_username || row.empleado_id != null) && (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              {row.empleado_username ? `@${row.empleado_username}` : `ID ${row.empleado_id}`}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                          {row.metodo_http && row.codigo_http != null
                            ? `${row.metodo_http} ${row.codigo_http}${row.duracion_ms != null ? ` · ${row.duracion_ms} ms` : ''}`
                            : row.codigo_http != null
                              ? String(row.codigo_http)
                              : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', maxWidth: '280px', wordBreak: 'break-all', color: '#555' }}>{row.ruta ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontSize: '0.88rem', color: '#6b7280' }}>
              Total: {actividadTotal} · Página {Math.floor(actividadSkip / ACTIVIDAD_PAGE_SIZE) + 1} de {Math.max(1, Math.ceil(actividadTotal / ACTIVIDAD_PAGE_SIZE) || 1)}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled={actividadSkip <= 0 || loadingActividad || purgingActividad}
                onClick={() => setActividadSkip((s) => Math.max(0, s - ACTIVIDAD_PAGE_SIZE))}
                style={{ ...btnSecondary, opacity: actividadSkip <= 0 ? 0.5 : 1 }}
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={actividadSkip + ACTIVIDAD_PAGE_SIZE >= actividadTotal || loadingActividad || purgingActividad}
                onClick={() => setActividadSkip((s) => s + ACTIVIDAD_PAGE_SIZE)}
                style={{ ...btnSecondary, opacity: actividadSkip + ACTIVIDAD_PAGE_SIZE >= actividadTotal ? 0.5 : 1 }}
              >
                Siguiente
              </button>
            </div>
          </div>

          {/* cierre del bloque logs */}
          </>}

          {/* ── MÉTRICAS (dentro de Actividad) ─────────────────────────────── */}
          {actividadVista === 'metricas' && (() => {
            const NIVEL_COLOR: Record<string, string> = { info: '#818cf8', warning: '#fbbf24', error: '#fb7185' };
            const CAT_ICON = ACTIVIDAD_CATEGORIA_ICON;
            const CATEGORIAS = [...ACTIVIDAD_CATEGORIAS, 'request'];

            if (loadingMetricas) return (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ display: 'inline-block', width: 22, height: 22, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin .7s linear infinite', marginRight: 10, verticalAlign: 'middle' }} />
                Cargando métricas…
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            );
            if (!metricasData) return (
              <div style={{ padding: 24, color: '#ef4444', background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
                No se pudieron cargar las métricas.
              </div>
            );

            const { total, por_nivel, por_categoria, eventos_por_dia, logins_por_dia, top_errores, top_empleados } = metricasData;
            const maxDia = Math.max(...eventos_por_dia.map(d => d.info + d.warning + d.error), 1);
            const maxLogin = Math.max(...logins_por_dia.map(d => d.n), 1);
            const maxErr = Math.max(...top_errores.map(e => e.n), 1);
            const maxEmp = Math.max(...top_empleados.map(e => e.n), 1);

            const card2 = (label: string, value: number | string, icon: string, bg: string, isDark: boolean, sub?: string) => (
              <div key={label} style={{ background: bg, borderRadius: 14, padding: '18px 20px', boxShadow: isDark ? '0 6px 20px rgba(99,102,241,0.25)' : '0 2px 8px rgba(0,0,0,0.06)', border: isDark ? 'none' : '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: isDark ? 'rgba(255,255,255,0.8)' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                  <span style={{ fontSize: '1.2rem' }}>{icon}</span>
                </div>
                <div style={{ fontSize: '1.9rem', fontWeight: 800, color: isDark ? '#fff' : '#0f172a', lineHeight: 1.1 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
                {sub && <div style={{ fontSize: '0.72rem', color: isDark ? 'rgba(255,255,255,0.65)' : '#94a3b8', fontWeight: 500 }}>{sub}</div>}
              </div>
            );

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* ── Filtros ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 700 }}>Periodo:</span>
                  {[7, 15, 30, 60, 90].map(d => (
                    <button key={d} onClick={() => setMetricasDias(d)}
                      style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                        borderColor: metricasDias === d ? '#6366f1' : '#e2e8f0',
                        background: metricasDias === d ? '#6366f1' : '#fff',
                        color: metricasDias === d ? '#fff' : '#475569' }}>
                      {d}d
                    </button>
                  ))}
                  <span style={{ color: '#e2e8f0', fontSize: '1.2rem' }}>|</span>
                  <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 700 }}>Nivel:</span>
                  <select value={metricasFiltroNivel} onChange={e => setMetricasFiltroNivel(e.target.value)}
                    style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.82rem', background: '#fff', color: '#334155', cursor: 'pointer' }}>
                    <option value="">Todos</option>
                    <option value="info">info</option>
                    <option value="warning">warning</option>
                    <option value="error">error</option>
                  </select>
                  <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 700 }}>Categoría:</span>
                  <select value={metricasFiltroCategoria} onChange={e => setMetricasFiltroCategoria(e.target.value)}
                    style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.82rem', background: '#fff', color: '#334155', cursor: 'pointer' }}>
                    <option value="">Todas</option>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
                  </select>
                  {(metricasFiltroNivel || metricasFiltroCategoria) && (
                    <button onClick={() => { setMetricasFiltroNivel(''); setMetricasFiltroCategoria(''); }}
                      style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                      ✕ Limpiar
                    </button>
                  )}
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 4 }}>· {total.toLocaleString()} eventos</span>
                </div>

            {/* ── KPI Cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
                {card2('Total eventos', total, '📊', 'linear-gradient(135deg,#6366f1,#818cf8)', true, `últimos ${metricasDias} días`)}
                {card2('Errores', por_nivel['error'] ?? 0, '⚠️', 'linear-gradient(135deg,#f43f5e,#fb7185)', true, (por_nivel['error'] ?? 0) === 0 ? 'Sin errores' : 'Requieren atención')}
                {card2('Warnings', por_nivel['warning'] ?? 0, '🔔', '#fff', false, 'Alertas registradas')}
                {card2('Info', por_nivel['info'] ?? 0, '📋', '#fff', false, 'Registros informativos')}
            </div>

            {/* ── Eventos por día ── */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 22px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '0.92rem', fontWeight: 700, color: '#1e293b' }}>Eventos por día</h3>
              {eventos_por_dia.length === 0 ? <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.88rem' }}>Sin datos.</p> : (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, minWidth: eventos_por_dia.length * 28, height: 160 }}>
                    {eventos_por_dia.map(d => {
                      const tot = d.info + d.warning + d.error;
                      const h = Math.max(4, (tot / maxDia) * 140);
                      const errH = tot > 0 ? (d.error / tot) * h : 0;
                      const warnH = tot > 0 ? (d.warning / tot) * h : 0;
                      const infoH = h - errH - warnH;
                      const label = d.dia.slice(5);
                      return (
                        <div key={d.dia} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 22 }} title={`${d.dia}\nInfo: ${d.info}\nWarn: ${d.warning}\nErr: ${d.error}`}>
                          <div style={{ width: '80%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 140 }}>
                            {infoH > 0 && <div style={{ background: NIVEL_COLOR.info, height: infoH, borderRadius: errH === 0 && warnH === 0 ? '4px 4px 0 0' : '0' }} />}
                            {warnH > 0 && <div style={{ background: NIVEL_COLOR.warning, height: warnH }} />}
                            {errH > 0 && <div style={{ background: NIVEL_COLOR.error, height: errH }} />}
                          </div>
                          <span style={{ fontSize: '0.56rem', color: '#94a3b8', transform: 'rotate(-45deg)', transformOrigin: 'center', whiteSpace: 'nowrap' }}>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                    {['info', 'warning', 'error'].map(k => (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: NIVEL_COLOR[k] }} />
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>{k}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Row: Por categoría + Logins ── */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              {/* Por categoría */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 22px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.92rem', fontWeight: 700, color: '#1e293b' }}>Por categoría</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(por_categoria).sort((a, b) => b[1] - a[1]).map(([cat, n]) => {
                    const maxCat = Math.max(...Object.values(por_categoria), 1);
                    const pct = Math.round((n / maxCat) * 100);
                    return (
                      <div key={cat}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>{CAT_ICON[cat] ?? '📌'} {cat}</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>{n.toLocaleString()}</span>
                        </div>
                        <div style={{ height: 8, background: '#e0e7ff', borderRadius: 4 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#6366f1,#818cf8)', borderRadius: 4, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(por_categoria).length === 0 && <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.88rem' }}>Sin datos.</p>}
                </div>
              </div>

              {/* Logins por día */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 22px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.92rem', fontWeight: 700, color: '#1e293b' }}>Inicios de sesión por día</h3>
                {logins_por_dia.length === 0 ? <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.88rem' }}>Sin datos.</p> : (
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, minWidth: logins_por_dia.length * 28, height: 120 }}>
                      {logins_por_dia.map(d => {
                        const h = Math.max(4, (d.n / maxLogin) * 100);
                        return (
                          <div key={d.dia} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 22 }} title={`${d.dia}: ${d.n} logins`}>
                            <div style={{ width: '70%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 100 }}>
                              <div style={{ background: 'linear-gradient(180deg,#818cf8,#6366f1)', height: h, borderRadius: '4px 4px 2px 2px' }} />
                            </div>
                            <span style={{ fontSize: '0.56rem', color: '#94a3b8', transform: 'rotate(-45deg)', transformOrigin: 'center', whiteSpace: 'nowrap' }}>{d.dia.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Row: Top errores + Top empleados ── */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              {/* Top rutas con errores */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 22px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.92rem', fontWeight: 700, color: '#1e293b' }}>Top rutas con errores</h3>
                {top_errores.length === 0 ? <p style={{ color: '#22c55e', margin: 0, fontSize: '0.88rem', fontWeight: 600 }}>Sin errores registrados 🎉</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {top_errores.map(({ ruta, n }) => {
                      const pct = Math.round((n / maxErr) * 100);
                      return (
                        <div key={ruta}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#475569', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }} title={ruta}>{ruta}</span>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f43f5e', flexShrink: 0 }}>{n}</span>
                          </div>
                          <div style={{ height: 6, background: '#ffe4e6', borderRadius: 3 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#f43f5e,#fb7185)', borderRadius: 3, transition: 'width 0.4s' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Empleados más activos */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 22px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.92rem', fontWeight: 700, color: '#1e293b' }}>Empleados más activos</h3>
                {top_empleados.length === 0 ? <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.88rem' }}>Sin datos.</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {top_empleados.map(({ nombre, numero, n }) => {
                      const pct = Math.round((n / maxEmp) * 100);
                      return (
                        <div key={nombre}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }} title={nombre}>
                              {nombre}{numero ? <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>#{numero}</span> : null}
                            </span>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#4f46e5', flexShrink: 0 }}>{n}</span>
                          </div>
                          <div style={{ height: 6, background: '#e0e7ff', borderRadius: 3 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#6366f1,#818cf8)', borderRadius: 3, transition: 'width 0.4s' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
            );
          })()}

        </div>
      )}

    </>
  );

  return isMobile ? (
    <div style={{ padding: '0 0 24px', minHeight: '100%' }}>
      <div style={rhMobileHero}>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem', marginBottom: 4 }}>Configuración</div>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.2rem', lineHeight: 1.2 }}>{configTabSubtitle(configTab)}</div>
      </div>
      <div style={rhMobileContentShell}>{pageBody}</div>
    </div>
  ) : (
    <div style={{ padding: '20px' }}>{pageBody}</div>
  );
};
