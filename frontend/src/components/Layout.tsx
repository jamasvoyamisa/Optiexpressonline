import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { NotificationBell } from './NotificationBell';
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

export const Layout = ({ children }: LayoutProps) => {
  const { isAuthenticated, authMe, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' }}>
        <span style={{ color: '#6b7280', fontSize: '1rem' }}>Cargando...</span>
      </div>
    );
  }

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
          {showFullAdmin && superAdminItems.map(item => (
            <Link key={item.to} to={item.to} style={linkStyle(item.to)}>{item.label}</Link>
          ))}
        </div>
      </aside>

      {/* Columna derecha: header + contenido */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header superior */}
        <header style={{
          backgroundColor: '#1f2937',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '0 20px',
          height: '52px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '12px',
        }}>
          {/* Campana de notificaciones */}
          {isAuthenticated && <NotificationBell dispositivos={showFullAdmin ? dispositivos : []} />}

          {/* Separador */}
          {isAuthenticated && (
            <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255,255,255,0.15)' }} />
          )}

          {/* Info del usuario + cerrar sesión */}
          {isAuthenticated && authMe && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Avatar con iniciales */}
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                backgroundColor: '#6366f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 700,
                fontSize: '0.85rem',
                flexShrink: 0,
                userSelect: 'none',
              }}>
                {`${authMe.nombre.charAt(0)}${authMe.apellido_paterno ? authMe.apellido_paterno.charAt(0) : ''}`.toUpperCase()}
              </div>
              <div style={{ color: 'white', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {authMe.nombre} {authMe.apellido_paterno ?? ''}
              </div>

              {/* Botón cerrar sesión — ícono salir */}
              <button
                type="button"
                onClick={handleLogout}
                title="Cerrar sesión"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  padding: '5px 6px',
                  color: 'rgba(255,255,255,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s',
                  marginLeft: '2px',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fca5a5')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
              >
                {/* Ícono "salir" SVG */}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          )}
        </header>

        <main style={{ flex: 1, minHeight: 0, backgroundColor: '#f3f4f6', overflow: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
};
