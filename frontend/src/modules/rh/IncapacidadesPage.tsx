import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

interface Empresa {
  id: number;
  nombre: string;
}

interface Departamento {
  id: number;
  nombre: string;
  empresa_id: number;
}

interface Empleado {
  id: number;
  numero_empleado: string;
  nombre: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  departamento_id?: number | null;
}

interface Incapacidad {
  id: number;
  empleado_id: number;
  tipo: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias: number;
  folio_imss?: string | null;
  descripcion?: string | null;
  estado: string;
  created_at: string;
  empleado?: Empleado | null;
  registrador?: Empleado | null;
}

const TIPO_LABEL: Record<string, string> = {
  imss: 'IMSS',
  maternidad: 'Maternidad',
  paternidad: 'Paternidad',
  enfermedad_general: 'Enfermedad general',
  accidente_trabajo: 'Accidente de trabajo',
  otro: 'Otro',
};

const TIPO_COLOR: Record<string, { bg: string; color: string }> = {
  imss: { bg: '#e0f2fe', color: '#0369a1' },
  maternidad: { bg: '#fce7f3', color: '#9d174d' },
  paternidad: { bg: '#e0f2fe', color: '#0c4a6e' },
  enfermedad_general: { bg: '#fef3c7', color: '#92400e' },
  accidente_trabajo: { bg: '#fee2e2', color: '#991b1b' },
  otro: { bg: '#f3f4f6', color: '#374151' },
};

const ESTADO_STYLE: Record<string, { bg: string; color: string }> = {
  activa: { bg: '#d1fae5', color: '#065f46' },
  finalizada: { bg: '#f3f4f6', color: '#6b7280' },
  cancelada: { bg: '#fee2e2', color: '#991b1b' },
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

const filterControlStyle: React.CSSProperties = {
  ...inputStyle,
  height: 36,
};

const today = new Date().toISOString().slice(0, 10);

const emptyForm = {
  empleado_id: '',
  tipo: 'imss',
  fecha_inicio: today,
  fecha_fin: today,
  folio_imss: '',
  descripcion: '',
};

export const IncapacidadesPage = () => {
  const [incapacidades, setIncapacidades] = useState<Incapacidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Incapacidad | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [resumenModal, setResumenModal] = useState<{ eliminadas: number; detalle: string[] } | null>(null);

  // Catálogos para el formulario
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [deptosPorEmpresa, setDeptosPorEmpresa] = useState<Departamento[]>([]);
  const [empleadosPorDepto, setEmpleadosPorDepto] = useState<Empleado[]>([]);
  const [formEmpresaId, setFormEmpresaId] = useState('');
  const [formDeptoId, setFormDeptoId] = useState('');
  const [loadingDeptos, setLoadingDeptos] = useState(false);
  const [loadingEmps, setLoadingEmps] = useState(false);

  // Filtros tabla
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('activa');
  const [filtroTipo, setFiltroTipo] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [incRes, empRes] = await Promise.all([
        api.get<Incapacidad[]>('/incapacidades?limit=500'),
        api.get<Empresa[]>('/personal/empresas?limit=200'),
      ]);
      setIncapacidades(Array.isArray(incRes.data) ? incRes.data : []);
      setEmpresas(Array.isArray(empRes.data) ? empRes.data : []);
    } catch {
      setIncapacidades([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Al cambiar empresa → cargar departamentos
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

  // Al cambiar departamento → cargar empleados
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
    setEditando(null);
    setForm(emptyForm);
    setFormEmpresaId('');
    setFormDeptoId('');
    setDeptosPorEmpresa([]);
    setEmpleadosPorDepto([]);
    setError('');
    setShowModal(true);
  };

  const abrirEditar = (inc: Incapacidad) => {
    setEditando(inc);
    setForm({
      empleado_id: String(inc.empleado_id),
      tipo: inc.tipo,
      fecha_inicio: inc.fecha_inicio,
      fecha_fin: inc.fecha_fin,
      folio_imss: inc.folio_imss ?? '',
      descripcion: inc.descripcion ?? '',
    });
    // Precargar empresa/depto del empleado si está disponible
    setFormEmpresaId('');
    setFormDeptoId('');
    setEmpleadosPorDepto(inc.empleado ? [inc.empleado] : []);
    setError('');
    setShowModal(true);
  };

  const guardar = async () => {
    if (!form.empleado_id) { setError('Selecciona un empleado'); return; }
    if (form.fecha_fin < form.fecha_inicio) { setError('La fecha fin debe ser igual o posterior a la fecha inicio'); return; }
    setGuardando(true);
    setError('');
    try {
      const payload = {
        empleado_id: Number(form.empleado_id),
        tipo: form.tipo,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        folio_imss: form.folio_imss.trim() || null,
        descripcion: form.descripcion.trim() || null,
      };
      if (editando) {
        await api.put(`/incapacidades/${editando.id}`, payload);
        setShowModal(false);
      } else {
        const res = await api.post<{
          incapacidad: unknown;
          incidencias_eliminadas: number;
          detalle_incidencias: string[];
        }>('/incapacidades', payload);
        setShowModal(false);
        if (res.data.incidencias_eliminadas > 0) {
          setResumenModal({
            eliminadas: res.data.incidencias_eliminadas,
            detalle: res.data.detalle_incidencias,
          });
        }
      }
      cargar();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const cancelarInc = async (id: number) => {
    if (!confirm('¿Cancelar esta incapacidad?')) return;
    try {
      await api.delete(`/incapacidades/${id}`);
      cargar();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error al cancelar');
    }
  };

  const nombreEmpleado = (e?: Empleado | null) => {
    if (!e) return '—';
    return `${e.nombre} ${e.apellido_paterno ?? ''}`.trim();
  };

  const filtradas = incapacidades.filter(inc => {
    if (filtroEstado && inc.estado !== filtroEstado) return false;
    if (filtroTipo && inc.tipo !== filtroTipo) return false;
    if (busqueda) {
      const b = busqueda.toLowerCase();
      const nombre = nombreEmpleado(inc.empleado).toLowerCase();
      const num = inc.empleado?.numero_empleado?.toLowerCase() ?? '';
      const folio = (inc.folio_imss ?? '').toLowerCase();
      if (!nombre.includes(b) && !num.includes(b) && !folio.includes(b)) return false;
    }
    return true;
  });

  // Calcular días entre fechas del form
  const diasForm = (() => {
    if (!form.fecha_inicio || !form.fecha_fin || form.fecha_fin < form.fecha_inicio) return 0;
    const d1 = new Date(form.fecha_inicio);
    const d2 = new Date(form.fecha_fin);
    return Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
  })();

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Incapacidades</h1>
        <button
          onClick={abrirNueva}
          style={{ padding: '9px 18px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
        >
          + Registrar incapacidad
        </button>
      </div>

      {/* Filtros */}
      <div style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Buscar empleado, No. o folio IMSS..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ ...filterControlStyle, width: 300, flex: '0 0 300px' }}
        />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...filterControlStyle, width: 'auto' }}>
          <option value="">Todos los estados</option>
          <option value="activa">Activa</option>
          <option value="finalizada">Finalizada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...filterControlStyle, width: 'auto' }}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {(busqueda || filtroEstado || filtroTipo) && (
          <button onClick={() => { setBusqueda(''); setFiltroEstado('activa'); setFiltroTipo(''); }}
            style={{ padding: '7px 12px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <p style={{ color: '#666' }}>Cargando...</p>
      ) : filtradas.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', color: '#9ca3af' }}>
          No se encontraron incapacidades con los filtros aplicados.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Empleado</th>
                <th style={th}>Tipo</th>
                <th style={th}>Fecha inicio</th>
                <th style={th}>Fecha fin</th>
                <th style={{ ...th, textAlign: 'center' }}>Días</th>
                <th style={th}>Folio / Doc.</th>
                <th style={th}>Descripción</th>
                <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                <th style={{ ...th, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(inc => {
                const tipoStyle = TIPO_COLOR[inc.tipo] ?? TIPO_COLOR.otro;
                const estadoStyle = ESTADO_STYLE[inc.estado] ?? ESTADO_STYLE.activa;
                return (
                  <tr key={inc.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{nombreEmpleado(inc.empleado)}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>No. {inc.empleado?.numero_empleado ?? '—'}</div>
                    </td>
                    <td style={td}>
                      <span style={{ backgroundColor: tipoStyle.bg, color: tipoStyle.color, borderRadius: 5, padding: '3px 9px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {TIPO_LABEL[inc.tipo] ?? inc.tipo}
                      </span>
                    </td>
                    <td style={td}>{new Date(inc.fecha_inicio + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                    <td style={td}>{new Date(inc.fecha_fin + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{inc.dias}</td>
                    <td style={{ ...td, color: '#555' }}>{inc.folio_imss || '—'}</td>
                    <td style={{ ...td, color: '#555', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inc.descripcion ?? ''}>
                      {inc.descripcion || '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ backgroundColor: estadoStyle.bg, color: estadoStyle.color, borderRadius: 5, padding: '3px 9px', fontSize: '0.78rem', fontWeight: 600 }}>
                        {inc.estado.charAt(0).toUpperCase() + inc.estado.slice(1)}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        {inc.estado !== 'cancelada' && (
                          <>
                            <button
                              onClick={() => abrirEditar(inc)}
                              title="Editar"
                              style={{ padding: '4px 10px', backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => cancelarInc(inc.id)}
                              title="Cancelar incapacidad"
                              style={{ padding: '4px 10px', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                            >
                              Cancelar
                            </button>
                          </>
                        )}
                        {inc.estado === 'cancelada' && <span style={{ color: '#d1d5db' }}>—</span>}
                      </div>
                    </td>
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

      {/* Modal: registrar / editar */}
      {showModal && (
        <div
          onClick={() => !guardando && setShowModal(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: 'white', borderRadius: 12, padding: 28, width: 500, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700 }}>
              {editando ? 'Editar incapacidad' : 'Registrar incapacidad'}
            </h3>

            {/* Empresa */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '5px', color: '#374151' }}>
                Empresa <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={formEmpresaId}
                onChange={e => setFormEmpresaId(e.target.value)}
                disabled={!!editando}
                style={{ ...inputStyle, backgroundColor: editando ? '#f9fafb' : 'white' }}
              >
                <option value="">— Seleccionar empresa —</option>
                {empresas.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                ))}
              </select>
            </div>

            {/* Departamento */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '5px', color: '#374151' }}>
                Departamento <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={formDeptoId}
                onChange={e => setFormDeptoId(e.target.value)}
                disabled={!!editando || !formEmpresaId}
                style={{ ...inputStyle, backgroundColor: (!formEmpresaId || !!editando) ? '#f9fafb' : 'white' }}
              >
                <option value="">
                  {loadingDeptos ? 'Cargando...' : !formEmpresaId ? '— Primero selecciona empresa —' : '— Seleccionar departamento —'}
                </option>
                {deptosPorEmpresa.map(d => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>

            {/* Empleado */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '5px', color: '#374151' }}>
                Empleado <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={form.empleado_id}
                onChange={e => setForm(f => ({ ...f, empleado_id: e.target.value }))}
                disabled={!!editando || (!formDeptoId && !editando)}
                style={{ ...inputStyle, backgroundColor: (!formDeptoId || !!editando) ? '#f9fafb' : 'white' }}
              >
                <option value="">
                  {loadingEmps ? 'Cargando...' : !formDeptoId && !editando ? '— Primero selecciona departamento —' : '— Seleccionar empleado —'}
                </option>
                {empleadosPorDepto.map(e => (
                  <option key={e.id} value={e.id}>
                    {`${e.nombre} ${e.apellido_paterno ?? ''}`.trim()} — No. {e.numero_empleado}
                  </option>
                ))}
              </select>
            </div>

            {/* Tipo */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '5px', color: '#374151' }}>Tipo de incapacidad</label>
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={inputStyle}>
                {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {/* Fechas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '5px', color: '#374151' }}>
                  Fecha inicio <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input type="date" value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '5px', color: '#374151' }}>
                  Fecha fin <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input type="date" value={form.fecha_fin} onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            {/* Contador de días */}
            {diasForm > 0 && (
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '8px 14px', marginBottom: '14px', fontSize: '0.87rem', color: '#166534', fontWeight: 600 }}>
                📅 {diasForm} día{diasForm !== 1 ? 's' : ''} calendario cubiertos
              </div>
            )}

            {/* Folio IMSS */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '5px', color: '#374151' }}>Folio IMSS / Número de documento</label>
              <input
                type="text"
                value={form.folio_imss}
                onChange={e => setForm(f => ({ ...f, folio_imss: e.target.value }))}
                placeholder="Ej. 12345678"
                style={inputStyle}
              />
            </div>

            {/* Descripción */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '5px', color: '#374151' }}>Descripción / Diagnóstico</label>
              <textarea
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                rows={3}
                placeholder="Ej. Fractura de muñeca derecha"
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            {error && (
              <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', marginBottom: '14px', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => !guardando && setShowModal(false)}
                disabled={guardando}
                style={{ padding: '9px 20px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                style={{ padding: '9px 20px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: guardando ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              >
                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: resumen de incidencias eliminadas */}
      {resumenModal && (
        <div
          onClick={() => setResumenModal(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: 'white', borderRadius: 12, padding: 28, width: 480, maxWidth: '94vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: '1.5rem' }}>🩺</span>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1f2937' }}>
                Incapacidad registrada correctamente
              </h3>
            </div>

            {/* Resumen */}
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#166534', fontWeight: 600 }}>
                ✅ Se eliminaron <strong>{resumenModal.eliminadas}</strong> incidencia{resumenModal.eliminadas !== 1 ? 's' : ''} automática{resumenModal.eliminadas !== 1 ? 's' : ''} generada{resumenModal.eliminadas !== 1 ? 's' : ''} durante el período de incapacidad.
              </p>
            </div>

            {/* Detalle */}
            {resumenModal.detalle.length > 0 && (
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
                <p style={{ margin: '0 0 8px', fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Detalle de incidencias eliminadas
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {resumenModal.detalle.map((d, i) => (
                    <div key={i} style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 12px', fontSize: '0.83rem', color: '#991b1b' }}>
                      {d}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ textAlign: 'right' }}>
              <button
                onClick={() => setResumenModal(null)}
                style={{ padding: '9px 24px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
