import { ReactNode, useState, useEffect } from 'react';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const formatFechaHora = () => {
  const d = new Date();
  const dia = d.getDate();
  const mes = MESES[d.getMonth()];
  const año = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dia} ${mes} ${año}  ${hh}:${mm}`;
};
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useIsMobile } from '../hooks/useIsMobile';
import { NotificationBell } from './NotificationBell';
import api from '../services/api';
import type { Dispositivo } from '../types';

interface LayoutProps {
  children: ReactNode;
}

const empleadoNavItems = [
  { to: '/mis-asistencias', label: 'Mis asistencias' },
  { to: '/mis-vacaciones', label: 'Vacaciones' },
  { to: '/mis-prestamos', label: 'Mis préstamos' },
  { to: '/mis-datos', label: 'Mis datos' },
];

const dashboardNavItem = { to: '/dashboard', label: 'Dashboard' };

const superAdminNavItems = [
  { to: '/rh', label: 'Recursos Humanos' },
  { to: '/asistencia', label: 'Asistencia' },
  { to: '/mi-area', label: 'Incidencias y solicitudes' },
];

const superAdminItems = [
  { to: '/configuracion', label: 'Configuracion' },
];

const miAreaNavItem = { to: '/mi-area', label: 'Mi Área' };
const solicitudesVacacionesNavItem = { to: '/solicitudes-vacaciones', label: 'Solicitudes a aprobar' };

export const Layout = ({ children }: LayoutProps) => {
  const { isAuthenticated, authMe, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [fechaHora, setFechaHora] = useState(formatFechaHora);
  const [mostrarCumple, setMostrarCumple] = useState(false);
  const isSuperuser = authMe?.is_superuser ?? false;

  // Modal privado: detectar si el usuario logueado cumple años hoy (usando hora México)
  useEffect(() => {
    if (!authMe?.fecha_nacimiento) return;
    // Fecha de hoy en México
    const hoyMx = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }); // YYYY-MM-DD
    const [, mesMx, diaMx] = hoyMx.split('-').map(Number);
    // fecha_nacimiento viene como "YYYY-MM-DD", parseamos solo mes y día
    const [, mesFn, diaFn] = authMe.fecha_nacimiento.slice(0, 10).split('-').map(Number);
    const esCumple = mesFn === mesMx && diaFn === diaMx;
    if (!esCumple) return;
    const llave = `cumple_privado_${authMe.id}_${hoyMx}`;
    if (sessionStorage.getItem(llave)) return;
    sessionStorage.setItem(llave, '1');
    // Pequeño delay para que no aparezca mientras carga la app
    const t = setTimeout(() => setMostrarCumple(true), 1200);
    return () => clearTimeout(t);
  }, [authMe]);

  // Cerrar sidebar al cambiar de ruta en móvil
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  useEffect(() => {
    const t = setInterval(() => setFechaHora(formatFechaHora()), 1000);
    return () => clearInterval(t);
  }, []);

  const isRH = authMe?.is_rh ?? false;
  const puedeVerMiArea = authMe?.puede_ver_mi_area ?? false;
  const puedeVerDashboard = (authMe?.puede_ver_dashboard ?? false) || (authMe?.puede_ver_mi_area ?? false);
  const puedeVerSolicitudesVacaciones = isSuperuser || (authMe?.is_director === true) || (authMe?.is_gerente_general === true) || isRH;
  const showFullAdmin = isSuperuser;
  const showRH = isRH && !isSuperuser;
  const showMiAreaOnly = !showFullAdmin && !showRH && puedeVerMiArea;

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
      padding: '10px 12px',
      borderRadius: '6px',
      backgroundColor: active ? 'rgba(14,165,233,0.25)' : 'transparent',
      borderLeft: active ? '3px solid #0ea5e9' : '3px solid transparent',
      fontWeight: active ? 600 : 400,
      fontSize: isMobile ? '1rem' : undefined,
      transition: 'background-color 0.15s',
      display: 'block',
    };
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f0f4f8' }}>
        <span style={{ color: '#6b7280', fontSize: '1rem' }}>Cargando...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const navContent = (
    <>
      <Link to="/" style={{ display: 'block', marginBottom: '24px', textDecoration: 'none' }}>
        <img
          src="/GPO-Cristal-bco.png"
          alt="Grupo Cristal"
          style={{ width: '100%', maxWidth: '160px', height: 'auto', objectFit: 'contain', display: 'block' }}
        />
      </Link>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        {puedeVerDashboard && (
          <Link key={dashboardNavItem.to} to={dashboardNavItem.to} style={linkStyle(dashboardNavItem.to)}>{dashboardNavItem.label}</Link>
        )}
        {puedeVerSolicitudesVacaciones && (
          <Link key={solicitudesVacacionesNavItem.to} to={solicitudesVacacionesNavItem.to} style={linkStyle(solicitudesVacacionesNavItem.to)}>{solicitudesVacacionesNavItem.label}</Link>
        )}
        {showFullAdmin
          ? superAdminNavItems.map(item => (
              <Link key={item.to} to={item.to} style={linkStyle(item.to)}>{item.label}</Link>
            ))
          : showRH
          ? [
              ...empleadoNavItems.map(item => (
                <Link key={item.to} to={item.to} style={linkStyle(item.to)}>{item.label}</Link>
              )),
              <Link key="/rh" to="/rh" style={linkStyle('/rh')}>Recursos Humanos</Link>,
            ]
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
      <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
        v1.0.0
      </div>
    </>
  );

  return (
    <>
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Sidebar desktop ── */}
      {!isMobile && (
        <aside style={{
          width: '200px',
          flexShrink: 0,
          backgroundColor: '#1e3a5f',
          color: 'white',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          boxShadow: '4px 0 12px rgba(0,0,0,0.22)',
        }}>
          {navContent}
        </aside>
      )}

      {/* ── Drawer móvil (overlay) ── */}
      {isMobile && sidebarOpen && (
        <>
          {/* Fondo semitransparente */}
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
              zIndex: 200,
            }}
          />
          {/* Panel lateral */}
          <aside style={{
            position: 'fixed', top: 0, left: 0, bottom: 0,
            width: '260px',
            backgroundColor: '#1e3a5f',
            color: 'white',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            zIndex: 201,
            boxShadow: '4px 0 24px rgba(0,0,0,0.35)',
          }}>
            {/* Botón cerrar */}
            <button
              onClick={() => setSidebarOpen(false)}
              style={{
                alignSelf: 'flex-end', background: 'none', border: 'none',
                color: 'rgba(255,255,255,0.7)', fontSize: '1.6rem', cursor: 'pointer',
                lineHeight: 1, marginBottom: '12px',
              }}
            >
              &times;
            </button>
            {navContent}
          </aside>
        </>
      )}

      {/* ── Columna derecha: header + contenido ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header superior */}
        <header style={{
          backgroundColor: '#1e3a5f',
          padding: '0 16px',
          height: '52px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.18)',
        }}>
          {/* Hamburguesa (solo móvil) */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              style={{
                background: 'none', border: 'none', color: 'white',
                cursor: 'pointer', padding: '4px 6px', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
              aria-label="Abrir menú"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}

          {/* Logo pequeño en móvil */}
          {isMobile && (
            <img src="/GPO-Cristal-bco.png" alt="Logo" style={{ height: '28px', objectFit: 'contain' }} />
          )}

          {/* Derecha del header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
            {!isMobile && (
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {fechaHora}
              </span>
            )}

            {isAuthenticated && <NotificationBell dispositivos={showFullAdmin ? dispositivos : []} />}

            {isAuthenticated && (
              <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255,255,255,0.15)' }} />
            )}

            {isAuthenticated && authMe && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '34px', height: '34px', borderRadius: '50%',
                  backgroundColor: '#0ea5e9', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: 'white', fontWeight: 700,
                  fontSize: '0.85rem', flexShrink: 0, userSelect: 'none',
                }}>
                  {`${authMe.nombre.charAt(0)}${authMe.apellido_paterno ? authMe.apellido_paterno.charAt(0) : ''}`.toUpperCase()}
                </div>
                {!isMobile && (
                  <div style={{ color: 'white', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {authMe.nombre} {authMe.apellido_paterno ?? ''}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  title="Cerrar sesión"
                  style={{
                    background: 'transparent', border: 'none', borderRadius: '7px',
                    cursor: 'pointer', padding: '5px 6px', color: 'rgba(255,255,255,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'color 0.15s', marginLeft: '2px',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#fca5a5')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </header>

        <main style={{ flex: 1, minHeight: 0, backgroundColor: '#f0f4f8', overflow: 'auto' }}>
          {children}
        </main>
      </div>
    </div>

    {/* ── Modal privado de cumpleaños ── */}
    {mostrarCumple && authMe && (
      <div
        onClick={() => setMostrarCumple(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeInOverlay 0.3s ease',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'linear-gradient(135deg, #0f2057 0%, #1a4a8a 50%, #0e7ab5 100%)',
            border: '1px solid rgba(14,165,233,0.35)',
            borderRadius: '20px',
            padding: '40px 44px 36px',
            maxWidth: '420px',
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 40px rgba(14,165,233,0.15)',
            animation: 'slideUpModal 0.35s ease',
            position: 'relative',
          }}
        >
          <button
            onClick={() => setMostrarCumple(false)}
            style={{
              position: 'absolute', top: '14px', right: '16px',
              background: 'rgba(255,255,255,0.1)', border: 'none',
              color: '#fff', width: '30px', height: '30px',
              borderRadius: '50%', cursor: 'pointer', fontSize: '14px',
            }}
          >✕</button>
          <div style={{ fontSize: '54px', marginBottom: '10px', display: 'block' }}>🎂</div>
          <h2 style={{ color: '#fff', fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>
            ¡Feliz cumpleaños, {authMe.nombre}!
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '15px', marginBottom: '28px', lineHeight: 1.6 }}>
            Todo el equipo de <strong style={{ color: '#38bdf8' }}>Optiexpress</strong> te desea un excelente día.<br />
            ¡Que lo disfrutes mucho! 🎉
          </p>
          <button
            onClick={() => setMostrarCumple(false)}
            style={{
              background: 'linear-gradient(90deg, #0369a1, #0ea5e9)',
              color: '#fff', border: 'none', borderRadius: '30px',
              padding: '12px 40px', fontSize: '15px', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ¡Gracias! 🎈
          </button>
        </div>
      </div>
    )}
    </>
  );
};
