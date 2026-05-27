import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toMexicoDateString } from '../../utils/date';
import { fmtNombreEmpleado } from '../../utils/format';
import { useAuth } from '../../hooks/useAuth';
import { SolicitudVacaciones } from '../../types';

interface EmpleadoResumen {
  id: number;
  nombre: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  numero_empleado: string;
  fecha_ingreso?: string | null;
  empresa?: { id: number; nombre: string } | null;
  departamento?: { id: number; nombre: string } | null;
  puesto?: { id: number; nombre: string } | null;
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

const fmtPartes = (iso: string | null | undefined) => {
  if (!iso) return { dd: '', mm: '', aaaa: '' };
  const d = new Date(iso.includes('T') ? iso : iso + 'T12:00:00');
  return {
    dd: String(d.getDate()).padStart(2, '0'),
    mm: String(d.getMonth() + 1).padStart(2, '0'),
    aaaa: String(d.getFullYear()),
  };
};

const generarDocumento = (sol: SolicitudVacaciones, emp: EmpleadoResumen | null) => {
  const nombreCompleto = emp
    ? [emp.nombre, emp.apellido_paterno, emp.apellido_materno].filter(Boolean).join(' ')
    : `Empleado #${sol.empleado_id}`;
  const numEmp = emp?.numero_empleado ?? '—';
  const empresa = emp?.empresa?.nombre ?? '—';
  const departamento = emp?.departamento?.nombre ?? '—';
  const puesto = emp?.puesto?.nombre ?? '—';

  const hoyPartes = fmtPartes(toMexicoDateString(new Date()));
  const inicioPartes = fmtPartes(sol.fecha_inicio);
  const finPartes = fmtPartes(sol.fecha_fin);
  const ingresoPartes = fmtPartes(emp?.fecha_ingreso);

  const regresoPartes = (() => {
    const base = sol.fecha_fin;
    const d = new Date(base.includes('T') ? base : base + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return {
      dd: String(d.getDate()).padStart(2, '0'),
      mm: String(d.getMonth() + 1).padStart(2, '0'),
      aaaa: String(d.getFullYear()),
    };
  })();

  const esBorrador = sol.estado === 'pendiente';

  const logoGrupo = new URL('../../assets/GPOCristal.png', import.meta.url).pathname;
  const logoRaiz = new URL('../../assets/Raiz.png', import.meta.url).pathname;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Solicitud de Vacaciones — ${nombreCompleto}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; }
  .no-print { padding: 12px 20px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 12px; }
  @media print { .no-print { display: none !important; } }
  .page { max-width: 740px; margin: 0 auto; padding: 40px 48px 48px; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
  .logo-area { display: flex; align-items: center; gap: 24px; }
  .doc-title { font-size: 22px; font-weight: 700; color: #1e3a8a; text-align: right; align-self: flex-end; }
  .fecha-header { display: flex; align-items: center; gap: 6px; margin-bottom: 20px; justify-content: flex-end; font-size: 12px; }
  .fecha-header .lbl { color: #555; }
  .fecha-cell { display: inline-block; min-width: 28px; text-align: center; border-bottom: 1.5px solid #1e3a8a; padding: 2px 4px; font-weight: 600; color: #1e3a8a; }
  .sep { color: #1e3a8a; font-weight: 700; }
  .sec-title { font-size: 14px; font-weight: 700; color: #1e3a8a; margin-bottom: 14px; }
  .form-row { display: flex; gap: 0; margin-bottom: 14px; align-items: flex-end; }
  .form-field { flex: 1; }
  .form-field + .form-field { margin-left: 24px; }
  .form-label { font-size: 11px; color: #444; margin-bottom: 3px; display: block; }
  .form-value { border-bottom: 1.5px solid #555; min-height: 20px; padding: 2px 2px 2px 0; font-size: 13px; font-weight: 500; color: #111; display: block; min-width: 60px; }
  .form-value.wide { min-width: 200px; }
  .dias-row { margin-bottom: 10px; font-size: 13px; }
  .dias-row .val { font-weight: 700; border-bottom: 1.5px solid #555; display: inline-block; min-width: 60px; text-align: center; margin-left: 6px; }
  .fecha-field { display: flex; align-items: flex-end; gap: 2px; }
  .fecha-field .fc { display: inline-block; border-bottom: 1.5px solid #555; text-align: center; padding: 2px 4px; font-weight: 600; min-width: 28px; font-size: 13px; }
  .fecha-field .fc.year { min-width: 44px; }
  .fecha-field .fsep { color: #555; padding: 0 2px; font-size: 13px; align-self: flex-end; margin-bottom: 2px; }
  .firmas-title { font-size: 16px; font-weight: 700; color: #1e3a8a; text-align: center; margin: 36px 0 40px; }
  .firmas-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px 32px; margin-bottom: 32px; }
  .firma-item { text-align: center; }
  .firma-line { border-top: 1.5px solid #555; margin-bottom: 6px; }
  .firma-nombre { font-size: 11px; font-weight: 700; color: #1a1a2e; }
  .firma-cargo { font-size: 10px; color: #555; margin-top: 2px; }
  .firmas-bottom { display: flex; justify-content: center; }
  .borrador-banner { background: #fef9c3; border: 1px solid #fbbf24; color: #92400e; padding: 6px 14px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .btn-print { padding: 8px 20px; background: #1e3a8a; color: white; border: none; border-radius: 5px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-close { padding: 8px 20px; background: #e2e8f0; color: #334155; border: none; border-radius: 5px; font-size: 13px; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
<div class="no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
  <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
  ${esBorrador ? '<span class="borrador-banner">⚠️ Solicitud pendiente de aprobación</span>' : ''}
</div>
<div class="page">
  <div class="doc-header">
    <div class="logo-area" style="display:flex;align-items:center;gap:24px;">
      <img src="${logoGrupo}" alt="Grupo Cristal" style="height:48px;max-width:140px;object-fit:contain;" onerror="this.style.display='none'"/>
      <img src="${logoRaiz}" alt="Raiz" style="height:44px;max-width:120px;object-fit:contain;" onerror="this.style.display='none'"/>
    </div>
    <div class="doc-title">Solicitud de vacaciones</div>
  </div>

  <div class="fecha-header">
    <span class="lbl">Fecha:</span>
    <span class="fecha-cell">${hoyPartes.dd}</span>
    <span class="sep">|</span>
    <span class="fecha-cell">${hoyPartes.mm}</span>
    <span class="sep">|</span>
    <span class="fecha-cell">${hoyPartes.aaaa}</span>
  </div>

  <div class="sec-title">Solicitante</div>

  <div class="form-row">
    <div class="form-field">
      <span class="form-label">Nombre de colaborador:</span>
      <span class="form-value wide">${nombreCompleto}</span>
    </div>
  </div>

  <div class="form-row">
    <div class="form-field">
      <span class="form-label">No. de nómina:</span>
      <span class="form-value">${numEmp}</span>
    </div>
    <div class="form-field" style="display:flex;align-items:flex-end;gap:8px;">
      <span class="form-label" style="white-space:nowrap;">Fecha ingreso:</span>
      <div class="fecha-field">
        <span class="fc">${ingresoPartes.dd}</span>
        <span class="fsep">|</span>
        <span class="fc">${ingresoPartes.mm}</span>
        <span class="fsep">|</span>
        <span class="fc year">${ingresoPartes.aaaa}</span>
      </div>
    </div>
  </div>

  <div class="form-row">
    <div class="form-field">
      <span class="form-label">Empresa:</span>
      <span class="form-value">${empresa}</span>
    </div>
    <div class="form-field">
      <span class="form-label">Departamento:</span>
      <span class="form-value">${departamento}</span>
    </div>
  </div>

  <div class="form-row">
    <div class="form-field">
      <span class="form-label">Puesto:</span>
      <span class="form-value wide">${puesto}</span>
    </div>
  </div>

  <div style="margin-top: 20px;">
    <div class="dias-row">
      Días de vacaciones a tomar: <span class="val">${sol.dias_solicitados}</span>
    </div>
    <div class="form-row" style="align-items:center;margin-bottom:10px;">
      <span style="font-size:13px;min-width:80px;">Día Inicial:</span>
      <div class="fecha-field">
        <span class="fc">${inicioPartes.dd}</span><span class="fsep">|</span>
        <span class="fc">${inicioPartes.mm}</span><span class="fsep">|</span>
        <span class="fc year">${inicioPartes.aaaa}</span>
      </div>
    </div>
    <div class="form-row" style="align-items:center;margin-bottom:10px;">
      <span style="font-size:13px;min-width:80px;">Día Final:</span>
      <div class="fecha-field">
        <span class="fc">${finPartes.dd}</span><span class="fsep">|</span>
        <span class="fc">${finPartes.mm}</span><span class="fsep">|</span>
        <span class="fc year">${finPartes.aaaa}</span>
      </div>
    </div>
    <div class="form-row" style="align-items:center;margin-bottom:0;">
      <span style="font-size:13px;min-width:auto;margin-right:8px;">Día que se presenta a laborar después de vacaciones:</span>
      <div class="fecha-field">
        <span class="fc">${regresoPartes.dd}</span><span class="fsep">|</span>
        <span class="fc">${regresoPartes.mm}</span><span class="fsep">|</span>
        <span class="fc year">${regresoPartes.aaaa}</span>
      </div>
    </div>
  </div>

  <div class="firmas-title">Firmas para aprobación de solicitud</div>

  <div class="firmas-grid">
    <div class="firma-item">
      <div class="firma-line"></div>
      <div class="firma-nombre">NOMBRE Y FIRMA</div>
      <div class="firma-cargo">Solicitante</div>
    </div>
    <div class="firma-item">
      <div class="firma-line"></div>
      <div class="firma-nombre">NOMBRE Y FIRMA</div>
      <div class="firma-cargo">Jefe Directo</div>
    </div>
    <div class="firma-item">
      <div class="firma-line"></div>
      <div class="firma-nombre">NOMBRE Y FIRMA</div>
      <div class="firma-cargo">Gestión RH</div>
    </div>
  </div>

  <div class="firmas-bottom">
    <div class="firma-item" style="min-width:220px;">
      <div class="firma-line"></div>
      <div class="firma-nombre">Rafael Vargas Salinas</div>
      <div class="firma-cargo">Gerencia Administrativa</div>
    </div>
  </div>
</div>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=820,height=920,scrollbars=yes');
  if (w) { w.document.write(html); w.document.close(); }
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

export const VacacionesPage = () => {
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
    setConfirmandoId(solicitudId);
    try {
      await api.put(`/vacaciones/solicitudes/${solicitudId}/confirmar-rh`, {
        aprobar: true,
        comentarios: comentarios || null,
      });
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
      generarDocumento(sol, empleadosMap[sol.empleado_id]);
      return;
    }
    setLoadingDoc(sol.id);
    try {
      const r = await api.get<EmpleadoResumen>(`/personal/empleados/${sol.empleado_id}`);
      const emp = r.data;
      setEmpleadosMap(prev => ({ ...prev, [sol.empleado_id]: emp }));
      generarDocumento(sol, emp);
    } catch {
      generarDocumento(sol, null);
    } finally {
      setLoadingDoc(null);
    }
  }, [empleadosMap]);

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
    return <div style={{ padding: '24px', color: '#666' }}>Cargando solicitudes...</div>;
  }

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ marginBottom: '20px' }}>Solicitudes de Vacaciones</h1>

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
                              onClick={() => { setModalConfirmar(sol.id); setComentarioRH(''); }}
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
                          <button
                            type="button"
                            onClick={() => handleVerDocumento(sol)}
                            disabled={loadingDoc === sol.id}
                            style={{
                              padding: '5px 12px',
                              backgroundColor: '#0369a1', color: 'white',
                              border: 'none', borderRadius: 5,
                              cursor: loadingDoc === sol.id ? 'wait' : 'pointer',
                              fontSize: '0.78rem', fontWeight: 600,
                              opacity: loadingDoc === sol.id ? 0.7 : 1,
                            }}
                          >
                            {loadingDoc === sol.id ? '...' : 'Ver Solicitud'}
                          </button>
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
          onClick={() => setModalConfirmar(null)}
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setModalConfirmar(null)}
                style={{ padding: '7px 18px', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', backgroundColor: 'white', fontSize: '0.85rem' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const id = modalConfirmar;
                  setModalConfirmar(null);
                  confirmarRH(id, comentarioRH);
                }}
                style={{ padding: '7px 20px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
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
