import React, { useState, useEffect } from 'react';
import api from '../../services/api';

type TipoIncidencia = 'retardo' | 'falta' | 'horas_extra' | 'salida_anticipada';
type TipoChecada = 'entrada' | 'salida' | 'salida_comer' | 'regreso_comer';

interface Incidencia {
  id: number;
  empleado_id: number;
  empleado_nombre?: string;
  asistencia_id?: number | null;
  fecha: string;
  tipo: TipoIncidencia;
  descripcion?: string | null;
  justificada: boolean;
  comentarios?: string | null;
  origen?: string | null;
  created_at: string;
}

interface Checada {
  id: number;
  empleado_id: number;
  empleado_nombre?: string;
  empleado_numero?: string;
  timestamp: string;
  tipo: TipoChecada | string;
  es_tiempo_extra?: boolean;
}

interface SolicitudVacaciones {
  id: number;
  empleado_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_solicitados: number;
  motivo?: string | null;
  estado: string;
  jefe_aprobador_id?: number | null;
  fecha_aprobacion?: string | null;
  comentarios_aprobacion?: string | null;
  created_at: string;
}

interface EmpleadoArea {
  id: number;
  numero_empleado: string;
  nombre: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  email?: string | null;
  telefono?: string | null;
  puesto?: { id: number; nombre: string } | null;
  departamento?: { id: number; nombre: string } | null;
  estado?: string;
  fecha_ingreso?: string | null;
}

interface AuthMe {
  id: number;
  nombre: string;
  apellido_paterno?: string | null;
  is_jefe: boolean;
  is_superuser?: boolean;
  puede_ver_mi_area?: boolean;
  departamentos: { id: number; nombre: string }[];
  departamentos_que_administro?: { id: number; nombre: string }[];
}

const tipoLabels: Record<string, string> = {
  retardo: 'Retardo',
  falta: 'Falta',
  horas_extra: 'Horas extra',
  salida_anticipada: 'Salida anticipada',
  entrada: 'Entrada',
  salida: 'Salida',
  salida_comer: 'Salida a comer',
  regreso_comer: 'Regreso de comer',
};

type TabKey = 'personal' | 'asistencia' | 'vacaciones';

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '12px 24px',
  cursor: 'pointer',
  border: 'none',
  borderBottom: active ? '3px solid #007bff' : '3px solid transparent',
  backgroundColor: 'transparent',
  fontWeight: active ? 700 : 400,
  fontSize: '1rem',
  color: active ? '#007bff' : '#666',
  transition: 'color 0.15s, border-color 0.15s',
});

const th: React.CSSProperties = {
  padding: '11px 13px', textAlign: 'left', borderBottom: '2px solid #dee2e6',
  fontSize: '0.82rem', fontWeight: 600, color: '#555', backgroundColor: '#f8f9fa',
};
const td: React.CSSProperties = {
  padding: '10px 13px', borderBottom: '1px solid #f0f0f0', fontSize: '0.9rem',
};

/** Quincena actual según el día: 1–15 = quincena 1, 16–fin = quincena 2 */
function getQuincenaActual(): { year: number; month: number; num: 1 | 2 } {
  const d = new Date();
  const num = d.getDate() >= 16 ? 2 : 1;
  return { year: d.getFullYear(), month: d.getMonth(), num };
}

/** Rango de fechas de una quincena (inicio 00:00, fin 23:59) en ISO para la API */
function getQuincenaRango(year: number, month: number, num: 1 | 2): { inicio: string; fin: string } {
  const m = String(month + 1).padStart(2, '0');
  if (num === 1) {
    return {
      inicio: `${year}-${m}-01T00:00:00`,
      fin: `${year}-${m}-15T23:59:59`,
    };
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    inicio: `${year}-${m}-16T00:00:00`,
    fin: `${year}-${m}-${String(lastDay).padStart(2, '0')}T23:59:59`,
  };
}

/** Etiqueta para mostrar: "1° quincena marzo 2026 (1 - 15 mar)" */
function formatQuincenaLabel(year: number, month: number, num: 1 | 2): string {
  const mesNombre = new Date(year, month, 1).toLocaleDateString('es-MX', { month: 'long' });
  const mesCorto = new Date(year, month, 1).toLocaleDateString('es-MX', { month: 'short' });
  const mesCapitalized = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);
  if (num === 1) return `1° quincena ${mesCapitalized} ${year} (1 - 15 ${mesCorto})`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return `2° quincena ${mesCapitalized} ${year} (16 - ${lastDay} ${mesCorto})`;
}

export const MiAreaPage = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('personal');
  const [authMe, setAuthMe] = useState<AuthMe | null>(null);

  // Personal
  const [personal, setPersonal] = useState<EmpleadoArea[]>([]);
  const [loadingPersonal, setLoadingPersonal] = useState(false);

  // Asistencia / Checadas (por quincena: 1 = días 1-15, 2 = 16-fin de mes)
  const [checadas, setChecadas] = useState<Checada[]>([]);
  const [loadingChecadas, setLoadingChecadas] = useState(false);
  const [quincena, setQuincena] = useState<{ year: number; month: number; num: 1 | 2 }>(() => getQuincenaActual());

  // Incidencias
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [loadingIncidencias, setLoadingIncidencias] = useState(false);
  const [filtroJustificada, setFiltroJustificada] = useState<'todas' | 'pendientes' | 'justificadas'>('pendientes');
  const [modalIncidencia, setModalIncidencia] = useState<Incidencia | null>(null);
  const [justificarComentarios, setJustificarComentarios] = useState('');
  const [justificada, setJustificada] = useState(true);
  const [saving, setSaving] = useState(false);

  // Vacaciones
  const [solicitudesVacaciones, setSolicitudesVacaciones] = useState<SolicitudVacaciones[]>([]);
  const [loadingVacaciones, setLoadingVacaciones] = useState(false);
  const [filtroEstadoVacaciones, setFiltroEstadoVacaciones] = useState<string>('pendientes');
  const [modalAprobar, setModalAprobar] = useState<SolicitudVacaciones | null>(null);
  const [aprobacionComentarios, setAprobacionComentarios] = useState('');
  const [aprobando, setAprobando] = useState(false);

  // Mapa id→nombre empleado
  const [empleadosMap, setEmpleadosMap] = useState<Record<number, string>>({});

  const puedeVerMiArea = (authMe?.puede_ver_mi_area ?? authMe?.is_jefe ?? false) || (authMe?.is_superuser === true);
  const deptos = authMe?.departamentos_que_administro ?? authMe?.departamentos ?? [];

  // Cargar authMe
  useEffect(() => {
    let cancelled = false;
    api.get<AuthMe>('/auth/me')
      .then((res) => { if (!cancelled) setAuthMe(res.data); })
      .catch(() => { if (!cancelled) setAuthMe(null); });
    return () => { cancelled = true; };
  }, []);

  // Cargar mapa de empleados
  useEffect(() => {
    api.get<EmpleadoArea[]>('/personal/empleados', { params: { limit: 500 } })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : (res.data as any)?.results ?? [];
        const map: Record<number, string> = {};
        list.forEach((e: EmpleadoArea) => {
          map[e.id] = `${e.nombre} ${e.apellido_paterno || ''}`.trim();
        });
        setEmpleadosMap(map);
      })
      .catch(() => {});
  }, []);

  // Personal del área (superadmin ve todos; gerente/supervisor solo su área)
  const loadPersonal = () => {
    if (!puedeVerMiArea) return;
    setLoadingPersonal(true);
    const deptosAdmin = authMe?.departamentos_que_administro ?? authMe?.departamentos ?? [];
    const isSuperuser = authMe?.is_superuser === true;
    if (deptosAdmin.length === 0 && !isSuperuser) {
      setLoadingPersonal(false);
      return;
    }
    if (isSuperuser && deptosAdmin.length === 0) {
      api.get<EmpleadoArea[]>('/personal/empleados', { params: { limit: 1000 } })
        .then(r => {
          const list = Array.isArray(r.data) ? r.data : (r.data as any)?.results ?? [];
          setPersonal(list);
        })
        .catch(() => setPersonal([]))
        .finally(() => setLoadingPersonal(false));
      return;
    }
    Promise.all(
      deptosAdmin.map(d =>
        api.get<EmpleadoArea[]>('/personal/empleados', { params: { departamento_id: d.id, limit: 200 } })
          .then(r => Array.isArray(r.data) ? r.data : (r.data as any)?.results ?? [])
          .catch(() => [] as EmpleadoArea[])
      )
    ).then(arrays => {
      const merged: EmpleadoArea[] = [];
      const seen = new Set<number>();
      arrays.flat().forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); } });
      setPersonal(merged);
    }).finally(() => setLoadingPersonal(false));
  };

  // Checadas del área (por quincena)
  const loadChecadas = () => {
    setLoadingChecadas(true);
    const { inicio, fin } = getQuincenaRango(quincena.year, quincena.month, quincena.num);
    api.get<Checada[]>('/asistencia/checadas/mi-area', { params: { fecha_inicio: inicio, fecha_fin: fin, limit: 2000 } })
      .then(res => setChecadas(Array.isArray(res.data) ? res.data : []))
      .catch(() => setChecadas([]))
      .finally(() => setLoadingChecadas(false));
  };

  // Incidencias
  const loadIncidencias = () => {
    setLoadingIncidencias(true);
    api.get<Incidencia[]>('/asistencia/incidencias/mi-area')
      .then(res => setIncidencias(Array.isArray(res.data) ? res.data : []))
      .catch(() => setIncidencias([]))
      .finally(() => setLoadingIncidencias(false));
  };

  // Vacaciones (superadmin ve todas; gerente/jefe solo las de su área o asignadas)
  const loadSolicitudesVacaciones = () => {
    if (!authMe?.id) return;
    setLoadingVacaciones(true);
    const params: Record<string, string | number> = { limit: 500 };
    if (authMe?.is_superuser) {
      if (filtroEstadoVacaciones === 'pendientes') params.estado = 'pendiente';
      else if (filtroEstadoVacaciones !== 'todas') params.estado = filtroEstadoVacaciones;
    } else {
      if (filtroEstadoVacaciones === 'pendientes') params.jefe_id = authMe.id;
      else if (filtroEstadoVacaciones !== 'todas') params.estado = filtroEstadoVacaciones;
    }
    api.get<SolicitudVacaciones[]>('/vacaciones/solicitudes', { params })
      .then(res => setSolicitudesVacaciones(Array.isArray(res.data) ? res.data : []))
      .catch(() => setSolicitudesVacaciones([]))
      .finally(() => setLoadingVacaciones(false));
  };

  useEffect(() => {
    if (!puedeVerMiArea) return;
    if (activeTab === 'personal') loadPersonal();
    if (activeTab === 'asistencia') { loadChecadas(); loadIncidencias(); }
    if (activeTab === 'vacaciones') loadSolicitudesVacaciones();
  }, [puedeVerMiArea, activeTab]);

  useEffect(() => {
    if (activeTab === 'vacaciones' && puedeVerMiArea) loadSolicitudesVacaciones();
  }, [filtroEstadoVacaciones]);

  useEffect(() => {
    if (activeTab === 'asistencia' && puedeVerMiArea) loadChecadas();
  }, [quincena.year, quincena.month, quincena.num]);

  const filteredInc = incidencias.filter(inc => {
    if (filtroJustificada === 'pendientes') return !inc.justificada;
    if (filtroJustificada === 'justificadas') return inc.justificada;
    return true;
  });

  const saveJustificacion = () => {
    if (!modalIncidencia) return;
    setSaving(true);
    api.patch(`/asistencia/incidencias/${modalIncidencia.id}`, {
      justificada, comentarios: justificarComentarios.trim() || null,
    }).then(() => { loadIncidencias(); setModalIncidencia(null); })
      .finally(() => setSaving(false));
  };

  const handleAprobarRechazar = (aprobar: boolean) => {
    if (!modalAprobar || !authMe) return;
    setAprobando(true);
    api.put(`/vacaciones/solicitudes/${modalAprobar.id}/aprobar?jefe_id=${authMe.id}`, {
      aprobar, comentarios: aprobacionComentarios.trim() || null,
    })
      .then(() => { loadSolicitudesVacaciones(); setModalAprobar(null); setAprobacionComentarios(''); })
      .catch((err) => alert(err.response?.data?.detail ?? err.message ?? 'Error al aprobar o rechazar'))
      .finally(() => setAprobando(false));
  };

  if (authMe && !puedeVerMiArea) {
    return (
      <div style={{ padding: '24px' }}>
        <h1 style={{ marginBottom: '16px' }}>Mi Área</h1>
        <p style={{ color: '#666' }}>Solo gerentes o supervisores con área asignada pueden ver este módulo.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <h1 style={{ margin: 0 }}>{authMe?.is_superuser && deptos.length === 0 ? 'Asistencia y solicitudes' : 'Mi Área'}</h1>
        {(deptos.length > 0 || authMe?.is_superuser) && (
          <span style={{ color: '#555', fontSize: '0.9rem', backgroundColor: '#f0f4ff', padding: '4px 12px', borderRadius: '20px', border: '1px solid #c7d7fc' }}>
            {authMe?.is_superuser && deptos.length === 0 ? 'Todos los departamentos' : deptos.map(d => d.nombre).join(' · ')}
          </span>
        )}
      </div>

      {/* Pestañas */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '20px' }}>
        <button style={tabStyle(activeTab === 'personal')} onClick={() => setActiveTab('personal')}>Personal del área</button>
        <button style={tabStyle(activeTab === 'asistencia')} onClick={() => setActiveTab('asistencia')}>Asistencia e incidencias</button>
        <button style={tabStyle(activeTab === 'vacaciones')} onClick={() => setActiveTab('vacaciones')}>Vacaciones</button>
      </div>

      {/* ─── TAB: PERSONAL ─── */}
      {activeTab === 'personal' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <button
              onClick={loadPersonal} disabled={loadingPersonal}
              style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              {loadingPersonal ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>
          {loadingPersonal ? (
            <p style={{ color: '#666' }}>Cargando personal...</p>
          ) : personal.length === 0 ? (
            <p style={{ color: '#666', padding: '24px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              {authMe?.is_superuser ? 'No hay empleados registrados.' : 'No hay empleados en tu área o no tienes departamentos asignados.'}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <thead>
                  <tr>
                    <th style={th}>No. Empleado</th>
                    <th style={th}>Nombre</th>
                    <th style={th}>Teléfono</th>
                    <th style={th}>Email</th>
                    <th style={th}>Puesto</th>
                    <th style={th}>Área / Departamento</th>
                    <th style={th}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {personal.map(emp => (
                    <tr key={emp.id} style={{ transition: 'background 0.1s' }} onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ ...td, fontWeight: 600, color: '#374151' }}>{emp.numero_empleado}</td>
                      <td style={td}>{`${emp.nombre} ${emp.apellido_paterno || ''} ${emp.apellido_materno || ''}`.trim()}</td>
                      <td style={td}>{emp.telefono ? <a href={`tel:${emp.telefono}`} style={{ color: '#0369a1', textDecoration: 'none' }}>{emp.telefono}</a> : <span style={{ color: '#aaa' }}>—</span>}</td>
                      <td style={td}>{emp.email ? <a href={`mailto:${emp.email}`} style={{ color: '#0369a1', textDecoration: 'none' }}>{emp.email}</a> : <span style={{ color: '#aaa' }}>—</span>}</td>
                      <td style={td}>
                        {emp.puesto ? (
                          <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
                            {emp.puesto.nombre}
                          </span>
                        ) : <span style={{ color: '#aaa' }}>—</span>}
                      </td>
                      <td style={td}>
                        {emp.departamento ? (
                          <span style={{ backgroundColor: '#f0fdf4', color: '#15803d', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
                            {emp.departamento.nombre}
                          </span>
                        ) : <span style={{ color: '#aaa' }}>—</span>}
                      </td>
                      <td style={td}>
                        <span style={{
                          fontWeight: 600, fontSize: '0.8rem',
                          color: emp.estado === 'activo' ? '#15803d' : emp.estado === 'baja' ? '#b91c1c' : '#b45309',
                        }}>
                          {emp.estado ? emp.estado.charAt(0).toUpperCase() + emp.estado.slice(1) : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ marginTop: '8px', color: '#888', fontSize: '0.82rem' }}>{personal.length} empleado{personal.length !== 1 ? 's' : ''}</p>
            </div>
          )}
        </>
      )}

      {/* ─── TAB: ASISTENCIA E INCIDENCIAS ─── */}
      {activeTab === 'asistencia' && (
        <>
          {/* Checadas del personal del área (por quincena) */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Checadas del personal del área</h2>
              <span style={{ color: '#666', fontSize: '0.875rem', fontWeight: 500 }}>
                {formatQuincenaLabel(quincena.year, quincena.month, quincena.num)}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (quincena.num === 1) {
                    setQuincena({ year: quincena.year, month: quincena.month - 1, num: 2 });
                  } else {
                    setQuincena({ ...quincena, num: 1 });
                  }
                }}
                style={{ padding: '7px 12px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                ← Anterior
              </button>
              <button
                type="button"
                onClick={() => {
                  if (quincena.num === 2) {
                    setQuincena({ year: quincena.year, month: quincena.month + 1, num: 1 });
                  } else {
                    setQuincena({ ...quincena, num: 2 });
                  }
                }}
                style={{ padding: '7px 12px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                Siguiente →
              </button>
              <button
                onClick={loadChecadas}
                disabled={loadingChecadas}
                style={{ padding: '7px 14px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                {loadingChecadas ? 'Cargando...' : 'Actualizar'}
              </button>
            </div>
            <p style={{ margin: '0 0 12px 0', color: '#666', fontSize: '0.85rem' }}>
              Entradas y salidas del personal de tu área en esta quincena (días 1-15 o 16-fin de mes).
            </p>
            {loadingChecadas ? (
              <p style={{ color: '#666' }}>Cargando checadas del personal del área...</p>
            ) : checadas.length === 0 ? (
              <p style={{ color: '#666', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', fontSize: '0.9rem' }}>
                No hay checadas del personal del área en esta quincena.
              </p>
            ) : (() => {
              // Una fila por empleado por día (unificado como en Asistencia)
              type DayRow = {
                key: string;
                numeroEmpleado: string;
                empleadoNombre: string;
                empleado_id: number;
                fecha: string;
                fechaSort: string;
                entrada?: string;
                salida_comer?: string;
                regreso_comer?: string;
                salida?: string;
                primeraChecada?: number;
                ultimaChecada?: number;
                salidaComerTs?: number;
                regresoComerTs?: number;
                esTiempoExtra: boolean;
                incidenciaTipo?: string;
                incidenciaJustificada?: boolean;
              };
              const calcTotal = (row: DayRow): string => {
                const primera = row.primeraChecada;
                const ultima = row.ultimaChecada;
                if (primera == null || ultima == null || ultima <= primera) return '--';
                let totalMs = ultima - primera;
                if (row.salidaComerTs != null && row.regresoComerTs != null && row.regresoComerTs > row.salidaComerTs)
                  totalMs -= (row.regresoComerTs - row.salidaComerTs);
                const mins = Math.floor(totalMs / 60000);
                if (mins < 0) return '--';
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                return m === 0 ? `${h}h` : `${h}h ${m}m`;
              };

              const map = new Map<string, DayRow>();
              checadas.forEach(c => {
                const ts = c.timestamp.endsWith('Z') || c.timestamp.includes('+') ? c.timestamp : c.timestamp + 'Z';
                const d = new Date(ts);
                const fechaSort = d.toISOString().slice(0, 10);
                const fechaStr = d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
                const key = `${c.empleado_id}_${fechaSort}`;
                if (!map.has(key)) {
                  map.set(key, {
                    key,
                    numeroEmpleado: c.empleado_numero ?? '—',
                    empleadoNombre: c.empleado_nombre || empleadosMap[c.empleado_id] || `#${c.empleado_id}`,
                    empleado_id: c.empleado_id,
                    fecha: fechaStr,
                    fechaSort,
                    esTiempoExtra: !!c.es_tiempo_extra,
                  });
                }
                const row = map.get(key)!;
                const t = d.getTime();
                if (row.primeraChecada == null) row.primeraChecada = t;
                else row.primeraChecada = Math.min(row.primeraChecada, t);
                if (row.ultimaChecada == null) row.ultimaChecada = t;
                else row.ultimaChecada = Math.max(row.ultimaChecada, t);
                const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                if (c.tipo === 'entrada' && !row.entrada) row.entrada = hora;
                else if (c.tipo === 'salida_comer') { if (!row.salida_comer) { row.salida_comer = hora; row.salidaComerTs = t; } }
                else if (c.tipo === 'regreso_comer') { if (!row.regreso_comer) { row.regreso_comer = hora; row.regresoComerTs = t; } }
                else if (c.tipo === 'salida' && !row.salida) row.salida = hora;
              });
              const dayRows = Array.from(map.values());
              dayRows.forEach(row => {
                const inc = incidencias.find(i => i.empleado_id === row.empleado_id && String(i.fecha).slice(0, 10) === row.fechaSort);
                if (inc) { row.incidenciaTipo = inc.tipo; row.incidenciaJustificada = inc.justificada; }
              });
              dayRows.sort((a, b) => b.fechaSort.localeCompare(a.fechaSort) || a.empleadoNombre.localeCompare(b.empleadoNombre));

              const incBg: Record<string, string> = { retardo: '#fef3c7', salida_anticipada: '#fee2e2', falta: '#fce7f3', horas_extra: '#dbeafe' };

              return (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <thead>
                    <tr>
                      <th style={th}>No.</th>
                      <th style={th}>Empleado</th>
                      <th style={th}>Fecha</th>
                      <th style={{ ...th, textAlign: 'center', color: '#155724', backgroundColor: '#e8f5e9' }}>Entrada</th>
                      <th style={{ ...th, textAlign: 'center', color: '#856404', backgroundColor: '#fff8e1' }}>Salida comer</th>
                      <th style={{ ...th, textAlign: 'center', color: '#004085', backgroundColor: '#e3f2fd' }}>Regreso comer</th>
                      <th style={{ ...th, textAlign: 'center', color: '#721c24', backgroundColor: '#fce4ec' }}>Salida</th>
                      <th style={{ ...th, textAlign: 'center' }}>Incidencia</th>
                      <th style={{ ...th, textAlign: 'center' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayRows.map(row => (
                      <tr key={row.key}
                        style={{
                          borderBottom: '1px solid #eee',
                          backgroundColor: row.incidenciaTipo && !row.incidenciaJustificada ? (incBg[row.incidenciaTipo] ?? '#fff7ed') + '88' : row.esTiempoExtra ? '#fff8e1' : undefined,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.98)')}
                        onMouseLeave={e => (e.currentTarget.style.filter = '')}
                      >
                        <td style={{ ...td, fontWeight: 600, color: '#374151' }}>{row.numeroEmpleado}</td>
                        <td style={{ ...td, fontWeight: 500 }}>{row.empleadoNombre}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          {row.fecha}
                          {row.esTiempoExtra && <span style={{ marginLeft: '6px', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, backgroundColor: '#ff9800', color: 'white' }}>T. EXTRA</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: row.entrada ? '#155724' : '#ccc' }}>{row.entrada || '--:--'}</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: row.salida_comer ? '#856404' : '#ccc' }}>{row.salida_comer || '--:--'}</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: row.regreso_comer ? '#004085' : '#ccc' }}>{row.regreso_comer || '--:--'}</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: row.salida ? '#721c24' : '#ccc' }}>{row.salida || '--:--'}</td>
                        <td style={td}>
                          {row.incidenciaTipo ? (
                            <span style={{
                              padding: '2px 8px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600,
                              backgroundColor: incBg[row.incidenciaTipo] ?? '#f3f4f6',
                              color: '#374151',
                              textDecoration: row.incidenciaJustificada ? 'line-through' : 'none',
                              opacity: row.incidenciaJustificada ? 0.6 : 1,
                            }}>
                              {tipoLabels[row.incidenciaTipo] || row.incidenciaTipo}
                              {row.incidenciaJustificada && ' ✓'}
                            </span>
                          ) : <span style={{ color: '#d1d5db' }}>—</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{calcTotal(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ marginTop: '6px', color: '#888', fontSize: '0.82rem' }}>{dayRows.length} día{dayRows.length !== 1 ? 's' : ''} · {checadas.length} checada{checadas.length !== 1 ? 's' : ''} del personal del área</p>
              </div>
            ); })()}
          </div>

          {/* Incidencias del personal del área */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Incidencias del personal del área</h2>
              <select
                value={filtroJustificada}
                onChange={e => setFiltroJustificada(e.target.value as 'todas' | 'pendientes' | 'justificadas')}
                style={{ padding: '7px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem' }}
              >
                <option value="pendientes">Pendientes de justificar</option>
                <option value="justificadas">Justificadas</option>
                <option value="todas">Todas</option>
              </select>
              <button
                onClick={loadIncidencias} disabled={loadingIncidencias}
                style={{ padding: '7px 14px', backgroundColor: '#0d9488', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                {loadingIncidencias ? 'Cargando...' : 'Actualizar'}
              </button>
            </div>
            {loadingIncidencias ? (
              <p style={{ color: '#666' }}>Cargando incidencias del personal del área...</p>
            ) : filteredInc.length === 0 ? (
              <p style={{ color: '#666', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', fontSize: '0.9rem' }}>
                No hay incidencias del personal del área {filtroJustificada === 'pendientes' ? 'pendientes' : filtroJustificada === 'justificadas' ? 'justificadas' : ''}.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <thead>
                    <tr>
                      <th style={th}>Empleado</th>
                      <th style={th}>Fecha</th>
                      <th style={th}>Tipo</th>
                      <th style={th}>Descripción</th>
                      <th style={{ ...th, textAlign: 'center' }}>Justificada</th>
                      <th style={{ ...th, textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInc.map(inc => (
                      <tr key={inc.id} onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ ...td, fontWeight: 500 }}>{inc.empleado_nombre || empleadosMap[inc.empleado_id] || `#${inc.empleado_id}`}</td>
                        <td style={td}>{new Date(inc.fecha).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                        <td style={td}>
                          <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600, backgroundColor: '#fef3c7', color: '#92400e' }}>
                            {tipoLabels[inc.tipo] || inc.tipo}
                          </span>
                        </td>
                        <td style={{ ...td, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.descripcion || '—'}</td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          {inc.justificada
                            ? <span style={{ color: '#15803d', fontWeight: 700 }}>✓</span>
                            : <span style={{ color: '#b45309', fontWeight: 700 }}>✗</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <button
                            onClick={() => { setModalIncidencia(inc); setJustificarComentarios(inc.comentarios || ''); setJustificada(inc.justificada); }}
                            style={{ padding: '5px 12px', backgroundColor: '#0d9488', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}
                          >
                            Justificar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── TAB: VACACIONES ─── */}
      {activeTab === 'vacaciones' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <select
              value={filtroEstadoVacaciones}
              onChange={e => setFiltroEstadoVacaciones(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px' }}
            >
              <option value="pendientes">Pendientes de mi aprobación</option>
              <option value="todas">Todas</option>
              <option value="aprobada">Aprobadas</option>
              <option value="rechazada">Rechazadas</option>
            </select>
            <button
              onClick={loadSolicitudesVacaciones} disabled={loadingVacaciones}
              style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              {loadingVacaciones ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>
          {loadingVacaciones ? (
            <p style={{ color: '#666' }}>Cargando solicitudes...</p>
          ) : solicitudesVacaciones.length === 0 ? (
            <p style={{ color: '#666', padding: '24px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              No hay solicitudes {filtroEstadoVacaciones === 'pendientes' ? 'pendientes de tu aprobación' : ''}.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <thead>
                  <tr>
                    <th style={th}>Empleado</th>
                    <th style={th}>Fecha inicio</th>
                    <th style={th}>Fecha fin</th>
                    <th style={{ ...th, textAlign: 'center' }}>Días</th>
                    <th style={th}>Motivo</th>
                    <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                    <th style={{ ...th, textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudesVacaciones.map(s => (
                    <tr key={s.id} onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ ...td, fontWeight: 500 }}>{empleadosMap[s.empleado_id] || `#${s.empleado_id}`}</td>
                      <td style={td}>{new Date(s.fecha_inicio).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                      <td style={td}>{new Date(s.fecha_fin).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{s.dias_solicitados}</td>
                      <td style={{ ...td, maxWidth: '160px' }}>{s.motivo || '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem',
                          color: s.estado === 'aprobada' ? '#15803d' : s.estado === 'rechazada' ? '#b91c1c' : '#b45309' }}>
                          {s.estado === 'pendiente' ? 'Pendiente' : s.estado === 'aprobada' ? 'Aprobada' : s.estado === 'rechazada' ? 'Rechazada' : s.estado}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {s.estado === 'pendiente' && (
                          <button
                            onClick={() => { setModalAprobar(s); setAprobacionComentarios(''); }}
                            style={{ padding: '5px 12px', backgroundColor: '#0d9488', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}
                          >
                            Aprobar / Rechazar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─── MODAL JUSTIFICAR ─── */}
      {modalIncidencia && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setModalIncidencia(null)} role="presentation">
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', maxWidth: '440px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()} role="dialog">
            <h2 style={{ marginTop: 0, marginBottom: '14px' }}>Justificar incidencia</h2>
            <p style={{ color: '#555', marginBottom: '14px', fontSize: '0.9rem' }}>
              {modalIncidencia.empleado_nombre || empleadosMap[modalIncidencia.empleado_id] || `#${modalIncidencia.empleado_id}`}
              {' · '}{tipoLabels[modalIncidencia.tipo]}{' · '}{new Date(modalIncidencia.fecha).toLocaleDateString('es-MX')}
            </p>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.9rem' }}>Comentarios</label>
              <textarea value={justificarComentarios} onChange={e => setJustificarComentarios(e.target.value)} rows={3}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', resize: 'vertical', fontSize: '0.9rem' }}
                placeholder="Motivo o comentario..." />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '18px' }}>
              <input type="checkbox" checked={justificada} onChange={e => setJustificada(e.target.checked)} />
              <span style={{ fontSize: '0.9rem' }}>Marcar como justificada</span>
            </label>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalIncidencia(null)}
                style={{ padding: '9px 18px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={saveJustificacion} disabled={saving}
                style={{ padding: '9px 18px', backgroundColor: '#0d9488', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL APROBAR/RECHAZAR VACACIONES ─── */}
      {modalAprobar && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setModalAprobar(null)} role="presentation">
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', maxWidth: '440px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()} role="dialog">
            <h2 style={{ marginTop: 0, marginBottom: '12px' }}>Aprobar o rechazar solicitud</h2>
            <p style={{ color: '#555', marginBottom: '6px', fontWeight: 500 }}>{empleadosMap[modalAprobar.empleado_id] || `#${modalAprobar.empleado_id}`}</p>
            <p style={{ color: '#555', marginBottom: '14px', fontSize: '0.9rem' }}>
              {new Date(modalAprobar.fecha_inicio).toLocaleDateString('es-MX')} – {new Date(modalAprobar.fecha_fin).toLocaleDateString('es-MX')} · {modalAprobar.dias_solicitados} días
            </p>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.9rem' }}>Comentarios (opcional)</label>
              <textarea value={aprobacionComentarios} onChange={e => setAprobacionComentarios(e.target.value)} rows={2}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', resize: 'vertical', fontSize: '0.9rem' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalAprobar(null)}
                style={{ padding: '9px 18px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => handleAprobarRechazar(false)} disabled={aprobando}
                style={{ padding: '9px 18px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                {aprobando ? '...' : 'Rechazar'}
              </button>
              <button onClick={() => handleAprobarRechazar(true)} disabled={aprobando}
                style={{ padding: '9px 18px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                {aprobando ? '...' : 'Aprobar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
