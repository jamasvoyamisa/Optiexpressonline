import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useIsMobile } from '../../hooks/useIsMobile';

interface Solicitud {
  id: number;
  empleado_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_solicitados: number;
  motivo?: string | null;
  estado: string;
  jefe_aprobador_id?: number | null;
  jefe_aprobador_nombre?: string | null;
  fecha_aprobacion?: string | null;
  comentarios_aprobacion?: string | null;
  created_at: string;
}

interface PeriodoVacaciones {
  anios_antiguedad: number;
  dias_derecho: number;
  dias_tomados: number;
  dias_disponibles: number;
  fecha_aniversario?: string | null;
  fecha_limite_goce?: string | null;
}

interface Balance {
  año: number;
  dias_disponibles: number;
  dias_tomados: number;
  dias_pendientes: number;
  periodo_actual?: PeriodoVacaciones | null;
  periodo_anterior?: PeriodoVacaciones | null;
  fecha_limite_goce?: string | null;
}

type TabKey = 'nueva' | 'pendientes' | 'registros';

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '12px 20px',
  cursor: 'pointer',
  border: 'none',
  borderBottom: active ? '3px solid #0ea5e9' : '3px solid transparent',
  backgroundColor: 'transparent',
  fontWeight: active ? 700 : 400,
  fontSize: '0.95rem',
  color: active ? '#0ea5e9' : '#666',
});

const th = { padding: '11px 13px', textAlign: 'left' as const, borderBottom: '2px solid #dee2e6', fontSize: '0.82rem', fontWeight: 600, color: '#555', backgroundColor: '#f8f9fa' };
const td = { padding: '10px 13px', borderBottom: '1px solid #f0f0f0', fontSize: '0.9rem' };

// Días en México: festivos y santoral (clave "mes-día", 1-12, 1-31)
const MEXICO_DAY_LABELS: Record<string, string> = {
  '1-1': 'Año Nuevo', '1-6': 'Día de Reyes', '1-17': 'San Antonio',
  '2-2': 'Candelaria', '2-5': 'Constitución', '2-14': 'San Valentín', '2-19': 'Día del Ejército',
  '3-8': 'Día de la Mujer', '3-19': 'San José', '3-21': 'Natalicio B. Juárez',
  '4-30': 'Día del Niño', '5-1': 'Día del Trabajo', '5-5': 'Batalla de Puebla', '5-10': 'Día de las Madres', '5-15': 'San Isidro',
  '6-1': 'Día de la Marina', '6-24': 'San Juan', '6-29': 'San Pedro y San Pablo',
  '7-16': 'Virgen del Carmen', '7-25': 'Santiago Apóstol',
  '8-15': 'Asunción', '8-24': 'San Bartolomé',
  '9-8': 'Natividad María', '9-16': 'Día Independencia', '9-29': 'San Miguel',
  '10-4': 'San Francisco', '10-12': 'Virgen del Pilar', '10-31': 'Halloween',
  '11-1': 'Todos los Santos', '11-2': 'Día de Muertos', '11-20': 'Revolución Mexicana', '11-22': 'Santa Cecilia',
  '12-8': 'Inmaculada Concepción', '12-12': 'Virgen de Guadalupe', '12-24': 'Nochebuena', '12-25': 'Navidad', '12-28': 'Santos Inocentes',
};
function getMexicoLabel(month: number, day: number): string | null {
  return MEXICO_DAY_LABELS[`${month + 1}-${day}`] ?? null;
}

interface DiaFestivo {
  id: number;
  fecha: string;  // 'YYYY-MM-DD'
  nombre: string;
  tipo: string;
  activo: boolean;
}

export const MisVacacionesPage = () => {
  const isMobile = useIsMobile();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('nueva');
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [modalSolicitar, setModalSolicitar] = useState(false);
  const [modalRechazo, setModalRechazo] = useState<{ motivo: string | null; comentario: string | null } | null>(null);
  const [modalCancelar, setModalCancelar] = useState<Solicitud | null>(null);
  const [cancelando, setCancelando] = useState(false);
  // Festivos: Set de strings 'YYYY-MM-DD' activos, y mapa fecha→nombre
  const [festivosSet, setFestivosSet] = useState<Set<string>>(new Set());
  const [festivosNombre, setFestivosNombre] = useState<Record<string, string>>({});

  const loadFestivos = (year: number) => {
    api.get<DiaFestivo[]>(`/asistencia/festivos?año=${year}&solo_activos=true`)
      .then(res => {
        const arr = Array.isArray(res.data) ? res.data : [];
        setFestivosSet(new Set(arr.map(f => f.fecha)));
        setFestivosNombre(Object.fromEntries(arr.map(f => [f.fecha, f.nombre])));
      })
      .catch(() => {});
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Solicitud[]>('/vacaciones/mis-solicitudes?limit=500'),
      api.get<Balance>('/vacaciones/mi-balance'),
    ])
      .then(([solRes, balRes]) => {
        setSolicitudes(Array.isArray(solRes.data) ? solRes.data : []);
        const b = balRes.data as Balance | null;
        if (b) setBalance({ ...b, año: (b as Balance).año ?? new Date().getFullYear() });
        else setBalance(null);
      })
      .catch(() => {
        setSolicitudes([]);
        setBalance(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    loadFestivos(new Date().getFullYear());
  }, []);


  const submitDesdeModal = () => {
    const start = rangeStart || rangeEnd;
    const end = rangeEnd || rangeStart;
    if (!start || !end) return;
    if (isPast(start)) {
      alert('La fecha de inicio no puede ser anterior al día de hoy.');
      return;
    }
    setSending(true);
    api
      .post('/vacaciones/mis-solicitudes', {
        fecha_inicio: new Date(start + 'T12:00:00').toISOString(),
        fecha_fin: new Date(end + 'T12:00:00').toISOString(),
        motivo: motivo.trim() || null,
      })
      .then(() => {
        setModalSolicitar(false);
        setRangeStart(null);
        setRangeEnd(null);
        setMotivo('');
        load();
        setActiveTab('pendientes');
      })
      .catch((err) => alert(err.response?.data?.detail || 'Error al crear la solicitud'))
      .finally(() => setSending(false));
  };

  // Calendario: lunes = 0, domingo = 6 (no elegible)
  const weekDaysFull = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const weekDaysShort = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const firstOfMonth = new Date(calYear, calMonth, 1);
  const lastOfMonth = new Date(calYear, calMonth + 1, 0);
  const startPad = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = lastOfMonth.getDate();
  const totalCells = startPad + daysInMonth;
  void Math.ceil(totalCells / 7); // rows — no se usa actualmente

  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  const todayLocal = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();
  const isSunday = (y: number, m: number, day: number) => new Date(y, m, day).getDay() === 0;
  const isPast = (iso: string) => iso < todayLocal;

  const registros = solicitudes.filter((s) => s.estado === 'aprobada');
  // Incluye: pendiente de jefe, pendiente de RH (aprobada_jefe) y rechazadas
  const pendientes = solicitudes.filter((s) =>
    s.estado === 'pendiente' || s.estado === 'aprobada_jefe' || s.estado === 'rechazada'
  );
  const isDiaTomado = (iso: string) =>
    registros.some((s) => {
      const start = s.fecha_inicio.slice(0, 10);
      const end = s.fecha_fin.slice(0, 10);
      return iso >= start && iso <= end;
    });

  const handleDayClick = (iso: string, isSundayDay: boolean, isPastDay: boolean, isTomado: boolean) => {
    if (isSundayDay || isPastDay || isTomado) return;
    if (!rangeStart) {
      setRangeStart(iso);
      setRangeEnd(null);
      return;
    }
    const end = rangeEnd || rangeStart;
    if (!rangeEnd) {
      if (iso < rangeStart) {
        setRangeStart(iso);
        setRangeEnd(rangeStart);
      } else {
        setRangeEnd(iso);
      }
      return;
    }
    // Clic en un día ya seleccionado: deseleccionar todo el rango
    if (iso >= rangeStart && iso <= end) {
      setRangeStart(null);
      setRangeEnd(null);
      return;
    }
    if (iso < rangeStart) setRangeStart(iso);
    else if (iso > end) setRangeEnd(iso);
  };

  const isInRange = (iso: string) => {
    if (!rangeStart) return false;
    const end = rangeEnd || rangeStart;
    return iso >= rangeStart && iso <= end;
  };


  const selectedCount = (() => {
    if (!rangeStart) return 0;
    const end = rangeEnd || rangeStart;
    let count = 0;
    const [sy, sm, sd] = rangeStart.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const startD = new Date(sy, sm - 1, sd);
    const endD = new Date(ey, em - 1, ed);
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0) continue; // domingo
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (festivosSet.has(iso)) continue; // festivo
      count++;
    }
    return count;
  })();

  const cancelarSolicitud = () => {
    if (!modalCancelar) return;
    setCancelando(true);
    api.put(`/vacaciones/mis-solicitudes/${modalCancelar.id}/cancelar`)
      .then(() => {
        setModalCancelar(null);
        load();
      })
      .catch(err => alert(err.response?.data?.detail || 'Error al cancelar la solicitud'))
      .finally(() => setCancelando(false));
  };

  return (
    <div style={{ padding: isMobile ? '14px' : '24px' }}>
      <h1 style={{ marginBottom: '16px', fontSize: isMobile ? '1.3rem' : '1.6rem' }}>Vacaciones</h1>

      {/* Tarjetas siempre visibles */}
      {balance && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '18px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '4px' }}>Días disponibles</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#15803d' }}>{Number(balance.dias_disponibles)}</div>
          </div>
          <div style={{ padding: '18px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '4px' }}>Días tomados</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0369a1' }}>{Number(balance.dias_tomados)}</div>
          </div>
          <div style={{ padding: '18px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '4px' }}>Pendientes (solicitados)</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#b45309' }}>{Number(balance.dias_pendientes)}</div>
          </div>
          <div style={{ padding: '18px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '8px' }}>Por vencer</div>
            {(() => {
              const porVencer: PeriodoVacaciones[] = [];
              if (balance.periodo_anterior && Number(balance.periodo_anterior.dias_disponibles) > 0) {
                porVencer.push(balance.periodo_anterior);
              }
              if (porVencer.length === 0) {
                return <div style={{ fontSize: '0.9rem', color: '#888' }}>Ningún periodo por prescribir</div>;
              }
              return (
                <div style={{ fontSize: '0.9rem' }}>
                  {porVencer.map((p, idx) => (
                    <div key={idx} style={{ marginBottom: idx < porVencer.length - 1 ? '8px' : 0 }}>
                      <span style={{ fontWeight: 700, color: '#b91c1c' }}>{Number(p.dias_disponibles)} día{Number(p.dias_disponibles) !== 1 ? 's' : ''}</span>
                      <span style={{ color: '#555' }}> ({p.anios_antiguedad} año{p.anios_antiguedad !== 1 ? 's' : ''})</span>
                      {p.fecha_limite_goce && (
                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
                          Vencen: {new Date(p.fecha_limite_goce + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'short' })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Pestañas debajo de las tarjetas */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '20px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        <button style={{ ...tabStyle(activeTab === 'nueva'), padding: isMobile ? '10px 14px' : '12px 20px', fontSize: isMobile ? '0.85rem' : '0.95rem' }} onClick={() => setActiveTab('nueva')}>
          Nueva Solicitud
        </button>
        <button style={{ ...tabStyle(activeTab === 'pendientes'), padding: isMobile ? '10px 14px' : '12px 20px', fontSize: isMobile ? '0.85rem' : '0.95rem' }} onClick={() => setActiveTab('pendientes')}>
          Solicitudes Pendientes
        </button>
        <button style={{ ...tabStyle(activeTab === 'registros'), padding: isMobile ? '10px 14px' : '12px 20px', fontSize: isMobile ? '0.85rem' : '0.95rem' }} onClick={() => setActiveTab('registros')}>
          Vacaciones Ejercidas
        </button>
      </div>

      {/* Tab Registros: vacaciones ya tomadas (aprobadas) - estilo asistencia, con quien autorizó y fecha autorización */}
      {activeTab === 'registros' && (
        <>
          {loading && solicitudes.length === 0 ? (
            <p style={{ color: '#666' }}>Cargando...</p>
          ) : registros.length === 0 ? (
            <p style={{ color: '#666', padding: '24px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              No tienes vacaciones tomadas (aprobadas) registradas.
            </p>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {registros.map((s) => {
                const completada = s.fecha_fin.slice(0, 10) < todayLocal;
                return (
                  <div key={s.id} style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontWeight: 700, color: '#1e3a5f' }}>
                        {new Date(s.fecha_inicio).toLocaleDateString('es-MX', { dateStyle: 'short' })} — {new Date(s.fecha_fin).toLocaleDateString('es-MX', { dateStyle: 'short' })}
                      </div>
                      <span style={{ fontWeight: 700, color: '#374151' }}>{s.dias_solicitados} días</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '8px' }}>
                      Autorizó: {s.jefe_aprobador_nombre || '—'}
                      {s.comentarios_aprobacion && <div style={{ marginTop: '2px' }}>{s.comentarios_aprobacion}</div>}
                    </div>
                    {completada
                      ? <span style={{ backgroundColor: '#d1fae5', color: '#065f46', borderRadius: 5, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600 }}>Completada</span>
                      : <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: 5, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600 }}>Programada</span>
                    }
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <thead>
                  <tr>
                    <th style={th}>Fecha inicio</th>
                    <th style={th}>Fecha fin</th>
                    <th style={{ ...th, textAlign: 'center' }}>Días</th>
                    <th style={th}>Autorizó</th>
                    <th style={th}>Fecha autorización</th>
                    <th style={th}>Comentarios</th>
                    <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((s) => {
                    const completada = s.fecha_fin.slice(0, 10) < todayLocal;
                    return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={td}>{new Date(s.fecha_inicio).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                      <td style={td}>{new Date(s.fecha_fin).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{s.dias_solicitados}</td>
                      <td style={td}>{s.jefe_aprobador_nombre || '—'}</td>
                      <td style={td}>{s.fecha_aprobacion ? new Date(s.fecha_aprobacion).toLocaleDateString('es-MX', { dateStyle: 'short' }) : '—'}</td>
                      <td style={{ ...td, color: '#555' }}>{s.comentarios_aprobacion || '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {completada
                          ? <span style={{ backgroundColor: '#d1fae5', color: '#065f46', borderRadius: 5, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Completada</span>
                          : <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: 5, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Programada</span>
                        }
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ marginTop: '8px', color: '#888', fontSize: '0.82rem' }}>
                {registros.length} registro{registros.length !== 1 ? 's' : ''} de vacaciones tomadas
              </p>
            </div>
          )}
        </>
      )}

      {/* Tab Pendientes */}
      {activeTab === 'pendientes' && (
        <>
          {loading && solicitudes.length === 0 ? (
            <p style={{ color: '#666' }}>Cargando...</p>
          ) : pendientes.length === 0 ? (
            <p style={{ color: '#666', padding: '24px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              No tienes solicitudes en proceso ni rechazadas.
            </p>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pendientes.map((s) => (
                <div key={s.id} style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: '0.95rem' }}>
                      {new Date(s.fecha_inicio).toLocaleDateString('es-MX', { dateStyle: 'short' })} — {new Date(s.fecha_fin).toLocaleDateString('es-MX', { dateStyle: 'short' })}
                      <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: '6px', fontSize: '0.85rem' }}>{s.dias_solicitados} días</span>
                    </div>
                    {s.estado === 'pendiente' && <span style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 5, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Pendiente</span>}
                    {s.estado === 'aprobada_jefe' && <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: 5, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>En revisión RH</span>}
                    {s.estado === 'rechazada' && <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 5, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Rechazada</span>}
                  </div>
                  {s.motivo && <p style={{ margin: '0 0 8px', fontSize: '0.83rem', color: '#6b7280' }}>{s.motivo}</p>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {s.estado === 'rechazada' && (
                      <button onClick={() => setModalRechazo({ motivo: s.motivo ?? null, comentario: s.comentarios_aprobacion ?? null })}
                        style={{ padding: '7px 14px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                        Ver motivo
                      </button>
                    )}
                    {s.estado === 'pendiente' && (
                      <button onClick={() => setModalCancelar(s)}
                        style={{ padding: '7px 14px', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                        Cancelar solicitud
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <thead>
                  <tr>
                    <th style={th}>Fecha inicio</th>
                    <th style={th}>Fecha fin</th>
                    <th style={{ ...th, textAlign: 'center' }}>Días</th>
                    <th style={th}>Motivo</th>
                    <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                    <th style={{ ...th, textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={td}>{new Date(s.fecha_inicio).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                      <td style={td}>{new Date(s.fecha_fin).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{s.dias_solicitados}</td>
                      <td style={{ ...td, color: '#555' }}>{s.motivo || '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {s.estado === 'pendiente' && <span style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 5, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Pendiente de Aprobación</span>}
                        {s.estado === 'aprobada_jefe' && <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: 5, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>En revisión RH</span>}
                        {s.estado === 'rechazada' && <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 5, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Rechazada</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                          {s.estado === 'rechazada' && (
                            <button onClick={() => setModalRechazo({ motivo: s.motivo ?? null, comentario: s.comentarios_aprobacion ?? null })}
                              style={{ padding: '4px 10px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                              Ver
                            </button>
                          )}
                          {s.estado === 'pendiente' && (
                            <button onClick={() => setModalCancelar(s)}
                              style={{ padding: '4px 10px', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              Cancelar
                            </button>
                          )}
                          {s.estado !== 'rechazada' && s.estado !== 'pendiente' && <span style={{ color: '#d1d5db' }}>—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Tab Nueva solicitud: calendario a ancho total + botón Solicitar + modal */}
      {activeTab === 'nueva' && (
        <div style={{ width: '100%' }}>
          {/* Barra superior: título + botón Solicitar (solo si hay selección) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Selecciona el período de vacaciones</h2>
            {balance && Number(balance.dias_disponibles) - Number(balance.dias_pendientes) <= 0 && (
              <span style={{ color: '#b91c1c', fontWeight: 600, fontSize: '0.9rem' }}>
                No tienes días disponibles para solicitar
              </span>
            )}
            {rangeStart && Number(balance?.dias_disponibles ?? 0) - Number(balance?.dias_pendientes ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => setModalSolicitar(true)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '1rem',
                }}
              >
                Solicitar
              </button>
            )}
          </div>

          {/* Navegación: flechas al lado del mes, grupo centrado */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '12px' }}>
            <button
              type="button"
              onClick={() => {
                if (calMonth === 0) {
                  setCalMonth(11); setCalYear(calYear - 1);
                  loadFestivos(calYear - 1);
                } else setCalMonth(calMonth - 1);
              }}
              style={{ padding: '8px 14px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
            >
              ←
            </button>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937' }}>
              {firstOfMonth.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }).replace(/^\w/, (c) => c.toUpperCase())}
            </span>
            <button
              type="button"
              onClick={() => {
                if (calMonth === 11) {
                  setCalMonth(0); setCalYear(calYear + 1);
                  loadFestivos(calYear + 1);
                } else setCalMonth(calMonth + 1);
              }}
              style={{ padding: '8px 14px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
            >
              →
            </button>
          </div>

          {/* Calendario */}
          <div style={{ backgroundColor: '#f1f5f9', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '20px', width: '100%', padding: isMobile ? '6px' : '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: isMobile ? '2px' : '4px', marginBottom: isMobile ? '4px' : '8px' }}>
              {(isMobile ? weekDaysShort : weekDaysFull).map((w) => (
                <div
                  key={w}
                  style={{
                    minHeight: isMobile ? '28px' : '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    backgroundColor: '#0369a1',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.7rem' : '0.85rem',
                    color: 'white',
                  }}
                >
                  {w}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: isMobile ? '52px' : '88px', gap: isMobile ? '2px' : '4px', padding: 0 }}>
              {Array.from({ length: startPad }, (_, i) => (
                <div key={`pad-${i}`} style={{ minHeight: '80px' }} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const iso = toISO(new Date(calYear, calMonth, day));
                const sun = isSunday(calYear, calMonth, day);
                const past = isPast(iso);
                const yaTomado = isDiaTomado(iso);
                const esFestivo = festivosSet.has(iso);
                const festivoNombre = festivosNombre[iso] ?? null;
                // Festivos y domingos son no elegibles (no se pueden seleccionar)
                const noElegible = sun || past || yaTomado || esFestivo;
                const inRange = isInRange(iso);
                const mexicoLabel = festivoNombre ?? getMexicoLabel(calMonth, day);

                // Colores: festivo (naranja), pasado (gris), domingo (violeta), ya tomado (azul), en rango (verde), normal
                const bg =
                  past
                    ? '#f3f4f6'
                    : esFestivo
                      ? '#fff7ed'
                      : sun
                        ? '#f5f3ff'
                        : yaTomado
                          ? '#e0f2fe'
                          : inRange
                            ? '#dcfce7'
                            : '#fff';
                const fg =
                  past
                    ? '#9ca3af'
                    : esFestivo
                      ? '#c2410c'
                      : sun
                        ? '#8b7fa8'
                        : yaTomado
                          ? '#0369a1'
                          : inRange
                            ? '#15803d'
                            : '#1f2937';
                const labelColor = past ? '#9ca3af' : esFestivo ? '#ea580c' : sun ? '#8b7fa8' : yaTomado ? '#1e3a8a' : inRange ? '#15803d' : '#6b7280';
                return (
                  <button
                    key={iso}
                    type="button"
                    title={mexicoLabel ? (esFestivo ? `🎉 ${mexicoLabel}` : mexicoLabel) : undefined}
                    onClick={() => handleDayClick(iso, sun, past, yaTomado || esFestivo)}
                    disabled={noElegible}
                    style={{
                      height: '100%',
                      minHeight: isMobile ? '52px' : '88px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      paddingTop: isMobile ? '6px' : '10px',
                      paddingBottom: '4px',
                      paddingLeft: '2px',
                      paddingRight: '2px',
                      borderRadius: isMobile ? '6px' : '10px',
                      border: esFestivo ? '2px solid #fb923c' : '1px solid #e5e7eb',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      fontSize: isMobile ? '0.85rem' : '1rem',
                      fontWeight: 700,
                      cursor: noElegible ? 'not-allowed' : 'pointer',
                      backgroundColor: bg,
                      color: fg,
                      opacity: noElegible ? 0.85 : 1,
                      overflow: 'hidden',
                    }}
                  >
                    <span style={{ lineHeight: 1 }}>{day}</span>
                    {mexicoLabel && !isMobile && (
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: esFestivo ? 700 : 500,
                        color: labelColor,
                        marginTop: '4px',
                        lineHeight: 1.2,
                        textAlign: 'center',
                        width: '100%',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical' as const,
                        wordBreak: 'break-word',
                      }}>
                        {esFestivo ? `🎉 ${mexicoLabel}` : mexicoLabel}
                      </span>
                    )}
                    {isMobile && esFestivo && (
                      <span style={{ fontSize: '0.6rem', marginTop: '2px', lineHeight: 1 }}>🎉</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar solicitud (inicio, regreso, días a tomar, motivo) */}
      {modalSolicitar && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => !sending && setModalSolicitar(false)}
          role="presentation"
        >
          <div
            style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', maxWidth: '420px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.2rem' }}>Confirmar solicitud de vacaciones</h2>
            <dl style={{ margin: '0 0 16px 0', fontSize: '0.95rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <dt style={{ color: '#666', fontWeight: 500 }}>Inicio</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>{rangeStart ? new Date(rangeStart + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' }) : '—'}</dd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <dt style={{ color: '#666', fontWeight: 500 }}>Regreso</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>{(rangeEnd || rangeStart) ? new Date((rangeEnd || rangeStart) + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' }) : '—'}</dd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <dt style={{ color: '#666', fontWeight: 500 }}>Días a tomar</dt>
                <dd style={{ margin: 0, fontWeight: 600, color: '#15803d' }}>{selectedCount} día{selectedCount !== 1 ? 's' : ''}</dd>
              </div>
              {balance && selectedCount > Number(balance.dias_disponibles) - Number(balance.dias_pendientes) && (
                <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 500 }}>
                  No puedes solicitar más de {Number(balance.dias_disponibles) - Number(balance.dias_pendientes)} días. Tienes {Number(balance.dias_disponibles)} disponibles y {Number(balance.dias_pendientes)} ya en solicitudes pendientes.
                </div>
              )}
            </dl>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.9rem' }}>Motivo (opcional)</label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="Ej. vacaciones familiares"
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', resize: 'vertical', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => !sending && setModalSolicitar(false)}
                style={{ padding: '10px 20px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitDesdeModal}
                disabled={sending || (!!balance && selectedCount > Number(balance.dias_disponibles) - Number(balance.dias_pendientes))}
                style={{ padding: '10px 20px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: sending ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: (!!balance && selectedCount > Number(balance.dias_disponibles) - Number(balance.dias_pendientes)) ? 0.6 : 1 }}
              >
                {sending ? 'Enviando...' : 'Confirmar solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar cancelación */}
      {modalCancelar && (
        <div
          onClick={() => !cancelando && setModalCancelar(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: 'white', borderRadius: 10, padding: 28, width: 400, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: '1.3rem' }}>⚠️</span>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#92400e' }}>
                Cancelar solicitud de vacaciones
              </h3>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: '#374151' }}>
              ¿Estás seguro de que deseas cancelar tu solicitud de vacaciones del{' '}
              <strong>{new Date(modalCancelar.fecha_inicio).toLocaleDateString('es-MX', { dateStyle: 'long' })}</strong>{' '}
              al{' '}
              <strong>{new Date(modalCancelar.fecha_fin).toLocaleDateString('es-MX', { dateStyle: 'long' })}</strong>?
            </p>
            <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: '#6b7280', backgroundColor: '#f9fafb', padding: '8px 12px', borderRadius: 6 }}>
              Los <strong>{modalCancelar.dias_solicitados} días</strong> solicitados regresarán a tu saldo disponible.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => !cancelando && setModalCancelar(null)}
                disabled={cancelando}
                style={{ padding: '9px 20px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, cursor: cancelando ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              >
                Volver
              </button>
              <button
                type="button"
                onClick={cancelarSolicitud}
                disabled={cancelando}
                style={{ padding: '9px 20px', backgroundColor: '#ea580c', color: 'white', border: 'none', borderRadius: 6, cursor: cancelando ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              >
                {cancelando ? 'Cancelando...' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: motivo de rechazo */}
      {modalRechazo && (
        <div
          onClick={() => setModalRechazo(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: 'white', borderRadius: 10, padding: 28, width: 420, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: '1.3rem' }}>❌</span>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#991b1b' }}>
                Solicitud rechazada
              </h3>
            </div>

            {modalRechazo.motivo && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ margin: '0 0 4px', fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Motivo de la solicitud
                </p>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151', backgroundColor: '#f9fafb', padding: '8px 12px', borderRadius: 6 }}>
                  {modalRechazo.motivo}
                </p>
              </div>
            )}

            <div>
              <p style={{ margin: '0 0 4px', fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Comentario de rechazo
              </p>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151', backgroundColor: '#fef2f2', padding: '10px 12px', borderRadius: 6, border: '1px solid #fecaca', minHeight: 48 }}>
                {modalRechazo.comentario || 'Sin comentarios adicionales.'}
              </p>
            </div>

            <div style={{ textAlign: 'right', marginTop: 20 }}>
              <button
                onClick={() => setModalRechazo(null)}
                style={{ padding: '8px 22px', backgroundColor: '#374151', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
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
