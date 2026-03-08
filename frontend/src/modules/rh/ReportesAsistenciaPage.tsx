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
  retardos: number;
  salidas_anticipadas: number;
  dias_incapacidad: number;
  puntualidad_pct: number;
}

interface DetalleChecada { hora: string; tipo: string; }
interface DetalleIncidencia { tipo: string; descripcion: string; justificada: boolean; origen: string; }
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

const TIPO_CHECADA: Record<string, string> = {
  entrada: 'Entrada', salida_comer: 'Salida comer',
  regreso_comer: 'Regreso comer', salida: 'Salida',
};
const TIPO_INC_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  falta: { label: 'Falta', bg: '#fee2e2', color: '#991b1b' },
  retardo: { label: 'Retardo', bg: '#fef3c7', color: '#92400e' },
  salida_anticipada: { label: 'Salida anticipada', bg: '#fff7ed', color: '#c2410c' },
  horas_extra: { label: 'Horas extra', bg: '#d1fae5', color: '#065f46' },
};

// ─── Exportar XLSX ───────────────────────────────────────────────────────────
async function exportarXLSX(datos: ResumenEmpleado[], fi: string, ff: string, label: string) {
  const XLSX = await import('xlsx');

  const cols = [
    'No.', 'Nombre', 'Empresa', 'Departamento',
    'Días laborables', 'Asistió', 'Completos', 'Faltas', 'Faltas justif.',
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
    r.retardos,
    r.salidas_anticipadas,
    r.dias_incapacidad,
    r.puntualidad_pct / 100,   // formato porcentaje real para Excel
  ]);

  const ws = XLSX.utils.aoa_to_sheet([cols, ...rows]);

  // Ancho de columnas
  ws['!cols'] = [
    { wch: 8 }, { wch: 28 }, { wch: 22 }, { wch: 22 },
    { wch: 14 }, { wch: 10 }, { wch: 11 }, { wch: 8 }, { wch: 12 },
    { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
  ];

  // Formato porcentaje en columna M (índice 12, fila 2 en adelante)
  for (let i = 1; i <= rows.length; i++) {
    const cell = XLSX.utils.encode_cell({ r: i, c: 12 });
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

/** Convierte un Date a 'YYYY-MM-DD' en hora local */
function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Expande un rango [fechaNominal1, fechaNominal2] a semanas completas lun–dom,
 * tal como exige la STPS para periodos de nómina.
 *  - inicio: retrocede al lunes de la semana del día 1
 *  - fin: avanza al domingo de la semana del último día
 */
function semanaCompleta(fechaNominalInicio: Date, fechaNominalFin: Date): { fi: string; ff: string } {
  // Lunes de la semana de inicio (getDay: 0=dom,1=lun…6=sáb)
  const lunesDelta = (fechaNominalInicio.getDay() + 6) % 7; // días desde el lunes
  const lunes = new Date(fechaNominalInicio);
  lunes.setDate(lunes.getDate() - lunesDelta);

  // Domingo de la semana del fin
  const domingoDelta = (7 - fechaNominalFin.getDay()) % 7; // días hasta el domingo
  const domingo = new Date(fechaNominalFin);
  domingo.setDate(domingo.getDate() + domingoDelta);

  return { fi: toISO(lunes), ff: toISO(domingo) };
}

function quincenaActual(): { fi: string; ff: string; label: string; fiNominal: string; ffNominal: string } {
  const n = new Date();
  const y = n.getFullYear();
  const m = n.getMonth() + 1; // 1-12
  const d = n.getDate();
  const ultimo = new Date(y, m, 0).getDate();

  let fiNominalStr: string;
  let ffNominalStr: string;
  let label: string;

  if (d <= 15) {
    fiNominalStr = `${y}-${pad(m)}-01`;
    ffNominalStr = `${y}-${pad(m)}-15`;
    label = `1ª quincena de ${nombreMes(m)} ${y}`;
  } else {
    fiNominalStr = `${y}-${pad(m)}-16`;
    ffNominalStr = `${y}-${pad(m)}-${ultimo}`;
    label = `2ª quincena de ${nombreMes(m)} ${y}`;
  }

  const { fi, ff } = semanaCompleta(
    new Date(fiNominalStr + 'T12:00:00'),
    new Date(ffNominalStr + 'T12:00:00'),
  );

  return { fi, ff, label, fiNominal: fiNominalStr, ffNominal: ffNominalStr };
}

// ─── Componente ──────────────────────────────────────────────────────────────
export const ReportesAsistenciaPage = () => {
  const quincenaInicial = quincenaActual();
  const [fechaInicio, setFechaInicio] = useState(quincenaInicial.fi);
  const [fechaFin, setFechaFin] = useState(quincenaInicial.ff);
  const [quinLabel, setQuinLabel] = useState<string>(quincenaInicial.label);

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

  const buscar = useCallback(async () => {
    if (!fechaInicio || !fechaFin) return;
    setCargando(true);
    setBuscado(true);
    try {
      const params = new URLSearchParams({ fecha_inicio: fechaInicio, fecha_fin: fechaFin });
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
  }, [fechaInicio, fechaFin, filtroEmpresa, filtroDepto]);

  // Auto-generar al montar
  useEffect(() => { buscar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const verDetalle = async (emp: ResumenEmpleado) => {
    setDetalleEmp(emp);
    setDetalleData(null);
    setCargandoDetalle(true);
    try {
      const res = await api.get<DetalleEmpleado>(
        `/asistencia/reporte-detalle/${emp.empleado_id}?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`
      );
      setDetalleData(res.data);
    } catch { /* silencioso */ }
    finally { setCargandoDetalle(false); }
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
    retardos: acc.retardos + r.retardos,
    salidas: acc.salidas + r.salidas_anticipadas,
    incapacidades: acc.incapacidades + r.dias_incapacidad,
  }), { faltas: 0, faltas_j: 0, retardos: 0, salidas: 0, incapacidades: 0 });

  const badge = (n: number, bg: string, color: string) => (
    <span style={{ backgroundColor: bg, color, borderRadius: 5, padding: '2px 9px', fontSize: '0.78rem', fontWeight: 700 }}>{n}</span>
  );

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ marginBottom: '20px', fontSize: '1.4rem' }}>Reportes de Asistencia</h1>

      {/* ── Filtros ── */}
      <div style={{ backgroundColor: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: 20 }}>

        {/* Período: quincena actual + inputs editables */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>Período:</span>
            <span style={{ backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 6, padding: '4px 12px', fontSize: '0.82rem', fontWeight: 700 }}>
              📅 {quinLabel}
            </span>
            <span style={{ fontSize: '0.74rem', color: '#6b7280', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 5, padding: '3px 9px' }}>
              Semana completa (lun–dom) · STPS
            </span>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Desde</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={e => {
                  setFechaInicio(e.target.value);
                  setQuinLabel('Rango personalizado');
                }}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Hasta</label>
              <input
                type="date"
                value={fechaFin}
                onChange={e => {
                  setFechaFin(e.target.value);
                  setQuinLabel('Rango personalizado');
                }}
                style={inputStyle}
              />
            </div>
            {fechaInicio && fechaFin && fechaFin >= fechaInicio && (
              <span style={{ fontSize: '0.78rem', color: '#6b7280', paddingBottom: 2 }}>
                {Math.round((new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / 86400000) + 1} días
              </span>
            )}
            {/* Botón para volver a la quincena corriente */}
            {quinLabel !== quincenaActual().label && (
              <button
                type="button"
                onClick={() => {
                  const q = quincenaActual();
                  setFechaInicio(q.fi);
                  setFechaFin(q.ff);
                  setQuinLabel(q.label);
                }}
                style={{ padding: '7px 12px', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                ↩ Quincena actual
              </button>
            )}
          </div>
        </div>

        {/* Empresa, Departamento y botón generar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', borderTop: '1px solid #f3f4f6', paddingTop: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Empresa</label>
            <select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)} style={{ ...inputStyle, minWidth: 160 }}>
              <option value="">Todas</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Departamento</label>
            <select value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)} disabled={!filtroEmpresa} style={{ ...inputStyle, minWidth: 160, backgroundColor: !filtroEmpresa ? '#f9fafb' : 'white' }}>
              <option value="">Todos</option>
              {deptos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
          <button
            onClick={buscar}
            disabled={cargando}
            style={{ padding: '8px 24px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: 7, cursor: cargando ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem' }}
          >
            {cargando ? 'Generando...' : '🔍 Generar reporte'}
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
                  📅 <strong>{quinLabel}</strong> ({fechaInicio} → {fechaFin})
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
                  No. {detalleEmp.numero_empleado} · {detalleEmp.departamento || 'Sin depto.'} · {fechaInicio} al {fechaFin}
                </div>
              </div>
              <button onClick={() => setDetalleEmp(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#9ca3af' }}>×</button>
            </div>

            {/* Mini-resumen */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {[
                { l: 'Faltas', v: detalleEmp.faltas, bg: '#fee2e2', c: '#991b1b' },
                { l: 'F.Just.', v: detalleEmp.faltas_justificadas, bg: '#f5f3ff', c: '#7c3aed' },
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
                    </tr>
                  </thead>
                  <tbody>
                    {detalleData.dias.filter(d => !d.es_domingo).map(d => {
                      const bgRow = d.en_incapacidad ? '#f0f9ff' : d.es_festivo ? '#fff7ed' : d.incidencias.some(i => i.tipo === 'falta' && !i.justificada) ? '#fef2f2' : d.incidencias.some(i => i.tipo === 'retardo') ? '#fffbeb' : 'white';
                      return (
                        <tr key={d.fecha} style={{ backgroundColor: bgRow, borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ ...td, fontWeight: 600, fontSize: '0.8rem' }}>
                            {new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'short' })}
                          </td>
                          <td style={{ ...td, color: '#6b7280', fontSize: '0.78rem' }}>{d.dia_semana}</td>
                          <td style={td}>
                            {d.en_incapacidad ? (
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
                                      {s.label}{inc.justificada ? ' ✓' : ''}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td style={{ ...td, fontSize: '0.75rem', color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.incidencias.map(i => i.descripcion).filter(Boolean).join(' · ') || '—'}
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
