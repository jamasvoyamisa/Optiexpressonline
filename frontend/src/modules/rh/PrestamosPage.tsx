import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { generarDocumentoPrestamo } from '../prestamos/documentoPrestamo';

interface Empleado {
  id: number;
  numero_empleado: string;
  nombre: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
}

interface SolicitudPrestamo {
  id: number;
  empleado_id: number;
  monto: string;
  plazo_meses: number;
  motivo?: string | null;
  descuento_quincenal?: string | null;
  estado: string;
  aprobado_por_id?: number | null;
  fecha_aprobacion?: string | null;
  comentarios_aprobacion?: string | null;
  created_at: string;
  empleado?: Empleado | null;
  aprobador?: Empleado | null;
}

interface Empresa {
  id: number;
  nombre: string;
}

interface Departamento {
  id: number;
  nombre: string;
  empresa_id: number;
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
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 13px', borderBottom: '1px solid #f0f0f0', fontSize: '0.88rem', verticalAlign: 'middle',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px',
  fontSize: '0.88rem', outline: 'none', width: '100%', boxSizing: 'border-box',
};

const filterControlStyle: React.CSSProperties = { ...inputStyle, height: 36 };

const emptyForm = {
  empleado_id: '',
  monto: '',
  plazo_meses: '12',
  motivo: '',
};

const calcularDescuentoQuincenal = (monto: number, plazo: number) => {
  if (plazo <= 0 || isNaN(monto) || monto <= 0) return null;
  return Math.round((monto / (plazo * 2)) * 100) / 100;
};

const formatMonto = (v: string | number) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
};

const nombreEmpleado = (e?: Empleado | null) => {
  if (!e) return '—';
  return `${e.nombre} ${e.apellido_paterno ?? ''}`.trim();
};

export const PrestamosPage = () => {
  const { authMe } = useAuth();
  const isRH = authMe?.is_superuser === true || authMe?.is_rh === true;

  const [solicitudes, setSolicitudes] = useState<SolicitudPrestamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [modalAprobar, setModalAprobar] = useState<SolicitudPrestamo | null>(null);
  const [modalConfirmar, setModalConfirmar] = useState<SolicitudPrestamo | null>(null);
  const [aprobando, setAprobando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [comentariosAprobacion, setComentariosAprobacion] = useState('');
  const [comentariosConfirmar, setComentariosConfirmar] = useState('');

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [deptosPorEmpresa, setDeptosPorEmpresa] = useState<Departamento[]>([]);
  const [empleadosPorDepto, setEmpleadosPorDepto] = useState<Empleado[]>([]);
  const [formEmpresaId, setFormEmpresaId] = useState('');
  const [formDeptoId, setFormDeptoId] = useState('');
  const [loadingDeptos, setLoadingDeptos] = useState(false);
  const [loadingEmps, setLoadingEmps] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('pendiente');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (isRH) params.set('limit', '500');
      else params.set('empleado_id', String(authMe?.id ?? ''));
      const res = await api.get<SolicitudPrestamo[]>(`prestamos?${params}`);
      setSolicitudes(Array.isArray(res.data) ? res.data : []);
    } catch {
      setSolicitudes([]);
    } finally {
      setLoading(false);
    }
  }, [isRH, authMe?.id]);

  useEffect(() => {
    if (isRH) {
      api.get<Empresa[]>('/personal/empresas?limit=200')
        .then(res => setEmpresas(Array.isArray(res.data) ? res.data : []))
        .catch(() => setEmpresas([]));
    }
  }, [isRH]);

  useEffect(() => {
    setFormDeptoId('');
    setDeptosPorEmpresa([]);
    setEmpleadosPorDepto([]);
    setForm(f => ({ ...f, empleado_id: '' }));
    if (!formEmpresaId) return;
    setLoadingDeptos(true);
    api.get<Departamento[]>(`/personal/departamentos?empresa_id=${formEmpresaId}&limit=200`)
      .then(res => setDeptosPorEmpresa(Array.isArray(res.data) ? res.data : []))
      .catch(() => setDeptosPorEmpresa([]))
      .finally(() => setLoadingDeptos(false));
  }, [formEmpresaId]);

  useEffect(() => {
    setEmpleadosPorDepto([]);
    setForm(f => ({ ...f, empleado_id: '' }));
    if (!formDeptoId) return;
    setLoadingEmps(true);
    api.get<Empleado[]>(`/personal/empleados?departamento_id=${formDeptoId}&limit=500&estado=activo`)
      .then(res => setEmpleadosPorDepto(Array.isArray(res.data) ? res.data : []))
      .catch(() => setEmpleadosPorDepto([]))
      .finally(() => setLoadingEmps(false));
  }, [formDeptoId]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirNueva = () => {
    setForm(emptyForm);
    setFormEmpresaId('');
    setFormDeptoId('');
    setDeptosPorEmpresa([]);
    setEmpleadosPorDepto([]);
    setError('');
    setShowModal(true);
  };

  const guardar = async () => {
    if (!form.empleado_id) { setError('Selecciona un empleado'); return; }
    const monto = parseFloat(form.monto);
    const plazo = parseInt(form.plazo_meses, 10);
    if (isNaN(monto) || monto <= 0) { setError('Monto debe ser mayor a cero'); return; }
    if (isNaN(plazo) || plazo < 1) { setError('Plazo debe ser al menos 1 mes'); return; }
    setGuardando(true);
    setError('');
    try {
      const payload = {
        empleado_id: Number(form.empleado_id),
        monto,
        plazo_meses: plazo,
        motivo: form.motivo.trim() || null,
      };
      await api.post('prestamos/rh', payload);
      setShowModal(false);
      cargar();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const puedeAprobar = authMe?.is_superuser || authMe?.is_director || authMe?.is_gerente_general;
  const puedeConfirmar = authMe?.is_superuser || authMe?.is_rh;

  const aprobarRechazar = async (sol: SolicitudPrestamo, aprobado: boolean) => {
    setAprobando(true);
    try {
      await api.post(`prestamos/${sol.id}/aprobar`, { aprobado, comentarios: comentariosAprobacion || null });
      setModalAprobar(null);
      setComentariosAprobacion('');
      cargar();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error al procesar');
    } finally {
      setAprobando(false);
    }
  };

  const confirmarRH = async (sol: SolicitudPrestamo) => {
    setConfirmando(true);
    try {
      await api.put(`prestamos/${sol.id}/confirmar-rh`, { comentarios: comentariosConfirmar || null });
      setModalConfirmar(null);
      setComentariosConfirmar('');
      cargar();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error al confirmar');
    } finally {
      setConfirmando(false);
    }
  };

  const filtradas = solicitudes.filter(sol => {
    if (filtroEstado && sol.estado !== filtroEstado) return false;
    if (busqueda) {
      const b = busqueda.toLowerCase();
      const nombre = nombreEmpleado(sol.empleado).toLowerCase();
      const num = sol.empleado?.numero_empleado?.toLowerCase() ?? '';
      if (!nombre.includes(b) && !num.includes(b)) return false;
    }
    return true;
  });

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Solicitudes de préstamos</h1>
        {isRH && (
          <button
            onClick={abrirNueva}
            style={{ padding: '9px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap' }}
          >
            + Registrar solicitud (RH)
          </button>
        )}
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Buscar empleado o No..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ ...filterControlStyle, width: 280, flex: '0 0 280px' }}
        />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...filterControlStyle, width: 'auto' }}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="aprobada_gerente">Aprobada por gerente</option>
          <option value="aprobada">Aprobada</option>
          <option value="rechazada">Rechazada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        {(busqueda || filtroEstado) && (
          <button onClick={() => { setBusqueda(''); setFiltroEstado('pendiente'); }}
            style={{ padding: '7px 12px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
            ✕ Limpiar
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#666' }}>Cargando...</p>
      ) : filtradas.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', color: '#9ca3af' }}>
          No se encontraron solicitudes con los filtros aplicados.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Empleado</th>
                <th style={{ ...th, textAlign: 'right' }}>Monto</th>
                <th style={{ ...th, textAlign: 'center' }}>Plazo</th>
                <th style={{ ...th, textAlign: 'right' }}>Descuento/q</th>
                <th style={th}>Motivo</th>
                <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                <th style={th}>Fecha solicitud</th>
                {(isRH || puedeAprobar || puedeConfirmar) && <th style={{ ...th, textAlign: 'center' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(sol => {
                const estadoStyle = ESTADO_STYLE[sol.estado] ?? ESTADO_STYLE.pendiente;
                return (
                  <tr key={sol.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{nombreEmpleado(sol.empleado)}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>No. {sol.empleado?.numero_empleado ?? '—'}</div>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatMonto(sol.monto)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{sol.plazo_meses} meses</td>
                    <td style={{ ...td, textAlign: 'right', color: '#0369a1' }}>{sol.descuento_quincenal ? formatMonto(sol.descuento_quincenal) : '—'}</td>
                    <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sol.motivo ?? ''}>
                      {sol.motivo || '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ backgroundColor: estadoStyle.bg, color: estadoStyle.color, borderRadius: 5, padding: '3px 9px', fontSize: '0.78rem', fontWeight: 600 }}>
                        {ESTADO_LABEL[sol.estado] ?? sol.estado}
                      </span>
                    </td>
                    <td style={td}>{new Date(sol.created_at).toLocaleDateString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    {(isRH || puedeAprobar || puedeConfirmar) && (
                      <td style={{ ...td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => {
                              const w = window.open('', '_blank', 'width=820,height=920,scrollbars=yes');
                              if (!w) {
                                alert('Permite ventanas emergentes para ver el documento');
                                return;
                              }
                              w.document.write('<html><body style="font-family:system-ui;padding:40px;text-align:center;color:#666">Cargando documento...</body></html>');
                              (async () => {
                                try {
                                  const res = await api.get(`personal/empleados/${sol.empleado_id}`);
                                  generarDocumentoPrestamo(sol, res.data, w);
                                } catch {
                                  generarDocumentoPrestamo(sol, sol.empleado ?? null, w);
                                }
                              })();
                            }}
                            style={{ padding: '4px 10px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            Ver documento
                          </button>
                          {sol.estado === 'pendiente' && puedeAprobar && (
                            <button
                              onClick={() => setModalAprobar(sol)}
                              style={{ padding: '4px 10px', backgroundColor: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                            >
                              Aprobar / Rechazar
                            </button>
                          )}
                          {sol.estado === 'aprobada_gerente' && puedeConfirmar && (
                            <button
                              onClick={() => setModalConfirmar(sol)}
                              style={{ padding: '4px 10px', backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                            >
                              Confirmar
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '8px 16px', color: '#9ca3af', fontSize: '0.78rem' }}>
            {filtradas.length} registro{filtradas.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {showModal && isRH && (
        <div
          onClick={() => !guardando && setShowModal(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: 'white', borderRadius: 12, padding: 28, width: 480, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
          >
            <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700 }}>Registrar solicitud de préstamo</h3>
            {error && <p style={{ color: '#dc3545', marginBottom: 12, fontSize: '0.88rem' }}>{error}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Empresa</label>
                <select value={formEmpresaId} onChange={e => setFormEmpresaId(e.target.value)} style={inputStyle} disabled={loadingDeptos}>
                  <option value="">Seleccionar...</option>
                  {empresas.map(e => <option key={e.id} value={String(e.id)}>{e.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Departamento</label>
                <select value={formDeptoId} onChange={e => setFormDeptoId(e.target.value)} style={inputStyle} disabled={loadingDeptos}>
                  <option value="">Seleccionar...</option>
                  {deptosPorEmpresa.map(d => <option key={d.id} value={String(d.id)}>{d.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Empleado *</label>
                <select value={form.empleado_id} onChange={e => setForm(f => ({ ...f, empleado_id: e.target.value }))} style={inputStyle} disabled={loadingEmps}>
                  <option value="">Seleccionar...</option>
                  {empleadosPorDepto.map(e => <option key={e.id} value={String(e.id)}>{nombreEmpleado(e)}</option>)}
                </select>
              </div>
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
              <button onClick={guardar} disabled={guardando} style={{ padding: '9px 18px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: 7, cursor: guardando ? 'not-allowed' : 'pointer', fontWeight: 600 }}>{guardando ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {modalAprobar && (
        <div
          onClick={() => !aprobando && setModalAprobar(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: 12, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700 }}>Aprobar o rechazar</h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#555' }}>
              Solicitud de {nombreEmpleado(modalAprobar.empleado)} — {formatMonto(modalAprobar.monto)} a {modalAprobar.plazo_meses} meses
              {modalAprobar.descuento_quincenal && (
                <span style={{ display: 'block', marginTop: 4, color: '#0369a1' }}>Descuento quincenal: {formatMonto(modalAprobar.descuento_quincenal)}</span>
              )}
            </p>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Comentarios (opcional)</label>
              <textarea value={comentariosAprobacion} onChange={e => setComentariosAprobacion(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="Comentario para el empleado" rows={2} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => !aprobando && setModalAprobar(null)} style={{ padding: '9px 18px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={() => aprobarRechazar(modalAprobar, false)} disabled={aprobando} style={{ padding: '9px 18px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 7, cursor: aprobando ? 'not-allowed' : 'pointer', fontWeight: 600 }}>Rechazar</button>
              <button onClick={() => aprobarRechazar(modalAprobar, true)} disabled={aprobando} style={{ padding: '9px 18px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: 7, cursor: aprobando ? 'not-allowed' : 'pointer', fontWeight: 600 }}>Aprobar</button>
            </div>
          </div>
        </div>
      )}

      {modalConfirmar && (
        <div
          onClick={() => !confirmando && setModalConfirmar(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: 12, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700 }}>Confirmar préstamo</h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#555' }}>
              Solicitud de {nombreEmpleado(modalConfirmar.empleado)} — {formatMonto(modalConfirmar.monto)} a {modalConfirmar.plazo_meses} meses
              {modalConfirmar.descuento_quincenal && (
                <span style={{ display: 'block', marginTop: 4, color: '#0369a1' }}>Descuento quincenal: {formatMonto(modalConfirmar.descuento_quincenal)}</span>
              )}
            </p>
            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#6b7280' }}>Ya fue aprobada por el gerente. Confirma para finalizar.</p>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Comentarios (opcional)</label>
              <textarea value={comentariosConfirmar} onChange={e => setComentariosConfirmar(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="Comentario opcional" rows={2} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => !confirmando && setModalConfirmar(null)} style={{ padding: '9px 18px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={() => confirmarRH(modalConfirmar)} disabled={confirmando} style={{ padding: '9px 18px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: 7, cursor: confirmando ? 'not-allowed' : 'pointer', fontWeight: 600 }}>{confirmando ? '...' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
