import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { fmtNombreEmpleado } from '../../utils/format';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { SolicitudVacaciones } from '../../types';
import {
  rhMobileBadge,
  rhMobileCard,
  rhMobileCardRow,
  rhMobileCardSub,
  rhMobileCardTitle,
  rhMobileBtnPrimary,
} from '../rh/rhMobileStyles';
import { generarDocumentoVacaciones, type EmpleadoResumenVacaciones } from './documentoVacaciones';
import { AccionesDocumentoVacaciones } from './AccionesDocumentoVacaciones';

interface EmpleadoResumen extends EmpleadoResumenVacaciones {
  jefe?: { id: number; nombre: string; apellido_paterno?: string | null; apellido_materno?: string | null } | null;
}

const th: React.CSSProperties = {
  padding: '11px 13px',
  textAlign: 'left',
  borderBottom: '2px solid #dee2e6',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#555',
  backgroundColor: '#f8f9fa',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 13px',
  borderBottom: '1px solid #f0f0f0',
  fontSize: '0.9rem',
  verticalAlign: 'middle',
};

const ESTADO_LABEL: Record<string, string> = {
  pendiente:     'Pendiente',
  aprobada_jefe: 'Aprobada por jefe',
  aprobada:      'Aprobada',
  rechazada:     'Rechazada',
  cancelada:     'Cancelada',
};

const ESTADO_PRIORIDAD: Record<string, number> = {
  pendiente: 0,
  aprobada_jefe: 1,
  aprobada: 2,
  rechazada: 3,
  cancelada: 4,
};

const estadoBadgeStyle = (estado: string): React.CSSProperties => {
  const map: Record<string, React.CSSProperties> = {
    aprobada:      { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' },
    rechazada:     { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' },
    pendiente:     { background: '#fef9c3', color: '#92400e', border: '1px solid #fde68a' },
    aprobada_jefe: { background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' },
    cancelada:     { background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' },
  };
  return {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '0.78rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    ...(map[estado] ?? { background: '#f3f4f6', color: '#374151' }),
  };
};

const nombreCompleto = (e: EmpleadoResumen | null | undefined) =>
  e ? fmtNombreEmpleado(e) : '—';

const nombreJefe = (e: EmpleadoResumen | null | undefined) => {
  if (!e?.jefe) return '—';
  return fmtNombreEmpleado(e.jefe);
};

const PAGE_SIZE = 30;

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '0.875rem',
  color: '#374151',
  backgroundColor: 'white',
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: '28px',
};

const filtroFieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
};

const filtroLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
  color: '#6b7280',
  lineHeight: 1.2,
};

const filtroControlStyle: React.CSSProperties = {
  ...inputStyle,
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '0.82rem',
  minHeight: 36,
};

const filtroSelectStyle: React.CSSProperties = {
  ...selectStyle,
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '0.82rem',
  minHeight: 36,
};

export const VacacionesPage = ({ embeddedRh = false }: { embeddedRh?: boolean } = {}) => {
  const isMobile = useIsMobile();
  const compactRh = embeddedRh && isMobile;
  const { authMe } = useAuth();
  const isSuperuser = authMe?.is_superuser === true;

  const [solicitudes, setSolicitudes] = useState<SolicitudVacaciones[]>([]);
  const [empleadosMap, setEmpleadosMap] = useState<Record<number, EmpleadoResumen>>({});
  const [loading, setLoading] = useState(true);
  const [loadingDoc, setLoadingDoc] = useState<number | null>(null);

  // Confirmación RH
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);
  const [modalConfirmar, setModalConfirmar] = useState<number | null>(null);
  const [comentarioRH, setComentarioRH] = useState('');
  const [confirmacionAcepto, setConfirmacionAcepto] = useState(false);
  const [confirmacionPassword, setConfirmacionPassword] = useState('');

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroDepartamento, setFiltroDepartamento] = useState('');
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');

  // Paginación
  const [pagina, setPagina] = useState(1);

  const cargarDatos = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<SolicitudVacaciones[]>('/vacaciones/solicitudes?limit=1000'),
      api.get<EmpleadoResumen[]>('/personal/empleados?limit=500'),
    ])
      .then(([solRes, empRes]) => {
        setSolicitudes(Array.isArray(solRes.data) ? solRes.data : []);
        const map: Record<number, EmpleadoResumen> = {};
        (Array.isArray(empRes.data) ? empRes.data : []).forEach(e => { map[e.id] = e; });
        setEmpleadosMap(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const confirmarRH = async (solicitudId: number, comentarios?: string) => {
    if (!confirmacionAcepto) {
      alert('Debes marcar la casilla de aceptación para confirmar.');
      return;
    }
    if (!confirmacionPassword.trim()) {
      alert('Indica tu contraseña para confirmar el registro de RH.');
      return;
    }
    setConfirmandoId(solicitudId);
    try {
      await api.put(`/vacaciones/solicitudes/${solicitudId}/confirmar-rh`, {
        aprobar: true,
        comentarios: comentarios || null,
        acepto: true,
        password: confirmacionPassword,
      });
      setModalConfirmar(null);
      setComentarioRH('');
      setConfirmacionAcepto(false);
      setConfirmacionPassword('');
      await cargarDatos();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || 'Error al confirmar la solicitud';
      alert(msg);
    } finally {
      setConfirmandoId(null);
    }
  };

  // Resetear página al cambiar filtros
  useEffect(() => { setPagina(1); }, [busqueda, filtroEstado, filtroEmpresa, filtroDepartamento, filtroFechaInicio, filtroFechaFin]);

  const handleVerDocumento = useCallback(async (sol: SolicitudVacaciones) => {
    if (empleadosMap[sol.empleado_id]) {
      generarDocumentoVacaciones(sol, empleadosMap[sol.empleado_id]);
      return;
    }
    setLoadingDoc(sol.id);
    try {
      const r = await api.get<EmpleadoResumen>(`/personal/empleados/${sol.empleado_id}`);
      const emp = r.data;
      setEmpleadosMap(prev => ({ ...prev, [sol.empleado_id]: emp }));
      generarDocumentoVacaciones(sol, emp);
    } catch {
      generarDocumentoVacaciones(sol, null);
    } finally {
      setLoadingDoc(null);
    }
  }, [empleadosMap]);

  const patchSolicitudDoc = useCallback((updated: SolicitudVacaciones) => {
    setSolicitudes((prev) =>
      prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
    );
  }, []);

  // Listas únicas para los selects de filtro
  const empresas = [...new Set(
    Object.values(empleadosMap).map(e => e.empresa?.nombre).filter(Boolean) as string[]
  )].sort();

  const departamentos = [...new Set(
    Object.values(empleadosMap)
      .filter(e => !filtroEmpresa || e.empresa?.nombre === filtroEmpresa)
      .map(e => e.departamento?.nombre).filter(Boolean) as string[]
  )].sort();

  // Filtrado y ordenamiento: pendientes primero, luego aprobadas_jefe, luego el resto
  const solicitudesFiltradas = solicitudes.filter(sol => {
    const emp = empleadosMap[sol.empleado_id];
    const nombre = nombreCompleto(emp).toLowerCase();
    const numEmp = (emp?.numero_empleado ?? String(sol.empleado_id)).toLowerCase();
    const q = busqueda.trim().toLowerCase();

    if (q && !nombre.includes(q) && !numEmp.includes(q)) return false;
    if (filtroEstado && sol.estado !== filtroEstado) return false;
    if (filtroEmpresa && emp?.empresa?.nombre !== filtroEmpresa) return false;
    if (filtroDepartamento && emp?.departamento?.nombre !== filtroDepartamento) return false;
    if (filtroFechaInicio && sol.fecha_inicio.slice(0, 10) < filtroFechaInicio) return false;
    if (filtroFechaFin && sol.fecha_fin.slice(0, 10) > filtroFechaFin) return false;
    return true;
  }).sort((a, b) => {
    const pa = ESTADO_PRIORIDAD[a.estado] ?? 5;
    const pb = ESTADO_PRIORIDAD[b.estado] ?? 5;
    if (pa !== pb) return pa - pb;
    // Dentro del mismo estado: más reciente primero
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  // Paginación
  const totalPaginas = Math.max(1, Math.ceil(solicitudesFiltradas.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const solicitudesPagina = solicitudesFiltradas.slice(
    (paginaActual - 1) * PAGE_SIZE,
    paginaActual * PAGE_SIZE,
  );

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroEstado('');
    setFiltroEmpresa('');
    setFiltroDepartamento('');
    setFiltroFechaInicio('');
    setFiltroFechaFin('');
  };

  const hayFiltros = busqueda || filtroEstado || filtroEmpresa || filtroDepartamento || filtroFechaInicio || filtroFechaFin;

  if (loading) {
    return <div style={{ padding: compactRh ? 0 : isMobile ? '12px' : '24px', color: '#666' }}>Cargando solicitudes...</div>;
  }

  return (
    <div style={{ padding: compactRh ? 0 : isMobile ? '12px' : '24px' }}>
      {!compactRh && <h1 style={{ marginBottom: '20px', fontSize: isMobile ? '1.2rem' : undefined }}>Solicitudes de Vacaciones</h1>}

      {/* ── Barra de búsqueda y filtros ── */}
      <div style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '12px 16px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: hayFiltros
              ? 'repeat(auto-fit, minmax(150px, 1fr)) auto'
              : 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <div style={filtroFieldStyle}>
            <span style={filtroLabelStyle}>Buscar</span>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '0.85rem', pointerEvents: 'none' }}>🔍</span>
              <input
                type="text"
                placeholder="Nombre o No. empleado"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                style={{ ...filtroControlStyle, paddingLeft: 28 }}
              />
            </div>
          </div>

          <div style={filtroFieldStyle}>
            <span style={filtroLabelStyle}>Estado</span>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={filtroSelectStyle}>
              <option value="">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="aprobada_jefe">Aprobada por jefe</option>
              <option value="aprobada">Aprobada</option>
              <option value="rechazada">Rechazada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>

          <div style={filtroFieldStyle}>
            <span style={filtroLabelStyle}>Empresa</span>
            <select
              value={filtroEmpresa}
              onChange={e => { setFiltroEmpresa(e.target.value); setFiltroDepartamento(''); }}
              style={filtroSelectStyle}
            >
              <option value="">Todas</option>
              {empresas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
            </select>
          </div>

          <div style={filtroFieldStyle}>
            <span style={filtroLabelStyle}>Departamento</span>
            <select value={filtroDepartamento} onChange={e => setFiltroDepartamento(e.target.value)} style={filtroSelectStyle}>
              <option value="">Todos</option>
              {departamentos.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div style={filtroFieldStyle}>
            <span style={filtroLabelStyle}>Desde</span>
            <input type="date" value={filtroFechaInicio} onChange={e => setFiltroFechaInicio(e.target.value)} style={filtroControlStyle} />
          </div>

          <div style={filtroFieldStyle}>
            <span style={filtroLabelStyle}>Hasta</span>
            <input type="date" value={filtroFechaFin} onChange={e => setFiltroFechaFin(e.target.value)} style={filtroControlStyle} />
          </div>

          {hayFiltros && (
            <button
              type="button"
              onClick={limpiarFiltros}
              style={{
                alignSelf: 'end',
                padding: '8px 12px',
                minHeight: 36,
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                border: '1px solid #fecaca',
                borderRadius: 6,
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {solicitudesFiltradas.length === 0 ? (
        <p style={{ color: '#666', padding: '24px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          {hayFiltros ? 'No se encontraron solicitudes con los filtros aplicados.' : 'No hay solicitudes de vacaciones registradas.'}
        </p>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {solicitudesPagina.map(sol => {
            const emp = empleadosMap[sol.empleado_id];
            const esAprobadaJefe = sol.estado === 'aprobada_jefe';
            const badge = estadoBadgeStyle(sol.estado);
            return (
              <div key={sol.id} style={{ ...rhMobileCard, backgroundColor: esAprobadaJefe ? '#f0f9ff' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={rhMobileCardTitle}>{nombreCompleto(emp)}</div>
                    <div style={rhMobileCardSub}>No. {emp?.numero_empleado ?? sol.empleado_id}</div>
                  </div>
                  <span style={rhMobileBadge(String(badge.background), String(badge.color))}>{ESTADO_LABEL[sol.estado] ?? sol.estado}</span>
                </div>
                <div style={rhMobileCardRow}>
                  <span>{new Date(sol.fecha_inicio).toLocaleDateString('es-MX')}</span>
                  <span>→ {new Date(sol.fecha_fin).toLocaleDateString('es-MX')}</span>
                </div>
                <div style={rhMobileCardRow}>
                  <span>{sol.dias_solicitados} días</span>
                  <span>{emp?.departamento?.nombre ?? '—'}</span>
                </div>
                {esAprobadaJefe && (
                  <button
                    type="button"
                    disabled={confirmandoId === sol.id}
                    onClick={() => { setModalConfirmar(sol.id); setComentarioRH(''); setConfirmacionAcepto(false); setConfirmacionPassword(''); }}
                    style={{ ...rhMobileBtnPrimary, marginTop: 10, background: '#059669' }}
                  >
                    Confirmar RH
                  </button>
                )}
                <div style={{ marginTop: 10 }}>
                  <AccionesDocumentoVacaciones
                    solicitud={sol}
                    loadingPlantilla={loadingDoc === sol.id}
                    onVerPlantilla={() => handleVerDocumento(sol)}
                    onActualizado={(u) => patchSolicitudDoc({ ...sol, ...u })}
                    permitirSubida={authMe?.vacaciones_pdf_firmado_habilitado === true}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <thead>
                <tr>
                  <th style={th}>No.</th>
                  <th style={th}>Nombre</th>
                  <th style={th}>Empresa</th>
                  <th style={th}>Departamento</th>
                  <th style={th}>Jefe</th>
                  <th style={th}>Fecha Inicio</th>
                  <th style={th}>Fecha Fin</th>
                  <th style={{ ...th, textAlign: 'center' }}>Días</th>
                  <th style={th}>Autorizó</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {solicitudesPagina.map((sol) => {
                  const emp = empleadosMap[sol.empleado_id];
                  const enConfirmacion = confirmandoId === sol.id;
                  const esAprobadaJefe = sol.estado === 'aprobada_jefe';
                  return (
                    <tr
                      key={sol.id}
                      style={{
                        borderBottom: '1px solid #f0f0f0',
                        backgroundColor: esAprobadaJefe ? '#f0f9ff' : undefined,
                      }}
                    >
                      <td style={{ ...td, color: '#6b7280', fontSize: '0.82rem' }}>
                        {emp?.numero_empleado ?? sol.empleado_id}
                      </td>
                      <td style={{ ...td, fontWeight: 500 }}>{nombreCompleto(emp)}</td>
                      <td style={{ ...td, color: '#555' }}>{emp?.empresa?.nombre ?? '—'}</td>
                      <td style={{ ...td, color: '#555' }}>{emp?.departamento?.nombre ?? '—'}</td>
                      <td style={{ ...td, color: '#555' }}>{nombreJefe(emp)}</td>
                      <td style={td}>{new Date(sol.fecha_inicio).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                      <td style={td}>{new Date(sol.fecha_fin).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{sol.dias_solicitados}</td>
                      <td style={{ ...td, fontSize: '0.85rem' }}>
                        {sol.jefe_aprobador_nombre ? (
                          <>
                            <div style={{ fontWeight: 500 }}>{sol.jefe_aprobador_nombre}</div>
                            {sol.jefe_aprobador_puesto ? (
                              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                                {sol.jefe_aprobador_puesto}
                              </div>
                            ) : null}
                          </>
                        ) : '—'}
                      </td>
                      <td style={td}>
                        <span style={estadoBadgeStyle(sol.estado)}>
                          {ESTADO_LABEL[sol.estado] ?? sol.estado}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {esAprobadaJefe && (
                            <button
                              type="button"
                              disabled={enConfirmacion}
                              onClick={() => { setModalConfirmar(sol.id); setComentarioRH(''); setConfirmacionAcepto(false); setConfirmacionPassword(''); }}
                              style={{
                                padding: '5px 12px',
                                backgroundColor: enConfirmacion ? '#9ca3af' : '#059669',
                                color: 'white', border: 'none', borderRadius: 5,
                                cursor: enConfirmacion ? 'wait' : 'pointer',
                                fontSize: '0.78rem', fontWeight: 700,
                              }}
                            >
                              {enConfirmacion ? '...' : '✔ Confirmar RH'}
                            </button>
                          )}
                          <AccionesDocumentoVacaciones
                            solicitud={sol}
                            loadingPlantilla={loadingDoc === sol.id}
                            onVerPlantilla={() => handleVerDocumento(sol)}
                            onActualizado={(u) => patchSolicitudDoc({ ...sol, ...u })}
                            permitirSubida={authMe?.vacaciones_pdf_firmado_habilitado === true}
                            compact
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Paginación ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
              Mostrando {(paginaActual - 1) * PAGE_SIZE + 1}–{Math.min(paginaActual * PAGE_SIZE, solicitudesFiltradas.length)} de {solicitudesFiltradas.length} solicitud{solicitudesFiltradas.length !== 1 ? 'es' : ''}
              {hayFiltros && ` (filtradas de ${solicitudes.length} total)`}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={() => setPagina(1)}
                disabled={paginaActual === 1}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '5px', backgroundColor: paginaActual === 1 ? '#f9fafb' : 'white', color: paginaActual === 1 ? '#9ca3af' : '#374151', cursor: paginaActual === 1 ? 'default' : 'pointer', fontSize: '0.82rem' }}
              >«</button>
              <button
                type="button"
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '5px', backgroundColor: paginaActual === 1 ? '#f9fafb' : 'white', color: paginaActual === 1 ? '#9ca3af' : '#374151', cursor: paginaActual === 1 ? 'default' : 'pointer', fontSize: '0.82rem' }}
              >‹ Anterior</button>

              {/* Números de página */}
              {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPaginas || Math.abs(p - paginaActual) <= 2)
                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) => p === '...'
                  ? <span key={`e${i}`} style={{ padding: '6px 4px', color: '#9ca3af', fontSize: '0.82rem' }}>…</span>
                  : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPagina(p as number)}
                      style={{
                        padding: '6px 10px', border: '1px solid', borderRadius: '5px', fontSize: '0.82rem', cursor: 'pointer', minWidth: '34px',
                        borderColor: p === paginaActual ? '#0369a1' : '#d1d5db',
                        backgroundColor: p === paginaActual ? '#0369a1' : 'white',
                        color: p === paginaActual ? 'white' : '#374151',
                        fontWeight: p === paginaActual ? 700 : 400,
                      }}
                    >{p}</button>
                  )
                )}

              <button
                type="button"
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaActual === totalPaginas}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '5px', backgroundColor: paginaActual === totalPaginas ? '#f9fafb' : 'white', color: paginaActual === totalPaginas ? '#9ca3af' : '#374151', cursor: paginaActual === totalPaginas ? 'default' : 'pointer', fontSize: '0.82rem' }}
              >Siguiente ›</button>
              <button
                type="button"
                onClick={() => setPagina(totalPaginas)}
                disabled={paginaActual === totalPaginas}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '5px', backgroundColor: paginaActual === totalPaginas ? '#f9fafb' : 'white', color: paginaActual === totalPaginas ? '#9ca3af' : '#374151', cursor: paginaActual === totalPaginas ? 'default' : 'pointer', fontSize: '0.82rem' }}
              >»</button>
            </div>
          </div>
        </>
      )}

      {/* Modal confirmación RH */}
      {modalConfirmar !== null && (
        <div
          onClick={() => { setModalConfirmar(null); setConfirmacionAcepto(false); setConfirmacionPassword(''); }}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: 'white', borderRadius: 10, padding: 28, width: 420, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700, color: '#065f46' }}>
              ✔ Constancia formal — RH
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#6b7280' }}>
              El saldo ya se descontó al aprobar el jefe. Esto solo registra la confirmación en expediente; puedes añadir un comentario opcional.
            </p>
            {isSuperuser && (
              <p style={{ margin: '0 0 12px', fontSize: '0.78rem', backgroundColor: '#f0f9ff', color: '#0369a1', padding: '6px 10px', borderRadius: 5, fontWeight: 500 }}>
                Estás confirmando como Administrador.
              </p>
            )}
            <textarea
              placeholder="Comentario de RH (opcional)"
              value={comentarioRH}
              onChange={e => setComentarioRH(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '12px 0', fontSize: '0.85rem', color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={confirmacionAcepto} onChange={(e) => setConfirmacionAcepto(e.target.checked)}
                style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }} />
              <span>
                Confirmo el registro formal de RH de esta solicitud y lo autentico con mi contraseña.
              </span>
            </label>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.85rem' }}>Contraseña</label>
              <input
                type="password"
                value={confirmacionPassword}
                onChange={(e) => setConfirmacionPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Tu contraseña de acceso"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button
                onClick={() => { setModalConfirmar(null); setConfirmacionAcepto(false); setConfirmacionPassword(''); }}
                style={{ padding: '7px 18px', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', backgroundColor: 'white', fontSize: '0.85rem' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => confirmarRH(modalConfirmar, comentarioRH)}
                disabled={!!confirmandoId || !confirmacionAcepto || !confirmacionPassword.trim()}
                style={{ padding: '7px 20px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', opacity: (!confirmacionAcepto || !confirmacionPassword.trim()) ? 0.6 : 1 }}
              >
                {confirmandoId ? '...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
