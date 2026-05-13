import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useIsMobile';

interface AsistenciaGraficaItem {
  label: string;
  personal: number;
  con_asistencia: number;
}

interface DashboardData {
  empleados: { total: number; activos: number; inactivos: number; baja: number };
  empresas: number;
  departamentos: number;
  checadas_mes_actual: number;
  incidencias_mes_actual: number;
  checadas_por_mes: { mes: string; label: string; checadas: number }[];
  solo_mi_area?: boolean;
  asistencia_grafica?: { tipo: string; items: AsistenciaGraficaItem[] };
}

interface DepartamentoOption {
  id: number;
  nombre: string;
  activo?: boolean;
}

const MESES_ES: Record<string, string> = {
  Jan: 'Ene', Feb: 'Feb', Mar: 'Mar', Apr: 'Abr', May: 'May', Jun: 'Jun',
  Jul: 'Jul', Aug: 'Ago', Sep: 'Sep', Oct: 'Oct', Nov: 'Nov', Dec: 'Dic',
};

/* ── Donut ring via canvas ── */
function DonutChart({ segments, size = 170, thickness = 28 }: { segments: { value: number; color: string; label: string }[]; size?: number; thickness?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2, r = (size - thickness) / 2;
    let startAngle = -Math.PI / 2;
    if (total === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = thickness;
      ctx.stroke();
    } else {
      for (const seg of segments) {
        const sweep = (seg.value / total) * 2 * Math.PI;
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, startAngle + sweep);
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'butt';
        ctx.stroke();
        startAngle += sweep;
      }
    }
    ctx.font = `700 ${size * 0.2}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(total), cx, cy - 6);
    ctx.font = `500 ${size * 0.085}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('empleados', cx, cy + 14);
  }, [segments, size, thickness, total]);
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}

export const DashboardPage = () => {
  const { authMe } = useAuth();
  const isMobile = useIsMobile();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [departamentos, setDepartamentos] = useState<DepartamentoOption[]>([]);
  const [filtroArea, setFiltroArea] = useState<string>('');
  const [tipoGraficaAsistencia, setTipoGraficaAsistencia] = useState<'global' | 'empresa' | 'area'>('global');
  const puedeVerVistaGeneral = authMe?.puede_ver_dashboard === true;

  useEffect(() => {
    if (puedeVerVistaGeneral) {
      api.get<DepartamentoOption[]>('/personal/departamentos', { params: { limit: 500, activo: true } })
        .then(res => setDepartamentos(Array.isArray(res.data) ? res.data : []))
        .catch(() => setDepartamentos([]));
    }
  }, [puedeVerVistaGeneral]);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = filtroArea ? { departamento_ids: filtroArea } : {};
    params.tipo_grafica = tipoGraficaAsistencia;
    api.get<DashboardData>('/asistencia/dashboard', { params })
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [filtroArea, tipoGraficaAsistencia]);

  if (loading) {
    return (
      <div style={{ padding: isMobile ? '20px 16px' : 32, textAlign: 'center', color: '#94a3b8', fontSize: '0.95rem' }}>
        <div style={{ display: 'inline-block', width: 24, height: 24, border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin .7s linear infinite', marginRight: 10, verticalAlign: 'middle' }} />
        Cargando dashboard…
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 32, color: '#ef4444', background: '#fef2f2', borderRadius: 12, margin: 24, fontSize: '0.95rem' }}>
        No se pudieron cargar los datos del dashboard. Verifica que tengas permiso.
      </div>
    );
  }

  const maxChecadas = Math.max(...data.checadas_por_mes.map(m => m.checadas), 1);
  const asistItems = data.asistencia_grafica?.items || [];
  const totalPersonalHoy = asistItems.reduce((s, i) => s + i.personal, 0);
  const totalAsistHoy = asistItems.reduce((s, i) => s + i.con_asistencia, 0);
  const pctAsistGlobal = totalPersonalHoy > 0 ? Math.round((totalAsistHoy / totalPersonalHoy) * 100) : 0;
  const ausentesHoy = totalPersonalHoy - totalAsistHoy;

  const hoy = new Date();
  const hora = hoy.getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const nombreDia = hoy.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const primerNombre = authMe?.nombre?.split(' ')[0] ?? '';

  const donutSegments = [
    { value: data.empleados.activos, color: '#22c55e', label: 'Activos' },
    { value: data.empleados.inactivos, color: '#f59e0b', label: 'Inactivos' },
    { value: data.empleados.baja, color: '#ef4444', label: 'Baja' },
  ];

  const maxBar = asistItems.length > 0 ? Math.max(...asistItems.map(i => i.personal), 1) : 1;

  const card = (bg: string, icon: string, label: string, value: string | number, sub: string, isDark: boolean) => (
    <div style={{
      background: bg, borderRadius: isMobile ? 16 : 14, padding: isMobile ? '14px 16px' : '18px 20px',
      display: 'flex', flexDirection: 'column', gap: isMobile ? 4 : 6,
      border: isDark ? 'none' : '1px solid #e2e8f0',
      boxShadow: isDark ? '0 6px 20px rgba(99,102,241,0.3)' : '0 2px 8px rgba(0,0,0,0.06)',
      minHeight: isMobile ? 88 : 100,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: isMobile ? '0.65rem' : '0.78rem', fontWeight: 600, color: isDark ? 'rgba(255,255,255,0.85)' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <span style={{ fontSize: isMobile ? '1.1rem' : '1.3rem' }}>{icon}</span>
      </div>
      <div style={{ fontSize: isMobile ? '1.5rem' : '1.75rem', fontWeight: 800, color: isDark ? '#fff' : '#0f172a', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: isMobile ? '0.68rem' : '0.75rem', color: isDark ? 'rgba(255,255,255,0.7)' : '#94a3b8', fontWeight: 500 }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ padding: isMobile ? '0 0 30px' : '24px 28px', maxWidth: 1400, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── MOBILE HERO ── */}
      {isMobile ? (
        <div style={{ background: 'linear-gradient(135deg, #312e81 0%, #4338ca 50%, #6366f1 100%)', padding: '20px 16px 28px', marginBottom: -14, position: 'relative' }}>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', marginBottom: 2 }}>{saludo}{primerNombre ? `, ${primerNombre}` : ''} 👋</div>
          <div style={{ color: 'white', fontWeight: 800, fontSize: '1.35rem', lineHeight: 1.2, marginBottom: 4, textTransform: 'capitalize' }}>
            Dashboard
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', textTransform: 'capitalize', marginBottom: 16 }}>
            {nombreDia}
          </div>
          {/* Dos métricas destacadas en el hero */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>📊 Asistencia hoy</div>
              <div style={{ color: 'white', fontWeight: 800, fontSize: '2rem', lineHeight: 1 }}>{pctAsistGlobal}%</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.68rem', marginTop: 2 }}>{totalAsistHoy} de {totalPersonalHoy}</div>
            </div>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>🚫 Ausentes hoy</div>
              <div style={{ color: ausentesHoy > 0 ? '#fca5a5' : '#86efac', fontWeight: 800, fontSize: '2rem', lineHeight: 1 }}>{ausentesHoy}</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.68rem', marginTop: 2 }}>
                {totalPersonalHoy > 0 ? `${Math.round((ausentesHoy / totalPersonalHoy) * 100)}% del personal` : '—'}
              </div>
            </div>
          </div>
          {puedeVerVistaGeneral && (
            <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)}
              style={{ marginTop: 12, width: '100%', padding: '9px 14px', borderRadius: 10, border: 'none', fontSize: '0.82rem', background: 'rgba(255,255,255,0.15)', color: 'white', fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
              <option value="" style={{ color: '#1e293b' }}>Todas las áreas</option>
              {departamentos.map(d => <option key={d.id} value={String(d.id)} style={{ color: '#1e293b' }}>{d.nombre}</option>)}
            </select>
          )}
        </div>
      ) : (
        /* ── DESKTOP header ── */
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Dashboard</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#94a3b8', textTransform: 'capitalize' }}>
              {nombreDia}{data.solo_mi_area && filtroArea ? ` · ${departamentos.find(d => String(d.id) === filtroArea)?.nombre ?? 'Área'}` : data.solo_mi_area && !puedeVerVistaGeneral ? ' · Tu área' : ''}
            </p>
          </div>
          {puedeVerVistaGeneral && (
            <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.85rem', background: '#fff', color: '#334155', fontWeight: 500, outline: 'none', cursor: 'pointer' }}>
              <option value="">Todas las áreas</option>
              {departamentos.map(d => <option key={d.id} value={String(d.id)}>{d.nombre}</option>)}
            </select>
          )}
        </div>
      )}

      {/* ── CONTENT ── */}
      <div style={{ padding: isMobile ? '14px 12px 0' : 0, backgroundColor: isMobile ? 'white' : 'transparent', borderRadius: isMobile ? '20px 20px 0 0' : 0, position: 'relative', zIndex: 1 }}>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(190px, 1fr))', gap: isMobile ? 10 : 16, marginBottom: isMobile ? 16 : 24 }}>
        {card('linear-gradient(135deg,#6366f1,#818cf8)', '📊', 'Asistencia Hoy', `${pctAsistGlobal}%`, `${totalAsistHoy} de ${totalPersonalHoy}`, true)}
        {card('linear-gradient(135deg,#f43f5e,#fb7185)', '🚫', 'Ausentes Hoy', ausentesHoy, totalPersonalHoy > 0 ? `${Math.round((ausentesHoy / totalPersonalHoy) * 100)}% del personal` : '—', true)}
        {card('#fff', '⏱️', 'Checadas del Mes', data.checadas_mes_actual.toLocaleString(), 'Registros totales', false)}
        {card('#fff', '⚠️', 'Incidencias del Mes', data.incidencias_mes_actual.toLocaleString(), data.incidencias_mes_actual === 0 ? 'Sin incidencias' : 'Requieren atención', false)}
        {card('#fff', '🏢', 'Empresas', data.empresas, 'Activas', false)}
        {card('#fff', '🏷️', 'Departamentos', data.departamentos, 'Activos', false)}
      </div>

      {/* ── Row 2: Donut + Asistencia Hoy ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '340px 1fr', gap: isMobile ? 12 : 20, marginBottom: isMobile ? 12 : 24 }}>
        {/* Donut */}
        <div style={{ background: '#fff', borderRadius: isMobile ? 16 : 14, border: '1px solid #e2e8f0', padding: isMobile ? '16px' : '22px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: `0 0 ${isMobile ? 12 : 16}px`, fontSize: isMobile ? '0.85rem' : '0.92rem', fontWeight: 700, color: '#1e293b' }}>
            Distribución de Personal
          </h3>
          {isMobile ? (
            /* Mobile: horizontal layout donut + leyenda */
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <DonutChart segments={donutSegments} size={110} thickness={20} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                {donutSegments.map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 500 }}>{s.label}</span>
                    </div>
                    <span style={{ fontSize: '0.88rem', color: '#1e293b', fontWeight: 700 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DonutChart segments={donutSegments} size={160} thickness={26} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 16 }}>
                {donutSegments.map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
                    <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 500 }}>{s.label}</span>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Asistencia hoy */}
        <div style={{ background: '#fff', borderRadius: isMobile ? 16 : 14, border: '1px solid #e2e8f0', padding: isMobile ? '16px' : '22px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: isMobile ? 12 : 18, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: isMobile ? '0.85rem' : '0.92rem', fontWeight: 700, color: '#1e293b' }}>Asistencia de Hoy</h3>
            <select value={tipoGraficaAsistencia} onChange={e => setTipoGraficaAsistencia(e.target.value as 'global' | 'empresa' | 'area')}
              style={{ padding: isMobile ? '6px 10px' : '5px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: isMobile ? '0.78rem' : '0.82rem', background: '#f8fafc', color: '#334155', fontWeight: 500, cursor: 'pointer' }}>
              <option value="global">Global</option>
              <option value="empresa">Por empresa</option>
              <option value="area">Por área</option>
            </select>
          </div>
          {asistItems.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: 0 }}>Sin datos de asistencia para hoy.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 10, maxHeight: isMobile ? 220 : 250, overflowY: 'auto' }}>
              {asistItems.map((item, i) => {
                const pct = item.personal > 0 ? (item.con_asistencia / item.personal) * 100 : 0;
                const barWidth = item.personal > 0 ? (item.personal / maxBar) * 100 : 0;
                const asistWidth = item.personal > 0 ? (item.con_asistencia / item.personal) * 100 : 0;
                const barColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontSize: isMobile ? '0.8rem' : '0.82rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }} title={item.label}>
                        {item.label}
                      </span>
                      <span style={{ fontSize: isMobile ? '0.8rem' : '0.78rem', fontWeight: 700, color: barColor }}>
                        {pct.toFixed(0)}%
                        <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>{item.con_asistencia}/{item.personal}</span>
                      </span>
                    </div>
                    <div style={{ position: 'relative', height: isMobile ? 8 : 10, background: '#f1f5f9', borderRadius: 5, width: isMobile ? '100%' : `${Math.max(barWidth, 30)}%` }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${asistWidth}%`, background: barColor, borderRadius: 5, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Checadas por mes ── */}
      <div style={{ background: '#fff', borderRadius: isMobile ? 16 : 14, border: '1px solid #e2e8f0', padding: isMobile ? '16px' : '22px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: `0 0 4px`, fontSize: isMobile ? '0.85rem' : '0.92rem', fontWeight: 700, color: '#1e293b' }}>Registros de Checadas</h3>
        <p style={{ margin: `0 0 ${isMobile ? 14 : 18}px`, fontSize: '0.75rem', color: '#94a3b8' }}>Últimos 12 meses</p>
        <div style={{ position: 'relative', height: isMobile ? 160 : 220, display: 'flex', alignItems: 'flex-end', gap: isMobile ? 3 : 4 }}>
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <div key={f} style={{ position: 'absolute', left: 0, right: 0, bottom: `${f * 100}%`, borderBottom: '1px solid #f1f5f9', zIndex: 0 }}>
              {!isMobile && (
                <span style={{ position: 'absolute', left: -4, top: -8, fontSize: '0.6rem', color: '#cbd5e1', transform: 'translateX(-100%)', paddingRight: 4 }}>
                  {Math.round(maxChecadas * f).toLocaleString()}
                </span>
              )}
            </div>
          ))}
          {data.checadas_por_mes.map((m, i) => {
            const chartH = isMobile ? 140 : 190;
            const h = Math.max(4, (m.checadas / maxChecadas) * chartH);
            const isLast = i === data.checadas_por_mes.length - 1;
            return (
              <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 1, minWidth: 0 }}>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', flex: 1 }}>
                  {!isMobile && (
                    <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, marginBottom: 2 }}>
                      {m.checadas > 0 ? m.checadas.toLocaleString() : ''}
                    </span>
                  )}
                  <div
                    style={{ width: '70%', maxWidth: isMobile ? 20 : 44, height: h, borderRadius: '6px 6px 2px 2px', background: isLast ? 'linear-gradient(180deg,#6366f1,#818cf8)' : isMobile ? '#c7d2fe' : '#e0e7ff', transition: 'height 0.4s ease' }}
                    title={`${m.label}: ${m.checadas.toLocaleString()}`}
                  />
                </div>
                <span style={{ fontSize: isMobile ? '0.58rem' : '0.68rem', color: isLast ? '#4f46e5' : '#94a3b8', fontWeight: isLast ? 700 : 500, textAlign: 'center' }}>
                  {MESES_ES[m.label.split(' ')[0]] || m.label.split(' ')[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      </div>{/* /content */}
    </div>
  );
};
