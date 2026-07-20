import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { fmtNombreEmpleado } from '../../utils/format';
import { descargarArchivo, XLSX_MIME } from '../../utils/download';
import { estiloPuntualidad } from '../../utils/puntualidad';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  rhMobileBtnPrimary,
  rhMobileBtnSecondary,
  rhMobileCard,
  rhMobileCardRow,
  rhMobileCardSub,
  rhMobileCardTitle,
  rhMobileSheetContainer,
  rhMobileSheetHandle,
  rhMobileSheetOverlay,
} from './rhMobileStyles';

const FILAS_POR_PAGINA = 25;

interface Empresa { id: number; nombre: string; }
interface Departamento { id: number; nombre: string; empresa_id: number; }

interface ResumenEmpleado {
  empleado_id: number;
  numero_empleado: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  empresa: string;
  departamento: string;
  total_dias_periodo?: number;
  dias_periodo_evaluados?: number;
  total_dias_laborables: number;
  dias_laborables_evaluados?: number;
  periodo_en_curso?: boolean;
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

interface DetalleChecada {
  hora: string;
  tipo: string;
  motivo_remoto?: string | null;
  motivo_remoto_detalle?: string | null;
  motivo_remoto_label?: string | null;
  latitud?: number | null;
  longitud?: number | null;
}
interface DetalleIncidencia { tipo: string; descripcion: string; justificada: boolean; comentarios?: string | null; justificado_por_nombre?: string | null; origen: string; }
interface DetalleDia {
  fecha: string;
  dia_semana: string;
  es_domingo: boolean;
  es_festivo: boolean;
  festivo_nombre?: string | null;
  en_incapacidad: boolean;
  en_vacaciones: boolean;
  checadas: DetalleChecada[];
  incidencias: DetalleIncidencia[];
}
interface DetalleEmpleado {
  empleado_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias: DetalleDia[];
}

function fmtDiasPeriodo(r: ResumenEmpleado): string {
  const total = r.total_dias_periodo ?? r.total_dias_laborables;
  const evaluados = r.dias_periodo_evaluados ?? r.dias_laborables_evaluados;
  if (r.periodo_en_curso && evaluados != null) {
    return `${evaluados}/${total}`;
  }
  return String(total);
}

function fmtPuntualidad(r: ResumenEmpleado): string {
  const pct = `${r.puntualidad_pct}%`;
  return r.periodo_en_curso ? `${pct} progreso` : pct;
}

const th: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', borderBottom: '2px solid #dee2e6',
  fontSize: '0.78rem', fontWeight: 700, color: '#555', backgroundColor: '#f8f9fa',
  whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
};
const thC: React.CSSProperties = { ...th, textAlign: 'center' };
const td: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid #f0f0f0', fontSize: '0.86rem', verticalAlign: 'middle' };
const tdC: React.CSSProperties = { ...td, textAlign: 'center' };

const inputStyle: React.CSSProperties = {
  padding: '7px 11px', border: '1px solid #d1d5db', borderRadius: '6px',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

/** Mismo tamaño para inputs y selects en filtros */
const filterControlStyle: React.CSSProperties = {
  ...inputStyle,
  width: 150,
  height: 34,
};

const TIPO_CHECADA: Record<string, string> = {
  entrada: 'Entrada', salida_comer: 'Salida comer',
  regreso_comer: 'Regreso comer', salida: 'Salida',
};

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Chip de checada; si es portal remoto muestra motivo y enlace a mapa (solo Reportes RH). */
function ChecadaChip({ c }: { c: DetalleChecada }) {
  const label = (c.motivo_remoto_label || '').trim();
  const hasGeo = c.latitud != null && c.longitud != null
    && Number.isFinite(Number(c.latitud)) && Number.isFinite(Number(c.longitud));
  return (
    <span style={{
      display: 'inline-flex', flexDirection: 'column', gap: 2,
      backgroundColor: label ? '#e0f2fe' : '#f0fdf4',
      color: label ? '#075985' : '#166534',
      borderRadius: 4, padding: '2px 6px', fontSize: '0.72rem', fontWeight: 600,
      border: label ? '1px solid #bae6fd' : '1px solid transparent',
    }}>
      <span>{c.hora} {TIPO_CHECADA[c.tipo] ?? c.tipo}</span>
      {label && (
        <span style={{ fontWeight: 500, fontSize: '0.68rem', opacity: 0.95 }}>
          Portal: {label}
          {hasGeo && (
            <>
              {' · '}
              <a
                href={mapsUrl(Number(c.latitud), Number(c.longitud))}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#0369a1', textDecoration: 'underline' }}
                onClick={(e) => e.stopPropagation()}
              >
                Mapa
              </a>
            </>
          )}
        </span>
      )}
    </span>
  );
}

const TIPO_INC_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  falta: { label: 'Falta', bg: '#fee2e2', color: '#991b1b' },
  incompleta: { label: 'Incompleta', bg: '#fef9c3', color: '#854d0e' },
  retardo: { label: 'Retardo', bg: '#fef3c7', color: '#92400e' },
  salida_anticipada: { label: 'Salida anticipada', bg: '#fff7ed', color: '#c2410c' },
  horas_extra: { label: 'Horas extra', bg: '#d1fae5', color: '#065f46' },
};

// ─── Descargar reporte XLSX del backend ──────────────────────────────────────
async function descargarReporteDetalle(fi: string, ff: string, empresa: string, depto: string) {
  const params = new URLSearchParams({ fecha_inicio: fi, fecha_fin: ff });
  if (empresa) params.set('empresa_id', empresa);
  if (depto) params.set('departamento_id', depto);
  try {
    await descargarArchivo(
      `/asistencia/reporte-export-xlsx?${params}`,
      `reporte_asistencia_${fi}_${ff}.xlsx`,
      XLSX_MIME,
    );
  } catch (e: any) {
    alert(e?.message || 'Error al generar reporte');
  }
}

// ─── Utilidades de quincena ──────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, '0'); }
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function nombreMes(m: number) { return MESES[m - 1] ?? ''; }

/** Devuelve la quincena (fi, ff, label) dado año, mes (1-12) y número (1 o 2).
 * Período 1: días 1-15. Período 2: días 16-28/29/30/31 según el mes. */
function quincenaDatos(year: number, mes: number, num: 1 | 2): { fi: string; ff: string; label: string } {
  const ultimo = new Date(year, mes, 0).getDate();
  if (num === 1) {
    return {
      fi: `${year}-${pad(mes)}-01`,
      ff: `${year}-${pad(mes)}-15`,
      label: `1-15 de ${nombreMes(mes)} ${year}`,
    };
  }
  return {
    fi: `${year}-${pad(mes)}-16`,
    ff: `${year}-${pad(mes)}-${ultimo}`,
    label: `16-${ultimo} de ${nombreMes(mes)} ${year}`,
  };
}

/** Devuelve la quincena anterior */
function quincenaAnterior(year: number, mes: number, num: 1 | 2) {
  if (num === 2) return quincenaDatos(year, mes, 1);
  const prevMes = mes === 1 ? 12 : mes - 1;
  const prevYear = mes === 1 ? year - 1 : year;
  return quincenaDatos(prevYear, prevMes, 2);
}

/** Devuelve la quincena siguiente */
function quincenaSiguiente(year: number, mes: number, num: 1 | 2) {
  if (num === 1) return quincenaDatos(year, mes, 2);
  const nextMes = mes === 12 ? 1 : mes + 1;
  const nextYear = mes === 12 ? year + 1 : year;
  return quincenaDatos(nextYear, nextMes, 1);
}

/** Devuelve la quincena actual: período exacto 1-15 o 16-ultimo (sin expandir a semanas completas).
 * Los domingos cuentan dentro del período. */
function quincenaActual(): { fi: string; ff: string; label: string; fiNominal: string; ffNominal: string } {
  const n = new Date();
  const y = n.getFullYear();
  const m = n.getMonth() + 1; // 1-12
  const d = n.getDate();
  const ultimo = new Date(y, m, 0).getDate();

  let fi: string;
  let ff: string;
  let label: string;

  if (d <= 15) {
    fi = `${y}-${pad(m)}-01`;
    ff = `${y}-${pad(m)}-15`;
    label = `1-15 de ${nombreMes(m)} ${y}`;
  } else {
    fi = `${y}-${pad(m)}-16`;
    ff = `${y}-${pad(m)}-${ultimo}`;
    label = `16-${ultimo} de ${nombreMes(m)} ${y}`;
  }

  return { fi, ff, label, fiNominal: fi, ffNominal: ff };
}

// ─── Componente ──────────────────────────────────────────────────────────────
export const ReportesAsistenciaPage = ({ embeddedRh = false }: { embeddedRh?: boolean } = {}) => {
  const isMobile = useIsMobile();
  const compactRh = embeddedRh && isMobile;
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [quinLabel, setQuinLabel] = useState<string>('');
  const [fiNominal, setFiNominal] = useState('');
  const [, setFfNominal] = useState('');

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [deptos, setDeptos] = useState<Departamento[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroDepto, setFiltroDepto] = useState('');

  const [datos, setDatos] = useState<ResumenEmpleado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);

  const [detalleEmp, setDetalleEmp] = useState<ResumenEmpleado | null>(null);
  const [detalleData, setDetalleData] = useState<DetalleEmpleado | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  // Quincena activa en el modal de detalle
  const [detalleQ, setDetalleQ] = useState<{ fi: string; ff: string; label: string } | null>(null);

  // Cargar catálogos
  useEffect(() => {
    api.get<Empresa[]>('/personal/empresas?limit=200')
      .then(r => setEmpresas(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    setFiltroDepto('');
    setDeptos([]);
    if (!filtroEmpresa) return;
    api.get<Departamento[]>(`/personal/departamentos?empresa_id=${filtroEmpresa}&limit=200`)
      .then(r => setDeptos(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [filtroEmpresa]);

  const buscarConFechas = useCallback(async (fi: string, ff: string, label: string) => {
    setCargando(true);
    setBuscado(true);
    setQuinLabel(label);
    setFiNominal(fi);
    setFfNominal(ff);
    setFechaInicio(fi);
    setFechaFin(ff);
    try {
      const params = new URLSearchParams({ fecha_inicio: fi, fecha_fin: ff });
      if (filtroEmpresa) params.set('empresa_id', filtroEmpresa);
      if (filtroDepto) params.set('departamento_id', filtroDepto);
      const res = await api.get<ResumenEmpleado[]>(`/asistencia/reporte-resumen?${params}`);
      setDatos(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error al generar el reporte');
      setDatos([]);
    } finally {
      setCargando(false);
    }
  }, [filtroEmpresa, filtroDepto]);

  // Navegación rápida por quincena (prev/next) desde el período mostrado arriba.
  const navegarQuincenaPeriodo = useCallback(async (dir: 'prev' | 'next') => {
    if (!fiNominal) return;
    const d = new Date(fiNominal + 'T12:00:00');
    const year = d.getFullYear();
    const mes = d.getMonth() + 1;
    const num: 1 | 2 = d.getDate() <= 15 ? 1 : 2;
    const q = dir === 'prev' ? quincenaAnterior(year, mes, num) : quincenaSiguiente(year, mes, num);
    setFechaInicio(q.fi);
    setFechaFin(q.ff);
    await buscarConFechas(q.fi, q.ff, q.label);
  }, [fiNominal, buscarConFechas]);

  const buscar = useCallback(() => {
    if (fechaInicio && fechaFin) {
      buscarConFechas(fechaInicio, fechaFin, 'Rango personalizado');
    } else {
      const q = quincenaActual();
      buscarConFechas(q.fi, q.ff, q.label);
    }
  }, [fechaInicio, fechaFin, buscarConFechas]);

  // Por defecto: mostrar quincena actual
  useEffect(() => {
    const q = quincenaActual();
    buscarConFechas(q.fi, q.ff, q.label);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarDetalle = async (emp: ResumenEmpleado, q: { fi: string; ff: string; label: string }) => {
    setDetalleData(null);
    setCargandoDetalle(true);
    try {
      const res = await api.get<DetalleEmpleado>(
        `/asistencia/reporte-detalle/${emp.empleado_id}?fecha_inicio=${q.fi}&fecha_fin=${q.ff}`
      );
      setDetalleData(res.data);
    } catch { /* silencioso */ }
    finally { setCargandoDetalle(false); }
  };

  const verDetalle = async (emp: ResumenEmpleado) => {
    if (!fiNominal) return;
    const d = new Date(fiNominal + 'T12:00:00');
    const year = d.getFullYear();
    const mes = d.getMonth() + 1;
    const num: 1 | 2 = d.getDate() <= 15 ? 1 : 2;
    const q = quincenaDatos(year, mes, num);
    setDetalleEmp(emp);
    setDetalleQ(q);
    await cargarDetalle(emp, q);
  };

  const navegarQuincena = async (dir: 'prev' | 'next') => {
    if (!detalleEmp || !detalleQ) return;
    const d = new Date(detalleQ.fi + 'T12:00:00');
    const year = d.getFullYear();
    const mes = d.getMonth() + 1;
    const num: 1 | 2 = d.getDate() <= 15 ? 1 : 2;
    const q = dir === 'prev' ? quincenaAnterior(year, mes, num) : quincenaSiguiente(year, mes, num);
    setDetalleQ(q);
    await cargarDetalle(detalleEmp, q);
  };

  const filtrados = datos.filter(d => {
    if (!busqueda) return true;
    const b = busqueda.toLowerCase();
    return (
      fmtNombreEmpleado(d).toLowerCase().includes(b) ||
      d.numero_empleado.toLowerCase().includes(b) ||
      d.departamento.toLowerCase().includes(b)
    );
  });

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / FILAS_POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicioPagina = (paginaSegura - 1) * FILAS_POR_PAGINA;
  const filtradosPagina = filtrados.slice(inicioPagina, inicioPagina + FILAS_POR_PAGINA);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, datos, filtroEmpresa, filtroDepto]);

  useEffect(() => {
    setPagina(p => Math.min(p, totalPaginas));
  }, [totalPaginas]);

  const paginationBar = filtrados.length > FILAS_POR_PAGINA && (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: isMobile ? '4px 0' : '8px 16px' }}>
      <span style={{ color: '#6b7280', fontSize: '0.82rem' }}>
        {inicioPagina + 1}–{Math.min(inicioPagina + FILAS_POR_PAGINA, filtrados.length)} de {filtrados.length} empleados
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          disabled={paginaSegura <= 1}
          onClick={() => setPagina(p => Math.max(1, p - 1))}
          style={isMobile
            ? { ...rhMobileBtnSecondary, minHeight: 36, opacity: paginaSegura <= 1 ? 0.5 : 1 }
            : { padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: paginaSegura <= 1 ? '#f9fafb' : 'white', cursor: paginaSegura <= 1 ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}
        >
          Anterior
        </button>
        <span style={{ color: '#374151', fontSize: '0.85rem', fontWeight: 600 }}>{paginaSegura}/{totalPaginas}</span>
        <button
          type="button"
          disabled={paginaSegura >= totalPaginas}
          onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
          style={isMobile
            ? { ...rhMobileBtnSecondary, minHeight: 36, opacity: paginaSegura >= totalPaginas ? 0.5 : 1 }
            : { padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: paginaSegura >= totalPaginas ? '#f9fafb' : 'white', cursor: paginaSegura >= totalPaginas ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}
        >
          Siguiente
        </button>
      </div>
    </div>
  );

  // ── Totales ──
  const totales = filtrados.reduce((acc, r) => ({
    faltas: acc.faltas + r.faltas,
    faltas_j: acc.faltas_j + r.faltas_justificadas,
    incompletas: acc.incompletas + (r.incompletas ?? 0),
    retardos: acc.retardos + r.retardos,
    salidas: acc.salidas + r.salidas_anticipadas,
    incapacidades: acc.incapacidades + r.dias_incapacidad,
    vacaciones: acc.vacaciones + (r.dias_vacaciones ?? 0),
  }), { faltas: 0, faltas_j: 0, incompletas: 0, retardos: 0, salidas: 0, incapacidades: 0, vacaciones: 0 });

  const badge = (n: number, bg: string, color: string) => (
    <span style={{ backgroundColor: bg, color, borderRadius: 5, padding: '2px 9px', fontSize: '0.78rem', fontWeight: 700 }}>{n}</span>
  );

  return (
    <div style={{ padding: compactRh ? 0 : isMobile ? '12px' : '24px' }}>
      {!compactRh && <h1 style={{ marginBottom: '20px', fontSize: isMobile ? '1.2rem' : '1.4rem' }}>Reportes de Asistencia</h1>}

      {/* ── Filtros: todo en una línea ── */}
      <div style={{ backgroundColor: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: 20 }}>
        {quinLabel && (
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => navegarQuincenaPeriodo('prev')}
                disabled={cargando}
                style={{ background: 'white', border: '1px solid #d1d5db', borderRadius: 8, width: 32, height: 32, cursor: cargando ? 'not-allowed' : 'pointer', color: '#374151', fontSize: '1rem', fontWeight: 800 }}
              >
                ‹
              </button>
              <span style={{ backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 6, padding: '4px 12px', fontSize: '0.82rem', fontWeight: 700 }}>
                Período: {quinLabel}
              </span>
              <button
                type="button"
                onClick={() => navegarQuincenaPeriodo('next')}
                disabled={cargando}
                style={{ background: 'white', border: '1px solid #d1d5db', borderRadius: 8, width: 32, height: 32, cursor: cargando ? 'not-allowed' : 'pointer', color: '#374151', fontSize: '1rem', fontWeight: 800 }}
              >
                ›
              </button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Empleado</label>
            <input
              type="text"
              placeholder="Buscar por nombre o No."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={{ ...inputStyle, width: 220, height: 34, backgroundColor: 'white' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Empresa</label>
            <select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)} style={filterControlStyle}>
              <option value="">Todas</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Departamento</label>
            <select value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)} disabled={!filtroEmpresa} style={{ ...filterControlStyle, backgroundColor: !filtroEmpresa ? '#f9fafb' : 'white' }}>
              <option value="">Todos</option>
              {deptos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Desde</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={e => {
                setFechaInicio(e.target.value);
                setFiNominal(e.target.value);
                setQuinLabel(e.target.value ? 'Rango personalizado' : '');
              }}
              style={filterControlStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Hasta</label>
            <input
              type="date"
              value={fechaFin}
              onChange={e => {
                setFechaFin(e.target.value);
                setFfNominal(e.target.value);
                setQuinLabel(e.target.value ? 'Rango personalizado' : '');
              }}
              style={filterControlStyle}
            />
          </div>
          <button
            onClick={buscar}
            disabled={cargando}
            style={{ padding: '8px 24px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: 7, cursor: cargando ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem' }}
          >
            {cargando ? 'Generando...' : 'Generar reporte'}
          </button>
        </div>
      </div>

      {/* ── Resultados ── */}
      {buscado && !cargando && (
        <>
          {/* Tarjetas resumen */}
          {filtrados.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Empleados', valor: filtrados.length, color: '#0ea5e9', bg: '#f0f9ff' },
                { label: 'Faltas', valor: totales.faltas, color: '#dc2626', bg: '#fef2f2' },
                { label: 'F. justificadas', valor: totales.faltas_j, color: '#7c3aed', bg: '#f5f3ff' },
                { label: 'Incompletas', valor: totales.incompletas, color: '#854d0e', bg: '#fef9c3' },
                { label: 'Retardos', valor: totales.retardos, color: '#d97706', bg: '#fffbeb' },
                { label: 'Salidas antic.', valor: totales.salidas, color: '#c2410c', bg: '#fff7ed' },
                { label: 'Incapacidades', valor: totales.incapacidades, color: '#0369a1', bg: '#f0f9ff' },
                { label: 'Vacaciones', valor: totales.vacaciones, color: '#166534', bg: '#f0fdf4' },
              ].map(c => (
                <div key={c.label} style={{ backgroundColor: c.bg, border: `1px solid ${c.color}22`, borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: '1.7rem', fontWeight: 800, color: c.color }}>{c.valor}</div>
                </div>
              ))}
            </div>
          )}

          {/* Barra búsqueda en tabla + período + botón CSV */}
          {filtrados.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                  <strong>{quinLabel || 'Período'}</strong> ({fechaInicio} → {fechaFin})
                </span>
                {filtrados.some(r => r.periodo_en_curso) && (
                  <span style={{ fontSize: '0.75rem', color: '#0369a1', backgroundColor: '#f0f9ff', borderRadius: 6, padding: '4px 10px', fontWeight: 600 }}>
                    Quincena en curso — {filtrados[0] ? fmtDiasPeriodo(filtrados[0]) : ''} días del periodo
                  </span>
                )}
              </div>
              <button
                onClick={() => descargarReporteDetalle(fechaInicio, fechaFin, filtroEmpresa, filtroDepto)}
                style={{ padding: '7px 16px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                ⬇ Exportar XLSX
              </button>
            </div>
          )}

          {filtrados.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', backgroundColor: 'white', borderRadius: 10, border: '1px solid #e5e7eb', color: '#9ca3af' }}>
              No se encontraron empleados con los filtros seleccionados.
            </div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {paginationBar}
              {filtradosPagina.map(r => {
                const pct = r.puntualidad_pct;
                const punt = estiloPuntualidad(pct);
                return (
                  <div key={r.empleado_id} style={rhMobileCard}>
                    <div style={rhMobileCardTitle}>{fmtNombreEmpleado(r)}</div>
                    <div style={rhMobileCardSub}>No. {r.numero_empleado} · {r.departamento || '—'}</div>
                    <div style={{ ...rhMobileCardRow, marginTop: 10 }}>
                      <span>Periodo: {fmtDiasPeriodo(r)} días</span>
                      <span style={{ color: punt.text, fontWeight: 700, backgroundColor: punt.bg, borderRadius: 5, padding: '2px 8px', fontSize: '0.78rem' }}>{fmtPuntualidad(r)}</span>
                    </div>
                    <div style={rhMobileCardRow}>
                      <span>Completos: {r.dias_completos}</span>
                      <span>Faltas: {r.faltas}</span>
                      <span>Retardos: {r.retardos}</span>
                    </div>
                    <button type="button" onClick={() => verDetalle(r)} style={{ ...rhMobileBtnPrimary, marginTop: 10, backgroundColor: '#0369a1' }}>
                      Ver detalle
                    </button>
                  </div>
                );
              })}
              {paginationBar}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              {paginationBar}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>No.</th>
                    <th style={th}>Nombre</th>
                    <th style={th}>Empresa</th>
                    <th style={th}>Departamento</th>
                    <th style={thC}>Días período{filtrados.some(r => r.periodo_en_curso) ? ' (prog.)' : ''}</th>
                    <th style={thC}>Asistió</th>
                    <th style={thC}>Completos</th>
                    <th style={thC}>Faltas</th>
                    <th style={thC}>F. Just.</th>
                    <th style={thC}>Incompl.</th>
                    <th style={thC}>Retardos</th>
                    <th style={thC}>Sal. Antic.</th>
                    <th style={thC}>Incapac.</th>
                    <th style={thC}>Vacac.</th>
                    <th style={thC}>Puntualidad{filtrados.some(r => r.periodo_en_curso) ? ' (prog.)' : ''}</th>
                    <th style={thC}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradosPagina.map(r => {
                    const pct = r.puntualidad_pct;
                    const punt = estiloPuntualidad(pct);
                    return (
                      <tr key={r.empleado_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={td}><span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{r.numero_empleado}</span></td>
                        <td style={td}>
                          <div style={{ fontWeight: 600 }}>{fmtNombreEmpleado(r)}</div>
                        </td>
                        <td style={{ ...td, fontSize: '0.8rem', color: '#6b7280' }}>{r.empresa || '—'}</td>
                        <td style={{ ...td, fontSize: '0.8rem', color: '#6b7280' }}>{r.departamento || '—'}</td>
                        <td style={tdC}>{fmtDiasPeriodo(r)}</td>
                        <td style={tdC}>{r.dias_asistio}</td>
                        <td style={tdC}>{r.dias_completos}</td>
                        <td style={tdC}>{r.faltas > 0 ? badge(r.faltas, '#fee2e2', '#991b1b') : <span style={{ color: '#d1d5db' }}>0</span>}</td>
                        <td style={tdC}>{r.faltas_justificadas > 0 ? badge(r.faltas_justificadas, '#f5f3ff', '#7c3aed') : <span style={{ color: '#d1d5db' }}>0</span>}</td>
                        <td style={tdC}>{(r.incompletas ?? 0) > 0 ? badge(r.incompletas!, '#fef9c3', '#854d0e') : <span style={{ color: '#d1d5db' }}>0</span>}</td>
                        <td style={tdC}>{r.retardos > 0 ? badge(r.retardos, '#fef3c7', '#92400e') : <span style={{ color: '#d1d5db' }}>0</span>}</td>
                        <td style={tdC}>{r.salidas_anticipadas > 0 ? badge(r.salidas_anticipadas, '#fff7ed', '#c2410c') : <span style={{ color: '#d1d5db' }}>0</span>}</td>
                        <td style={tdC}>{r.dias_incapacidad > 0 ? badge(r.dias_incapacidad, '#f0f9ff', '#0369a1') : <span style={{ color: '#d1d5db' }}>0</span>}</td>
                        <td style={tdC}>{(r.dias_vacaciones ?? 0) > 0 ? badge(r.dias_vacaciones, '#f0fdf4', '#166534') : <span style={{ color: '#d1d5db' }}>0</span>}</td>
                        <td style={tdC}>
                          <span style={{ backgroundColor: punt.bg, color: punt.text, borderRadius: 5, padding: '2px 9px', fontSize: '0.78rem', fontWeight: 700 }} title={r.periodo_en_curso ? `${punt.tier} · progreso de quincena` : punt.tier}>
                            {fmtPuntualidad(r)}
                          </span>
                        </td>
                        <td style={tdC}>
                          <button
                            onClick={() => verDetalle(r)}
                            style={{ padding: '4px 10px', backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {paginationBar}
            </div>
          )}
        </>
      )}

      {/* ── Modal detalle por empleado ── */}
      {detalleEmp && (
        <div
          onClick={() => setDetalleEmp(null)}
          style={rhMobileSheetOverlay(isMobile)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              ...rhMobileSheetContainer(isMobile),
              maxHeight: isMobile ? '92dvh' : '88vh',
              display: 'flex',
              flexDirection: 'column',
              ...(isMobile ? {} : { width: 760, maxWidth: '96vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }),
            }}
          >
            {isMobile && <div style={rhMobileSheetHandle} />}
            {/* Encabezado */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                  {fmtNombreEmpleado(detalleEmp)}
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>
                  No. {detalleEmp.numero_empleado} · {detalleEmp.departamento || 'Sin depto.'}
                </div>
                {/* Navegación de quincenas */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => navegarQuincena('prev')}
                    disabled={cargandoDetalle}
                    style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', color: '#374151' }}
                  >‹</button>
                  <span style={{ fontSize: isMobile ? '0.78rem' : '0.82rem', fontWeight: 600, color: '#1d4ed8', minWidth: isMobile ? 0 : 240, textAlign: 'center', flex: 1 }}>
                    {detalleQ?.label ?? ''}
                  </span>
                  <button
                    onClick={() => navegarQuincena('next')}
                    disabled={cargandoDetalle}
                    style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', color: '#374151' }}
                  >›</button>
                </div>
              </div>
              <button onClick={() => setDetalleEmp(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#9ca3af' }}>×</button>
            </div>

            {/* Mini-resumen */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {(() => {
                const puntDet = estiloPuntualidad(detalleEmp.puntualidad_pct);
                return [
                  { l: 'Faltas', v: detalleEmp.faltas, bg: '#fef2f2', c: '#b91c1c' },
                  { l: 'F.Just.', v: detalleEmp.faltas_justificadas, bg: '#f5f3ff', c: '#7c3aed' },
                  { l: 'Incompl.', v: detalleEmp.incompletas ?? 0, bg: '#fefce8', c: '#a16207' },
                  { l: 'Retardos', v: detalleEmp.retardos, bg: '#fffbeb', c: '#b45309' },
                  { l: 'Sal.Antic.', v: detalleEmp.salidas_anticipadas, bg: '#fff7ed', c: '#c2410c' },
                  { l: 'Incapac.', v: detalleEmp.dias_incapacidad, bg: '#f0f9ff', c: '#0369a1' },
                  { l: 'Vacac.', v: detalleEmp.dias_vacaciones ?? 0, bg: '#f0fdf4', c: '#166534' },
                  { l: 'Puntualidad', v: fmtPuntualidad(detalleEmp), bg: puntDet.bg, c: puntDet.text },
                ].map(x => (
                  <div key={x.l} style={{ backgroundColor: x.bg, borderRadius: 6, padding: '6px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600 }}>{x.l}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: x.c }}>{x.v}</div>
                  </div>
                ));
              })()}
            </div>

            {/* Tabla de días */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {cargandoDetalle ? (
                <p style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>Cargando detalle...</p>
              ) : detalleData && isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detalleData.dias.map(d => {
                    const bgRow = d.es_domingo ? '#f3f4f6' : d.en_vacaciones ? '#f0fdf4' : d.en_incapacidad ? '#f0f9ff' : d.es_festivo ? '#fff7ed' : d.incidencias.some(i => i.tipo === 'falta' && !i.justificada) ? '#fef2f2' : 'white';
                    return (
                      <div key={d.fecha} style={{ ...rhMobileCard, backgroundColor: bgRow }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                          <div style={rhMobileCardTitle}>
                            {new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'short' })}
                          </div>
                          <div style={{ ...rhMobileCardSub, marginTop: 0 }}>{d.dia_semana}</div>
                        </div>
                        <div style={{ fontSize: '0.78rem', marginBottom: 6 }}>
                          {d.es_domingo ? (
                            <span style={{ color: '#6b7280', fontWeight: 600 }}>Descanso</span>
                          ) : d.en_vacaciones ? (
                            <span style={{ color: '#166534', fontWeight: 600 }}>Vacaciones</span>
                          ) : d.en_incapacidad ? (
                            <span style={{ color: '#0369a1', fontWeight: 600 }}>Incapacidad</span>
                          ) : d.es_festivo ? (
                            <span style={{ color: '#c2410c', fontWeight: 600 }}>{d.festivo_nombre}</span>
                          ) : d.checadas.length === 0 ? (
                            <span style={{ color: '#d1d5db' }}>Sin checadas</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {d.checadas.map((c, i) => (
                                <ChecadaChip key={i} c={c} />
                              ))}
                            </div>
                          )}
                        </div>
                        {d.incidencias.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                            {d.incidencias.map((inc, i) => {
                              const s = TIPO_INC_LABEL[inc.tipo] ?? { label: inc.tipo, bg: '#f3f4f6', color: '#374151' };
                              return (
                                <span key={i} style={{ backgroundColor: s.bg, color: s.color, borderRadius: 4, padding: '2px 7px', fontSize: '0.72rem', fontWeight: 700 }}>
                                  {s.label}{inc.justificada ? ' ✓' : ''}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {d.incidencias.some(i => i.descripcion || i.comentarios) && (
                          <div style={{ ...rhMobileCardSub, fontSize: '0.75rem', lineHeight: 1.35 }}>
                            {d.incidencias.map((i, idx) => (
                              <div key={idx}>{i.justificada ? (i.comentarios || '') : (i.descripcion || '')}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : detalleData ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, fontSize: '0.75rem' }}>Fecha</th>
                      <th style={{ ...th, fontSize: '0.75rem' }}>Día</th>
                      <th style={{ ...th, fontSize: '0.75rem' }}>Checadas</th>
                      <th style={{ ...th, fontSize: '0.75rem' }}>Incidencias</th>
                      <th style={{ ...th, fontSize: '0.75rem' }}>Observaciones</th>
                      <th style={{ ...th, fontSize: '0.75rem' }}>Quién justificó</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleData.dias.map(d => {
                      const bgRow = d.es_domingo ? '#f3f4f6' : d.en_vacaciones ? '#f0fdf4' : d.en_incapacidad ? '#f0f9ff' : d.es_festivo ? '#fff7ed' : d.incidencias.some(i => i.tipo === 'falta' && !i.justificada) ? '#fef2f2' : d.incidencias.some(i => i.tipo === 'incompleta') ? '#fefce8' : d.incidencias.some(i => i.tipo === 'retardo') ? '#fffbeb' : 'white';
                      return (
                        <tr key={d.fecha} style={{ backgroundColor: bgRow, borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ ...td, fontWeight: 600, fontSize: '0.8rem' }}>
                            {new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'short' })}
                          </td>
                          <td style={{ ...td, color: '#6b7280', fontSize: '0.78rem' }}>{d.dia_semana}</td>
                          <td style={td}>
                            {d.es_domingo ? (
                              <span style={{ color: '#6b7280', fontSize: '0.75rem', fontWeight: 600 }}>Descanso</span>
                            ) : d.en_vacaciones ? (
                              <span style={{ color: '#166534', fontSize: '0.75rem', fontWeight: 600 }}>Vacaciones</span>
                            ) : d.en_incapacidad ? (
                              <span style={{ color: '#0369a1', fontSize: '0.75rem', fontWeight: 600 }}>Incapacidad</span>
                            ) : d.es_festivo ? (
                              <span style={{ color: '#c2410c', fontSize: '0.75rem', fontWeight: 600 }}>🎉 {d.festivo_nombre}</span>
                            ) : d.checadas.length === 0 ? (
                              <span style={{ color: '#d1d5db', fontSize: '0.75rem' }}>Sin checadas</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {d.checadas.map((c, i) => (
                                  <ChecadaChip key={i} c={c} />
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={td}>
                            {d.incidencias.length === 0 ? (
                              <span style={{ color: '#d1d5db', fontSize: '0.75rem' }}>—</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {d.incidencias.map((inc, i) => {
                                  const s = TIPO_INC_LABEL[inc.tipo] ?? { label: inc.tipo, bg: '#f3f4f6', color: '#374151' };
                                  return (
                                    <span key={i} style={{ backgroundColor: s.bg, color: s.color, borderRadius: 4, padding: '1px 7px', fontSize: '0.72rem', fontWeight: 700 }}>
                                      {s.label}{inc.justificada ? ' Justificada' : ''}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td style={{ ...td, fontSize: '0.75rem', color: '#6b7280', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal' }}>
                            {d.incidencias.length === 0 ? '—' : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {d.incidencias.map((i, idx) => (
                                  <div key={idx}>
                                    {i.justificada ? (i.comentarios || '—') : (i.descripcion || '—')}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={{ ...td, fontSize: '0.75rem', color: '#6b7280', maxWidth: 140 }}>
                            {d.incidencias.length === 0 ? '—' : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {d.incidencias.map((i, idx) => (
                                  <div key={idx}>
                                    {i.justificada ? (i.justificado_por_nombre || '—') : '—'}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
            </div>

            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setDetalleEmp(null)}
                style={isMobile ? { ...rhMobileBtnPrimary, backgroundColor: '#374151', width: '100%' } : { padding: '8px 22px', backgroundColor: '#374151', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
