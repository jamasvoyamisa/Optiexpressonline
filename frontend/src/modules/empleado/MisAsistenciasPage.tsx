import { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { parseTimestampForMexico, toMexicoDateString } from '../../utils/date';
import api from '../../services/api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuth } from '../../hooks/useAuth';
import type { AsistenciaResponse, DiaContextoLaboral } from '../../types/api';

/** Quincena actual: 1–15 = quincena 1, 16–fin = quincena 2 */
function getQuincenaActual(): { year: number; month: number; num: 1 | 2 } {
  const d = new Date();
  const num = d.getDate() >= 16 ? 2 : 1;
  return { year: d.getFullYear(), month: d.getMonth(), num };
}

function getQuincenaRango(year: number, month: number, num: 1 | 2): { inicio: string; fin: string } {
  const m = String(month + 1).padStart(2, '0');
  if (num === 1) {
    return { inicio: `${year}-${m}-01T00:00:00`, fin: `${year}-${m}-15T23:59:59` };
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  return { inicio: `${year}-${m}-16T00:00:00`, fin: `${year}-${m}-${String(lastDay).padStart(2, '0')}T23:59:59` };
}

function formatQuincenaLabel(year: number, month: number, num: 1 | 2): string {
  const mesNombre = new Date(year, month, 1).toLocaleDateString('es-MX', { month: 'long' });
  const mesCorto = new Date(year, month, 1).toLocaleDateString('es-MX', { month: 'short' });
  const mesCapitalized = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);
  if (num === 1) return `1° quincena ${mesCapitalized} ${year} (1 - 15 ${mesCorto})`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return `2° quincena ${mesCapitalized} ${year} (16 - ${lastDay} ${mesCorto})`;
}

type DayRow = {
  key: string;
  fecha: string;
  fechaSort: string;
  entrada?: string;
  salida_comer?: string;
  regreso_comer?: string;
  salida?: string;
  primeraChecada?: number;
  ultimaChecada?: number;
  salidaComerTs?: number;
  regresoComerTs?: number;
  esTiempoExtra: boolean;
};

type DayRowConContexto = DayRow & { contexto?: DiaContextoLaboral };

function diasEnQuincena(year: number, month: number, num: 1 | 2): string[] {
  const last = num === 1 ? 15 : new Date(year, month + 1, 0).getDate();
  const start = num === 1 ? 1 : 16;
  const m = month + 1;
  const out: string[] = [];
  for (let d = start; d <= last; d++) {
    out.push(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

function mergeDayRowsWithContexto(
  q: { year: number; month: number; num: 1 | 2 },
  checadas: AsistenciaResponse[],
  contexto: DiaContextoLaboral[],
): DayRowConContexto[] {
  const byChecada = buildDayRows(checadas);
  const mapBy = new Map(byChecada.map((r) => [r.fechaSort, r]));
  const ctxMap = new Map(contexto.map((c) => [c.fecha.slice(0, 10), c]));
  const dias = diasEnQuincena(q.year, q.month, q.num).sort().reverse();
  return dias.map((fechaSort) => {
    const base = mapBy.get(fechaSort);
    const ctx = ctxMap.get(fechaSort);
    if (base) {
      return { ...base, contexto: ctx };
    }
    const d = new Date(`${fechaSort}T12:00:00`);
    const fechaStr = d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Mexico_City' });
    return {
      key: fechaSort,
      fecha: fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1),
      fechaSort,
      esTiempoExtra: false,
      contexto: ctx,
    };
  });
}

const th = { padding: '11px 13px', textAlign: 'left' as const, borderBottom: '2px solid #dee2e6', fontSize: '0.82rem', fontWeight: 600, color: '#555', backgroundColor: '#f8f9fa' };
const td = { padding: '10px 13px', borderBottom: '1px solid #f0f0f0', fontSize: '0.9rem' };

function buildDayRows(checadas: AsistenciaResponse[]): DayRow[] {
  const map = new Map<string, DayRow>();
  checadas.forEach((c) => {
    const d = parseTimestampForMexico(c.timestamp);
    const fechaSort = toMexicoDateString(d);
    const fechaStr = d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Mexico_City' });
    if (!map.has(fechaSort)) {
      map.set(fechaSort, { key: fechaSort, fecha: fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1), fechaSort, esTiempoExtra: !!c.es_tiempo_extra });
    }
    const row = map.get(fechaSort)!;
    const t = d.getTime();
    if (row.primeraChecada == null) row.primeraChecada = t;
    else row.primeraChecada = Math.min(row.primeraChecada, t);
    if (row.ultimaChecada == null) row.ultimaChecada = t;
    else row.ultimaChecada = Math.max(row.ultimaChecada, t);
    const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    if (c.tipo === 'entrada' && !row.entrada) row.entrada = hora;
    else if (c.tipo === 'salida_comer') { if (!row.salida_comer) { row.salida_comer = hora; row.salidaComerTs = t; } }
    else if (c.tipo === 'regreso_comer') { if (!row.regreso_comer) { row.regreso_comer = hora; row.regresoComerTs = t; } }
    else if (c.tipo === 'salida' && !row.salida) row.salida = hora;
  });
  const rows = Array.from(map.values());
  rows.sort((a, b) => b.fechaSort.localeCompare(a.fechaSort));
  return rows;
}

function calcTotal(row: DayRow): string {
  const primera = row.primeraChecada;
  const ultima = row.ultimaChecada;
  if (primera == null || ultima == null || ultima <= primera) return '--';
  let totalMs = ultima - primera;
  if (row.salidaComerTs != null && row.regresoComerTs != null && row.regresoComerTs > row.salidaComerTs) {
    totalMs -= row.regresoComerTs - row.salidaComerTs;
  }
  const mins = Math.floor(totalMs / 60000);
  if (mins < 0) return '--';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export const MisAsistenciasPage = () => {
  const { authMe } = useAuth();
  const isMobile = useIsMobile();
  if (authMe?.exento_incidencias) {
    return <Navigate to="/" replace />;
  }
  const [checadas, setChecadas] = useState<AsistenciaResponse[]>([]);
  const [contextoDias, setContextoDias] = useState<DiaContextoLaboral[]>([]);
  const [loading, setLoading] = useState(true);
  const [quincena, setQuincena] = useState<{ year: number; month: number; num: 1 | 2 }>(() => getQuincenaActual());

  const load = () => {
    setLoading(true);
    const { inicio, fin } = getQuincenaRango(quincena.year, quincena.month, quincena.num);
    const params = new URLSearchParams();
    params.set('limit', '500');
    params.set('fecha_inicio', inicio);
    params.set('fecha_fin', fin);
    const pCtx = new URLSearchParams();
    pCtx.set('fecha_inicio', inicio.slice(0, 10));
    pCtx.set('fecha_fin', fin.slice(0, 10));
    Promise.all([
      api.get<AsistenciaResponse[]>(`/asistencia/mis-checadas?${params}`),
      api.get<DiaContextoLaboral[]>(`/asistencia/mis-contexto-dias?${pCtx}`),
    ])
      .then(([checRes, ctxRes]) => {
        setChecadas(Array.isArray(checRes.data) ? checRes.data : []);
        setContextoDias(Array.isArray(ctxRes.data) ? ctxRes.data : []);
      })
      .catch(() => {
        setChecadas([]);
        setContextoDias([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [quincena.year, quincena.month, quincena.num]);

  const dayRows = useMemo(
    () => mergeDayRowsWithContexto(quincena, checadas, contextoDias),
    [quincena, checadas, contextoDias],
  );

  const navBtn: React.CSSProperties = {
    background: 'white',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    width: isMobile ? 36 : 32,
    height: isMobile ? 36 : 32,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: isMobile ? '1.1rem' : '1rem',
    fontWeight: 800,
    color: '#374151',
    flexShrink: 0,
  };

  return (
    <div style={{ padding: isMobile ? '14px 14px 30px' : '24px' }}>
      <h1 style={{ marginBottom: '14px', fontSize: isMobile ? '1.2rem' : '1.6rem' }}>Mis asistencias</h1>

      {/* Navegación de quincena */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            style={navBtn}
            aria-label="Quincena anterior"
            onClick={() => {
              if (quincena.num === 1) {
                const pm = quincena.month - 1;
                setQuincena({ year: pm < 0 ? quincena.year - 1 : quincena.year, month: pm < 0 ? 11 : pm, num: 2 });
              } else {
                setQuincena({ ...quincena, num: 1 });
              }
            }}
          >
            ‹
          </button>
          <span
            style={{
              fontSize: isMobile ? '0.82rem' : '0.9rem',
              fontWeight: 700,
              color: '#0369a1',
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: 6,
              padding: isMobile ? '6px 10px' : '4px 12px',
              textAlign: 'center',
            }}
          >
            {formatQuincenaLabel(quincena.year, quincena.month, quincena.num)}
          </span>
          <button
            type="button"
            style={navBtn}
            aria-label="Quincena siguiente"
            onClick={() => {
              if (quincena.num === 2) {
                const nm = quincena.month + 1;
                setQuincena({ year: nm > 11 ? quincena.year + 1 : quincena.year, month: nm > 11 ? 0 : nm, num: 1 });
              } else {
                setQuincena({ ...quincena, num: 2 });
              }
            }}
          >
            ›
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#666' }}>Cargando asistencias...</p>
      ) : isMobile ? (
        /* ── Vista móvil: tarjetas ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {dayRows.map((row) => (
            <div key={row.key} style={{
              backgroundColor: row.esTiempoExtra ? '#fff8e1' : 'white',
              borderRadius: 14, padding: '12px 14px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
              border: `1.5px solid ${row.esTiempoExtra ? '#ffe082' : (!row.entrada && !row.salida ? '#f1f5f9' : '#e5e7eb')}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, color: '#1e3a5f', fontSize: '0.92rem' }}>{row.fecha}</span>
                  {row.contexto && (
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3, lineHeight: 1.3 }}>
                      {row.contexto.etiqueta}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  {row.esTiempoExtra && (
                    <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700, backgroundColor: '#ff9800', color: '#fff' }}>T.EXTRA</span>
                  )}
                  <span style={{ fontWeight: 800, color: row.entrada && row.salida ? '#0ea5e9' : '#9ca3af', fontSize: '1rem' }}>{calcTotal(row)}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5 }}>
                {[
                  { label: '↓ Entrada', val: row.entrada, color: '#155724', bg: '#e8f5e9' },
                  { label: '🍽 Sal.', val: row.salida_comer, color: '#856404', bg: '#fff8e1' },
                  { label: '🔙 Reg.', val: row.regreso_comer, color: '#004085', bg: '#e3f2fd' },
                  { label: '↑ Salida', val: row.salida, color: '#721c24', bg: '#fce4ec' },
                ].map(({ label, val, color, bg }) => (
                  <div key={label} style={{ backgroundColor: bg, borderRadius: 8, padding: '5px 4px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.58rem', color: '#888', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: val ? color : '#d1d5db' }}>{val || '--:--'}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p style={{ marginTop: 4, color: '#888', fontSize: '0.82rem', textAlign: 'center' }}>
            {dayRows.length} día{dayRows.length !== 1 ? 's' : ''} · {checadas.length} checada{checadas.length !== 1 ? 's' : ''}
          </p>
        </div>
      ) : (
        /* ── Vista desktop: tabla ── */
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={{ ...th, minWidth: 200 }}>Tipo de día</th>
                <th style={{ ...th, textAlign: 'center', color: '#155724', backgroundColor: '#e8f5e9' }}>Entrada</th>
                <th style={{ ...th, textAlign: 'center', color: '#856404', backgroundColor: '#fff8e1' }}>Salida comer</th>
                <th style={{ ...th, textAlign: 'center', color: '#004085', backgroundColor: '#e3f2fd' }}>Regreso comer</th>
                <th style={{ ...th, textAlign: 'center', color: '#721c24', backgroundColor: '#fce4ec' }}>Salida</th>
                <th style={{ ...th, textAlign: 'center' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {dayRows.map((row) => (
                <tr key={row.key} style={{ borderBottom: '1px solid #eee', backgroundColor: row.esTiempoExtra ? '#fff8e1' : undefined }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = row.esTiempoExtra ? '#fff3cd' : '#f8f9fa')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = row.esTiempoExtra ? '#fff8e1' : '')}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {row.fecha}
                    {row.esTiempoExtra && (
                      <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, backgroundColor: '#ff9800', color: 'white' }}>T. EXTRA</span>
                    )}
                  </td>
                  <td style={{ ...td, fontSize: '0.85rem', color: '#334155', lineHeight: 1.35, verticalAlign: 'top' }}>
                    {row.contexto?.etiqueta ?? '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: row.entrada ? '#155724' : '#ccc' }}>{row.entrada || '--:--'}</td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: row.salida_comer ? '#856404' : '#ccc' }}>{row.salida_comer || '--:--'}</td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: row.regreso_comer ? '#004085' : '#ccc' }}>{row.regreso_comer || '--:--'}</td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: row.salida ? '#721c24' : '#ccc' }}>{row.salida || '--:--'}</td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{calcTotal(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: '8px', color: '#888', fontSize: '0.82rem' }}>
            {dayRows.length} día{dayRows.length !== 1 ? 's' : ''} · {checadas.length} checada{checadas.length !== 1 ? 's' : ''} en el rango seleccionado
          </p>
        </div>
      )}
    </div>
  );
};
