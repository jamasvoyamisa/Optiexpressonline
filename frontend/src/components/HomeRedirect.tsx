import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/** Redirige al destino correcto según el rol del usuario. */
export const HomeRedirect = () => {
  const { isAuthenticated, authMe, loading } = useAuth();

  if (loading) return <div style={{ padding: '24px', textAlign: 'center' }}>Cargando...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (authMe?.must_change_password) return <Navigate to="/cambiar-contrasena" replace />;

  // Administrador, Director, Gerente General, RH → Dashboard
  if (authMe?.puede_ver_dashboard) return <Navigate to="/dashboard" replace />;

  // Gerente o supervisor → Dashboard (con datos de su área)
  if (authMe?.puede_ver_mi_area) return <Navigate to="/dashboard" replace />;

  // Usuario especial (sin registro de asistencia operativo) → Mis datos
  if (authMe?.exento_incidencias) return <Navigate to="/mis-datos" replace />;

  // Empleado normal → sus asistencias
  return <Navigate to="/mis-asistencias" replace />;
};
