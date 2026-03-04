import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { to: '/rh', label: 'Recursos Humanos' },
];

const adminItems = [
  { to: '/configuracion', label: 'Configuracion' },
];

export const Layout = ({ children }: LayoutProps) => {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: '250px',
        backgroundColor: '#1f2937',
        color: 'white',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <h2 style={{ marginBottom: '30px' }}>Grupo Cristal</h2>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {navItems.map(item => (
            <Link key={item.to} to={item.to} style={linkStyle(item.to)}>{item.label}</Link>
          ))}
        </nav>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '12px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', padding: '0 12px' }}>
              Administrador
            </span>
          </div>
          {adminItems.map(item => (
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

      <main style={{ flex: 1, backgroundColor: '#f3f4f6', overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
};
