import { ReactNode, useState, useEffect } from 'react';
import logoSidebar from '../assets/GPO-Cristal-bco.png';

const logoSidebarCollapsed = '/favicon.png';

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
import { canAccessNomina } from '../config/features';
import type { Dispositivo } from '../types';

interface LayoutProps {
  children: ReactNode;
}

const sidebarIcons: Record<string, JSX.Element> = {
  '/dashboard': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  '/mis-asistencias': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  '/mis-vacaciones': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  '/mis-prestamos': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  '/mis-datos': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  '/rh': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  '/organigrama': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><rect x="2" y="18" width="6" height="4" rx="1"/><rect x="16" y="18" width="6" height="4" rx="1"/><path d="M12 6v4"/><path d="M5 14v4"/><path d="M19 14v4"/><path d="M5 14h14"/><path d="M12 10v4"/></svg>,
  '/asistencia': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14l2 2 4-4"/></svg>,
  '/descansos-programados': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  '/mi-area': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
  '/solicitudes-vacaciones': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  '/configuracion': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  '/soporte': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  '/nomina': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
};

const NavIcon = ({ path }: { path: string }) => {
  const icon = sidebarIcons[path];
  return icon ? <span style={{ display: 'inline-flex', flexShrink: 0, opacity: 0.85 }}>{icon}</span> : null;
};

/** Icono tipo pestaña: >| para expandir, |< para colapsar. Solo icono + hover. */
const SidebarTabToggle = ({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={collapsed ? 'Mostrar menú' : 'Ocultar menú'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-end',
        width: '100%',
        padding: '6px 2px',
        marginBottom: 4,
        background: 'none',
        border: 'none',
        boxShadow: 'none',
        outline: 'none',
        color: hover ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)',
        cursor: 'default',
        transition: 'color 0.15s ease',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {collapsed ? (
          /* >|  expandir */
          <>
            <polyline points="8 6 14 12 8 18" />
            <line x1="17" y1="4" x2="17" y2="20" />
          </>
        ) : (
          /* |<  colapsar */
          <>
            <line x1="7" y1="4" x2="7" y2="20" />
            <polyline points="16 6 10 12 16 18" />
          </>
        )}
      </svg>
    </button>
  );
};

const SIDEBAR_WIDTH_EXPANDED = 172;
const SIDEBAR_WIDTH_COLLAPSED = 64;

const empleadoNavItems = [
  { to: '/mis-asistencias', label: 'Mis asistencias' },
  { to: '/mis-vacaciones', label: 'Vacaciones' },
  { to: '/mis-prestamos', label: 'Mis préstamos' },
  { to: '/mis-datos', label: 'Mis datos' },
];

const dashboardNavItem = { to: '/dashboard', label: 'Dashboard' };

const superAdminNavItems = [
  { to: '/rh', label: 'Recursos Humanos' },
  { to: '/organigrama', label: 'Organigrama' },
  { to: '/asistencia', label: 'Asistencia' },
  { to: '/descansos-programados', label: 'Descansos' },
  { to: '/mi-area', label: 'Incidencias y solicitudes' },
  { to: '/soporte', label: 'Soporte TI' },
];

const miAreaNavItem = { to: '/mi-area', label: 'Mi Área' };
const solicitudesVacacionesNavItem = { to: '/solicitudes-vacaciones', label: 'Solicitudes a confirmar' };
const PRESTAMOS_ANTIGUEDAD_MINIMA_ANIOS = 1;

export const Layout = ({ children }: LayoutProps) => {
  const { isAuthenticated, authMe, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** Desktop: menú expandido o solo iconos; se controla con flecha (arriba de Configuración). */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [fechaHora, setFechaHora] = useState(formatFechaHora);
  const [mostrarCumple, setMostrarCumple] = useState(false);
  const [mostrarAniversario, setMostrarAniversario] = useState(false);
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

  // Modal aniversario laboral
  useEffect(() => {
    if (!authMe?.es_aniversario_hoy || !authMe?.anios_empresa) return;
    const hoyMx = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
    const llave = `aniversario_${authMe.id}_${hoyMx}`;
    if (sessionStorage.getItem(llave)) return;
    sessionStorage.setItem(llave, '1');
    // Aparece después del popup de cumpleaños si coinciden ambos
    const t = setTimeout(() => setMostrarAniversario(true), mostrarCumple ? 6000 : 1800);
    return () => clearTimeout(t);
  }, [authMe, mostrarCumple]);

  // Cerrar sidebar al cambiar de ruta en móvil
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  useEffect(() => {
    const t = setInterval(() => setFechaHora(formatFechaHora()), 1000);
    return () => clearInterval(t);
  }, []);

  const isRH = authMe?.is_rh ?? false;
  const isDirector = authMe?.is_director ?? false;
  const isTI = authMe?.is_ti ?? false;
  const isGerenteGeneral = authMe?.is_gerente_general === true;
  const isJefe = authMe?.is_jefe === true;
  const esUsuarioEspecial = authMe?.exento_incidencias === true;
  const puedeVerMiArea = authMe?.puede_ver_mi_area ?? false;
  const puedeVerDashboard = (authMe?.puede_ver_dashboard ?? false) || (authMe?.puede_ver_mi_area ?? false);
  const puedeVerSolicitudesVacaciones = isSuperuser || (authMe?.is_director === true) || isGerenteGeneral || isRH;
  const puedeVerOrganigrama = isSuperuser || isRH || isDirector || isGerenteGeneral || isJefe;
  const showFullAdmin = isSuperuser;
  const puedeVerPrestamos = (authMe?.anios_empresa ?? 0) >= PRESTAMOS_ANTIGUEDAD_MINIMA_ANIOS;
  /** Director o RH (no admin): ven módulo Recursos Humanos como pestañas empleado + RH */
  const showRHNav = (isRH || isDirector) && !isSuperuser;
  const showMiAreaOnly = !showFullAdmin && !showRHNav && puedeVerMiArea;
  const empleadoNavLinks = esUsuarioEspecial
    ? empleadoNavItems.filter(
        (i) => i.to !== '/mis-asistencias' && i.to !== '/mis-vacaciones' && i.to !== '/mis-prestamos',
      )
    : empleadoNavItems.filter((i) => i.to !== '/mis-prestamos' || puedeVerPrestamos);

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

  const linkStyle = (path: string, collapsed = false): React.CSSProperties => {
    const active = location.pathname === path || location.pathname.startsWith(path + '/');
    return {
      color: 'white',
      textDecoration: 'none',
      padding: isMobile ? '9px 12px' : collapsed ? '10px 0' : '7px 10px',
      borderRadius: '8px',
      backgroundColor: active ? 'rgba(14,165,233,0.25)' : 'transparent',
      borderLeft: collapsed ? 'none' : (active ? '3px solid #0ea5e9' : '3px solid transparent'),
      boxShadow: collapsed && active ? 'inset 0 0 0 1.5px rgba(14,165,233,0.7)' : undefined,
      fontWeight: active ? 600 : 400,
      fontSize: isMobile ? '1rem' : '0.84rem',
      transition: 'background-color 0.15s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: collapsed ? 'center' : 'flex-start',
      gap: isMobile ? '10px' : collapsed ? 0 : '8px',
      minHeight: collapsed ? 40 : undefined,
    };
  };

  const renderNavLink = (to: string, label: string, collapsed: boolean) => (
    <Link
      key={to}
      to={to}
      title={collapsed ? label : undefined}
      aria-label={label}
      style={linkStyle(to, collapsed)}
    >
      <NavIcon path={to} />
      {!collapsed && label}
    </Link>
  );

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

  const buildNavContent = (collapsed: boolean) => (
    <>
      <Link
        to="/"
        title={collapsed ? 'Inicio' : undefined}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: isMobile ? undefined : 52,
          minHeight: isMobile ? undefined : 52,
          marginBottom: isMobile ? '24px' : 0,
          flexShrink: 0,
          textDecoration: 'none',
        }}
      >
        <img
          src={collapsed ? logoSidebarCollapsed : logoSidebar}
          alt="Grupo Cristal"
          style={{
            width: collapsed ? '28px' : '100%',
            maxWidth: isMobile ? '160px' : collapsed ? '28px' : '128px',
            height: 'auto',
            maxHeight: isMobile ? undefined : collapsed ? 28 : 36,
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </Link>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, paddingTop: isMobile ? 0 : 10 }}>
        {puedeVerDashboard && renderNavLink(dashboardNavItem.to, dashboardNavItem.label, collapsed)}
        {puedeVerSolicitudesVacaciones && renderNavLink(solicitudesVacacionesNavItem.to, solicitudesVacacionesNavItem.label, collapsed)}
        {showFullAdmin
          ? superAdminNavItems.map(item => renderNavLink(item.to, item.label, collapsed))
          : showRHNav
          ? [
              ...empleadoNavLinks.map(item => renderNavLink(item.to, item.label, collapsed)),
              renderNavLink('/rh', 'Recursos Humanos', collapsed),
              renderNavLink('/organigrama', 'Organigrama', collapsed),
            ]
          : [
              ...empleadoNavLinks.map(item => renderNavLink(item.to, item.label, collapsed)),
              ...(showMiAreaOnly ? [renderNavLink(miAreaNavItem.to, miAreaNavItem.label, collapsed)] : []),
              ...((puedeVerOrganigrama && !showFullAdmin) ? [renderNavLink('/organigrama', 'Organigrama', collapsed)] : []),
              ...(isTI ? [renderNavLink('/soporte', 'Soporte TI', collapsed)] : []),
            ]
        }
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: 'auto' }}>
        {showFullAdmin && canAccessNomina(isSuperuser) && renderNavLink('/nomina', 'Nómina', collapsed)}
        {/* Flecha tipo pestaña (>| / |<) justo arriba de Configuración. */}
        {!isMobile && (
          <SidebarTabToggle
            collapsed={collapsed}
            onToggle={() => setSidebarCollapsed(c => !c)}
          />
        )}
        {showFullAdmin && renderNavLink('/configuracion', 'Configuración', collapsed)}
      </div>
      {!collapsed && (
        <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
          v1.5.1
        </div>
      )}
    </>
  );

  const navContent = buildNavContent(false);

  return (
    <>
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      backgroundColor: '#1e3a5f',
    }}>

      {/* ── Sidebar desktop (misma pieza que el header; sin sombra ni z-index) ── */}
      {!isMobile && (
        <aside
          style={{
            width: sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
            flexShrink: 0,
            backgroundColor: 'transparent',
            color: 'white',
            padding: sidebarCollapsed ? '0 6px 14px' : '0 12px 14px',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            overflowX: 'hidden',
            boxShadow: 'none',
            transition: 'width 0.2s ease, padding 0.2s ease',
          }}
        >
          {buildNavContent(sidebarCollapsed)}
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
            width: '232px',
            backgroundColor: '#1e3a5f',
            color: 'white',
            padding: '16px 14px',
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
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'transparent' }}>
        {/* Header superior — fundido con el sidebar (misma franja) */}
        <header style={{
          backgroundColor: 'transparent',
          padding: '0 16px',
          height: '52px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          boxShadow: 'none',
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
            <img src={logoSidebar} alt="Logo" style={{ height: '28px', objectFit: 'contain' }} />
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

        <main style={{
          flex: 1,
          minHeight: 0,
          backgroundColor: '#f0f4f8',
          overflow: 'auto',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        }}>
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
    {/* ── Modal aniversario laboral ── */}
    {mostrarAniversario && authMe && (
      <div
        onClick={() => setMostrarAniversario(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
          animation: 'fadeInOverlay 0.3s ease',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: '#fff',
            borderRadius: '22px',
            maxWidth: '440px', width: '100%',
            overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
            animation: 'slideUpModal 0.38s cubic-bezier(0.34,1.56,0.64,1)',
            position: 'relative',
          }}
        >
          {/* Banner superior */}
          <div style={{
            background: 'linear-gradient(135deg, #1e3a5f 0%, #2563a8 60%, #1e88d4 100%)',
            padding: '32px 28px 60px',
            textAlign: 'center', position: 'relative', overflow: 'hidden',
          }}>
            {/* Círculos decorativos */}
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
            <div style={{ position: 'absolute', bottom: -20, left: -20, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
            <button
              onClick={() => setMostrarAniversario(false)}
              style={{
                position: 'absolute', top: 12, right: 14,
                background: 'rgba(255,255,255,0.15)', border: 'none',
                color: '#fff', width: 28, height: 28, borderRadius: '50%',
                cursor: 'pointer', fontSize: 13, zIndex: 1,
              }}
            >✕</button>
            <div style={{ letterSpacing: '4px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', fontWeight: 700, marginBottom: 8, fontSize: '0.72rem' }}>
              🏢 Óptica Express
            </div>
            <div style={{ fontSize: '3rem', marginBottom: 6 }}>🎊</div>
            <h2 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 800, margin: 0, lineHeight: 1.3 }}>
              ¡Feliz aniversario, {authMe.nombre}!
            </h2>
          </div>

          {/* Medallón de años */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: -36, position: 'relative', zIndex: 1 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              border: '4px solid #fff',
              boxShadow: '0 4px 16px rgba(245,158,11,0.4)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                {authMe.anios_empresa}
              </span>
              <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.9)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                {authMe.anios_empresa === 1 ? 'año' : 'años'}
              </span>
            </div>
          </div>

          {/* Cuerpo */}
          <div style={{ padding: '16px 26px 26px' }}>
            <p style={{ textAlign: 'center', color: '#444', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 18 }}>
              Hoy cumples <strong style={{ color: '#1e3a5f' }}>
                {authMe.anios_empresa} {authMe.anios_empresa === 1 ? 'año' : 'años'}
              </strong> con nosotros. ¡Gracias por tu dedicación y esfuerzo!
            </p>

            {/* Cuadro de vacaciones */}
            {(authMe.dias_vacaciones_aniversario ?? 0) > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
                border: '1px solid #bae6fd',
                borderRadius: 14, padding: '16px 18px', marginBottom: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #0369a1, #0ea5e9)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.3rem', flexShrink: 0,
                  }}>🏖️</div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                      Vacaciones correspondientes
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0c4a6e', lineHeight: 1.1 }}>
                      {authMe.dias_vacaciones_aniversario} días
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#0369a1' }}>
                      Conforme a la LFT México — Art. 76
                    </div>
                  </div>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#0369a1', lineHeight: 1.5 }}>
                  Puedes solicitarlos en el módulo de <strong>Vacaciones</strong>. Tienes hasta 18 meses para disfrutarlos.
                </p>
              </div>
            )}

            <button
              onClick={() => setMostrarAniversario(false)}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #1e3a5f, #2563a8)',
                color: '#fff', border: 'none',
                padding: '12px 0', borderRadius: 50, fontWeight: 700,
                fontSize: '0.95rem', cursor: 'pointer',
              }}
            >
              ¡Muchas gracias! 🎉
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};
