import React, { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import api from '../services/api';

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;

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

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAuthenticatedRef = useRef(false);

  const doLogout = useCallback(() => {
    localStorage.removeItem('token');
    setAuthState({ isAuthenticated: false, user: null, authMe: null, loading: false });
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (!isAuthenticatedRef.current) return;
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(doLogout, INACTIVITY_TIMEOUT_MS);
  }, [doLogout]);

  // Escuchar eventos de actividad del usuario cuando está autenticado
  useEffect(() => {
    isAuthenticatedRef.current = authState.isAuthenticated;
    if (!authState.isAuthenticated) {
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
        inactivityTimer.current = null;
      }
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, resetInactivityTimer));
      return;
    }
    // Iniciar temporizador y escuchar actividad
    resetInactivityTimer();
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, resetInactivityTimer, { passive: true }));
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, resetInactivityTimer));
    };
  }, [authState.isAuthenticated, resetInactivityTimer]);

  const fetchAuthMe = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return Promise.resolve(null);
    return api.get<AuthMe>('/auth/me')
      .then((res) => res.data)
      .catch(() => null);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
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
          isAuthenticated: true,
          user: me ? { id: me.id, nombre: me.nombre } : null,
          authMe: me,
          loading: false,
        });
      }
    }).finally(() => { clearTimeout(timeout); });
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [fetchAuthMe]);

  const login = useCallback(async (username: string, password: string): Promise<AuthMe | null> => {
    try {
      const response = await api.post<{ access_token: string; user: any; me?: AuthMe }>('/auth/login', {
        username,
        password,
      });
      const { access_token, user, me } = response.data;
      if (!access_token) {
        console.error('Login: no se recibió token');
        return null;
      }
      localStorage.setItem('token', access_token);
      const authMeData = me ?? await fetchAuthMe();
      setAuthState({
        isAuthenticated: true,
        user: user ?? authMeData,
        authMe: authMeData,
        loading: false,
      });
      return authMeData;
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      return null;
    }
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
