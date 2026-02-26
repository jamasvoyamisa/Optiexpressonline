import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: '250px',
        backgroundColor: '#1f2937',
        color: 'white',
        padding: '20px',
      }}>
        <h2 style={{ marginBottom: '30px' }}>Optiexpress</h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link to="/" style={{ color: 'white', textDecoration: 'none' }}>Dashboard</Link>
          <Link to="/personal" style={{ color: 'white', textDecoration: 'none' }}>Personal</Link>
          <Link to="/vacaciones" style={{ color: 'white', textDecoration: 'none' }}>Vacaciones</Link>
          <Link to="/rh" style={{ color: 'white', textDecoration: 'none' }}>RH</Link>
          <Link to="/asistencia" style={{ color: 'white', textDecoration: 'none' }}>Asistencia</Link>
        </nav>
        {isAuthenticated && (
          <button
            onClick={handleLogout}
            style={{
              marginTop: '30px',
              padding: '10px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            Cerrar Sesión
          </button>
        )}
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '20px', backgroundColor: '#f3f4f6' }}>
        {children}
      </main>
    </div>
  );
};
