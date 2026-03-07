import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const HomeRedirect = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div style={{ padding: '24px', textAlign: 'center' }}>Cargando...</div>;
  return <Navigate to={isAuthenticated ? '/mis-asistencias' : '/login'} replace />;
};
