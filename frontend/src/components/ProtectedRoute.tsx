import { ReactNode } from 'react';
// import { Navigate } from 'react-router-dom';
// import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  // Login desactivado en desarrollo
  // const { isAuthenticated, loading } = useAuth();

  // if (loading) {
  //   return <div>Cargando...</div>;
  // }

  // if (!isAuthenticated) {
  //   return <Navigate to="/login" replace />;
  // }

  return <>{children}</>;
};
