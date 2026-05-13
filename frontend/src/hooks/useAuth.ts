import React, { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import api from '../services/api';
import { authStorage } from '../services/authStorage';

export interface AuthMe {
  id: number;
  numero_empleado: string;
  nombre: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  email?: string | null;
  rol_id?: number | null;
  is_jefe: boolean;
  is_superuser?: boolean;
  is_rh?: boolean;
  is_ti?: boolean;
  is_gerente_general?: boolean;
  is_director?: boolean;
  fecha_nacimiento?: string | null;
  fecha_ingreso?: string | null;
  es_aniversario_hoy?: boolean;
  anios_empresa?: number;
  dias_vacaciones_aniversario?: number;
  /** Usuario especial (exento de incidencias): no solicita vacaciones ni préstamos en la app. */
  exento_incidencias?: boolean;
  /** True si puede ver Dashboard (Administrador, Director, Gerente General, RH). */
  puede_ver_dashboard?: boolean;
  /** True si es gerente (área a cargo) o supervisor en su departamento; puede ver Mi Área (incidencias y solicitudes). */
  puede_ver_mi_area?: boolean;
  departamento_ids: number[];
  departamentos: { id: number; nombre: string }[];
  /** Departamentos que administra (como gerente o supervisor) para mostrar en Mi Área. */
  departamentos_que_administro?: { id: number; nombre: string }[];
}

interface AuthState {
  isAuthenticated: boolean;
  user: any | null;
  authMe: AuthMe | null;
  loading: boolean;
}

type AuthContextValue = AuthState & {
  /** Devuelve el AuthMe del usuario si el login fue exitoso, o null si falló. */
  login: (username: string, password: string) => Promise<AuthMe | null>;
  logout: () => void;
  refreshAuthMe: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    authMe: null,
    loading: true,
  });

  const doLogout = useCallback(() => {
    authStorage.clear();
    setAuthState({ isAuthenticated: false, user: null, authMe: null, loading: false });
  }, []);

  const fetchAuthMe = useCallback(() => {
    const token = authStorage.getToken();
    if (!token) return Promise.resolve(null);
    const load = () => api.get<AuthMe>('/auth/me').then((res) => res.data);
    return load().catch((err: { response?: { status?: number } }) => {
      const s = err?.response?.status;
      if (s === 502 || s === 503) {
        return new Promise((r) => setTimeout(r, 1000)).then(() => load().catch(() => null));
      }
      return null;
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
    } catch {
      /* ignore */
    }
    const token = authStorage.getToken();
    if (!token) {
      setAuthState({ isAuthenticated: false, user: null, authMe: null, loading: false });
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      setAuthState((prev) => (prev.loading ? { ...prev, loading: false, isAuthenticated: false, user: null, authMe: null } : prev));
    }, 8000);
    fetchAuthMe().then((me) => {
      if (!cancelled) {
        setAuthState({
          isAuthenticated: me !== null,
          user: me ? { id: me.id, nombre: me.nombre } : null,
          authMe: me,
          loading: false,
        });
        // Si el token existe pero el servidor lo rechazó, limpiarlo
        if (me === null) {
          authStorage.clear();
        }
      }
    }).finally(() => { clearTimeout(timeout); });
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [fetchAuthMe]);

  const login = useCallback(async (username: string, password: string): Promise<AuthMe | null> => {
    const response = await api.post<{ access_token: string; refresh_token: string; user: any; me?: AuthMe }>('/auth/login', {
      username,
      password,
    });
    const { access_token, refresh_token, user, me } = response.data;
    if (!access_token || !refresh_token) {
      console.error('Login: no se recibió token');
      return null;
    }
    authStorage.setTokens(access_token, refresh_token);
    const authMeData = me ?? await fetchAuthMe();
    setAuthState({
      isAuthenticated: true,
      user: user ?? authMeData,
      authMe: authMeData,
      loading: false,
    });
    return authMeData;
  }, [fetchAuthMe]);

  const logout = useCallback(() => {
    doLogout();
  }, [doLogout]);

  const refreshAuthMe = useCallback(() => {
    fetchAuthMe().then((me) => {
      setAuthState((prev) => (prev.isAuthenticated ? { ...prev, authMe: me } : prev));
    });
  }, [fetchAuthMe]);

  const value: AuthContextValue = {
    ...authState,
    login,
    logout,
    refreshAuthMe,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

const defaultAuth: AuthContextValue = {
  isAuthenticated: false,
  user: null,
  authMe: null,
  loading: false,
  login: async () => null,
  logout: () => {},
  refreshAuthMe: () => {},
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  return ctx ?? defaultAuth;
};
