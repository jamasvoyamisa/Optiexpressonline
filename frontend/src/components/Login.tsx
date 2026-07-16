import { useState, useEffect } from 'react';
import logoGrupo from '../assets/GPOCristal.png';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { AuthMe } from '../hooks/useAuth';
import { JubilacionArceliaModal } from './JubilacionArceliaModal';
import { DiaMadres2026Modal } from './DiaMadres2026Modal';


const getDefaultRoute = (me: AuthMe | null): string => {
  if (me?.must_change_password) return '/cambiar-contrasena';
  if (me?.puede_ver_dashboard) return '/dashboard';
  if (me?.puede_ver_mi_area) return '/mi-area';
  if (me?.exento_incidencias) return '/mis-datos';
  return '/mis-asistencias';
};

export const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { login, isAuthenticated, authMe, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const forzarJubilacion = searchParams.get('ver_jubilacion') === '1';
  const forzarDiaMadres = searchParams.get('ver_madres') === '1';

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'session_kicked') {
      setError('Tu sesión fue cerrada porque iniciaste sesión desde otro dispositivo.');
      setSearchParams({}, { replace: true });
    } else if (reason === 'session_expired' || searchParams.get('session_expired') === '1') {
      setError('Tu sesión ha expirado. Por favor inicia sesión de nuevo.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Si ya está autenticado, redirigir a la página principal
  if (!authLoading && isAuthenticated && authMe) {
    return <Navigate to={getDefaultRoute(authMe)} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Sanitización básica: recortar espacios, límite de longitud
    const cleanUsername = username.trim().slice(0, 100);
    const cleanPassword = password.slice(0, 200);

    if (!cleanUsername || !cleanPassword) {
      setError('Ingresa usuario y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const authMe = await login(cleanUsername, cleanPassword);
      if (authMe !== null) {
        const route = getDefaultRoute(authMe);
        setTimeout(() => navigate(route, { replace: true }), 0);
      } else {
        setError('Credenciales incorrectas');
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = ax?.response?.data?.detail;
      if (typeof msg === 'string') {
        setError(msg);
      } else if (ax?.response) {
        setError('Error al iniciar sesión. Inténtalo de nuevo.');
      } else {
        setError('No se pudo conectar al servidor. Verifica tu conexión.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <JubilacionArceliaModal forzar={forzarJubilacion} />
      <DiaMadres2026Modal forzar={forzarDiaMadres} />
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f2057 0%, #1a4a8a 40%, #0e7ab5 70%, #0ea5c9 100%)',
      overflow: 'hidden',
    }}>
      {/* Orbes de fondo para que el glass tenga algo que difuminar */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: '-160px', right: '-100px',
          width: '520px', height: '520px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(14,165,233,0.45) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-120px', left: '-120px',
          width: '480px', height: '480px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', top: '40%', left: '30%',
          width: '300px', height: '300px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)',
        }} />
      </div>

      {/* Tarjeta glassmorphism */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        background: 'rgba(255, 255, 255, 0.12)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.25)',
        padding: '2.5rem',
        borderRadius: '20px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.2)',
        width: '100%',
        maxWidth: '400px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <img
            src={logoGrupo}
            alt="Grupo Cristal"
            style={{ maxWidth: '180px', height: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
          />
        </div>
        <h1 style={{
          textAlign: 'center', marginBottom: '0.4rem',
          color: '#ffffff', fontSize: '1.15rem', fontWeight: 700,
          textShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }}>
          Sistema de Gestión Interna
        </h1>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginBottom: '2rem' }}>
          Inicia sesión para continuar
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'rgba(255,255,255,0.85)', fontSize: '0.88rem', fontWeight: 500 }}>
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              maxLength={100}
              spellCheck={false}
              style={{
                width: '100%', padding: '0.7rem 0.9rem',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: '10px',
                fontSize: '0.95rem', color: '#0f172a',
                caretColor: '#0f172a',
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.7)'; e.target.style.background = 'rgba(255,255,255,0.22)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.3)'; e.target.style.background = 'rgba(255,255,255,0.15)'; }}
            />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: 'rgba(255,255,255,0.85)', fontSize: '0.88rem', fontWeight: 500 }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              maxLength={200}
              style={{
                width: '100%', padding: '0.7rem 0.9rem',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: '10px',
                fontSize: '0.95rem', color: '#0f172a',
                caretColor: '#0f172a',
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.7)'; e.target.style.background = 'rgba(255,255,255,0.22)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.3)'; e.target.style.background = 'rgba(255,255,255,0.15)'; }}
            />
          </div>
          {error && (
            <div style={{
              color: '#fecdd3', marginBottom: '1rem', padding: '0.6rem 0.8rem',
              background: 'rgba(239,68,68,0.25)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: '8px',
              fontSize: '0.875rem',
              backdropFilter: 'blur(4px)',
            }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '0.75rem',
              background: loading
                ? 'rgba(14,165,233,0.4)'
                : 'linear-gradient(135deg, rgba(14,165,233,0.9) 0%, rgba(6,100,175,0.9) 100%)',
              color: 'white', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '10px',
              fontSize: '0.95rem', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.02em',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
    </>
  );
};
