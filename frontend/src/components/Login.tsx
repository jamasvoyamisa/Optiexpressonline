import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { AuthMe } from '../hooks/useAuth';


const getDefaultRoute = (me: AuthMe | null): string => {
  if (me?.puede_ver_dashboard) return '/dashboard';
  if (me?.puede_ver_mi_area) return '/mi-area';
  return '/mis-asistencias';
};

export const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { login, isAuthenticated, authMe, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const reason = sessionStorage.getItem('logout_reason');
    if (reason === 'inactivity') {
      sessionStorage.removeItem('logout_reason');
      setError('Sesión cerrada por inactividad. Por favor inicia sesión de nuevo.');
      return;
    }
    if (searchParams.get('session_expired') === '1') {
      setError('Tu sesión ha expirado. Por favor inicia sesión de nuevo.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Si ya está autenticado, redirigir a la página principal
  if (!authLoading && isAuthenticated && authMe) {
    return <Navigate to={getDefaultRoute(authMe)} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const authMe = await login(username, password);
      if (authMe !== null) {
        const route = getDefaultRoute(authMe);
        // Defer navigate para que el estado de auth se actualice antes de renderizar la ruta
        setTimeout(() => navigate(route, { replace: true }), 0);
      } else {
        setError('Credenciales incorrectas');
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = ax?.response?.data?.detail;
      if (typeof msg === 'string') {
        setError(msg);
      } else if (ax?.response) {
        setError('Error del servidor. Revisa la consola.');
      } else {
        setError('No se pudo conectar al servidor. Verifica que el backend esté en ejecución (puerto 9081).');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '2rem', color: '#333' }}>
          Sistema de Gestión Interna
        </h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#555' }}>
              Usuario (Email o Número de Empleado)
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#555' }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            />
          </div>
          {error && (
            <div style={{
              color: 'red',
              marginBottom: '1rem',
              padding: '0.5rem',
              backgroundColor: '#fee',
              borderRadius: '4px'
            }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#0ea5e9',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
};
