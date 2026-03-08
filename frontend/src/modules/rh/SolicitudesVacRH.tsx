import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import type { SolicitudVacaciones } from '../../types';

interface EmpleadoResumen {
  id: number;
  numero_empleado?: string;
  nombre: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  empresa?: { id: number; nombre: string } | null;
  departamento?: { id: number; nombre: string } | null;
  jefe?: {
    id: number;
    nombre: string;
    apellido_paterno?: string;
    apellido_materno?: string;
  } | null;
}

const ESTADO_COLOR: Record<string, React.CSSProperties> = {
  pendiente:     { backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '2px 10px', fontWeight: 600, fontSize: '0.78rem' },
  aprobada_jefe: { backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: 6, padding: '2px 10px', fontWeight: 600, fontSize: '0.78rem' },
  aprobada:      { backgroundColor: '#d1fae5', color: '#065f46', borderRadius: 6, padding: '2px 10px', fontWeight: 600, fontSize: '0.78rem' },
  rechazada:     { backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '2px 10px', fontWeight: 600, fontSize: '0.78rem' },
  cancelada:     { backgroundColor: '#f3f4f6', color: '#6b7280', borderRadius: 6, padding: '2px 10px', fontWeight: 600, fontSize: '0.78rem' },
};

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

const PAGE_SIZE = 25;

export const SolicitudesVacRH = () => {
  const [solicitudes, setSolicitudes] = useState<SolicitudVacaciones[]>([]);
  const [empleadosMap, setEmpleadosMap] = useState<Map<number, EmpleadoResumen>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroDepartamento, setFiltroDepartamento] = useState('');
  const [pagina, setPagina] = useState(1);

  const [procesando, setProcesando] = useState<number | null>(null);
  const [modalSolicitudId, setModalSolicitudId] = useState<number | null>(null);
  const [comentarioTexto, setComentarioTexto] = useState('');

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<SolicitudVacaciones[]>(
        '/vacaciones/solicitudes-pendientes-rh?limit=1000'
      );
      setSolicitudes(data);

      // Cargar empleados únicos
      const ids = [...new Set(data.map(s => s.empleado_id))];
      if (ids.length === 0) return;

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
  }, []);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const confirmarAprobar = async (solicitudId: number, comentarios?: string) => {
    setProcesando(solicitudId);
    try {
      await api.put(`/vacaciones/solicitudes/${solicitudId}/confirmar-rh`, {
        aprobar: true,
        comentarios: comentarios || null,
      });
      await cargarDatos();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Error al confirmar la solicitud';
      alert(msg);
    } finally {
      setProcesando(null);
    }
  };

  const abrirModal = (solicitudId: number) => {
    setModalSolicitudId(solicitudId);
    setComentarioTexto('');
  };

  const cerrarModal = () => {
    setModalSolicitudId(null);
    setComentarioTexto('');
  };

  const ejecutarConfirmar = () => {
    if (!modalSolicitudId) return;
    confirmarAprobar(modalSolicitudId, comentarioTexto);
    cerrarModal();
  };

  // Opciones para filtros
  const empresasUnicas = [...new Set(
    [...empleadosMap.values()].map(e => e.empresa?.nombre).filter(Boolean) as string[]
  )].sort();
  const deptsUnicos = [...new Set(
    [...empleadosMap.values()].map(e => e.departamento?.nombre).filter(Boolean) as string[]
  )].sort();

  // Filtrado
  const solicitudesFiltradas = solicitudes.filter(sol => {
    const emp = empleadosMap.get(sol.empleado_id);
    const nombreCompleto = emp
      ? `${emp.nombre} ${emp.apellido_paterno || ''} ${emp.apellido_materno || ''}`.toLowerCase()
      : '';
    const numEmp = emp?.numero_empleado?.toLowerCase() || '';

    if (busqueda && !nombreCompleto.includes(busqueda.toLowerCase()) && !numEmp.includes(busqueda.toLowerCase())) return false;
    if (filtroEmpresa && emp?.empresa?.nombre !== filtroEmpresa) return false;
    if (filtroDepartamento && emp?.departamento?.nombre !== filtroDepartamento) return false;
    return true;
  });

  const totalPaginas = Math.max(1, Math.ceil(solicitudesFiltradas.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const solicitudesPagina = solicitudesFiltradas.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroEmpresa('');
    setFiltroDepartamento('');
    setPagina(1);
  };

  const fmtFecha = (f: string) => {
    try { return new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return f; }
  };

  const nombreEmp = (emp?: EmpleadoResumen) =>
    emp ? `${emp.nombre} ${emp.apellido_paterno || ''}`.trim() : '—';

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
        Cargando solicitudes...
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

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>
            Solicitudes de Vacaciones — Confirmación RH
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
            Solicitudes aprobadas por el jefe directo, pendientes de confirmación final por RH
          </p>
        </div>
        <span style={{ ...ESTADO_COLOR['aprobada_jefe'], fontSize: '0.9rem' }}>
          {solicitudes.length} pendiente{solicitudes.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Filtros */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16,
        padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb',
      }}>
        <input
          type="text"
          placeholder="Buscar por nombre o No. empleado..."
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', minWidth: 220 }}
        />
        <select
          value={filtroEmpresa}
          onChange={e => { setFiltroEmpresa(e.target.value); setPagina(1); }}
          style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem' }}
        >
          <option value="">Todas las empresas</option>
          {empresasUnicas.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select
          value={filtroDepartamento}
          onChange={e => { setFiltroDepartamento(e.target.value); setPagina(1); }}
          style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem' }}
        >
          <option value="">Todos los departamentos</option>
          {deptsUnicos.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {(busqueda || filtroEmpresa || filtroDepartamento) && (
          <button
            onClick={limpiarFiltros}
            style={{ padding: '7px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer', backgroundColor: 'white' }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {solicitudesFiltradas.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: 8 }}>
          {solicitudes.length === 0
            ? 'No hay solicitudes pendientes de confirmación RH.'
            : 'No hay solicitudes que coincidan con los filtros.'}
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white' }}>
              <thead>
                <tr>
                  <th style={th}>No.</th>
                  <th style={th}>Nombre</th>
                  <th style={th}>Empresa</th>
                  <th style={th}>Departamento</th>
                  <th style={th}>Autorizó</th>
                  <th style={th}>Fecha autorización</th>
                  <th style={th}>Fecha inicio</th>
                  <th style={th}>Fecha fin</th>
                  <th style={{ ...th, textAlign: 'center' }}>Días</th>
                  <th style={{ ...th, textAlign: 'center' }}>Confirmar</th>
                </tr>
              </thead>
              <tbody>
                {solicitudesPagina.map(sol => {
                  const emp = empleadosMap.get(sol.empleado_id);
                  const enProceso = procesando === sol.id;
                  const esJefeDirecto = sol.aprobador_es_jefe_directo;
                  return (
                    <tr key={sol.id} style={{ transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}>
                      <td style={td}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>
                          {emp?.numero_empleado || sol.empleado_id}
                        </span>
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{nombreEmp(emp)}</div>
                        {emp?.apellido_materno && (
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{emp.apellido_materno}</div>
                        )}
                      </td>
                      <td style={td}>{emp?.empresa?.nombre || '—'}</td>
                      <td style={td}>{emp?.departamento?.nombre || '—'}</td>
                      <td style={td}>
                        {sol.jefe_aprobador_nombre ? (
                          <>
                            <div style={{ fontWeight: 600, color: '#111827' }}>
                              {sol.jefe_aprobador_nombre}
                            </div>
                            <div style={{ marginTop: 3 }}>
                              {esJefeDirecto === true && (
                                <span style={{ fontSize: '0.72rem', backgroundColor: '#d1fae5', color: '#065f46', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                                  Jefe directo
                                </span>
                              )}
                              {esJefeDirecto === false && (
                                <span style={{ fontSize: '0.72rem', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                                  Administrador
                                </span>
                              )}
                            </div>
                          </>
                        ) : '—'}
                      </td>
                      <td style={td}>
                        {sol.fecha_aprobacion
                          ? fmtFecha(sol.fecha_aprobacion)
                          : <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                      <td style={td}>{fmtFecha(sol.fecha_inicio)}</td>
                      <td style={td}>{fmtFecha(sol.fecha_fin)}</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{sol.dias_solicitados}</td>
                      <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          disabled={enProceso}
                          onClick={() => abrirModal(sol.id)}
                          style={{
                            padding: '5px 16px',
                            backgroundColor: enProceso ? '#9ca3af' : '#059669',
                            color: 'white',
                            border: 'none',
                            borderRadius: 6,
                            cursor: enProceso ? 'wait' : 'pointer',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                          }}
                        >
                          {enProceso ? '...' : '✔ Confirmar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPaginas > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16 }}>
              <button
                onClick={() => setPagina(1)} disabled={paginaActual === 1}
                style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 5, cursor: paginaActual === 1 ? 'default' : 'pointer', fontSize: '0.82rem', backgroundColor: 'white' }}
              >«</button>
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaActual === 1}
                style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 5, cursor: paginaActual === 1 ? 'default' : 'pointer', fontSize: '0.82rem', backgroundColor: 'white' }}
              >‹ Anterior</button>
              {Array.from({ length: Math.min(7, totalPaginas) }, (_, i) => {
                const pg = totalPaginas <= 7 ? i + 1 : Math.max(1, Math.min(paginaActual - 3, totalPaginas - 6)) + i;
                return (
                  <button key={pg} onClick={() => setPagina(pg)}
                    style={{
                      padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer',
                      fontSize: '0.82rem', fontWeight: pg === paginaActual ? 700 : 400,
                      backgroundColor: pg === paginaActual ? '#0369a1' : 'white',
                      color: pg === paginaActual ? 'white' : '#374151',
                    }}>{pg}</button>
                );
              })}
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}
                style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 5, cursor: paginaActual === totalPaginas ? 'default' : 'pointer', fontSize: '0.82rem', backgroundColor: 'white' }}
              >Siguiente ›</button>
              <button
                onClick={() => setPagina(totalPaginas)} disabled={paginaActual === totalPaginas}
                style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 5, cursor: paginaActual === totalPaginas ? 'default' : 'pointer', fontSize: '0.82rem', backgroundColor: 'white' }}
              >»</button>
              <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#6b7280' }}>
                {solicitudesFiltradas.length} resultado{solicitudesFiltradas.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </>
      )}

      {/* Modal de confirmación */}
      {modalSolicitudId !== null && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: 10, padding: 28, width: 420,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
              ✔ Confirmar solicitud de vacaciones
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#6b7280' }}>
              RH confirma la solicitud. Los días quedarán oficialmente registrados como vacaciones aprobadas.
            </p>
            <textarea
              placeholder="Comentario de RH (opcional)"
              value={comentarioTexto}
              onChange={e => setComentarioTexto(e.target.value)}
              rows={3}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #d1d5db',
                borderRadius: 6, fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button
                onClick={cerrarModal}
                style={{ padding: '7px 18px', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', backgroundColor: 'white', fontSize: '0.85rem' }}
              >
                Cancelar
              </button>
              <button
                onClick={ejecutarConfirmar}
                style={{
                  padding: '7px 20px',
                  backgroundColor: '#059669',
                  color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
