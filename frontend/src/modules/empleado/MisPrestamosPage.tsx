import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { generarDocumentoPrestamo } from '../prestamos/documentoPrestamo';
import { useIsMobile } from '../../hooks/useIsMobile';

interface SolicitudPrestamo {
  id: number;
  empleado_id: number;
  monto: string;
  plazo_meses: number;
  motivo?: string | null;
  descuento_quincenal?: string | null;
  estado: string;
  comentarios_aprobacion?: string | null;
  created_at: string;
  fecha_aprobacion?: string | null;
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada_gerente: 'Aprobada por gerente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
};

const ESTADO_STYLE: Record<string, { bg: string; color: string }> = {
  pendiente: { bg: '#fef3c7', color: '#92400e' },
  aprobada_gerente: { bg: '#e0f2fe', color: '#0369a1' },
  aprobada: { bg: '#d1fae5', color: '#065f46' },
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

const emptyForm = { monto: '', plazo_meses: '12', motivo: '' };

const calcularDescuentoQuincenal = (monto: number, plazo: number) => {
  if (plazo <= 0 || isNaN(monto) || monto <= 0) return null;
  return Math.round((monto / (plazo * 2)) * 100) / 100;
};

export const MisPrestamosPage = () => {
  const isMobile = useIsMobile();
  const [solicitudes, setSolicitudes] = useState<SolicitudPrestamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [cancelando, setCancelando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<SolicitudPrestamo[]>('prestamos?limit=200');
      setSolicitudes(Array.isArray(res.data) ? res.data : []);
    } catch {
      setSolicitudes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirNueva = () => {
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const guardar = async () => {
    const monto = parseFloat(form.monto);
    const plazo = parseInt(form.plazo_meses, 10);
    if (isNaN(monto) || monto <= 0) { setError('Monto debe ser mayor a cero'); return; }
    if (isNaN(plazo) || plazo < 1) { setError('Plazo debe ser al menos 1 mes'); return; }
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

  return (
    <div style={{ padding: isMobile ? '16px' : '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? '1.3rem' : '1.4rem' }}>Mis préstamos</h1>
        <button onClick={abrirNueva} style={{ padding: '9px 18px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
          + Nueva solicitud
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#666' }}>Cargando...</p>
      ) : solicitudes.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', color: '#9ca3af' }}>
          No tienes solicitudes de préstamo. Haz clic en "Nueva solicitud" para crear una.
        </div>
      ) : isMobile ? (
        /* ── Vista móvil: tarjetas ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {solicitudes.map(sol => {
            const estadoStyle = ESTADO_STYLE[sol.estado] ?? ESTADO_STYLE.pendiente;
            return (
              <div key={sol.id} style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#1e3a5f' }}>{formatMonto(sol.monto)}</div>
                    <div style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '2px' }}>
                      {sol.plazo_meses} meses · {sol.descuento_quincenal ? formatMonto(sol.descuento_quincenal) + '/q' : ''}
                    </div>
                  </div>
                  <span style={{ backgroundColor: estadoStyle.bg, color: estadoStyle.color, borderRadius: 5, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600 }}>
                    {ESTADO_LABEL[sol.estado] ?? sol.estado}
                  </span>
                </div>
                {sol.motivo && <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#374151' }}>{sol.motivo}</p>}
                <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '10px' }}>
                  {new Date(sol.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                  {sol.comentarios_aprobacion && sol.estado !== 'pendiente' && (
                    <div style={{ marginTop: '4px', color: '#6b7280' }}>{sol.comentarios_aprobacion}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => verDocumento(sol)} style={{ flex: 1, padding: '8px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                    Ver documento
                  </button>
                  {sol.estado === 'pendiente' && (
                    <button onClick={() => cancelar(sol.id)} disabled={cancelando} style={{ padding: '8px 14px', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 6, cursor: cancelando ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
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
                <th style={th}>Monto</th>
                <th style={{ ...th, textAlign: 'center' }}>Plazo</th>
                <th style={{ ...th, textAlign: 'right' }}>Descuento/q</th>
                <th style={th}>Motivo</th>
                <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                <th style={th}>Fecha</th>
                <th style={{ ...th, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(sol => {
                const estadoStyle = ESTADO_STYLE[sol.estado] ?? ESTADO_STYLE.pendiente;
                return (
                  <tr key={sol.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ ...td, fontWeight: 600 }}>{formatMonto(sol.monto)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{sol.plazo_meses} meses</td>
                    <td style={{ ...td, textAlign: 'right', color: '#0369a1' }}>{sol.descuento_quincenal ? formatMonto(sol.descuento_quincenal) : '—'}</td>
                    <td style={td}>{sol.motivo || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ backgroundColor: estadoStyle.bg, color: estadoStyle.color, borderRadius: 5, padding: '3px 9px', fontSize: '0.78rem', fontWeight: 600 }}>
                        {ESTADO_LABEL[sol.estado] ?? sol.estado}
                      </span>
                    </td>
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

      {showModal && (
        <div
          onClick={() => !guardando && setShowModal(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: 'white', borderRadius: 12, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
          >
            <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700 }}>Nueva solicitud de préstamo</h3>
            {error && <p style={{ color: '#dc3545', marginBottom: 12, fontSize: '0.88rem' }}>{error}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Monto (MXN) *</label>
                <input type="number" min="1" step="0.01" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} style={inputStyle} placeholder="Ej: 5000" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Plazo (meses) *</label>
                <input type="number" min="1" value={form.plazo_meses} onChange={e => setForm(f => ({ ...f, plazo_meses: e.target.value }))} style={inputStyle} />
              </div>
              {(() => {
                const plazo = parseInt(form.plazo_meses, 10) || 0;
                const desc = calcularDescuentoQuincenal(parseFloat(form.monto) || 0, plazo);
                const quincenas = plazo * 2;
                return desc != null && (
                  <div style={{ padding: '10px 12px', backgroundColor: '#f0f9ff', borderRadius: 8, fontSize: '0.88rem', color: '#0369a1' }}>
                    <strong>Descuento quincenal:</strong> {formatMonto(desc)} (calculado automáticamente a {quincenas} quincenas)
                  </div>
                );
              })()}
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Motivo</label>
                <textarea value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} style={{ ...inputStyle, minHeight: 70 }} placeholder="Opcional" rows={3} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => !guardando && setShowModal(false)} style={{ padding: '9px 18px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{ padding: '9px 18px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: 7, cursor: guardando ? 'not-allowed' : 'pointer', fontWeight: 600 }}>{guardando ? 'Enviando...' : 'Enviar solicitud'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
