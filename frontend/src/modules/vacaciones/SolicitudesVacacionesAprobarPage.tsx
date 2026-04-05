import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { fmtNombreEmpleado } from '../../utils/format';
import { useAuth } from '../../hooks/useAuth';
import type { SolicitudVacaciones } from '../../types';

interface SolicitudPrestamo {
  id: number;
  empleado_id: number;
  monto: string;
  plazo_meses: number;
  motivo?: string | null;
  descuento_quincenal?: string | null;
  estado: string;
  referencia_bancaria?: string | null;
  created_at: string;
  empleado?: { id: number; nombre: string; apellido_paterno?: string | null; numero_empleado?: string } | null;
}

interface EmpleadoResumen {
  id: number;
  numero_empleado?: string;
  nombre: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  empresa?: { id: number; nombre: string } | null;
  departamento?: { id: number; nombre: string } | null;
  puesto?: { id: number; nombre: string } | null;
}

const th: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '2px solid #e5e7eb',
  textAlign: 'left',
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#374151',
  whiteSpace: 'nowrap',
  backgroundColor: '#f9fafb',
};

const td: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '0.85rem',
  color: '#374151',
  verticalAlign: 'middle',
};

type TabTipo = 'vacaciones' | 'prestamos';

export const SolicitudesVacacionesAprobarPage = () => {
  const { authMe } = useAuth();
  const [activeTab, setActiveTab] = useState<TabTipo>('vacaciones');
  const [solicitudes, setSolicitudes] = useState<SolicitudVacaciones[]>([]);
  /** Pendientes de autorización por gerente de departamento */
  const [solicitudesPrestamosDepto, setSolicitudesPrestamosDepto] = useState<SolicitudPrestamo[]>([]);
  /** Pendientes de depósito + referencia (Gerente General) */
  const [solicitudesPrestamosDeposito, setSolicitudesPrestamosDeposito] = useState<SolicitudPrestamo[]>([]);
  const [empleadosMap, setEmpleadosMap] = useState<Map<number, EmpleadoResumen>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalAprobar, setModalAprobar] = useState<SolicitudVacaciones | null>(null);
  const [modalAprobarPrestamo, setModalAprobarPrestamo] = useState<SolicitudPrestamo | null>(null);
  const [modalDepositarPrestamo, setModalDepositarPrestamo] = useState<SolicitudPrestamo | null>(null);
  const [referenciaBancaria, setReferenciaBancaria] = useState('');
  const [aprobacionComentarios, setAprobacionComentarios] = useState('');
  const [aprobando, setAprobando] = useState(false);

  const cargarDatos = useCallback(async () => {
    if (!authMe?.id) return;
    setLoading(true);
    setError(null);
    try {
      const fetchPrestamosSeguro = async (url: string) => {
        try {
          const r = await api.get<SolicitudPrestamo[]>(url, { params: { limit: 500 } });
          return Array.isArray(r.data) ? r.data : [];
        } catch {
          return [];
        }
      };

      const [vacRes, presDepto, presDeposito] = await Promise.all([
        (async () => {
          const params: Record<string, string | number> = { limit: 500, estado: 'pendiente' };
          if (!authMe.is_superuser) params.jefe_id = authMe.id;
          const { data } = await api.get<SolicitudVacaciones[]>('/vacaciones/solicitudes', { params });
          return Array.isArray(data) ? data : [];
        })(),
        fetchPrestamosSeguro('prestamos/pendientes-mi-departamento'),
        fetchPrestamosSeguro('prestamos/pendientes-deposito'),
      ]);
      setSolicitudes(vacRes);
      setSolicitudesPrestamosDepto(presDepto);
      setSolicitudesPrestamosDeposito(presDeposito);

      const idsVac = [...new Set(vacRes.map(s => s.empleado_id))];
      const idsPres = [...new Set([...presDepto, ...presDeposito].map(s => s.empleado_id))];
      const ids = [...new Set([...idsVac, ...idsPres])];
      if (ids.length === 0) {
        setEmpleadosMap(new Map());
        return;
      }

      const chunks: number[][] = [];
      for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));

      const mapa = new Map<number, EmpleadoResumen>();
      await Promise.all(
        chunks.map(async (chunk) => {
          const results = await Promise.allSettled(
            chunk.map(id => api.get<EmpleadoResumen>(`/personal/empleados/${id}`))
          );
          results.forEach((r, idx) => {
            if (r.status === 'fulfilled') mapa.set(chunk[idx], r.value.data);
          });
        })
      );
      setEmpleadosMap(mapa);
    } catch (e) {
      setError('Error al cargar las solicitudes. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [authMe?.id, authMe?.is_superuser, authMe?.is_director]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const handleAprobarRechazar = (aprobar: boolean) => {
    if (!modalAprobar || !authMe) return;
    setAprobando(true);
    api.put(`/vacaciones/solicitudes/${modalAprobar.id}/aprobar?jefe_id=${authMe.id}`, {
      aprobar,
      comentarios: aprobacionComentarios.trim() || null,
    })
      .then(() => {
        cargarDatos();
        setModalAprobar(null);
        setAprobacionComentarios('');
      })
      .catch((err) => {
        const detail = err.response?.data?.detail;
        const msg = Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).join(', ')
          : typeof detail === 'string'
            ? detail
            : err.message ?? 'Error al aprobar o rechazar';
        alert(msg);
      })
      .finally(() => setAprobando(false));
  };

  const handleAprobarRechazarPrestamo = (aprobar: boolean) => {
    if (!modalAprobarPrestamo) return;
    setAprobando(true);
    api.post(`prestamos/${modalAprobarPrestamo.id}/aprobar-departamento`, {
      aprobado: aprobar,
      comentarios: aprobacionComentarios.trim() || null,
    })
      .then(() => {
        cargarDatos();
        setModalAprobarPrestamo(null);
        setAprobacionComentarios('');
      })
      .catch((err) => {
        const detail = err.response?.data?.detail;
        const msg = Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).join(', ')
          : typeof detail === 'string'
            ? detail
            : err.message ?? 'Error al aprobar o rechazar';
        alert(msg);
      })
      .finally(() => setAprobando(false));
  };

  const handleDepositarPrestamo = () => {
    if (!modalDepositarPrestamo) return;
    const ref = referenciaBancaria.trim();
    if (ref.length < 3) {
      alert('Ingresa la referencia bancaria (mínimo 3 caracteres).');
      return;
    }
    setAprobando(true);
    api
      .post(`prestamos/${modalDepositarPrestamo.id}/depositar`, {
        referencia_bancaria: ref,
        comentarios: aprobacionComentarios.trim() || null,
      })
      .then(() => {
        cargarDatos();
        setModalDepositarPrestamo(null);
        setReferenciaBancaria('');
        setAprobacionComentarios('');
      })
      .catch((err) => {
        const detail = err.response?.data?.detail;
        const msg = typeof detail === 'string' ? detail : err.message ?? 'Error al registrar depósito';
        alert(msg);
      })
      .finally(() => setAprobando(false));
  };

  const formatMonto = (v: string | number) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return isNaN(n) ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
  };

  const nombreEmp = (emp?: EmpleadoResumen) =>
    emp ? fmtNombreEmpleado(emp) : '—';

  const rolLabel = () => {
    if (authMe?.is_superuser) return 'Administrador';
    if (authMe?.is_director) return 'Director';
    if (authMe?.is_gerente_general) return 'Gerente General';
    return '';
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
        Cargando solicitudes pendientes...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, color: '#dc2626' }}>
        {error}
        <button onClick={cargarDatos} style={{ marginLeft: 12, padding: '4px 12px', cursor: 'pointer' }}>
          Reintentar
        </button>
      </div>
    );
  }

  const totalPendientesPrestamos =
    solicitudesPrestamosDepto.length + solicitudesPrestamosDeposito.length;
  const totalPendientes = activeTab === 'vacaciones' ? solicitudes.length : totalPendientesPrestamos;

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <button
          onClick={() => setActiveTab('vacaciones')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: activeTab === 'vacaciones' ? 700 : 400,
            backgroundColor: activeTab === 'vacaciones' ? '#0ea5e9' : '#e5e7eb',
            color: activeTab === 'vacaciones' ? 'white' : '#374151',
          }}
        >
          Vacaciones
        </button>
        <button
          onClick={() => setActiveTab('prestamos')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: activeTab === 'prestamos' ? 700 : 400,
            backgroundColor: activeTab === 'prestamos' ? '#0ea5e9' : '#e5e7eb',
            color: activeTab === 'prestamos' ? 'white' : '#374151',
          }}
        >
          Préstamos
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            Solicitudes a aprobar
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.9rem', color: '#6b7280' }}>
            {activeTab === 'vacaciones' ? 'Vacaciones' : 'Préstamos'} pendientes de aprobación · {rolLabel()}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            padding: '6px 14px',
            borderRadius: 8,
            fontSize: '0.9rem',
            fontWeight: 700,
            backgroundColor: totalPendientes > 0 ? '#fef3c7' : '#e5e7eb',
            color: totalPendientes > 0 ? '#92400e' : '#6b7280',
          }}>
            {totalPendientes} pendiente{totalPendientes !== 1 ? 's' : ''}
          </span>
          <button
            onClick={cargarDatos}
            style={{ padding: '8px 16px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            Actualizar
          </button>
        </div>
      </div>

      {activeTab === 'vacaciones' && solicitudes.length === 0 ? (
        <div style={{
          padding: 48,
          textAlign: 'center',
          backgroundColor: '#f9fafb',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          color: '#6b7280',
          fontSize: '1rem',
        }}>
          No hay solicitudes de vacaciones pendientes de tu aprobación.
        </div>
      ) : activeTab === 'prestamos' && totalPendientesPrestamos === 0 ? (
        <div style={{
          padding: 48,
          textAlign: 'center',
          backgroundColor: '#f9fafb',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          color: '#6b7280',
          fontSize: '1rem',
        }}>
          No hay solicitudes de préstamos pendientes de tu aprobación.
        </div>
      ) : activeTab === 'vacaciones' ? (
        <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Empleado</th>
                <th style={th}>Departamento</th>
                <th style={th}>Puesto</th>
                <th style={th}>Fecha inicio</th>
                <th style={th}>Fecha fin</th>
                <th style={{ ...th, textAlign: 'center' }}>Días</th>
                <th style={th}>Motivo</th>
                <th style={{ ...th, textAlign: 'center' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(s => {
                const emp = empleadosMap.get(s.empleado_id);
                return (
                  <tr
                    key={s.id}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                  >
                    <td style={{ ...td, fontWeight: 600 }}>
                      {nombreEmp(emp)}
                      {emp?.numero_empleado && (
                        <span style={{ marginLeft: 6, color: '#9ca3af', fontWeight: 400, fontSize: '0.82rem' }}>
                          #{emp.numero_empleado}
                        </span>
                      )}
                    </td>
                    <td style={td}>{emp?.departamento?.nombre ?? '—'}</td>
                    <td style={td}>{emp?.puesto?.nombre ?? '—'}</td>
                    <td style={td}>{new Date(s.fecha_inicio).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                    <td style={td}>{new Date(s.fecha_fin).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{s.dias_solicitados}</td>
                    <td style={{ ...td, maxWidth: 180 }}>{s.motivo || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button
                        onClick={() => { setModalAprobar(s); setAprobacionComentarios(''); }}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: '#0d9488',
                          color: 'white',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                        }}
                      >
                        Aprobar / Rechazar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'prestamos' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {solicitudesPrestamosDepto.length > 0 && (
            <div>
              <h2 style={{ fontSize: '1.05rem', margin: '0 0 12px', color: '#0f172a' }}>
                Pendientes en mi departamento (autorizar)
              </h2>
              <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Empleado</th>
                      <th style={th}>Departamento</th>
                      <th style={th}>Monto</th>
                      <th style={{ ...th, textAlign: 'center' }}>Plazo</th>
                      <th style={th}>Motivo</th>
                      <th style={{ ...th, textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solicitudesPrestamosDepto.map(s => {
                      const emp = empleadosMap.get(s.empleado_id);
                      return (
                        <tr
                          key={s.id}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                        >
                          <td style={{ ...td, fontWeight: 600 }}>
                            {nombreEmp(emp)}
                            {emp?.numero_empleado && (
                              <span style={{ marginLeft: 6, color: '#9ca3af', fontWeight: 400, fontSize: '0.82rem' }}>
                                #{emp.numero_empleado}
                              </span>
                            )}
                          </td>
                          <td style={td}>{emp?.departamento?.nombre ?? '—'}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{formatMonto(s.monto)}</td>
                          <td style={{ ...td, textAlign: 'center' }}>{s.plazo_meses} quincenas</td>
                          <td style={{ ...td, maxWidth: 180 }}>{s.motivo || '—'}</td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => { setModalAprobarPrestamo(s); setAprobacionComentarios(''); }}
                              style={{
                                padding: '6px 14px',
                                backgroundColor: '#0d9488',
                                color: 'white',
                                border: 'none',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                              }}
                            >
                              Autorizar / Rechazar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {solicitudesPrestamosDeposito.length > 0 && (
            <div>
              <h2 style={{ fontSize: '1.05rem', margin: '0 0 12px', color: '#0f172a' }}>
                Pendientes de depósito (Gerente General)
              </h2>
              <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Empleado</th>
                      <th style={th}>Departamento</th>
                      <th style={th}>Monto</th>
                      <th style={{ ...th, textAlign: 'center' }}>Plazo</th>
                      <th style={th}>Motivo</th>
                      <th style={{ ...th, textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solicitudesPrestamosDeposito.map(s => {
                      const emp = empleadosMap.get(s.empleado_id);
                      return (
                        <tr
                          key={s.id}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                        >
                          <td style={{ ...td, fontWeight: 600 }}>
                            {nombreEmp(emp)}
                            {emp?.numero_empleado && (
                              <span style={{ marginLeft: 6, color: '#9ca3af', fontWeight: 400, fontSize: '0.82rem' }}>
                                #{emp.numero_empleado}
                              </span>
                            )}
                          </td>
                          <td style={td}>{emp?.departamento?.nombre ?? '—'}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{formatMonto(s.monto)}</td>
                          <td style={{ ...td, textAlign: 'center' }}>{s.plazo_meses} quincenas</td>
                          <td style={{ ...td, maxWidth: 180 }}>{s.motivo || '—'}</td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setModalDepositarPrestamo(s);
                                setReferenciaBancaria('');
                                setAprobacionComentarios('');
                              }}
                              style={{
                                padding: '6px 14px',
                                backgroundColor: '#2563eb',
                                color: 'white',
                                border: 'none',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                              }}
                            >
                              Registrar depósito
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Modal Aprobar/Rechazar Vacaciones */}
      {modalAprobar && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
          onClick={() => setModalAprobar(null)}
          role="presentation"
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: 24,
              borderRadius: 12,
              maxWidth: 440,
              width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
            role="dialog"
          >
            <h2 style={{ marginTop: 0, marginBottom: 12 }}>Aprobar o rechazar vacaciones</h2>
            <p style={{ color: '#555', marginBottom: 6, fontWeight: 600 }}>
              {nombreEmp(empleadosMap.get(modalAprobar.empleado_id))}
            </p>
            <p style={{ color: '#555', marginBottom: 14, fontSize: '0.9rem' }}>
              {new Date(modalAprobar.fecha_inicio).toLocaleDateString('es-MX')} – {new Date(modalAprobar.fecha_fin).toLocaleDateString('es-MX')} · {modalAprobar.dias_solicitados} días
            </p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.9rem' }}>Comentarios (opcional)</label>
              <textarea
                value={aprobacionComentarios}
                onChange={e => setAprobacionComentarios(e.target.value)}
                rows={2}
                style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, resize: 'vertical', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModalAprobar(null)}
                style={{ padding: '9px 18px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleAprobarRechazar(false)}
                disabled={aprobando}
                style={{ padding: '9px 18px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: aprobando ? 'not-allowed' : 'pointer' }}
              >
                {aprobando ? '...' : 'Rechazar'}
              </button>
              <button
                onClick={() => handleAprobarRechazar(true)}
                disabled={aprobando}
                style={{ padding: '9px 18px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: aprobando ? 'not-allowed' : 'pointer' }}
              >
                {aprobando ? '...' : 'Aprobar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Aprobar/Rechazar Préstamo */}
      {modalAprobarPrestamo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
          onClick={() => setModalAprobarPrestamo(null)}
          role="presentation"
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: 24,
              borderRadius: 12,
              maxWidth: 440,
              width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
            role="dialog"
          >
            <h2 style={{ marginTop: 0, marginBottom: 12 }}>Autorizar préstamo (gerente de departamento)</h2>
            <p style={{ color: '#555', marginBottom: 6, fontWeight: 600 }}>
              {nombreEmp(empleadosMap.get(modalAprobarPrestamo.empleado_id))}
            </p>
            <p style={{ color: '#555', marginBottom: 14, fontSize: '0.9rem' }}>
              {formatMonto(modalAprobarPrestamo.monto)} a {modalAprobarPrestamo.plazo_meses} quincenas · Si autorizas, pasará a pendiente de depósito por Gerencia General
            </p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.9rem' }}>Comentarios (opcional)</label>
              <textarea
                value={aprobacionComentarios}
                onChange={e => setAprobacionComentarios(e.target.value)}
                rows={2}
                style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, resize: 'vertical', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModalAprobarPrestamo(null)}
                style={{ padding: '9px 18px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleAprobarRechazarPrestamo(false)}
                disabled={aprobando}
                style={{ padding: '9px 18px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: aprobando ? 'not-allowed' : 'pointer' }}
              >
                {aprobando ? '...' : 'Rechazar'}
              </button>
              <button
                onClick={() => handleAprobarRechazarPrestamo(true)}
                disabled={aprobando}
                style={{ padding: '9px 18px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: aprobando ? 'not-allowed' : 'pointer' }}
              >
                {aprobando ? '...' : 'Autorizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal registrar depósito (Gerente General) */}
      {modalDepositarPrestamo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
          onClick={() => setModalDepositarPrestamo(null)}
          role="presentation"
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: 24,
              borderRadius: 12,
              maxWidth: 440,
              width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
            role="dialog"
          >
            <h2 style={{ marginTop: 0, marginBottom: 12 }}>Registrar depósito</h2>
            <p style={{ color: '#555', marginBottom: 6, fontWeight: 600 }}>
              {nombreEmp(empleadosMap.get(modalDepositarPrestamo.empleado_id))}
            </p>
            <p style={{ color: '#555', marginBottom: 14, fontSize: '0.9rem' }}>
              {formatMonto(modalDepositarPrestamo.monto)} a {modalDepositarPrestamo.plazo_meses} quincenas · La solicitud ya fue autorizada por el departamento
            </p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.9rem' }}>
                Referencia bancaria *
              </label>
              <input
                type="text"
                value={referenciaBancaria}
                onChange={e => setReferenciaBancaria(e.target.value)}
                placeholder="Folio o referencia del depósito"
                style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.9rem' }}>Comentarios (opcional)</label>
              <textarea
                value={aprobacionComentarios}
                onChange={e => setAprobacionComentarios(e.target.value)}
                rows={2}
                style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, resize: 'vertical', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setModalDepositarPrestamo(null)}
                style={{ padding: '9px 18px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDepositarPrestamo}
                disabled={aprobando}
                style={{ padding: '9px 18px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: aprobando ? 'not-allowed' : 'pointer' }}
              >
                {aprobando ? '...' : 'Confirmar depósito'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
