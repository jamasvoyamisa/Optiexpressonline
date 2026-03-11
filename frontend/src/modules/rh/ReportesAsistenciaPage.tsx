import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

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
  total_dias_laborables: number;
  dias_asistio: number;
  dias_completos: number;
  faltas: number;
  faltas_justificadas: number;
  incompletas?: number;
  retardos: number;
  salidas_anticipadas: number;
  dias_incapacidad: number;
  puntualidad_pct: number;
}

interface DetalleChecada { hora: string; tipo: string; }
interface DetalleIncidencia { tipo: string; descripcion: string; justificada: boolean; comentarios?: string | null; justificado_por_nombre?: string | null; origen: string; }
interface DetalleDia {
  fecha: string;
  dia_semana: string;
  es_domingo: boolean;
  es_festivo: boolean;
  festivo_nombre?: string | null;
  en_incapacidad: boolean;
  checadas: DetalleChecada[];
  incidencias: DetalleIncidencia[];
}
interface DetalleEmpleado {
  empleado_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias: DetalleDia[];
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
const TIPO_INC_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  falta: { label: 'Falta', bg: '#fee2e2', color: '#991b1b' },
  incompleta: { label: 'Incompleta', bg: '#fef9c3', color: '#854d0e' },
  retardo: { label: 'Retardo', bg: '#fef3c7', color: '#92400e' },
  salida_anticipada: { label: 'Salida anticipada', bg: '#fff7ed', color: '#c2410c' },
  horas_extra: { label: 'Horas extra', bg: '#d1fae5', color: '#065f46' },
};

// ─── Exportar XLSX ───────────────────────────────────────────────────────────
async function exportarXLSX(datos: ResumenEmpleado[], fi: string, ff: string, label: string) {
  const XLSX = await import('xlsx');

  const cols = [
    'No.', 'Nombre', 'Empresa', 'Departamento',
    'Días laborables', 'Asistió', 'Completos', 'Faltas', 'Faltas justif.', 'Incompletas',
    'Retardos', 'Salidas anticipadas', 'Incapacidades', '% Puntualidad',
  ];

  const rows = datos.map(r => [
    r.numero_empleado,
    `${r.nombre} ${r.apellido_paterno}`.trim(),
    r.empresa,
    r.departamento,
    r.total_dias_laborables,
    r.dias_asistio,
    r.dias_completos,
    r.faltas,
    r.faltas_justificadas,
    r.incompletas ?? 0,
    r.retardos,
    r.salidas_anticipadas,
    r.dias_incapacidad,
    r.puntualidad_pct / 100,   // formato porcentaje real para Excel
  ]);

  const ws = XLSX.utils.aoa_to_sheet([cols, ...rows]);

  // Ancho de columnas
  ws['!cols'] = [
    { wch: 8 }, { wch: 28 }, { wch: 22 }, { wch: 22 },
    { wch: 14 }, { wch: 10 }, { wch: 11 }, { wch: 8 }, { wch: 12 }, { wch: 11 },
    { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
  ];

  // Formato porcentaje en columna % Puntualidad (índice 13, fila 2 en adelante)
  for (let i = 1; i <= rows.length; i++) {
    const cell = XLSX.utils.encode_cell({ r: i, c: 13 });
    if (ws[cell]) { ws[cell].z = '0.0%'; ws[cell].t = 'n'; }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');

  // Segunda hoja: metadatos del reporte
  const meta = XLSX.utils.aoa_to_sheet([
    ['Reporte de Asistencia'],
    ['Período', label],
    ['Desde', fi],
    ['Hasta', ff],
    ['Total empleados', datos.length],
    ['Generado', new Date().toLocaleString('es-MX')],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, 'Info');

  XLSX.writeFile(wb, `reporte_asistencia_${fi}_${ff}.xlsx`);
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
export const ReportesAsistenciaPage = () => {
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

  const buscar = useCallback(() => {
    if (fechaInicio && fechaFin) {
      buscarConFechas(fechaInicio, fechaFin, 'Rango personalizado');
    } else {
      const q = quincenaActual();
      buscarConFechas(q.fi, q.ff, q.label);
    }
  }, [fechaInicio, fechaFin, buscarConFechas]);

  // Por defecto: mostrar quincena actual (inputs vacíos, reporte de período actual)
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
      `${d.nombre} ${d.apellido_paterno}`.toLowerCase().includes(b) ||
      d.numero_empleado.toLowerCase().includes(b) ||
      d.departamento.toLowerCase().includes(b)
    );
  });

  // ── Totales ──
  const totales = filtrados.reduce((acc, r) => ({
    faltas: acc.faltas + r.faltas,
    faltas_j: acc.faltas_j + r.faltas_justificadas,
    incompletas: acc.incompletas + (r.incompletas ?? 0),
    retardos: acc.retardos + r.retardos,
    salidas: acc.salidas + r.salidas_anticipadas,
    incapacidades: acc.incapacidades + r.dias_incapacidad,
  }), { faltas: 0, faltas_j: 0, incompletas: 0, retardos: 0, salidas: 0, incapacidades: 0 });

  const badge = (n: number, bg: string, color: string) => (
    <span style={{ backgroundColor: bg, color, borderRadius: 5, padding: '2px 9px', fontSize: '0.78rem', fontWeight: 700 }}>{n}</span>
  );

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ marginBottom: '20px', fontSize: '1.4rem' }}>Reportes de Asistencia</h1>

      {/* ── Filtros: todo en una línea ── */}
      <div style={{ backgroundColor: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: 20 }}>
        {quinLabel && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 6, padding: '4px 12px', fontSize: '0.82rem', fontWeight: 700 }}>
              Período: {quinLabel}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
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
                <input
                  type="text"
                  placeholder="Filtrar por nombre, No. o departamento..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  style={{ ...inputStyle, width: 260 }}
                />
                <span style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                  <strong>{quinLabel || 'Período'}</strong> ({fechaInicio} → {fechaFin})
                </span>
              </div>
              <button
                onClick={() => exportarXLSX(filtrados, fechaInicio, fechaFin, quinLabel)}
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
          ) : (
            <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>No.</th>
                    <th style={th}>Nombre</th>
                    <th style={th}>Empresa</th>
                    <th style={th}>Departamento</th>
                    <th style={thC}>Días lab.</th>
                    <th style={thC}>Asistió</th>
                    <th style={thC}>Completos</th>
                    <th style={thC}>Faltas</th>
                    <th style={thC}>F. Just.</th>
                    <th style={thC}>Incompl.</th>
                    <th style={thC}>Retardos</th>
                    <th style={thC}>Sal. Antic.</th>
                    <th style={thC}>Incapac.</th>
                    <th style={thC}>Puntualidad</th>
                    <th style={thC}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(r => {
                    const pct = r.puntualidad_pct;
                    const pctColor = pct >= 90 ? '#065f46' : pct >= 70 ? '#92400e' : '#991b1b';
                    const pctBg = pct >= 90 ? '#d1fae5' : pct >= 70 ? '#fef3c7' : '#fee2e2';
                    return (
                      <tr key={r.empleado_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={td}><span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{r.numero_empleado}</span></td>
                        <td style={td}>
                          <div style={{ fontWeight: 600 }}>{r.nombre} {r.apellido_paterno}</div>
                        </td>
                        <td style={{ ...td, fontSize: '0.8rem', color: '#6b7280' }}>{r.empresa || '—'}</td>
                        <td style={{ ...td, fontSize: '0.8rem', color: '#6b7280' }}>{r.departamento || '—'}</td>
                        <td style={tdC}>{r.total_dias_laborables}</td>
                        <td style={tdC}>{r.dias_asistio}</td>
                        <td style={tdC}>{r.dias_completos}</td>
                        <td style={tdC}>{r.faltas > 0 ? badge(r.faltas, '#fee2e2', '#991b1b') : <span style={{ color: '#d1d5db' }}>0</span>}</td>
                        <td style={tdC}>{r.faltas_justificadas > 0 ? badge(r.faltas_justificadas, '#f5f3ff', '#7c3aed') : <span style={{ color: '#d1d5db' }}>0</span>}</td>
                        <td style={tdC}>{(r.incompletas ?? 0) > 0 ? badge(r.incompletas!, '#fef9c3', '#854d0e') : <span style={{ color: '#d1d5db' }}>0</span>}</td>
                        <td style={tdC}>{r.retardos > 0 ? badge(r.retardos, '#fef3c7', '#92400e') : <span style={{ color: '#d1d5db' }}>0</span>}</td>
                        <td style={tdC}>{r.salidas_anticipadas > 0 ? badge(r.salidas_anticipadas, '#fff7ed', '#c2410c') : <span style={{ color: '#d1d5db' }}>0</span>}</td>
                        <td style={tdC}>{r.dias_incapacidad > 0 ? badge(r.dias_incapacidad, '#f0f9ff', '#0369a1') : <span style={{ color: '#d1d5db' }}>0</span>}</td>
                        <td style={tdC}>
                          <span style={{ backgroundColor: pctBg, color: pctColor, borderRadius: 5, padding: '2px 9px', fontSize: '0.78rem', fontWeight: 700 }}>
                            {pct}%
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
              <div style={{ padding: '8px 16px', color: '#9ca3af', fontSize: '0.78rem' }}>
                {filtrados.length} empleado{filtrados.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modal detalle por empleado ── */}
      {detalleEmp && (
        <div
          onClick={() => setDetalleEmp(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: 'white', borderRadius: 12, padding: 24, width: 760, maxWidth: '96vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
          >
            {/* Encabezado */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                  {detalleEmp.nombre} {detalleEmp.apellido_paterno}
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
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1d4ed8', minWidth: 240, textAlign: 'center' }}>
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
              {[
                { l: 'Faltas', v: detalleEmp.faltas, bg: '#fee2e2', c: '#991b1b' },
                { l: 'F.Just.', v: detalleEmp.faltas_justificadas, bg: '#f5f3ff', c: '#7c3aed' },
                { l: 'Incompl.', v: detalleEmp.incompletas ?? 0, bg: '#fef9c3', c: '#854d0e' },
                { l: 'Retardos', v: detalleEmp.retardos, bg: '#fef3c7', c: '#92400e' },
                { l: 'Sal.Antic.', v: detalleEmp.salidas_anticipadas, bg: '#fff7ed', c: '#c2410c' },
                { l: 'Incapac.', v: detalleEmp.dias_incapacidad, bg: '#f0f9ff', c: '#0369a1' },
                { l: 'Puntualidad', v: `${detalleEmp.puntualidad_pct}%`, bg: '#f0fdf4', c: '#166534' },
              ].map(x => (
                <div key={x.l} style={{ backgroundColor: x.bg, borderRadius: 6, padding: '6px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600 }}>{x.l}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: x.c }}>{x.v}</div>
                </div>
              ))}
            </div>

            {/* Tabla de días */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {cargandoDetalle ? (
                <p style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>Cargando detalle...</p>
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
                      const bgRow = d.es_domingo ? '#f3f4f6' : d.en_incapacidad ? '#f0f9ff' : d.es_festivo ? '#fff7ed' : d.incidencias.some(i => i.tipo === 'falta' && !i.justificada) ? '#fef2f2' : d.incidencias.some(i => i.tipo === 'incompleta') ? '#fefce8' : d.incidencias.some(i => i.tipo === 'retardo') ? '#fffbeb' : 'white';
                      return (
                        <tr key={d.fecha} style={{ backgroundColor: bgRow, borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ ...td, fontWeight: 600, fontSize: '0.8rem' }}>
                            {new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'short' })}
                          </td>
                          <td style={{ ...td, color: '#6b7280', fontSize: '0.78rem' }}>{d.dia_semana}</td>
                          <td style={td}>
                            {d.es_domingo ? (
                              <span style={{ color: '#6b7280', fontSize: '0.75rem', fontWeight: 600 }}>Descanso</span>
                            ) : d.en_incapacidad ? (
                              <span style={{ color: '#0369a1', fontSize: '0.75rem', fontWeight: 600 }}>🏥 Incapacidad</span>
                            ) : d.es_festivo ? (
                              <span style={{ color: '#c2410c', fontSize: '0.75rem', fontWeight: 600 }}>🎉 {d.festivo_nombre}</span>
                            ) : d.checadas.length === 0 ? (
                              <span style={{ color: '#d1d5db', fontSize: '0.75rem' }}>Sin checadas</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {d.checadas.map((c, i) => (
                                  <span key={i} style={{ backgroundColor: '#f0fdf4', color: '#166534', borderRadius: 4, padding: '1px 6px', fontSize: '0.72rem', fontWeight: 600 }}>
                                    {c.hora} {TIPO_CHECADA[c.tipo] ?? c.tipo}
                                  </span>
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

            <div style={{ textAlign: 'right', marginTop: 14 }}>
              <button onClick={() => setDetalleEmp(null)} style={{ padding: '8px 22px', backgroundColor: '#374151', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
