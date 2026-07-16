import axios from 'axios';
import { authStorage } from './authStorage';

// Usar URL relativa para que el proxy de Vite funcione al acceder desde la red interna
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const baseURL = API_BASE_URL.startsWith('http') && !API_BASE_URL.includes('/api/v1')
  ? API_BASE_URL.replace(/\/$/, '') + '/api/v1'
  : API_BASE_URL;

const api = axios.create({
  baseURL,
  timeout: 45_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Lee SIEMPRE de authStorage (sessionStorage) — nunca de localStorage.
  const refreshToken = authStorage.getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await axios.post(
      `${baseURL.replace(/\/$/, '')}/auth/refresh`,
      { refresh_token: refreshToken },
      { headers: { 'Content-Type': 'application/json' } }
    );
    const nextAccess = res.data?.access_token as string | undefined;
    const nextRefresh = res.data?.refresh_token as string | undefined;
    if (!nextAccess || !nextRefresh) return null;
    authStorage.setTokens(nextAccess, nextRefresh);
    return nextAccess;
  } catch {
    return null;
  }
}

// Interceptor para agregar token
api.interceptors.request.use(
  (config) => {
    const token = authStorage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.url?.startsWith('/') && !config.url.startsWith('/api/') && config.baseURL) {
      config.url = config.url.slice(1);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor para manejar 401: intenta refresh; si falla o sesión expulsada → login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const originalRequest = error.config || {};
      const url = String(originalRequest.url || '');
      const isRefreshRequest = url.includes('/auth/refresh');
      const isLoginRequest = url.includes('/auth/login');
      const alreadyRetried = Boolean(originalRequest._retry);

      // Login fallido (credenciales incorrectas): no redirigir como «sesión expirada».
      if (isLoginRequest) {
        return Promise.reject(error);
      }

      // Mensaje específico cuando el backend informa sesión desplazada
      const detail: string = error.response?.data?.detail ?? '';
      const isKicked = detail.toLowerCase().includes('otro dispositivo');

      if (!isRefreshRequest && !alreadyRetried && !isKicked) {
        originalRequest._retry = true;
        if (!isRefreshing) {
          isRefreshing = true;
          refreshPromise = refreshAccessToken().finally(() => {
            isRefreshing = false;
          });
        }
        const newToken = await refreshPromise;
        if (newToken) {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      }

      authStorage.clear();
      const reason = isKicked ? 'session_kicked' : 'session_expired';
      window.location.href = `/login?reason=${reason}`;
    }
    return Promise.reject(error);
  }
);

export default api;
