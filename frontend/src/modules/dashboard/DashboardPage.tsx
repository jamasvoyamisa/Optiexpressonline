import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

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

const cardStyle: React.CSSProperties = {
  padding: '20px',
  backgroundColor: 'white',
  borderRadius: '10px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

export const DashboardPage = () => {
  const { authMe } = useAuth();
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
      <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
        Cargando datos del dashboard...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: '24px', color: '#dc3545' }}>
        No se pudieron cargar los datos del dashboard. Verifica que tengas permiso (Administrador, Director, Gerente General o RH).
      </div>
    );
  }

  const maxChecadas = Math.max(...data.checadas_por_mes.map(m => m.checadas), 1);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#1e3a5f', fontWeight: 700 }}>
          Dashboard
        </h1>
        {puedeVerVistaGeneral && (
          <select
            value={filtroArea}
            onChange={e => setFiltroArea(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '0.9rem',
              backgroundColor: 'white',
              color: '#374151',
              minWidth: '200px',
            }}
          >
            <option value="">Vista global</option>
            {departamentos.map(d => (
              <option key={d.id} value={String(d.id)}>
                {d.nombre}
              </option>
            ))}
          </select>
        )}
      </div>
      {data.solo_mi_area && !puedeVerVistaGeneral ? (
        <p style={{ margin: '0 0 24px', fontSize: '0.9rem', color: '#6b7280' }}>
          Datos de tu área
        </p>
      ) : data.solo_mi_area && filtroArea ? (
        <p style={{ margin: '0 0 24px', fontSize: '0.9rem', color: '#6b7280' }}>
          Datos del área: {departamentos.find(d => String(d.id) === filtroArea)?.nombre ?? ''}
        </p>
      ) : (
        <div style={{ marginBottom: '24px' }} />
      )}

      {/* Cards de empleados */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '4px' }}>Total empleados</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1e3a5f' }}>{data.empleados.total}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '4px' }}>Activos</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#28a745' }}>{data.empleados.activos}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '4px' }}>Inactivos</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ffc107' }}>{data.empleados.inactivos}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '4px' }}>Bajas</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#dc3545' }}>{data.empleados.baja}</div>
        </div>
      </div>

      {/* Empresas, departamentos, checadas e incidencias del mes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '4px' }}>Empresas</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0ea5e9' }}>{data.empresas}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '4px' }}>Departamentos</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0ea5e9' }}>{data.departamentos}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '4px' }}>Checadas este mes</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0ea5e9' }}>{data.checadas_mes_actual.toLocaleString()}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '4px' }}>Incidencias este mes</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: data.incidencias_mes_actual > 0 ? '#f59e0b' : '#28a745' }}>
            {data.incidencias_mes_actual.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Gráfica de asistencia vs personal (hoy) */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#374151', fontWeight: 600 }}>
            Asistencia hoy vs personal
          </h3>
          <select
            value={tipoGraficaAsistencia}
            onChange={e => setTipoGraficaAsistencia(e.target.value as 'global' | 'empresa' | 'area')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '0.85rem',
              backgroundColor: 'white',
              color: '#374151',
            }}
          >
            <option value="global">Global</option>
            <option value="empresa">Por empresa</option>
            <option value="area">Por área</option>
          </select>
        </div>
        {data.asistencia_grafica?.items?.length ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '200px', flexWrap: 'wrap' }}>
            {data.asistencia_grafica.items.map((item, i) => {
              const pct = item.personal > 0 ? (item.con_asistencia / item.personal) * 100 : 0;
              const barColor = pct >= 80 ? '#28a745' : pct >= 50 ? '#ffc107' : '#dc3545';
              return (
                <div style={{ flex: '1 1 60px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: 0 }} key={i}>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '48px',
                      height: `${Math.max(4, pct * 1.6)}px`,
                      backgroundColor: barColor,
                      borderRadius: '6px 6px 0 0',
                      minHeight: '4px',
                    }}
                    title={`${item.label}: ${item.con_asistencia} de ${item.personal} (${pct.toFixed(0)}%)`}
                  />
                  <span style={{ fontSize: '0.65rem', color: '#6b7280', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }} title={item.label}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: '#9ca3af' }}>{item.con_asistencia}/{item.personal}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>Sin datos de asistencia para hoy.</p>
        )}
      </div>

      {/* Gráfica de checadas por mes */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '1rem', color: '#374151', fontWeight: 600 }}>
          Checadas por mes (últimos 12 meses)
        </h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '220px' }}>
          {data.checadas_por_mes.map(m => (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: 0 }} key={m.mes}>
              <div
                style={{
                  width: '100%',
                  maxWidth: '40px',
                  height: `${Math.max(4, (m.checadas / maxChecadas) * 160)}px`,
                  backgroundColor: '#0ea5e9',
                  borderRadius: '6px 6px 0 0',
                  minHeight: '4px',
                }}
                title={`${m.label}: ${m.checadas.toLocaleString()} checadas`}
              />
              <span style={{ fontSize: '0.65rem', color: '#6b7280', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }} title={m.label}>
                {MESES_ES[m.label.split(' ')[0]] || m.label.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
