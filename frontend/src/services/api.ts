import axios from 'axios';

// Usar URL relativa para que el proxy de Vite funcione al acceder desde la red interna
// Siempre usar ruta relativa al origin para que el proxy de Vite funcione
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
// Si VITE_API_URL es URL absoluta sin /api/v1, añadir el path
const baseURL = API_BASE_URL.startsWith('http') && !API_BASE_URL.includes('/api/v1')
  ? API_BASE_URL.replace(/\/$/, '') + '/api/v1'
  : API_BASE_URL;

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token y corregir URLs (axios ignora baseURL si url empieza con /)
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Si url es ruta completa /api/v1/..., no modificar (axios la usa como absoluta al origin)
    // Solo quitar / inicial cuando es ruta relativa como /prestamos para que baseURL se use
    if (config.url?.startsWith('/') && !config.url.startsWith('/api/') && config.baseURL) {
      config.url = config.url.slice(1);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // No redirigir si el 401 viene del login (credenciales incorrectas)
      const isLoginRequest = error.config?.url?.includes('/auth/login');
      if (!isLoginRequest) {
        localStorage.removeItem('token');
        window.location.href = '/login?session_expired=1';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
