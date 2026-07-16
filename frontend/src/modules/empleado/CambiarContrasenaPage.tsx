import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import logoGrupo from '../../assets/GPOCristal.png';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

const inputStyleBase: CSSProperties = {
  width: '100%',
  padding: '0.7rem 0.9rem',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: '10px',
  fontSize: '0.95rem',
  color: '#0f172a',
  caretColor: '#0f172a',
  background: 'rgba(255,255,255,0.15)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, background 0.15s',
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '0.4rem',
  color: 'rgba(255,255,255,0.85)',
  fontSize: '0.88rem',
  fontWeight: 500,
};

/**
 * Pantalla obligatoria cuando must_change_password=true (alta o reset temporal).
 * También usable desde Mis datos para cambio voluntario.
 */
export const CambiarContrasenaPage = ({ forzar = false }: { forzar?: boolean }) => {
  const { refreshAuthMe, logout, authMe } = useAuth();
  const navigate = useNavigate();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  // Tras reset/alta ya entró con la temporal: no pedirla de nuevo.
  const omitirActual = forzar || authMe?.must_change_password === true;
  const estiloLogin = forzar || omitirActual;

  const onFocusInput = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'rgba(255,255,255,0.7)';
    e.target.style.background = 'rgba(255,255,255,0.22)';
  };
  const onBlurInput = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'rgba(255,255,255,0.3)';
    e.target.style.background = 'rgba(255,255,255,0.15)';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOk(false);
    if (nueva.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (nueva !== confirm) {
      setError('La confirmación no coincide.');
      return;
    }
    if (!omitirActual && !actual.trim()) {
      setError('Indica tu contraseña actual.');
      return;
    }
    setSaving(true);
    try {
      const body: { password_nueva: string; password_actual?: string } = {
        password_nueva: nueva,
      };
      if (!omitirActual) {
        body.password_actual = actual;
      }
      await api.post('/auth/cambiar-password', body);
      setOk(true);
      const me = await refreshAuthMe();
      if (forzar || omitirActual) {
        navigate('/', { replace: true });
      } else if (me?.must_change_password === false) {
        setActual('');
        setNueva('');
        setConfirm('');
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setError(ax.response?.data?.detail || 'No se pudo cambiar la contraseña');
    } finally {
      setSaving(false);
    }
  };

  const formFields = (
    <form onSubmit={handleSubmit}>
      {!omitirActual && (
        <div style={{ marginBottom: '1rem' }}>
          <label style={estiloLogin ? labelStyle : { display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 500, color: '#374151' }}>
            Contraseña actual
          </label>
          <input
            type="password"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            required
            autoComplete="current-password"
            style={estiloLogin ? inputStyleBase : {
              width: '100%', height: 40, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box',
            }}
            onFocus={estiloLogin ? onFocusInput : undefined}
            onBlur={estiloLogin ? onBlurInput : undefined}
          />
        </div>
      )}
      <div style={{ marginBottom: '1rem' }}>
        <label style={estiloLogin ? labelStyle : { display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 500, color: '#374151' }}>
          Nueva contraseña
        </label>
        <input
          type="password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          style={estiloLogin ? inputStyleBase : {
            width: '100%', height: 40, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box',
          }}
          onFocus={estiloLogin ? onFocusInput : undefined}
          onBlur={estiloLogin ? onBlurInput : undefined}
        />
      </div>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={estiloLogin ? labelStyle : { display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 500, color: '#374151' }}>
          Confirmar nueva
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          style={estiloLogin ? inputStyleBase : {
            width: '100%', height: 40, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box',
          }}
          onFocus={estiloLogin ? onFocusInput : undefined}
          onBlur={estiloLogin ? onBlurInput : undefined}
        />
      </div>
      {error && (
        <div style={estiloLogin ? {
          color: '#fecdd3', marginBottom: '1rem', padding: '0.6rem 0.8rem',
          background: 'rgba(239,68,68,0.25)',
          border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: '8px',
          fontSize: '0.875rem',
          backdropFilter: 'blur(4px)',
        } : { color: '#b91c1c', fontSize: '0.85rem', marginBottom: 12 }}>
          {error}
        </div>
      )}
      {ok && !estiloLogin && (
        <p style={{ color: '#15803d', fontSize: '0.85rem', margin: '0 0 12px' }}>Contraseña actualizada.</p>
      )}
      <button
        type="submit"
        disabled={saving}
        style={estiloLogin ? {
          width: '100%', padding: '0.75rem',
          background: saving
            ? 'rgba(14,165,233,0.4)'
            : 'linear-gradient(135deg, rgba(14,165,233,0.9) 0%, rgba(6,100,175,0.9) 100%)',
          color: 'white', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '10px',
          fontSize: '0.95rem', fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
          letterSpacing: '0.02em',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          transition: 'opacity 0.15s',
        } : {
          width: '100%',
          height: 42,
          border: 'none',
          borderRadius: 8,
          background: '#0ea5e9',
          color: '#fff',
          fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Guardando...' : 'Guardar contraseña'}
      </button>
    </form>
  );

  if (!estiloLogin) {
    return (
      <div style={{
        maxWidth: 420,
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        padding: '24px',
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.1rem', color: '#1e3a5f' }}>Cambiar contraseña</h2>
        <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: '#6b7280', lineHeight: 1.45 }}>
          Para cambiarla debes confirmar tu contraseña actual. RH no puede fijar la definitiva por ti.
        </p>
        {formFields}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f2057 0%, #1a4a8a 40%, #0e7ab5 70%, #0ea5c9 100%)',
      overflow: 'hidden',
    }}>
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
        margin: '16px',
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
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginBottom: '1.75rem' }}>
          Elige tu contraseña propia para continuar
        </p>
        {formFields}
        <button
          type="button"
          onClick={() => logout()}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '0.65rem',
            background: 'transparent',
            color: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: '10px',
            fontSize: '0.9rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
};
