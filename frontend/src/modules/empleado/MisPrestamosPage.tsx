import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../../services/api';
import { generarDocumentoPrestamo } from '../prestamos/documentoPrestamo';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuth } from '../../hooks/useAuth';

interface SolicitudPrestamo {
  id: number;
  numero_solicitud?: string | null;
  empleado_id: number;
  monto: string;
  plazo_meses: number;
  motivo?: string | null;
  descuento_quincenal?: string | null;
  estado: string;
  comentarios_aprobacion?: string | null;
  created_at: string;
  fecha_aprobacion?: string | null;
  fecha_deposito?: string | null;
  referencia_bancaria?: string | null;
  /** Saldo restante calculado en el servidor (quincenas día 15 y fin de mes). Tiene prioridad si viene. */
  saldo_restante?: number | string | null;
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada_departamento: 'Autorizada por departamento',
  depositado: 'Depositado',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
};

const ESTADO_STYLE: Record<string, { bg: string; color: string }> = {
  pendiente: { bg: '#fef3c7', color: '#92400e' },
  aprobada_departamento: { bg: '#e0f2fe', color: '#0369a1' },
  depositado: { bg: '#d1fae5', color: '#065f46' },
  rechazada: { bg: '#fee2e2', color: '#991b1b' },
  cancelada: { bg: '#f3f4f6', color: '#6b7280' },
};

const th: React.CSSProperties = {
  padding: '10px 13px', textAlign: 'left', borderBottom: '2px solid #dee2e6',
  fontSize: '0.81rem', fontWeight: 600, color: '#555', backgroundColor: '#f8f9fa',
};
const td: React.CSSProperties = {
  padding: '10px 13px', borderBottom: '1px solid #f0f0f0', fontSize: '0.88rem',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px',
  fontSize: '0.88rem', outline: 'none', width: '100%', boxSizing: 'border-box',
};

const formatMonto = (v: string | number) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
};

/** Parsea la fecha de aprobación: usa el día de calendario que envió el servidor (UTC) para evitar desfases por zona horaria. */
const parseFechaAprobacionLocal = (raw: string): Date | null => {
  const s = (raw && String(raw).trim()) || '';
  // Buscar YYYY-MM-DD en cualquier parte (p. ej. "2025-03-10T19:00:00.000Z" o "2025-03-10")
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10) - 1;
    const d = parseInt(iso[3], 10);
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      // Usar la misma fecha como día de calendario local (el “día” que ve el usuario)
      return new Date(Date.UTC(y, m, d));
    }
  }
  const parsed = new Date(s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z');
  if (isNaN(parsed.getTime())) return null;
  // Si el backend envió hora, usar año/mes/día UTC como día de calendario
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

/** Último día del mes (1-31) en zona local. month es 0-11. */
const getLastDayOfMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate();

/** Cuenta quincenas de calendario (día 15 y fin de mes) ya pasadas. Usa UTC para coincidir con el servidor. */
const contarQuincenasCalendario = (fechaAprobacion: Date): number => {
  const now = new Date();
  const ay = fechaAprobacion.getUTCFullYear?.() ?? fechaAprobacion.getFullYear();
  const am = fechaAprobacion.getUTCMonth?.() ?? fechaAprobacion.getMonth();
  const ad = fechaAprobacion.getUTCDate?.() ?? fechaAprobacion.getDate();
  const ty = now.getUTCFullYear();
  const tm = now.getUTCMonth();
  const td = now.getUTCDate();
  if (ay > ty || (ay === ty && am > tm) || (ay === ty && am === tm && ad > td)) return 0;
  let count = 0;
  for (let y = ay; y <= ty; y++) {
    const startM = y === ay ? am : 0;
    const endM = y === ty ? tm : 11;
    for (let m = startM; m <= endM; m++) {
      const lastDay = getLastDayOfMonth(y, m);
      const quincena15YaPaso = y < ty || (y === ty && m < tm) || (y === ty && m === tm && td >= 15);
      const quincena15DespuesDeAprob = y > ay || (y === ay && m > am) || (y === ay && m === am && 15 >= ad);
      if (quincena15DespuesDeAprob && quincena15YaPaso) count++;
      if (lastDay !== 15) {
        const quincenaFinYaPaso = y < ty || (y === ty && m < tm) || (y === ty && m === tm && td >= lastDay);
        const quincenaFinDespuesDeAprob = y > ay || (y === ay && m > am) || (y === ay && m === am && lastDay >= ad);
        if (quincenaFinDespuesDeAprob && quincenaFinYaPaso) count++;
      }
    }
  }
  return count;
};

/** Calcula el saldo restante. Usa saldo_restante del API si viene; si no, lo calcula en el cliente. */
const calcularSaldoRestante = (sol: SolicitudPrestamo): number | null => {
  if ((sol.estado || '').toLowerCase() !== 'depositado') return null;
  const monto = parseFloat(String(sol.monto));
  if (isNaN(monto) || monto <= 0) return null;
  const desdeServidor = sol.saldo_restante != null && sol.saldo_restante !== '';
  if (desdeServidor) {
    const n = parseFloat(String(sol.saldo_restante));
    if (!isNaN(n) && n >= 0) return n;
  }
  const rawFechaBase = sol.fecha_deposito || sol.fecha_aprobacion;
  if (!rawFechaBase) return null;
  const descQuincenal = parseFloat(String(sol.descuento_quincenal ?? '0'));
  if (isNaN(descQuincenal) || descQuincenal <= 0) return null;
  const fechaAprobacion = parseFechaAprobacionLocal(rawFechaBase);
  if (!fechaAprobacion) return null;
  const now = new Date();
  const ay = fechaAprobacion.getUTCFullYear();
  const am = fechaAprobacion.getUTCMonth();
  const ad = fechaAprobacion.getUTCDate();
  const ty = now.getUTCFullYear();
  const tm = now.getUTCMonth();
  const td = now.getUTCDate();
  if (ay > ty || (ay === ty && am > tm) || (ay === ty && am === tm && ad > td)) return monto;
  const quincenasTranscurridas = contarQuincenasCalendario(fechaAprobacion);
  return Math.max(0, monto - quincenasTranscurridas * descQuincenal);
};

/** Política estándar: máx. $6,000 MXN y 8 quincenas */
const PRESTAMO_MAX_MONTO = 6000;
const PRESTAMO_MAX_QUINCENAS = 8;
const PRESTAMOS_ANTIGUEDAD_MINIMA_ANIOS = 1;

const emptyForm = { monto: '', plazo_meses: '4', motivo: '' };

const calcularDescuentoQuincenal = (monto: number, plazo: number) => {
  if (plazo <= 0 || isNaN(monto) || monto <= 0) return null;
  return Math.round((monto / plazo) * 100) / 100;
};

export const MisPrestamosPage = () => {
  const { authMe } = useAuth();
  const isMobile = useIsMobile();
  const [solicitudes, setSolicitudes] = useState<SolicitudPrestamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [cancelando, setCancelando] = useState(false);

  const cargar = useCallback(async () => {
    if (!authMe?.id) {
      setSolicitudes([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<SolicitudPrestamo[]>(`prestamos?limit=200&empleado_id=${authMe.id}`);
      setSolicitudes(Array.isArray(res.data) ? res.data : []);
    } catch {
      setSolicitudes([]);
    } finally {
      setLoading(false);
    }
  }, [authMe?.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const estadosPrestamoActivo = ['pendiente', 'aprobada_departamento', 'depositado'];
  const tienePrestamoActivo = solicitudes.some(s => estadosPrestamoActivo.includes(s.estado));

  const abrirNueva = () => {
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const guardar = async () => {
    const monto = parseFloat(form.monto);
    const plazo = parseInt(form.plazo_meses, 10);
    if (isNaN(monto) || monto <= 0) { setError('Monto debe ser mayor a cero'); return; }
    if (monto > PRESTAMO_MAX_MONTO) {
      setError(`El monto máximo es ${PRESTAMO_MAX_MONTO.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}`);
      return;
    }
    if (isNaN(plazo) || plazo < 1) { setError('Plazo debe ser al menos 1 quincena'); return; }
    if (plazo > PRESTAMO_MAX_QUINCENAS) {
      setError(`El plazo máximo es ${PRESTAMO_MAX_QUINCENAS} quincenas`);
      return;
    }
    if (tienePrestamoActivo) {
      setError('Ya tienes un préstamo o solicitud activa. No puedes crear otra hasta finalizar o cancelar la actual.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await api.post('prestamos', {
        monto,
        plazo_meses: plazo,
        motivo: form.motivo.trim() || null,
      });
      setShowModal(false);
      cargar();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error al enviar solicitud');
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = async (id: number) => {
    if (!confirm('¿Cancelar esta solicitud?')) return;
    setCancelando(true);
    try {
      await api.delete(`prestamos/${id}`);
      cargar();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error al cancelar');
    } finally {
      setCancelando(false);
    }
  };

  const verDocumento = (sol: SolicitudPrestamo) => {
    const w = window.open('', '_blank', 'width=820,height=920,scrollbars=yes');
    if (!w) { alert('Permite ventanas emergentes para ver el documento'); return; }
    w.document.write('<html><body style="font-family:system-ui;padding:40px;text-align:center;color:#666">Cargando documento...</body></html>');
    (async () => {
      try {
        const res = await api.get(`personal/empleados/${sol.empleado_id}`);
        generarDocumentoPrestamo(sol, res.data, w);
      } catch {
        generarDocumentoPrestamo(sol, null, w);
      }
    })();
  };

  if (authMe?.exento_incidencias) return <Navigate to="/" replace />;
  if ((authMe?.anios_empresa ?? 0) < PRESTAMOS_ANTIGUEDAD_MINIMA_ANIOS) return <Navigate to="/" replace />;

  const sheetOverlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' };
  const sheetContainer: React.CSSProperties = isMobile
    ? { backgroundColor: 'white', borderRadius: '20px 20px 0 0', padding: '20px 20px calc(20px + env(safe-area-inset-bottom, 0px))', width: '100%', maxHeight: '90dvh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,0.2)' }
    : { backgroundColor: 'white', padding: '28px', borderRadius: '14px', maxWidth: '440px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' };
  const sheetHandle = isMobile ? (
    <div style={{ width: 40, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, margin: '0 auto 16px' }} />
  ) : null;

  /* ── Préstamo activo (primero con esos estados) ── */
  const prestamoActivo = solicitudes.find(s => ['pendiente', 'aprobada_departamento', 'depositado'].includes(s.estado)) ?? null;
  const saldoActivo = prestamoActivo ? calcularSaldoRestante(prestamoActivo) : null;
  const pctActivo = (prestamoActivo && saldoActivo !== null)
    ? Math.round((saldoActivo / parseFloat(String(prestamoActivo.monto))) * 100) : null;

  const ESTADO_ICON: Record<string, string> = {
    pendiente: '⏳',
    aprobada_departamento: '✅',
    depositado: '💰',
    rechazada: '❌',
    cancelada: '🚫',
  };

  return (
    <div style={{ padding: isMobile ? '0 0 100px' : '24px' }}>

      {/* ── MOBILE HERO ── */}
      {isMobile ? (
        <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0369a1 60%, #0ea5e9 100%)', padding: '20px 16px 28px', marginBottom: -12, position: 'relative' }}>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>💳 Mis préstamos</div>

          {loading ? (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginTop: 8 }}>Cargando...</div>
          ) : prestamoActivo ? (
            <>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', marginBottom: 2 }}>Préstamo activo</div>
              <div style={{ color: 'white', fontWeight: 800, fontSize: '2.6rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {formatMonto(prestamoActivo.monto)}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.82rem', marginTop: 4, marginBottom: 12 }}>
                {prestamoActivo.plazo_meses} quincenas · {prestamoActivo.descuento_quincenal ? formatMonto(prestamoActivo.descuento_quincenal) + '/quincena' : ''}
              </div>
              {saldoActivo !== null && pctActivo !== null && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>Saldo restante</span>
                    <span style={{ color: 'white', fontWeight: 700, fontSize: '0.85rem' }}>{formatMonto(saldoActivo)} ({pctActivo}%)</span>
                  </div>
                  <div style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 6, width: `${pctActivo}%`, backgroundColor: pctActivo > 60 ? '#f87171' : pctActivo > 25 ? '#fbbf24' : '#4ade80', transition: 'width 0.4s' }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '5px 14px' }}>
                <span>{ESTADO_ICON[prestamoActivo.estado] ?? '•'}</span>
                <span style={{ color: 'white', fontSize: '0.82rem', fontWeight: 700 }}>{ESTADO_LABEL[prestamoActivo.estado] ?? prestamoActivo.estado}</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ color: 'white', fontWeight: 800, fontSize: '1.8rem', lineHeight: 1.2 }}>Sin préstamos activos</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', marginTop: 6 }}>
                Puedes solicitar hasta {formatMonto(PRESTAMO_MAX_MONTO)} en {PRESTAMO_MAX_QUINCENAS} quincenas
              </div>
            </>
          )}
        </div>
      ) : (
        /* ── DESKTOP header ── */
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Mis préstamos</h1>
            {tienePrestamoActivo && (
              <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#b45309', maxWidth: 520 }}>
                Solo puede haber un préstamo o solicitud activa a la vez.
              </p>
            )}
          </div>
          <button type="button" onClick={abrirNueva} disabled={tienePrestamoActivo}
            style={{ padding: '9px 18px', backgroundColor: tienePrestamoActivo ? '#94a3b8' : '#0ea5e9', color: 'white', border: 'none', borderRadius: '7px', cursor: tienePrestamoActivo ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
            + Nueva solicitud
          </button>
        </div>
      )}

      <div
        style={{
          margin: isMobile ? '10px 12px 0' : '0 0 16px',
          padding: isMobile ? '10px 12px' : '12px 14px',
          backgroundColor: '#fff7ed',
          border: '1px solid #fed7aa',
          borderRadius: '10px',
          color: '#9a3412',
          fontSize: isMobile ? '0.8rem' : '0.83rem',
          lineHeight: 1.45,
        }}
      >
        <strong>Importante:</strong> toda solicitud de préstamo está sujeta a aprobación conforme a políticas internas vigentes.
        El registro de la solicitud no garantiza autorización ni depósito; la empresa evalúa antigüedad, historial y capacidad de descuento por quincena.
        En caso de aprobación, el préstamo se formaliza en recibo/registro y se descuenta vía nómina según el plazo autorizado.
      </div>

      {/* ── CONTENT area ── */}
      <div style={{ padding: isMobile ? '14px 12px 0' : 0, backgroundColor: isMobile ? 'white' : 'transparent', borderRadius: isMobile ? '20px 20px 0 0' : 0, position: 'relative', zIndex: 1 }}>

      {loading ? (
        <p style={{ color: '#666', padding: isMobile ? '16px 0' : 0 }}>Cargando...</p>
      ) : solicitudes.length === 0 ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', backgroundColor: isMobile ? '#f8fafc' : 'white', borderRadius: isMobile ? 16 : 10, border: '1px solid #e5e7eb', color: '#9ca3af', margin: isMobile ? '12px 0 0' : 0 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>💳</div>
          <div style={{ fontWeight: 700, color: '#374151', marginBottom: 6 }}>Sin solicitudes</div>
          <div style={{ fontSize: '0.85rem', marginBottom: 20 }}>Solicita hasta {formatMonto(PRESTAMO_MAX_MONTO)} en hasta {PRESTAMO_MAX_QUINCENAS} quincenas</div>
          {isMobile && (
            <button type="button" onClick={abrirNueva}
              style={{ padding: '13px 32px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: 50, cursor: 'pointer', fontWeight: 700, fontSize: '1rem', boxShadow: '0 4px 16px rgba(14,165,233,0.35)' }}>
              + Nueva solicitud
            </button>
          )}
        </div>
      ) : isMobile ? (
        /* ── Vista móvil: tarjetas app-like ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
          {solicitudes.map(sol => {
            const estadoStyle = ESTADO_STYLE[sol.estado] ?? ESTADO_STYLE.pendiente;
            const saldo = calcularSaldoRestante(sol);
            const pct = saldo !== null ? Math.round((saldo / parseFloat(String(sol.monto))) * 100) : null;
            const barColor = pct !== null ? (pct > 60 ? '#ef4444' : pct > 25 ? '#f59e0b' : '#22c55e') : null;
            const esActivo = ['pendiente', 'aprobada_departamento', 'depositado'].includes(sol.estado);
            return (
              <div key={sol.id} style={{ backgroundColor: 'white', borderRadius: 16, border: `1.5px solid ${esActivo ? '#bae6fd' : '#e5e7eb'}`, padding: '16px', boxShadow: esActivo ? '0 2px 10px rgba(14,165,233,0.12)' : '0 1px 4px rgba(0,0,0,0.05)' }}>
                {/* Header de la card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1.5rem', color: '#1e3a5f', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {formatMonto(sol.monto)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
                      {sol.plazo_meses} quincenas · {sol.descuento_quincenal ? formatMonto(sol.descuento_quincenal) + '/q' : '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ backgroundColor: estadoStyle.bg, color: estadoStyle.color, borderRadius: 20, padding: '4px 12px', fontSize: '0.72rem', fontWeight: 700 }}>
                      {ESTADO_ICON[sol.estado] ?? ''} {ESTADO_LABEL[sol.estado] ?? sol.estado}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.68rem', backgroundColor: '#f1f5f9', color: '#475569', padding: '2px 7px', borderRadius: 4 }}>
                      {sol.numero_solicitud ?? `#${sol.id}`}
                    </span>
                  </div>
                </div>

                {/* Barra de progreso de saldo */}
                {saldo !== null && pct !== null && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Saldo restante</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: barColor! }}>{formatMonto(saldo)} · {pct}%</span>
                    </div>
                    <div style={{ backgroundColor: '#f1f5f9', borderRadius: 6, height: 7, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 6, width: `${pct}%`, backgroundColor: barColor!, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                )}

                {/* Info extra */}
                {sol.motivo && <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: 8, fontStyle: 'italic' }}>"{sol.motivo}"</div>}
                {sol.referencia_bancaria && (
                  <div style={{ fontSize: '0.78rem', color: '#065f46', fontWeight: 600, marginBottom: 8, backgroundColor: '#ecfdf5', padding: '6px 10px', borderRadius: 8 }}>
                    🏦 Ref: <span style={{ fontFamily: 'monospace' }}>{sol.referencia_bancaria}</span>
                  </div>
                )}
                {sol.comentarios_aprobacion && sol.estado !== 'pendiente' && (
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 8, backgroundColor: '#f9fafb', padding: '6px 10px', borderRadius: 8 }}>
                    💬 {sol.comentarios_aprobacion}
                  </div>
                )}
                <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: 12 }}>
                  📅 {new Date(sol.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                </div>

                {/* Acciones */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => verDocumento(sol)}
                    style={{ flex: 1, padding: '10px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                    📄 Ver documento
                  </button>
                  {sol.estado === 'pendiente' && (
                    <button onClick={() => cancelar(sol.id)} disabled={cancelando}
                      style={{ padding: '10px 16px', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 10, cursor: cancelando ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Vista desktop: tabla ── */
        <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>No. solicitud</th>
                <th style={{ ...th, textAlign: 'right' }}>Monto</th>
                <th style={{ ...th, textAlign: 'center' }}>Plazo</th>
                <th style={{ ...th, textAlign: 'right' }}>Desc. quincenal</th>
                <th style={{ ...th, textAlign: 'right' }}>Saldo restante</th>
                <th style={th}>Motivo</th>
                <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                <th style={th}>Ref. bancaria</th>
                <th style={th}>Fecha</th>
                <th style={{ ...th, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(sol => {
                const estadoStyle = ESTADO_STYLE[sol.estado] ?? ESTADO_STYLE.pendiente;
                return (
                  <tr key={sol.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={td}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', backgroundColor: '#f1f5f9', color: '#334155', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                        {sol.numero_solicitud ?? `#${sol.id}`}
                      </span>
                    </td>
                    <td style={{ ...td, fontWeight: 600, textAlign: 'right' }}>{formatMonto(sol.monto)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{sol.plazo_meses} quincenas</td>
                    <td style={{ ...td, textAlign: 'right', color: '#0369a1' }}>
                      {sol.descuento_quincenal ? formatMonto(sol.descuento_quincenal) : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {(() => {
                        const saldo = calcularSaldoRestante(sol);
                        if (saldo === null) return <span style={{ color: '#9ca3af', fontSize: '0.82rem' }}>—</span>;
                        const pct = Math.round((saldo / parseFloat(sol.monto)) * 100);
                        const color = pct > 60 ? '#dc2626' : pct > 25 ? '#d97706' : '#16a34a';
                        return (
                          <div>
                            <div style={{ fontWeight: 700, color }}>{formatMonto(saldo)}</div>
                            <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{pct}% restante</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td style={td}>{sol.motivo || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ backgroundColor: estadoStyle.bg, color: estadoStyle.color, borderRadius: 5, padding: '3px 9px', fontSize: '0.78rem', fontWeight: 600 }}>
                        {ESTADO_LABEL[sol.estado] ?? sol.estado}
                      </span>
                    </td>
                    <td style={{ ...td, fontSize: '0.8rem', fontFamily: 'monospace' }}>{sol.referencia_bancaria || '—'}</td>
                    <td style={td}>
                      {new Date(sol.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                      {sol.comentarios_aprobacion && sol.estado !== 'pendiente' && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>{sol.comentarios_aprobacion}</div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => verDocumento(sol)} style={{ padding: '4px 10px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>Ver documento</button>
                        {sol.estado === 'pendiente' && (
                          <button onClick={() => cancelar(sol.id)} disabled={cancelando} style={{ padding: '4px 10px', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 5, cursor: cancelando ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>Cancelar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      </div>{/* /content area */}

      {/* FAB "Nueva solicitud" en móvil cuando no hay préstamo activo (y hay solicitudes) */}
      {isMobile && !tienePrestamoActivo && solicitudes.length > 0 && (
        <div style={{ position: 'fixed', bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)', zIndex: 60 }}>
          <button type="button" onClick={abrirNueva}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: 50, cursor: 'pointer', fontWeight: 800, fontSize: '1rem', boxShadow: '0 6px 24px rgba(14,165,233,0.45)', whiteSpace: 'nowrap' }}>
            💳 Nueva solicitud
          </button>
        </div>
      )}

      {showModal && (
        <div onClick={() => !guardando && setShowModal(false)} style={sheetOverlay}>
          <div onClick={e => e.stopPropagation()} style={sheetContainer}>
            {sheetHandle}
            <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 700 }}>Nueva solicitud de préstamo</h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.45 }}>
              Máx. <strong>{PRESTAMO_MAX_MONTO.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</strong> · plazo máx. <strong>{PRESTAMO_MAX_QUINCENAS} quincenas</strong>
            </p>
            <p style={{ margin: '0 0 12px', fontSize: '0.76rem', color: '#9a3412', lineHeight: 1.45, backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 10px' }}>
              Esta es una <strong>solicitud sujeta a aprobación</strong>. El envío no implica autorización automática ni depósito inmediato.
              La validación considera políticas internas, estatus laboral y capacidad de descuento quincenal.
            </p>
            {error && <p style={{ color: '#dc3545', marginBottom: 12, fontSize: '0.88rem', padding: '8px 12px', backgroundColor: '#fef2f2', borderRadius: 8 }}>{error}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Monto (MXN) *</label>
                <input type="number" min="0.01" max={PRESTAMO_MAX_MONTO} step="0.01"
                  value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                  style={inputStyle} placeholder={`Hasta ${PRESTAMO_MAX_MONTO.toLocaleString('es-MX')}`} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Plazo (quincenas) *</label>
                <input type="number" min={1} max={PRESTAMO_MAX_QUINCENAS}
                  value={form.plazo_meses} onChange={e => setForm(f => ({ ...f, plazo_meses: e.target.value }))}
                  style={inputStyle} />
              </div>
              {(() => {
                const plazo = parseInt(form.plazo_meses, 10) || 0;
                const desc = calcularDescuentoQuincenal(parseFloat(form.monto) || 0, plazo);
                return desc != null && (
                  <div style={{ padding: '12px', backgroundColor: '#f0f9ff', borderRadius: 10, fontSize: '0.9rem', color: '#0369a1', fontWeight: 600 }}>
                    Descuento quincenal: {formatMonto(desc)} <span style={{ color: '#64748b', fontWeight: 400 }}>({plazo} quincenas)</span>
                  </div>
                );
              })()}
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Motivo</label>
                <textarea value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                  style={{ ...inputStyle, minHeight: 60 }} placeholder="Opcional" rows={2} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => !guardando && setShowModal(false)}
                style={{ flex: 1, padding: '13px', backgroundColor: '#f3f4f6', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando}
                style={{ flex: 2, padding: '13px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: 10, cursor: guardando ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {guardando ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
