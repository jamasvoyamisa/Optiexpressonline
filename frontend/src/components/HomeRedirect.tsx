import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/** Redirige al destino correcto según el rol del usuario. */
export const HomeRedirect = () => {
  const { isAuthenticated, authMe, loading } = useAuth();

  if (loading) return <div style={{ padding: '24px', textAlign: 'center' }}>Cargando...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Superadmin / admin → panel de administración
  if (authMe?.is_superuser) return <Navigate to="/rh" replace />;

  // Gerente o supervisor → Mi Área
  if (authMe?.puede_ver_mi_area) return <Navigate to="/mi-area" replace />;

  // Empleado normal → sus asistencias
  return <Navigate to="/mis-asistencias" replace />;
};
