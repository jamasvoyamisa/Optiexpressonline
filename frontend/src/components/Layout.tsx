import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import type { Dispositivo } from '../types';

interface LayoutProps {
  children: ReactNode;
}

const empleadoNavItems = [
  { to: '/mis-asistencias', label: 'Mis asistencias' },
  { to: '/mis-vacaciones', label: 'Vacaciones' },
  { to: '/mis-datos', label: 'Mis datos' },
];

// Solo para superuser/admin
const superAdminNavItems = [
  { to: '/rh', label: 'Recursos Humanos' },
  { to: '/asistencia', label: 'Asistencia' },
  { to: '/mi-area', label: 'Asistencia y solicitudes' },
];

const superAdminItems = [
  { to: '/configuracion', label: 'Configuracion' },
];

// Para gerentes/supervisores/jefes de área (no superuser): solo Mi Área
const miAreaNavItem = { to: '/mi-area', label: 'Mi Área' };

const MS_1_DIA = 24 * 60 * 60 * 1000;

export const Layout = ({ children }: LayoutProps) => {
  const { isAuthenticated, authMe, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const isSuperuser = authMe?.is_superuser ?? false;
  const puedeVerMiArea = authMe?.puede_ver_mi_area ?? false;
  // Solo el superuser/admin ve todo el panel de administración
  const showFullAdmin = isSuperuser;
  // Gerentes, supervisores y jefes de área (no superuser) solo ven "Mi Área"
  const showMiAreaOnly = !showFullAdmin && puedeVerMiArea;

  useEffect(() => {
    if (!isAuthenticated || !showFullAdmin) return;
    let cancelled = false;
    api.get('/asistencia/devices')
      .then((res) => { if (!cancelled) setDispositivos(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (!cancelled) setDispositivos([]); });
    const interval = setInterval(() => {
      api.get('/asistencia/devices')
        .then((res) => { if (!cancelled) setDispositivos(Array.isArray(res.data) ? res.data : []); })
        .catch(() => {});
    }, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isAuthenticated, showFullAdmin]);

  const inactivos = dispositivos.filter((d) => !d.activo);
  const sinConexion1Dia = dispositivos.filter((d) => {
    const u = d.ultima_sync_agente;
    if (!u) return true;
    const diff = Date.now() - new Date(u.endsWith('Z') || u.includes('+') ? u : u + 'Z').getTime();
    return diff > MS_1_DIA;
  });
  const totalAlertas = new Set([...inactivos.map((d) => d.id), ...sinConexion1Dia.map((d) => d.id)]).size;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const linkStyle = (path: string): React.CSSProperties => {
    const active = location.pathname === path || location.pathname.startsWith(path + '/');
    return {
      color: 'white',
      textDecoration: 'none',
      padding: '8px 12px',
      borderRadius: '6px',
      backgroundColor: active ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
      fontWeight: active ? 600 : 400,
      transition: 'background-color 0.15s',
    };
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <aside style={{
        width: '250px',
        flexShrink: 0,
        backgroundColor: '#1f2937',
        color: 'white',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}>
        <h2 style={{ marginBottom: '30px' }}>Grupo Cristal</h2>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {showFullAdmin
            ? superAdminNavItems.map(item => (
                <Link key={item.to} to={item.to} style={linkStyle(item.to)}>{item.label}</Link>
              ))
            : [
                ...empleadoNavItems.map(item => (
                  <Link key={item.to} to={item.to} style={linkStyle(item.to)}>{item.label}</Link>
                )),
                ...(showMiAreaOnly ? [
                  <Link key={miAreaNavItem.to} to={miAreaNavItem.to} style={linkStyle(miAreaNavItem.to)}>{miAreaNavItem.label}</Link>
                ] : []),
              ]
          }
        </nav>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {showFullAdmin && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '12px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', padding: '0 12px' }}>
              Administrador
            </span>
          </div>
          )}
          {isAuthenticated && showFullAdmin && (
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <button
                type="button"
                onClick={() => setShowAlertPanel((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', textAlign: 'left',
                  color: 'white', background: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>🔔</span>
                <span>Alertas</span>
                {totalAlertas > 0 && (
                  <span style={{
                    minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '10px',
                    backgroundColor: '#ef4444', color: 'white', fontSize: '0.75rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {totalAlertas}
                  </span>
                )}
              </button>
              {showAlertPanel && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setShowAlertPanel(false)} role="presentation" />
                  <div style={{
                    position: 'absolute', left: '100%', top: 0, marginLeft: '8px', zIndex: 101,
                    width: '320px', maxHeight: '80vh', overflowY: 'auto',
                    backgroundColor: 'white', color: '#1f2937', borderRadius: '8px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                    padding: '12px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' }}>
                      <strong style={{ fontSize: '0.95rem' }}>Alertas de dispositivos</strong>
                      <button type="button" onClick={() => setShowAlertPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#6b7280' }}>&times;</button>
                    </div>
                    {inactivos.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#b91c1c', marginBottom: '6px' }}>Dispositivos inactivos</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {inactivos.map((d) => (
                            <div key={d.id} style={{ padding: '8px 10px', backgroundColor: '#fef2f2', borderRadius: '6px', fontSize: '0.85rem' }}>
                              {d.nombre}
                              {d.ubicacion && <span style={{ color: '#6b7280', marginLeft: '6px' }}> · {d.ubicacion}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {sinConexion1Dia.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#b45309', marginBottom: '6px' }}>Sin conexión hace más de 1 día</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {sinConexion1Dia.map((d) => (
                            <div key={d.id} style={{ padding: '8px 10px', backgroundColor: '#fffbeb', borderRadius: '6px', fontSize: '0.85rem' }}>
                              {d.nombre}
                              {d.ubicacion && <span style={{ color: '#6b7280', marginLeft: '6px' }}> · {d.ubicacion}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {totalAlertas === 0 && (
                      <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>No hay alertas.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {showFullAdmin && superAdminItems.map(item => (
            <Link key={item.to} to={item.to} style={linkStyle(item.to)}>{item.label}</Link>
          ))}
          {isAuthenticated && (
            <button
              onClick={handleLogout}
              style={{
                marginTop: '12px',
                padding: '10px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
            >
              Cerrar Sesion
            </button>
          )}
        </div>
      </aside>

      <main style={{ flex: 1, minHeight: 0, backgroundColor: '#f3f4f6', overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
};
