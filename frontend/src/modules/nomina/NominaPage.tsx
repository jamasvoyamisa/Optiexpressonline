import { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { canAccessNomina } from '../../config/features';
import { formatFechaSlash } from '../../utils/date';
import {
  etiquetaQuincenaPeriodo,
  getQuincenaActualMexico,
  listarQuincenasEjercicio,
  quincenaEsPasada,
  quincenasDisponiblesEjercicio,
  type QuincenaEjercicioItem,
} from '../../utils/quincena';

// ── Tipos ─────────────────────────────────────────────────────────────────

interface CatalogoItem { clave: string; descripcion: string; }
interface EmpresaBasic { id: number; nombre: string; }
interface PeriodoNomina {
  id: number;
  empresa_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  tipo: string;
  periodicidad?: string;
  estado: string;
  ejercicio_fiscal?: number;
  numero_periodo?: number;
  total_periodos_ejercicio?: number;
  periodo_etiqueta?: string;
  mes?: number;
  quincena_mes?: 1 | 2;
  total_percepciones?: string;
  total_deducciones?: string;
  total_neto?: string;
  notas?: string;
  created_at: string;
}

interface EjercicioHistorial {
  ejercicio: number;
  total_periodos: number;
  periodos_pagados: number;
  periodos_timbrados: number;
  total_neto: number;
  total_percepciones: number;
  total_deducciones: number;
}

interface FiscalApiStatus {
  habilitado: boolean;
  sandbox: boolean;
  api_url: string;
  tiene_csd: boolean;
  modo: string;
  mensaje: string;
}

interface ValidarTimbradoEmpleado {
  empleado_id: number;
  nombre: string;
  listo: boolean;
  ya_timbrado: boolean;
  cfdi_uuid?: string;
  cfdi_error?: string;
  errores: string[];
}

interface ValidarTimbradoResult {
  periodo_id: number;
  errores_empresa: string[];
  resumen: { total: number; listos: number; con_errores: number; ya_timbrados: number };
  puede_timbrar: boolean;
  empleados: ValidarTimbradoEmpleado[];
}

interface CfdiResumenNomina {
  tipo?: string;
  fecha_pago?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  dias_pagados?: number;
  percepciones?: { clave?: string; concepto?: string; gravado?: number; exento?: number }[];
  deducciones?: { clave?: string; concepto?: string; importe?: number }[];
  otros_pagos?: { clave?: string; concepto?: string; subsidio_causado?: number }[];
}

interface CfdiResumen {
  emisor?: { rfc?: string; nombre?: string; registro_patronal?: string };
  receptor?: { rfc?: string; nombre?: string; cp?: string; puesto?: string; departamento?: string };
  nomina?: CfdiResumenNomina;
}

interface PreviewEmpleado {
  empleado_id: number;
  nombre: string;
  numero_empleado?: string | null;
  dias_laborados?: number | null;
  dias_pagados?: number | null;
  dias_fuente?: string | null;
  total_percepciones?: number | null;
  total_gravado?: number | null;
  total_deducciones?: number | null;
  total_neto?: number | null;
  subsidio_causado?: number | null;
  percepciones: ConceptoLinea[];
  deducciones: ConceptoLinea[];
  cfdi_uuid?: string | null;
  cfdi_error?: string | null;
  ya_timbrado: boolean;
  listo_timbrado: boolean;
  errores_timbrado: string[];
  cfdi_resumen?: CfdiResumen | null;
}

interface AreaNominaItem {
  departamento_id: number | null;
  departamento_nombre: string;
  empleados: number;
}

interface PreviewPeriodo {
  periodo_id: number;
  empresa_nombre?: string | null;
  departamento_id?: number | null;
  departamento_nombre?: string | null;
  areas_disponibles?: AreaNominaItem[];
  fecha_inicio: string;
  fecha_fin: string;
  tipo: string;
  estado: string;
  totales: { percepciones?: number | null; deducciones?: number | null; neto?: number | null };
  resumen: { empleados: number; listos_timbrado: number; con_advertencias: number; ya_timbrados: number };
  empleados: PreviewEmpleado[];
}

interface ConceptoLinea {
  clave?: string;
  concepto?: string;
  importe?: number;
  importe_gravado?: number;
  importe_exento?: number;
}

function areaQueryValue(departamentoId: number | null | undefined): string {
  return String(departamentoId ?? 0);
}

function parseAreaQueryValue(raw: string): number | null {
  const n = Number(raw);
  return n === 0 ? null : n;
}

const card: React.CSSProperties = {
  background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
  padding: '20px 22px', marginBottom: 20,
};
const label: React.CSSProperties = {
  display: 'block', marginBottom: 4, fontSize: '0.83rem', fontWeight: 500, color: '#374151',
};
const input: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px', border: '1px solid #d1d5db',
  borderRadius: 6, fontSize: '0.88rem', boxSizing: 'border-box',
};
const sel: React.CSSProperties = { ...input };
const btn = (color = '#2563eb'): React.CSSProperties => ({
  padding: '8px 18px', background: color, color: '#fff', border: 'none',
  borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: '0.87rem',
});
const row: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' };
const col = (flex = 1): React.CSSProperties => ({ flex, minWidth: 120 });
const formField: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
};
const formLabel: React.CSSProperties = {
  fontSize: '0.83rem',
  fontWeight: 500,
  color: '#374151',
  lineHeight: 1.25,
  minHeight: 34,
  display: 'flex',
  alignItems: 'flex-end',
};
const nuevoPeriodoGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
  columnGap: 12,
  rowGap: 12,
};
const nuevoPeriodoToolbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: 16,
};

const ESTADO_COLOR: Record<string, string> = {
  borrador: '#f59e0b', calculada: '#3b82f6', timbrada: '#10b981', pagada: '#6b7280',
};

const tabBtn = (activo: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  border: 'none',
  borderBottom: activo ? '2px solid #2563eb' : '2px solid transparent',
  background: 'transparent',
  color: activo ? '#2563eb' : '#6b7280',
  fontWeight: activo ? 600 : 500,
  fontSize: '0.9rem',
  cursor: 'pointer',
  marginBottom: -1,
});

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 12, maxWidth: 920, width: '94%',
  maxHeight: '88vh', overflow: 'auto', padding: '22px 24px',
};

function money(v?: string | number | null) {
  if (v == null || v === '') return '—';
  return `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

const menuPeriodoBtn: React.CSSProperties = {
  width: 34, height: 34, padding: 0, border: '1px solid #d1d5db', borderRadius: 8,
  background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '1.15rem', lineHeight: 1,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const menuPeriodoPanel: React.CSSProperties = {
  position: 'fixed', minWidth: 200, maxWidth: 240, zIndex: 1100,
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
  boxShadow: '0 10px 28px rgba(0,0,0,0.14)', padding: '6px 0',
  overflow: 'hidden',
};
const menuPeriodoItem: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px',
  border: 'none', background: 'transparent', fontSize: '0.85rem', color: '#111827',
  cursor: 'pointer',
};
const menuPeriodoItemDanger: React.CSSProperties = { ...menuPeriodoItem, color: '#dc2626' };
const menuPeriodoItemDisabled: React.CSSProperties = {
  ...menuPeriodoItem, color: '#9ca3af', cursor: 'not-allowed',
};

function MenuPeriodoItem({
  label,
  onAction,
  danger,
  disabled,
}: {
  label: string;
  onAction: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      style={disabled ? menuPeriodoItemDisabled : danger ? menuPeriodoItemDanger : menuPeriodoItem}
      disabled={disabled}
      onClick={e => {
        e.stopPropagation();
        if (!disabled) onAction();
      }}
      onMouseEnter={e => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6';
      }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}

// ── Componente principal ──────────────────────────────────────────────────

export const NominaPage = () => {
  const { authMe } = useAuth();
  const puedeAcceder = canAccessNomina(authMe?.is_superuser);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  const [periodicidadCat, setPeriodicidadCat] = useState<CatalogoItem[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaBasic[]>([]);
  const [empresaSelId, setEmpresaSelId] = useState<number | ''>('');

  const [periodos, setPeriodos] = useState<PeriodoNomina[]>([]);
  const [totalPeriodos, setTotalPeriodos] = useState(0);
  const [nuevoPeriodo, setNuevoPeriodo] = useState({
    empresa_id: '', fecha_inicio: '', fecha_fin: '', tipo: 'O', periodicidad: '04', notas: '',
  });
  const [ejercicioNuevo, setEjercicioNuevo] = useState(() => new Date().getFullYear());
  const [quincenaNueva, setQuincenaNueva] = useState<number>(() => {
    const q = getQuincenaActualMexico();
    const actual = q.month * 2 + q.num;
    const disp = quincenasDisponiblesEjercicio(q.year);
    return disp.find(d => d.numero === actual)?.numero ?? disp[0]?.numero ?? actual;
  });
  const [catalogoQuincenas, setCatalogoQuincenas] = useState<QuincenaEjercicioItem[]>([]);
  const [filtroQuincenaHistorial, setFiltroQuincenaHistorial] = useState<number | ''>('');
  const [creandoPeriodo, setCreandoPeriodo] = useState(false);
  const [calculandoId, setCalculandoId] = useState<number | null>(null);
  const [timbrandoId, setTimbrandoId] = useState<number | null>(null);
  const [timbrandoEmpleadoId, setTimbrandoEmpleadoId] = useState<number | null>(null);
  const [validandoId, setValidandoId] = useState<number | null>(null);
  const [validacion, setValidacion] = useState<ValidarTimbradoResult | null>(null);
  const [fiscalApi, setFiscalApi] = useState<FiscalApiStatus | null>(null);

  const [previewPeriodoId, setPreviewPeriodoId] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewPeriodo | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [previewEmpleadoIdx, setPreviewEmpleadoIdx] = useState<number | null>(null);
  const [mostrarCfdiPreview, setMostrarCfdiPreview] = useState(false);
  const [menuPeriodoId, setMenuPeriodoId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [menuHistorial, setMenuHistorial] = useState(false);

  const [tabActiva, setTabActiva] = useState<'activos' | 'historial'>('activos');
  const [ejerciciosHistorial, setEjerciciosHistorial] = useState<EjercicioHistorial[]>([]);
  const [ejercicioSel, setEjercicioSel] = useState<number | null>(null);
  const [periodosHistorial, setPeriodosHistorial] = useState<PeriodoNomina[]>([]);
  const [, setTotalHistorial] = useState(0);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [soloCerradosHistorial, setSoloCerradosHistorial] = useState(false);
  const [cerrandoId, setCerrandoId] = useState<number | null>(null);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [catRes, empRes, faRes] = await Promise.all([
          api.get('/nomina/catalogos'),
          api.get('/personal/empresas?limit=100'),
          api.get<FiscalApiStatus>('/nomina/fiscalapi/status').catch(() => ({ data: null })),
        ]);
        setPeriodicidadCat(catRes.data?.periodicidad_pago ?? []);
        setEmpresas(empRes.data?.items ?? empRes.data ?? []);
        setFiscalApi(faRes.data ?? null);
      } catch {
        setMsg({ tipo: 'err', texto: 'Error al cargar catálogos.' });
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  const cargarPeriodos = useCallback(() => {
    const q = new URLSearchParams({ activos: 'true' });
    if (empresaSelId) q.set('empresa_id', String(empresaSelId));
    api.get(`/nomina/periodos?${q}`)
      .then(r => {
        setPeriodos(r.data.items ?? []);
        setTotalPeriodos(r.data.total ?? 0);
      })
      .catch(err => {
        const detalle = err?.response?.data?.detail;
        setMsg({ tipo: 'err', texto: typeof detalle === 'string' ? detalle : 'Error al cargar periodos.' });
      });
  }, [empresaSelId]);

  const cargarEjercicios = useCallback(async () => {
    const q = new URLSearchParams();
    if (empresaSelId) q.set('empresa_id', String(empresaSelId));
    if (soloCerradosHistorial) q.set('solo_cerrados', 'true');
    const suffix = q.toString() ? `?${q}` : '';
    const r = await api.get(`/nomina/historial/ejercicios${suffix}`);
    const items: EjercicioHistorial[] = r.data.items ?? [];
    setEjerciciosHistorial(items);
    return items;
  }, [empresaSelId, soloCerradosHistorial]);

  const cargarPeriodosHistorial = useCallback(() => {
    if (ejercicioSel == null) {
      setPeriodosHistorial([]);
      setTotalHistorial(0);
      return;
    }
    const q = new URLSearchParams({ ejercicio: String(ejercicioSel) });
    if (empresaSelId) q.set('empresa_id', String(empresaSelId));
    if (soloCerradosHistorial) q.set('solo_cerrados', 'true');
    setLoadingHistorial(true);
    api.get(`/nomina/historial/periodos?${q}`)
      .then(r => {
        setPeriodosHistorial(r.data.items ?? []);
        setTotalHistorial(r.data.total ?? 0);
      })
      .catch(() => setMsg({ tipo: 'err', texto: 'Error al cargar historial del ejercicio.' }))
      .finally(() => setLoadingHistorial(false));
  }, [ejercicioSel, empresaSelId, soloCerradosHistorial]);

  useEffect(() => { cargarPeriodos(); }, [cargarPeriodos]);

  useEffect(() => {
    if (nuevoPeriodo.periodicidad !== '04') {
      setCatalogoQuincenas([]);
      return;
    }
    const items = listarQuincenasEjercicio(ejercicioNuevo);
    setCatalogoQuincenas(items);
    const disponibles = items.filter(q => !quincenaEsPasada(q.fecha_fin));
    const selActual = items.find(i => i.numero === quincenaNueva);
    const sel = selActual && !quincenaEsPasada(selActual.fecha_fin)
      ? selActual
      : disponibles[0];
    if (!sel) {
      setNuevoPeriodo(p => ({ ...p, fecha_inicio: '', fecha_fin: '' }));
      return;
    }
    if (sel.numero !== quincenaNueva) {
      setQuincenaNueva(sel.numero);
      return;
    }
    setNuevoPeriodo(p => ({
      ...p,
      fecha_inicio: sel.fecha_inicio,
      fecha_fin: sel.fecha_fin,
    }));
  }, [nuevoPeriodo.periodicidad, ejercicioNuevo, quincenaNueva]);

  useEffect(() => {
    if (tabActiva !== 'historial') return;
    void cargarEjercicios().then(items => {
      if (items.length) {
        setEjercicioSel(prev => (prev != null && items.some(e => e.ejercicio === prev) ? prev : items[0].ejercicio));
      } else {
        setEjercicioSel(null);
        setPeriodosHistorial([]);
        setTotalHistorial(0);
      }
    });
  }, [tabActiva, cargarEjercicios]);

  useEffect(() => {
    if (tabActiva === 'historial') cargarPeriodosHistorial();
  }, [tabActiva, cargarPeriodosHistorial]);

  useEffect(() => {
    setFiltroQuincenaHistorial('');
  }, [ejercicioSel]);

  useEffect(() => {
    if (menuPeriodoId == null) return;
    const cerrar = () => {
      setMenuPeriodoId(null);
      setMenuPos(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('click', cerrar);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    return () => {
      window.removeEventListener('click', cerrar);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [menuPeriodoId]);

  const toggleMenuPeriodo = (e: React.MouseEvent<HTMLButtonElement>, periodoId: number, historial = false) => {
    e.stopPropagation();
    if (menuPeriodoId === periodoId && menuHistorial === historial) {
      setMenuPeriodoId(null);
      setMenuPos(null);
      setMenuHistorial(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const ancho = 200;
    const margen = 8;
    let left = rect.right - ancho;
    left = Math.max(margen, Math.min(left, window.innerWidth - ancho - margen));
    const top = Math.min(rect.bottom + 4, window.innerHeight - margen - 220);
    setMenuPeriodoId(periodoId);
    setMenuPos({ top, left });
    setMenuHistorial(historial);
  };

  const cerrarMenuPeriodo = () => {
    setMenuPeriodoId(null);
    setMenuPos(null);
    setMenuHistorial(false);
  };

  const cerrarPreview = () => {
    setPreviewPeriodoId(null);
    setPreview(null);
    setPreviewEmpleadoIdx(null);
    setMostrarCfdiPreview(false);
  };

  const abrirPreview = async (
    periodoId: number,
    departamentoId?: number | null,
    empleadoIdx: number | null = null,
  ) => {
    setPreviewPeriodoId(periodoId);
    setPreviewEmpleadoIdx(empleadoIdx);
    setMostrarCfdiPreview(false);
    setCargandoPreview(true);
    setMsg(null);
    try {
      const q = new URLSearchParams();
      if (departamentoId !== undefined) {
        q.set('departamento_id', areaQueryValue(departamentoId));
      }
      const suffix = q.toString() ? `?${q}` : '';
      const r = await api.get<PreviewPeriodo>(`/nomina/periodos/${periodoId}/preview${suffix}`);
      setPreview(r.data);
    } catch (err: unknown) {
      let texto = 'No se pudo cargar la previsualización.';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: string };
        if (typeof d?.detail === 'string') texto = d.detail;
      }
      setMsg({ tipo: 'err', texto });
      cerrarPreview();
    } finally {
      setCargandoPreview(false);
    }
  };

  const recargarPreview = async (periodoId: number, departamentoId?: number | null) => {
    const dep = departamentoId ?? preview?.departamento_id ?? null;
    const q = new URLSearchParams({ departamento_id: areaQueryValue(dep) });
    const r = await api.get<PreviewPeriodo>(`/nomina/periodos/${periodoId}/preview?${q}`);
    setPreview(r.data);
    return r.data;
  };

  const cambiarAreaPreview = async (departamentoId: number | null) => {
    if (previewPeriodoId == null) return;
    setPreviewEmpleadoIdx(null);
    setMostrarCfdiPreview(false);
    await abrirPreview(previewPeriodoId, departamentoId, null);
  };

  const crearPeriodo = async () => {
    setCreandoPeriodo(true);
    setMsg(null);
    try {
      await api.post('/nomina/periodos', {
        ...nuevoPeriodo,
        empresa_id: Number(nuevoPeriodo.empresa_id),
      });
      setMsg({ tipo: 'ok', texto: 'Periodo creado.' });
      setNuevoPeriodo({ empresa_id: '', fecha_inicio: '', fecha_fin: '', tipo: 'O', periodicidad: '04', notas: '' });
      cargarPeriodos();
    } catch (err: unknown) {
      let texto = 'Error al crear periodo.';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: string | { msg?: string }[] };
        if (typeof d?.detail === 'string') texto = d.detail;
        else if (Array.isArray(d?.detail)) {
          const parts = d.detail.map((x) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: string }).msg) : '')).filter(Boolean);
          if (parts.length) texto = parts.join('; ');
        }
      }
      setMsg({ tipo: 'err', texto });
    } finally {
      setCreandoPeriodo(false);
    }
  };

  const eliminarPeriodo = async (id: number) => {
    if (!confirm('¿Eliminar este periodo (borrador)?')) return;
    try {
      await api.delete(`/nomina/periodos/${id}`);
      cargarPeriodos();
    } catch {
      setMsg({ tipo: 'err', texto: 'No se pudo eliminar (solo se pueden eliminar borradores).' });
    }
  };

  const fiscalApiActivo = fiscalApi?.habilitado === true;

  const avisoFiscalApiNoConfigurado = () => {
    setMsg({
      tipo: 'err',
      texto:
        'Timbrado no disponible: configura FiscalAPI en backend/.env ' +
        '(NOMINA_FISCALAPI_ENABLED=true, FISCALAPI_API_KEY, FISCALAPI_TENANT) ' +
        'con cuenta en test.fiscalapi.com y reinicia el backend.',
    });
  };

  const solicitarTimbradoPeriodo = (id: number) => {
    if (!fiscalApiActivo) {
      avisoFiscalApiNoConfigurado();
      return;
    }
    void timbrarPeriodoPrueba(id);
  };

  const solicitarValidacionTimbrado = (id: number) => {
    if (!fiscalApiActivo) {
      avisoFiscalApiNoConfigurado();
      return;
    }
    void validarTimbrado(id);
  };

  const solicitarTimbradoEmpleado = (periodoId: number, empleadoId: number) => {
    if (!fiscalApiActivo) {
      avisoFiscalApiNoConfigurado();
      return;
    }
    void timbrarEmpleadoPrueba(periodoId, empleadoId);
  };

  const calcularPeriodo = async (id: number) => {
    if (!confirm('Calcular nómina del periodo (ISR, subsidio, IMSS, días por asistencia). ¿Continuar?')) return;
    setCalculandoId(id);
    setMsg(null);
    try {
      const r = await api.post<{
        empleados_procesados: number;
        omitidos: { empleado_id: number; motivo: string }[];
        advertencias?: string[];
        totales: { percepciones: number; deducciones: number; neto: number };
      }>(`/nomina/periodos/${id}/calcular`);
      const om = r.data.omitidos?.length
        ? ` Omitidos: ${r.data.omitidos.map((o) => `#${o.empleado_id} ${o.motivo}`).join('; ')}.`
        : '';
      const adv = r.data.advertencias?.length ? ` ${r.data.advertencias.slice(0, 3).join(' ')}` : '';
      setMsg({
        tipo: 'ok',
        texto: `Nómina calculada: ${r.data.empleados_procesados} empleados. Neto $${r.data.totales?.neto?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.${om}${adv}`,
      });
      cargarPeriodos();
      void abrirPreview(id);
    } catch (err: unknown) {
      let texto = 'No se pudo calcular.';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: string };
        if (typeof d?.detail === 'string') texto = d.detail;
      }
      setMsg({ tipo: 'err', texto });
    } finally {
      setCalculandoId(null);
    }
  };

  const validarTimbrado = async (id: number) => {
    setValidandoId(id);
    setMsg(null);
    try {
      const r = await api.get<ValidarTimbradoResult>(`/nomina/periodos/${id}/validar-timbrado`);
      setValidacion(r.data);
    } catch (err: unknown) {
      let texto = 'No se pudo validar.';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: string };
        if (typeof d?.detail === 'string') texto = d.detail;
      }
      setMsg({ tipo: 'err', texto });
    } finally {
      setValidandoId(null);
    }
  };

  const timbrarPeriodoPrueba = async (id: number) => {
    if (!confirm(
      'Timbrar recibos en FiscalAPI SANDBOX (pruebas, sin validez fiscal). ¿Continuar?'
    )) return;
    setTimbrandoId(id);
    setMsg(null);
    try {
      const r = await api.post<{
        timbrados: number;
        fallidos: number;
        fallos: { empleado_id: number; error: string }[];
        estado: string;
      }>(`/nomina/periodos/${id}/timbrar-prueba`);
      const errTxt = r.data.fallos?.length
        ? ` Errores: ${r.data.fallos.slice(0, 2).map(f => `#${f.empleado_id}: ${f.error}`).join('; ')}`
        : '';
      setMsg({
        tipo: r.data.fallidos > 0 && r.data.timbrados === 0 ? 'err' : 'ok',
        texto: `Timbrado sandbox: ${r.data.timbrados} OK, ${r.data.fallidos} fallidos.${errTxt}${
          r.data.estado === 'timbrada' && r.data.timbrados > 0
            ? ' El periodo pasó al historial por ejercicio/quincena.'
            : ''
        }`,
      });
      cargarPeriodos();
      if (r.data.estado === 'timbrada' && r.data.timbrados > 0) {
        cerrarPreview();
      } else if (previewPeriodoId === id) {
        void recargarPreview(id);
      }
      setValidacion(null);
    } catch (err: unknown) {
      let texto = 'No se pudo timbrar.';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: string };
        if (typeof d?.detail === 'string') texto = d.detail;
      }
      setMsg({ tipo: 'err', texto });
    } finally {
      setTimbrandoId(null);
    }
  };

  const timbrarEmpleadoPrueba = async (periodoId: number, empleadoId: number) => {
    if (!confirm('Timbrar recibo de este empleado en FiscalAPI sandbox. ¿Continuar?')) return;
    setTimbrandoEmpleadoId(empleadoId);
    setMsg(null);
    try {
      const r = await api.post<{ cfdi_uuid?: string; mensaje?: string; ya_timbrado?: boolean }>(
        `/nomina/periodos/${periodoId}/detalles/${empleadoId}/timbrar-prueba`,
      );
      setMsg({
        tipo: 'ok',
        texto: r.data.ya_timbrado
          ? (r.data.mensaje || 'Recibo ya timbrado.')
          : `Timbrado OK. UUID: ${r.data.cfdi_uuid || '—'}`,
      });
      cargarPeriodos();
      const data = await recargarPreview(periodoId);
      if (previewEmpleadoIdx != null && data.empleados[previewEmpleadoIdx]?.empleado_id === empleadoId) {
        /* mantiene índice */
      } else {
        const idx = data.empleados.findIndex(e => e.empleado_id === empleadoId);
        if (idx >= 0) setPreviewEmpleadoIdx(idx);
      }
    } catch (err: unknown) {
      let texto = 'No se pudo timbrar el recibo.';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: string };
        if (typeof d?.detail === 'string') texto = d.detail;
      }
      setMsg({ tipo: 'err', texto });
      if (previewPeriodoId === periodoId) void recargarPreview(periodoId);
    } finally {
      setTimbrandoEmpleadoId(null);
    }
  };

  const exportarXlsx = async (id: number) => {
    try {
      const r = await api.get(`/nomina/periodos/${id}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      const cd = r.headers['content-disposition'] as string | undefined;
      const match = cd?.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? `nomina_periodo_${id}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      let texto = 'No se pudo exportar (calcule el periodo primero).';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: string };
        if (typeof d?.detail === 'string') texto = d.detail;
      }
      setMsg({ tipo: 'err', texto });
    }
  };

  const guardarEnHistorial = async (id: number) => {
    if (!confirm('¿Guardar este periodo en el historial? Dejará de aparecer en periodos activos.')) return;
    setCerrandoId(id);
    setMsg(null);
    try {
      const r = await api.post<{ mensaje?: string; ejercicio_fiscal?: number }>(`/nomina/periodos/${id}/cerrar`);
      setMsg({ tipo: 'ok', texto: r.data.mensaje ?? 'Periodo guardado en historial.' });
      cargarPeriodos();
      if (tabActiva === 'historial') {
        void cargarEjercicios().then(items => {
          if (items.length && ejercicioSel == null) setEjercicioSel(items[0].ejercicio);
          else cargarPeriodosHistorial();
        });
      }
    } catch (err: unknown) {
      let texto = 'No se pudo guardar en historial.';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: string };
        if (typeof d?.detail === 'string') texto = d.detail;
      }
      setMsg({ tipo: 'err', texto });
    } finally {
      setCerrandoId(null);
    }
  };

  if (!puedeAcceder) {
    return (
      <div style={{ padding: 40, color: '#6b7280' }}>
        El módulo de nómina solo está disponible para el administrador del sistema.
      </div>
    );
  }

  const previewEmpleado =
    preview && previewEmpleadoIdx != null ? preview.empleados[previewEmpleadoIdx] : null;

  const periodoPreviewMeta = previewPeriodoId != null
    ? (periodos.find(p => p.id === previewPeriodoId)
      ?? periodosHistorial.find(p => p.id === previewPeriodoId)
      ?? (preview ? {
        periodicidad: '04',
        fecha_fin: preview.fecha_fin,
        numero_periodo: undefined,
        periodo_etiqueta: undefined,
      } : null))
    : null;

  const previewTitulo = periodoPreviewMeta
    ? etiquetaQuincenaPeriodo(periodoPreviewMeta as PeriodoNomina)
    : previewPeriodoId != null ? `#${previewPeriodoId}` : '';

  const periodoMenu = menuPeriodoId != null
    ? (periodos.find(p => p.id === menuPeriodoId)
      ?? periodosHistorial.find(p => p.id === menuPeriodoId)
      ?? null)
    : null;

  const menuPeriodoPortal = periodoMenu && menuPos && createPortal(
    <div
      role="menu"
      style={{ ...menuPeriodoPanel, top: menuPos.top, left: menuPos.left }}
      onClick={e => e.stopPropagation()}
    >
      {!menuHistorial && (periodoMenu.estado === 'borrador' || periodoMenu.estado === 'calculada') && (
        <MenuPeriodoItem
          label={
            calculandoId === periodoMenu.id
              ? 'Calculando…'
              : periodoMenu.estado === 'calculada'
                ? 'Recalcular nómina'
                : 'Calcular nómina'
          }
          disabled={calculandoId === periodoMenu.id}
          onAction={() => {
            cerrarMenuPeriodo();
            calcularPeriodo(periodoMenu.id);
          }}
        />
      )}
      {(periodoMenu.estado === 'calculada' || periodoMenu.estado === 'timbrada' || periodoMenu.estado === 'pagada') && (
        <>
          <MenuPeriodoItem
            label="Previsualizar"
            onAction={() => {
              cerrarMenuPeriodo();
              abrirPreview(periodoMenu.id);
            }}
          />
          <MenuPeriodoItem
            label="Exportar Excel"
            onAction={() => {
              cerrarMenuPeriodo();
              void exportarXlsx(periodoMenu.id);
            }}
          />
        </>
      )}
      {!menuHistorial && periodoMenu.estado === 'calculada' && (
        <>
          <MenuPeriodoItem
            label={validandoId === periodoMenu.id ? 'Validando…' : 'Validar datos'}
            disabled={validandoId === periodoMenu.id}
            onAction={() => {
              cerrarMenuPeriodo();
              solicitarValidacionTimbrado(periodoMenu.id);
            }}
          />
          <MenuPeriodoItem
            label={timbrandoId === periodoMenu.id ? 'Timbrando…' : 'Timbrar'}
            disabled={timbrandoId === periodoMenu.id}
            onAction={() => {
              cerrarMenuPeriodo();
              solicitarTimbradoPeriodo(periodoMenu.id);
            }}
          />
        </>
      )}
      {!menuHistorial && periodoMenu.estado === 'calculada' && (
        <MenuPeriodoItem
          label={cerrandoId === periodoMenu.id ? 'Guardando…' : 'Cerrar sin timbrar'}
          disabled={cerrandoId === periodoMenu.id}
          onAction={() => {
            cerrarMenuPeriodo();
            guardarEnHistorial(periodoMenu.id);
          }}
        />
      )}
      {!menuHistorial && periodoMenu.estado === 'borrador' && (
        <MenuPeriodoItem
          label="Eliminar periodo"
          danger
          onAction={() => {
            cerrarMenuPeriodo();
            eliminarPeriodo(periodoMenu.id);
          }}
        />
      )}
    </div>,
    document.body,
  );

  const ejercicioResumen = ejercicioSel != null
    ? ejerciciosHistorial.find(e => e.ejercicio === ejercicioSel)
    : null;

  const periodosHistorialVisibles = useMemo(() => {
    const base = filtroQuincenaHistorial === ''
      ? periodosHistorial
      : periodosHistorial.filter(p => p.numero_periodo === filtroQuincenaHistorial);
    return [...base].sort((a, b) => {
      const na = a.numero_periodo ?? 0;
      const nb = b.numero_periodo ?? 0;
      if (na !== nb) return nb - na;
      return b.fecha_fin.localeCompare(a.fecha_fin);
    });
  }, [periodosHistorial, filtroQuincenaHistorial]);

  const periodosActivosOrdenados = useMemo(() => (
    [...periodos].sort((a, b) => {
      const ea = a.ejercicio_fiscal ?? parseInt(a.fecha_fin.slice(0, 4), 10);
      const eb = b.ejercicio_fiscal ?? parseInt(b.fecha_fin.slice(0, 4), 10);
      if (ea !== eb) return eb - ea;
      return (b.numero_periodo ?? 0) - (a.numero_periodo ?? 0);
    })
  ), [periodos]);

  const periodosActivosPorEjercicio = useMemo(() => {
    const map = new Map<number, PeriodoNomina[]>();
    for (const p of periodosActivosOrdenados) {
      const ej = p.ejercicio_fiscal ?? parseInt(p.fecha_fin.slice(0, 4), 10);
      if (!map.has(ej)) map.set(ej, []);
      map.get(ej)!.push(p);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [periodosActivosOrdenados]);

  const renderTablaPeriodos = (lista: PeriodoNomina[], historial = false) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
        <thead>
          <tr style={{ background: '#f9fafb' }}>
            {['Quincena', 'Empresa', 'Inicio', 'Fin', 'Tipo', 'Estado', 'Neto', 'Acciones'].map(h => (
              <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lista.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }} title={p.periodo_etiqueta ?? undefined}>
                <strong style={{ fontSize: '0.95rem' }}>{etiquetaQuincenaPeriodo(p)}</strong>
                {p.periodo_etiqueta && (
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>
                    {p.periodo_etiqueta.replace(/^(Quincena \d+|M\d{2}\/12|P\d{2}\/\d+) — /, '')}
                  </div>
                )}
              </td>
              <td style={{ padding: '8px 10px' }}>{empresas.find(e => e.id === p.empresa_id)?.nombre ?? p.empresa_id}</td>
              <td style={{ padding: '8px 10px' }}>{formatFechaSlash(p.fecha_inicio)}</td>
              <td style={{ padding: '8px 10px' }}>{formatFechaSlash(p.fecha_fin)}</td>
              <td style={{ padding: '8px 10px' }}>{p.tipo === 'O' ? 'Ordinaria' : 'Extraordinaria'}</td>
              <td style={{ padding: '8px 10px' }}>
                <span style={{
                  display: 'inline-block', padding: '2px 10px',
                  borderRadius: 12, fontSize: '0.8rem', fontWeight: 600,
                  background: (ESTADO_COLOR[p.estado] ?? '#6b7280') + '22',
                  color: ESTADO_COLOR[p.estado] ?? '#6b7280',
                }}>
                  {p.estado === 'pagada' ? 'guardado' : p.estado}
                </span>
              </td>
              <td style={{ padding: '8px 10px' }}>
                {p.total_neto ? money(p.total_neto) : '—'}
              </td>
              <td style={{ padding: '8px 10px' }}>
                <button
                  type="button"
                  style={menuPeriodoBtn}
                  title="Opciones del periodo"
                  aria-label="Opciones del periodo"
                  aria-haspopup="menu"
                  aria-expanded={menuPeriodoId === p.id}
                  onClick={e => toggleMenuPeriodo(e, p.id, historial)}
                >
                  ⋮
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100 }}>
      <h1 style={{ margin: '0 0 6px', fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>
        Nómina — Periodos
      </h1>
      <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: '0.9rem' }}>
        Cálculo v1: días por checadas (o calendario si no hay asistencia), ISR con subsidio, IMSS por ramos.
        Tras calcular, revise la previsualización del recibo antes de timbrar. Al timbrar, el periodo sale de activos y queda en historial por ejercicio y quincena (1–24).
      </p>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
        <button type="button" style={tabBtn(tabActiva === 'activos')} onClick={() => setTabActiva('activos')}>
          Periodos activos
        </button>
        <button type="button" style={tabBtn(tabActiva === 'historial')} onClick={() => setTabActiva('historial')}>
          Historial por ejercicio
        </button>
      </div>

      {fiscalApi && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 8, fontSize: '0.85rem',
          background: fiscalApi.habilitado ? '#eff6ff' : '#fefce8',
          border: `1px solid ${fiscalApi.habilitado ? '#93c5fd' : '#fde047'}`,
          color: fiscalApi.habilitado ? '#1e40af' : '#854d0e',
        }}>
          <strong>FiscalAPI ({fiscalApi.modo})</strong>
          {' — '}{fiscalApi.mensaje}
          {!fiscalApi.habilitado && (
            <span> Activa <code>NOMINA_FISCALAPI_ENABLED=true</code> y credenciales en backend/.env (cuenta en test.fiscalapi.com).</span>
          )}
          {fiscalApi.habilitado && !fiscalApi.tiene_csd && (
            <span> Opcional: agrega CSD de prueba en .env o registra el emisor en FiscalAPI.</span>
          )}
        </div>
      )}

      {msg && (
        <div style={{
          padding: '10px 16px', marginBottom: 16, borderRadius: 8,
          background: msg.tipo === 'ok' ? '#ecfdf5' : '#fef2f2',
          color: msg.tipo === 'ok' ? '#166534' : '#991b1b',
          border: `1px solid ${msg.tipo === 'ok' ? '#a7f3d0' : '#fca5a5'}`,
          fontSize: '0.88rem',
        }}>
          {msg.texto}
        </div>
      )}

      {loading && <p style={{ padding: 20, color: '#6b7280' }}>Cargando…</p>}

      {!loading && tabActiva === 'activos' && (
        <div style={card}>
          <h3 style={{ margin: '0 0 14px', fontSize: '1rem', color: '#111827' }}>Nuevo periodo</h3>
          <div style={nuevoPeriodoGrid}>
            <div style={formField}>
              <label style={formLabel}>Empresa</label>
              <select style={sel} value={nuevoPeriodo.empresa_id} onChange={e => setNuevoPeriodo(p => ({ ...p, empresa_id: e.target.value }))}>
                <option value="">— Empresa —</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div style={formField}>
              <label style={formLabel}>Tipo</label>
              <select style={sel} value={nuevoPeriodo.tipo} onChange={e => setNuevoPeriodo(p => ({ ...p, tipo: e.target.value }))}>
                <option value="O">Ordinaria</option>
                <option value="E">Extraordinaria</option>
              </select>
            </div>
            <div style={formField}>
              <label style={formLabel}>Periodicidad</label>
              <select style={sel} value={nuevoPeriodo.periodicidad} onChange={e => setNuevoPeriodo(p => ({ ...p, periodicidad: e.target.value }))}>
                {periodicidadCat.length > 0
                  ? periodicidadCat.map(i => <option key={i.clave} value={i.clave}>{i.clave} – {i.descripcion}</option>)
                  : (
                    <>
                      <option value="04">04 – Quincenal</option>
                      <option value="05">05 – Mensual</option>
                      <option value="02">02 – Semanal</option>
                    </>
                  )
                }
              </select>
            </div>
            {nuevoPeriodo.periodicidad === '04' ? (
              <>
                <div style={formField}>
                  <label style={formLabel}>Ejercicio</label>
                  <select
                    style={sel}
                    value={ejercicioNuevo}
                    onChange={e => setEjercicioNuevo(Number(e.target.value))}
                  >
                    {[ejercicioNuevo - 1, ejercicioNuevo, ejercicioNuevo + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div style={formField}>
                  <label style={formLabel}>Quincena del año (1–24)</label>
                  <select
                    style={sel}
                    value={quincenaNueva}
                    onChange={e => setQuincenaNueva(Number(e.target.value))}
                  >
                    {catalogoQuincenas.map(q => (
                      <option
                        key={q.numero}
                        value={q.numero}
                        disabled={quincenaEsPasada(q.fecha_fin)}
                      >
                        {q.etiqueta}{quincenaEsPasada(q.fecha_fin) ? ' (pasada)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={formField}>
                  <label style={formLabel}>Notas</label>
                  <input style={input} value={nuevoPeriodo.notas} onChange={e => setNuevoPeriodo(p => ({ ...p, notas: e.target.value }))} placeholder="Opcional" />
                </div>
              </>
            ) : (
              <>
                <div style={formField}>
                  <label style={formLabel}>Fecha inicio</label>
                  <input style={input} type="date" value={nuevoPeriodo.fecha_inicio} onChange={e => setNuevoPeriodo(p => ({ ...p, fecha_inicio: e.target.value }))} />
                </div>
                <div style={formField}>
                  <label style={formLabel}>Fecha fin</label>
                  <input style={input} type="date" value={nuevoPeriodo.fecha_fin} onChange={e => setNuevoPeriodo(p => ({ ...p, fecha_fin: e.target.value }))} />
                </div>
                <div style={formField}>
                  <label style={formLabel}>Notas</label>
                  <input style={input} value={nuevoPeriodo.notas} onChange={e => setNuevoPeriodo(p => ({ ...p, notas: e.target.value }))} placeholder="Opcional" />
                </div>
              </>
            )}
          </div>
          {nuevoPeriodo.periodicidad === '04' && nuevoPeriodo.fecha_inicio && nuevoPeriodo.fecha_fin && (
            <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#6b7280' }}>
              Periodo: {formatFechaSlash(nuevoPeriodo.fecha_inicio)} → {formatFechaSlash(nuevoPeriodo.fecha_fin)}
            </p>
          )}
          {nuevoPeriodo.periodicidad === '04' && catalogoQuincenas.length > 0 && !catalogoQuincenas.some(q => !quincenaEsPasada(q.fecha_fin)) && (
            <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#b45309' }}>
              Todas las quincenas de este ejercicio ya pasaron. Elija el ejercicio actual o siguiente.
            </p>
          )}

          <h3 style={{ margin: '28px 0 10px', fontSize: '1rem', color: '#111827' }}>
            Periodos — {totalPeriodos} en total
          </h3>
          <div style={{ ...nuevoPeriodoToolbar, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <label style={{ ...label, marginBottom: 0, flexShrink: 0 }}>Empresa:</label>
              <select
                style={{ ...sel, width: 'auto', minWidth: 220, maxWidth: 420 }}
                value={String(empresaSelId)}
                onChange={e => setEmpresaSelId(Number(e.target.value) || '')}
              >
                <option value="">Todas</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <button
              style={{ ...btn('#059669'), flexShrink: 0, height: 36 }}
              disabled={
                creandoPeriodo
                || !nuevoPeriodo.empresa_id
                || !nuevoPeriodo.fecha_inicio
                || !nuevoPeriodo.fecha_fin
                || (nuevoPeriodo.periodicidad === '04' && quincenaEsPasada(nuevoPeriodo.fecha_fin))
              }
              onClick={crearPeriodo}
            >
              {creandoPeriodo ? 'Creando…' : '+ Crear periodo'}
            </button>
          </div>

          {periodos.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '0.88rem' }}>
              No hay periodos en curso (borrador o calculados). Los timbrados están en Historial.
            </p>
          ) : (
            periodosActivosPorEjercicio.map(([ejercicio, lista]) => (
              <div key={ejercicio} style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '0.92rem', color: '#374151' }}>
                  Ejercicio {ejercicio}
                </h4>
                {renderTablaPeriodos(lista)}
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tabActiva === 'historial' && (
        <div style={card}>
          <div style={{ ...row, marginBottom: 16, alignItems: 'flex-end' }}>
            <div style={col()}>
              <label style={label}>Ejercicio fiscal</label>
              <select
                style={sel}
                value={ejercicioSel ?? ''}
                onChange={e => setEjercicioSel(Number(e.target.value) || null)}
                disabled={ejerciciosHistorial.length === 0}
              >
                {ejerciciosHistorial.length === 0 ? (
                  <option value="">Sin ejercicios</option>
                ) : (
                  ejerciciosHistorial.map(e => (
                    <option key={e.ejercicio} value={e.ejercicio}>{e.ejercicio}</option>
                  ))
                )}
              </select>
            </div>
            <div style={col()}>
              <label style={label}>Empresa</label>
              <select style={sel} value={String(empresaSelId)} onChange={e => setEmpresaSelId(Number(e.target.value) || '')}>
                <option value="">Todas</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div style={col()}>
              <label style={label}>Quincena</label>
              <select
                style={sel}
                value={filtroQuincenaHistorial === '' ? '' : String(filtroQuincenaHistorial)}
                onChange={e => setFiltroQuincenaHistorial(e.target.value ? Number(e.target.value) : '')}
                disabled={ejercicioSel == null}
              >
                <option value="">Todas (1–24)</option>
                {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>Quincena {n}</option>
                ))}
              </select>
            </div>
            <div style={{ ...col(), display: 'flex', alignItems: 'center', gap: 8, minHeight: 38 }}>
              <input
                id="solo-cerrados-hist"
                type="checkbox"
                checked={soloCerradosHistorial}
                onChange={e => setSoloCerradosHistorial(e.target.checked)}
              />
              <label htmlFor="solo-cerrados-hist" style={{ ...label, marginBottom: 0, cursor: 'pointer' }}>
                Solo periodos guardados
              </label>
            </div>
          </div>

          {ejercicioResumen && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
              marginBottom: 20,
              padding: '14px 16px',
              background: '#f9fafb',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              fontSize: '0.85rem',
            }}>
              <div>
                <div style={{ color: '#6b7280' }}>Periodos</div>
                <strong>{ejercicioResumen.total_periodos}</strong>
                <span style={{ color: '#9ca3af' }}> ({ejercicioResumen.periodos_pagados} guardados)</span>
              </div>
              <div>
                <div style={{ color: '#6b7280' }}>Percepciones</div>
                <strong>{money(ejercicioResumen.total_percepciones)}</strong>
              </div>
              <div>
                <div style={{ color: '#6b7280' }}>Deducciones</div>
                <strong>{money(ejercicioResumen.total_deducciones)}</strong>
              </div>
              <div>
                <div style={{ color: '#6b7280' }}>Neto acumulado</div>
                <strong>{money(ejercicioResumen.total_neto)}</strong>
              </div>
            </div>
          )}

          <h3 style={{ margin: '0 0 14px', fontSize: '1rem', color: '#111827' }}>
            Periodos {ejercicioSel ?? '—'}
            {filtroQuincenaHistorial !== '' ? ` · Quincena ${filtroQuincenaHistorial}` : ''}
            {' — '}{periodosHistorialVisibles.length} mostrados
          </h3>

          {loadingHistorial ? (
            <p style={{ color: '#6b7280', fontSize: '0.88rem' }}>Cargando historial…</p>
          ) : periodosHistorialVisibles.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '0.88rem' }}>
              No hay periodos para este ejercicio{filtroQuincenaHistorial !== '' ? ' y quincena' : ''}. Calcule y guarde periodos desde la pestaña activos.
            </p>
          ) : (
            renderTablaPeriodos(periodosHistorialVisibles, true)
          )}
        </div>
      )}

      {previewPeriodoId != null && (
        <div style={overlay} onClick={cerrarPreview}>
          <div style={{ ...modal, maxWidth: 960 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
                  Previsualización — {previewTitulo}
                </h2>
                {preview && (
                  <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '0.85rem' }}>
                    {preview.empresa_nombre}
                    {preview.departamento_nombre ? ` · ${preview.departamento_nombre}` : ''}
                    {' · '}{formatFechaSlash(preview.fecha_inicio)} — {formatFechaSlash(preview.fecha_fin)}
                    {' · '}Neto área {money(preview.totales.neto)}
                    {' · '}{preview.resumen.empleados} recibos
                    {preview.resumen.listos_timbrado > 0 && ` · ${preview.resumen.listos_timbrado} listos para timbrar`}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {preview && preview.areas_disponibles && preview.areas_disponibles.length > 0 && (
                  <select
                    style={{ ...sel, width: 'auto', minWidth: 200, height: 34, fontSize: '0.82rem' }}
                    value={areaQueryValue(preview.departamento_id)}
                    onChange={e => void cambiarAreaPreview(parseAreaQueryValue(e.target.value))}
                    disabled={cargandoPreview}
                    title="Área / departamento"
                  >
                    {preview.areas_disponibles.map(a => (
                      <option key={String(a.departamento_id ?? 0)} value={areaQueryValue(a.departamento_id)}>
                        {a.departamento_nombre} ({a.empleados})
                      </option>
                    ))}
                  </select>
                )}
                {preview && previewPeriodoId != null && (
                  <button
                    type="button"
                    style={{ ...btn('#059669'), padding: '6px 14px', fontSize: '0.82rem' }}
                    onClick={() => exportarXlsx(previewPeriodoId)}
                    title="Descarga un Excel con todas las áreas (una hoja por departamento)"
                  >
                    Exportar Excel (todas las áreas)
                  </button>
                )}
                {preview && preview.estado === 'calculada' && (
                  <button
                    type="button"
                    style={{
                      ...btn('#7c3aed'),
                      padding: '6px 14px',
                      fontSize: '0.82rem',
                      ...(!fiscalApiActivo ? { opacity: 0.65, cursor: 'help' } : {}),
                    }}
                    disabled={timbrandoId === previewPeriodoId}
                    onClick={() => previewPeriodoId != null && solicitarTimbradoPeriodo(previewPeriodoId)}
                    title={fiscalApiActivo ? 'Timbrar todo el periodo (sandbox)' : 'Requiere FiscalAPI en backend/.env'}
                  >
                    {timbrandoId === previewPeriodoId ? 'Timbrando…' : 'Timbrar periodo'}
                  </button>
                )}
                <button type="button" style={{ ...btn('#6b7280'), padding: '6px 14px' }} onClick={cerrarPreview}>
                  Cerrar
                </button>
              </div>
            </div>

            {cargandoPreview && <p style={{ color: '#6b7280' }}>Cargando previsualización…</p>}

            {!cargandoPreview && preview && previewEmpleadoIdx == null && (
              <>
                <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#374151' }}>
                  Recibos del área seleccionada. Elija un empleado para ver el detalle y el resumen CFDI.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        {['Empleado', 'Días pag.', 'Percepciones', 'Deducciones', 'Neto', 'Timbrado', ''].map(h => (
                          <th key={h} style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.empleados.map((d, idx) => (
                        <tr key={d.empleado_id}>
                          <td style={{ padding: '8px' }}>{d.nombre}</td>
                          <td style={{ padding: '8px' }}>{d.dias_pagados ?? '—'}</td>
                          <td style={{ padding: '8px' }}>{money(d.total_percepciones)}</td>
                          <td style={{ padding: '8px' }}>{money(d.total_deducciones)}</td>
                          <td style={{ padding: '8px', fontWeight: 600 }}>{money(d.total_neto)}</td>
                          <td style={{ padding: '8px', fontSize: '0.78rem' }}>
                            {d.ya_timbrado ? '✓ UUID' : d.listo_timbrado ? '✓ Listo' : d.errores_timbrado.length ? '⚠ Revisar' : '—'}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <button
                              type="button"
                              style={{ ...btn('#2563eb'), padding: '4px 10px', fontSize: '0.78rem' }}
                              onClick={() => setPreviewEmpleadoIdx(idx)}
                            >
                              Ver recibo
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {!cargandoPreview && preview && previewEmpleado && (
              <div>
                <button
                  type="button"
                  style={{ ...btn('#6b7280'), padding: '4px 12px', fontSize: '0.8rem', marginBottom: 12 }}
                  onClick={() => { setPreviewEmpleadoIdx(null); setMostrarCfdiPreview(false); }}
                >
                  ← Volver a lista
                </button>

                <div style={{
                  border: '1px solid #e5e7eb', borderRadius: 10, padding: '18px 20px',
                  background: 'linear-gradient(180deg, #f8fafc 0%, #fff 120px)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Recibo de nómina (vista previa)
                      </div>
                      <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem' }}>{previewEmpleado.nombre}</h3>
                      {previewEmpleado.numero_empleado && (
                        <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>No. {previewEmpleado.numero_empleado}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.82rem', color: '#6b7280' }}>
                      <div>{preview.empresa_nombre}</div>
                      <div>{formatFechaSlash(preview.fecha_inicio)} — {formatFechaSlash(preview.fecha_fin)}</div>
                      <div>Días pagados: {previewEmpleado.dias_pagados ?? '—'} ({previewEmpleado.dias_fuente ?? '—'})</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                      <h4 style={{ margin: '0 0 8px', fontSize: '0.88rem', color: '#059669' }}>Percepciones</h4>
                      <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                        <tbody>
                          {previewEmpleado.percepciones.map((c, i) => (
                            <tr key={i}>
                              <td style={{ padding: '4px 0' }}>{c.concepto}</td>
                              <td style={{ padding: '4px 0', textAlign: 'right' }}>{money(c.importe_gravado ?? c.importe)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td style={{ paddingTop: 6, fontWeight: 600 }}>Total</td>
                            <td style={{ paddingTop: 6, textAlign: 'right', fontWeight: 600 }}>{money(previewEmpleado.total_percepciones)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 8px', fontSize: '0.88rem', color: '#dc2626' }}>Deducciones</h4>
                      <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                        <tbody>
                          {previewEmpleado.deducciones.map((c, i) => (
                            <tr key={i}>
                              <td style={{ padding: '4px 0' }}>{c.concepto}</td>
                              <td style={{ padding: '4px 0', textAlign: 'right' }}>{money(c.importe)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td style={{ paddingTop: 6, fontWeight: 600 }}>Total</td>
                            <td style={{ paddingTop: 6, textAlign: 'right', fontWeight: 600 }}>{money(previewEmpleado.total_deducciones)}</td>
                          </tr>
                        </tfoot>
                      </table>
                      {previewEmpleado.subsidio_causado != null && Number(previewEmpleado.subsidio_causado) > 0 && (
                        <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                          Subsidio al empleo causado: {money(previewEmpleado.subsidio_causado)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 14px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe',
                  }}>
                    <span style={{ fontWeight: 600, color: '#1e40af' }}>Neto a pagar</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e3a8a' }}>{money(previewEmpleado.total_neto)}</span>
                  </div>
                </div>

                {previewEmpleado.errores_timbrado.length > 0 && (
                  <div style={{
                    marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: '0.82rem',
                    background: '#fefce8', border: '1px solid #fde047', color: '#854d0e',
                  }}>
                    <strong>Pendiente para timbrar:</strong>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {previewEmpleado.errores_timbrado.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}

                {(previewEmpleado.cfdi_uuid || previewEmpleado.cfdi_error) && (
                  <div style={{
                    marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: '0.82rem',
                    background: previewEmpleado.cfdi_error ? '#fef2f2' : '#ecfdf5',
                    border: `1px solid ${previewEmpleado.cfdi_error ? '#fca5a5' : '#a7f3d0'}`,
                  }}>
                    {previewEmpleado.cfdi_uuid && <div><strong>UUID:</strong> {previewEmpleado.cfdi_uuid}</div>}
                    {previewEmpleado.cfdi_error && (
                      <div style={{ color: '#991b1b' }}><strong>Error timbrado:</strong> {previewEmpleado.cfdi_error}</div>
                    )}
                  </div>
                )}

                {previewEmpleado.cfdi_resumen && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      style={{ ...btn('#6b7280'), padding: '5px 12px', fontSize: '0.8rem' }}
                      onClick={() => setMostrarCfdiPreview(v => !v)}
                    >
                      {mostrarCfdiPreview ? 'Ocultar' : 'Ver'} resumen CFDI (lo que se enviaría al PAC)
                    </button>
                    {mostrarCfdiPreview && (
                      <pre style={{
                        marginTop: 8, padding: 12, borderRadius: 8, fontSize: '0.72rem',
                        background: '#f9fafb', border: '1px solid #e5e7eb', overflow: 'auto', maxHeight: 280,
                      }}>
                        {JSON.stringify(previewEmpleado.cfdi_resumen, null, 2)}
                      </pre>
                    )}
                  </div>
                )}

                {preview.estado === 'calculada' && previewPeriodoId != null && (
                  <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      style={{
                        ...btn('#7c3aed'),
                        padding: '6px 14px',
                        fontSize: '0.82rem',
                        ...(!fiscalApiActivo ? { opacity: 0.65, cursor: 'help' } : {}),
                      }}
                      disabled={timbrandoEmpleadoId === previewEmpleado.empleado_id}
                      onClick={() => solicitarTimbradoEmpleado(previewPeriodoId, previewEmpleado.empleado_id)}
                      title={fiscalApiActivo ? 'Timbrar este recibo (sandbox)' : 'Requiere FiscalAPI en backend/.env'}
                    >
                      {timbrandoEmpleadoId === previewEmpleado.empleado_id
                        ? 'Timbrando…'
                        : previewEmpleado.ya_timbrado ? 'Reintentar timbrado' : 'Timbrar este recibo'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {validacion && (
        <div style={overlay} onClick={() => setValidacion(null)}>
          <div style={{ ...modal, maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Validación pre-timbrado — periodo #{validacion.periodo_id}</h2>
                <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '0.85rem' }}>
                  {validacion.resumen.listos} listos · {validacion.resumen.con_errores} con errores · {validacion.resumen.ya_timbrados} ya timbrados
                </p>
              </div>
              <button type="button" style={{ ...btn('#6b7280'), padding: '6px 14px' }} onClick={() => setValidacion(null)}>
                Cerrar
              </button>
            </div>

            {validacion.errores_empresa.length > 0 && (
              <div style={{
                padding: '10px 12px', marginBottom: 12, borderRadius: 8,
                background: '#fef2f2', border: '1px solid #fca5a5', fontSize: '0.85rem', color: '#991b1b',
              }}>
                <strong>Empresa / configuración</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {validacion.errores_empresa.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            <div style={{ overflowX: 'auto', maxHeight: '50vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Empleado', 'Estado', 'Detalle'].map(h => (
                      <th key={h} style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {validacion.empleados.map(emp => (
                    <tr key={emp.empleado_id}>
                      <td style={{ padding: 8 }}>{emp.nombre}</td>
                      <td style={{ padding: 8 }}>
                        {emp.ya_timbrado ? '✓ Timbrado' : emp.listo ? '✓ Listo' : '⚠ Revisar'}
                      </td>
                      <td style={{ padding: 8, color: '#6b7280' }}>
                        {emp.ya_timbrado && emp.cfdi_uuid && `UUID ${emp.cfdi_uuid.slice(0, 8)}…`}
                        {!emp.ya_timbrado && emp.errores.length > 0 && emp.errores.join(' · ')}
                        {!emp.ya_timbrado && emp.errores.length === 0 && 'OK para timbrar'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(validacion.puede_timbrar || !fiscalApiActivo) && (
              <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  style={{
                    ...btn('#7c3aed'),
                    ...(!fiscalApiActivo ? { opacity: 0.65, cursor: 'help' } : {}),
                  }}
                  onClick={() => {
                    const id = validacion.periodo_id;
                    setValidacion(null);
                    solicitarTimbradoPeriodo(id);
                  }}
                  title={fiscalApiActivo ? undefined : 'Requiere FiscalAPI en backend/.env'}
                >
                  Timbrar periodo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {menuPeriodoPortal}
    </div>
  );
};

export default NominaPage;
