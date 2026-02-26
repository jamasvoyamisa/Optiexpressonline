import { useState, useEffect } from 'react';
import api from '../services/api';

interface AuthState {
  isAuthenticated: boolean;
  user: any | null;
  loading: boolean;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    loading: true,
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Verificar si el token es válido
      // Por ahora, solo verificamos que exista
      setAuthState({
        isAuthenticated: true,
        user: null, // Se puede cargar desde el token o hacer una petición
        loading: false,
      });
    } else {
      setAuthState({
        isAuthenticated: false,
        user: null,
        loading: false,
      });
    }
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const response = await api.post('/auth/login', {
        username,
        password,
      });
      const { access_token } = response.data;
      localStorage.setItem('token', access_token);
      setAuthState({
        isAuthenticated: true,
        user: response.data.user,
        loading: false,
      });
      return true;
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setAuthState({
      isAuthenticated: false,
      user: null,
      loading: false,
    });
  };

  return {
    ...authState,
    login,
    logout,
  };
};
