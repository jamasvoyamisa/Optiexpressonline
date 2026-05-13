import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { AuthMe } from '../hooks/useAuth';

/** Permisos requeridos por ruta: soporte (TI o admin), superuser (solo admin), rh (RH o admin), configuracion (solo admin), dashboard, mi_area, solicitudes_vacaciones (Admin/Director/GG), o all (cualquier autenticado). */
export type RoutePermission = 'soporte' | 'superuser' | 'rh' | 'configuracion' | 'dashboard' | 'mi_area' | 'solicitudes_vacaciones' | 'all';

const hasPermission = (authMe: AuthMe | null, perm: RoutePermission): boolean => {
  if (!authMe) return false;
  if (perm === 'all') return true;
  if (perm === 'soporte') return authMe.is_superuser === true || authMe.is_ti === true;
  if (perm === 'superuser') return authMe.is_superuser === true;
  if (perm === 'rh') return authMe.is_rh === true || authMe.is_superuser === true || authMe.is_director === true;
  if (perm === 'configuracion') return authMe.is_superuser === true;
  if (perm === 'dashboard') return authMe.puede_ver_dashboard === true || authMe.puede_ver_mi_area === true;
  if (perm === 'mi_area') return authMe.puede_ver_mi_area === true;
  if (perm === 'solicitudes_vacaciones') return authMe.is_superuser === true || authMe.is_director === true || authMe.is_gerente_general === true || authMe.is_rh === true;
  return false;
};

interface ProtectedRouteProps {
  children: ReactNode;
  /** Si se especifica, el usuario debe tener este permiso o se redirige a su página principal. */
  require?: RoutePermission;
}

/** Protege rutas: redirige a /login si no autenticado; a / si no tiene el permiso requerido. */
export const ProtectedRoute = ({ children, require: requiredPerm = 'all' }: ProtectedRouteProps) => {
  const { isAuthenticated, authMe, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f0f4f8',
      }}>
        <span style={{ color: '#6b7280', fontSize: '1rem' }}>Cargando...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasPermission(authMe, requiredPerm)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
