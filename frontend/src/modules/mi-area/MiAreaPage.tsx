import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { parseTimestampForMexico, toMexicoDateString } from '../../utils/date';
import { fmtNombreEmpleado } from '../../utils/format';
import { useSearchParams } from 'react-router-dom';

type TipoIncidencia = 'retardo' | 'falta' | 'completa' | 'horas_extra' | 'salida_anticipada' | 'incompleta';
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

interface SolicitudPrestamo {
  id: number;
  numero_solicitud?: string | null;
  empleado_id: number;
  monto: number | string;
  plazo_meses: number;
  motivo?: string | null;
  estado: string;
  created_at: string;
  empleado?: {
    id: number;
    nombre: string;
    apellido_paterno?: string | null;
    apellido_materno?: string | null;
  } | null;
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
  incompleta: 'Incompleta',
  completa: 'Completa',
  horas_extra: 'Completa', // backend legacy, mostrado como Completa
  salida_anticipada: 'Salida anticipada',
  entrada: 'Entrada',
  salida: 'Salida',
  salida_comer: 'Salida a comer',
  regreso_comer: 'Regreso de comer',
};

/** Colores corporativos para badges de tipo de incidencia */
const tipoIncidenciasColores: Record<string, { backgroundColor: string; color: string }> = {
  completa: { backgroundColor: '#d1fae5', color: '#047857' },       // Verde #10B981 - Éxito
  horas_extra: { backgroundColor: '#d1fae5', color: '#047857' },     // legacy → Completa
  retardo: { backgroundColor: '#fef3c7', color: '#92400e' },         // Ámbar #F59E0B - Advertencia
  salida_anticipada: { backgroundColor: '#fef9c3', color: '#b45309' }, // Amarillo #FBBF24 - Atención parcial
  incompleta: { backgroundColor: '#e5e7eb', color: '#374151' },     // Azul gris #6B7280 - Neutral
  falta: { backgroundColor: '#fee2e2', color: '#b91c1c' },           // Rojo #EF4444 - Crítico
};

type TabKey = 'personal' | 'asistencia' | 'incidencias' | 'vacaciones' | 'prestamos';

const ITEMS_PER_PAGE = 30;

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '12px 24px',
  cursor: 'pointer',
  border: 'none',
  borderBottom: active ? '3px solid #0ea5e9' : '3px solid transparent',
  backgroundColor: 'transparent',
  fontWeight: active ? 700 : 400,
  fontSize: '1rem',
  color: active ? '#0ea5e9' : '#666',
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
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>('personal');
  const [authMe, setAuthMe] = useState<AuthMe | null>(null);

  // Personal
  const [personal, setPersonal] = useState<EmpleadoArea[]>([]);
  const [loadingPersonal, setLoadingPersonal] = useState(false);
  const [busquedaPersonal, setBusquedaPersonal] = useState('');

  // Asistencia / Checadas (por quincena: 1 = días 1-15, 2 = 16-fin de mes)
  const [checadas, setChecadas] = useState<Checada[]>([]);
  const [loadingChecadas, setLoadingChecadas] = useState(false);
  const [quincena, setQuincena] = useState<{ year: number; month: number; num: 1 | 2 }>(() => getQuincenaActual());
  const [pagChecadas, setPagChecadas] = useState(1);

  // Incidencias
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [pagIncidencias, setPagIncidencias] = useState(1);
  const [loadingIncidencias, setLoadingIncidencias] = useState(false);
  const [filtroJustificada, setFiltroJustificada] = useState<'todas' | 'pendientes' | 'justificadas'>('pendientes');
  const [busquedaIncidencias, setBusquedaIncidencias] = useState('');
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
  const [solicitudesPrestamos, setSolicitudesPrestamos] = useState<SolicitudPrestamo[]>([]);
  const [loadingPrestamos, setLoadingPrestamos] = useState(false);
  const [filtroEstadoPrestamos, setFiltroEstadoPrestamos] = useState<string>('pendiente');
  const [modalAprobarPrestamo, setModalAprobarPrestamo] = useState<SolicitudPrestamo | null>(null);
  const [comentariosPrestamo, setComentariosPrestamo] = useState('');
  const [aprobandoPrestamo, setAprobandoPrestamo] = useState(false);

  // Mapa id→nombre empleado
  const [empleadosMap, setEmpleadosMap] = useState<Record<number, string>>({});

  const puedeVerMiArea = (authMe?.puede_ver_mi_area ?? authMe?.is_jefe ?? false) || (authMe?.is_superuser === true);
  const deptos = authMe?.departamentos_que_administro ?? authMe?.departamentos ?? [];

  /** Superadmin: null = todos; número = filtrar por ese departamento. Gerentes/jefes no lo usan. */
  const [areaFiltroAdmin, setAreaFiltroAdmin] = useState<number | null>(null);
  const [listaDeptosCat, setListaDeptosCat] = useState<{ id: number; nombre: string; empresa?: { nombre: string } | null }[]>([]);

  // Cargar authMe
  useEffect(() => {
    let cancelled = false;
    api.get<AuthMe>('/auth/me')
      .then((res) => { if (!cancelled) setAuthMe(res.data); })
      .catch(() => { if (!cancelled) setAuthMe(null); });
    return () => { cancelled = true; };
  }, []);

  // Permite abrir Mi Área desde links con filtros (ej. campana)
  useEffect(() => {
    const tab = searchParams.get('tab');
    const justificada = searchParams.get('justificada');
    if (tab === 'incidencias') {
      setActiveTab('incidencias');
      if (justificada === 'pendientes' || justificada === 'justificadas' || justificada === 'todas') {
        setFiltroJustificada(justificada);
      }
    }
  }, [searchParams]);

  // Catálogo de departamentos para el selector del administrador en Mi Área
  useEffect(() => {
    if (!authMe?.is_superuser) return;
    let cancelled = false;
    api
      .get<{ id: number; nombre: string; empresa?: { nombre: string } | null }[]>('/personal/departamentos', { params: { limit: 500 } })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data)
          ? res.data
          : (res.data as { results?: { id: number; nombre: string; empresa?: { nombre: string } | null }[] })?.results ?? [];
        const sorted = [...list].sort((a, b) => {
          const empA = (a.empresa?.nombre || '').localeCompare(b.empresa?.nombre || '', 'es');
          if (empA !== 0) return empA;
          return (a.nombre || '').localeCompare(b.nombre || '', 'es');
        });
        setListaDeptosCat(sorted);
      })
      .catch(() => {
        if (!cancelled) setListaDeptosCat([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authMe?.is_superuser]);

  // Cargar mapa de empleados
  useEffect(() => {
    api.get<EmpleadoArea[]>('/personal/empleados', { params: { limit: 500 } })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : (res.data as any)?.results ?? [];
        const map: Record<number, string> = {};
        list.forEach((e: EmpleadoArea) => {
          map[e.id] = fmtNombreEmpleado(e);
        });
        setEmpleadosMap(map);
      })
      .catch(() => {});
  }, []);

  // Personal del área (superadmin: todos o departamento elegido; gerente/supervisor solo su área)
  const loadPersonal = () => {
    if (!puedeVerMiArea) return;
    setLoadingPersonal(true);
    const deptosAdmin = authMe?.departamentos_que_administro ?? authMe?.departamentos ?? [];
    const isSuperuser = authMe?.is_superuser === true;
    if (isSuperuser) {
      const params: Record<string, string | number> = { limit: 1000 };
      if (areaFiltroAdmin != null) params.departamento_id = areaFiltroAdmin;
      api
        .get<EmpleadoArea[]>('/personal/empleados', { params })
        .then((r) => {
          const list = Array.isArray(r.data) ? r.data : (r.data as { results?: EmpleadoArea[] })?.results ?? [];
          setPersonal(list);
        })
        .catch(() => setPersonal([]))
        .finally(() => setLoadingPersonal(false));
      return;
    }
    if (deptosAdmin.length === 0) {
      setLoadingPersonal(false);
      return;
    }
    Promise.all(
      deptosAdmin.map((d) =>
        api
          .get<EmpleadoArea[]>('/personal/empleados', { params: { departamento_id: d.id, limit: 200 } })
          .then((r) => (Array.isArray(r.data) ? r.data : (r.data as { results?: EmpleadoArea[] })?.results ?? []))
          .catch(() => [] as EmpleadoArea[])
      )
    )
      .then((arrays) => {
        const merged: EmpleadoArea[] = [];
        const seen = new Set<number>();
        arrays.flat().forEach((e) => {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            merged.push(e);
          }
        });
        setPersonal(merged);
      })
      .finally(() => setLoadingPersonal(false));
  };

  // Checadas del área (por quincena)
  const loadChecadas = () => {
    setLoadingChecadas(true);
    const { inicio, fin } = getQuincenaRango(quincena.year, quincena.month, quincena.num);
    const params: Record<string, string | number> = { fecha_inicio: inicio, fecha_fin: fin, limit: 2000 };
    if (authMe?.is_superuser === true && areaFiltroAdmin != null) params.departamento_id = areaFiltroAdmin;
    api.get<Checada[]>('/asistencia/checadas/mi-area', { params })
      .then(res => setChecadas(Array.isArray(res.data) ? res.data : []))
      .catch(() => setChecadas([]))
      .finally(() => setLoadingChecadas(false));
  };

  // Incidencias (por quincena, misma que asistencia)
  const loadIncidencias = () => {
    setLoadingIncidencias(true);
    const { inicio, fin } = getQuincenaRango(quincena.year, quincena.month, quincena.num);
    const params: Record<string, string | number> = { fecha_inicio: inicio, fecha_fin: fin };
    if (authMe?.is_superuser === true && areaFiltroAdmin != null) params.departamento_id = areaFiltroAdmin;
    api.get<Incidencia[]>('/asistencia/incidencias/mi-area', { params })
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
      if (areaFiltroAdmin != null) params.departamento_id = areaFiltroAdmin;
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

  const loadSolicitudesPrestamos = () => {
    setLoadingPrestamos(true);
    const params: Record<string, string | number> = { limit: 500 };
    if (authMe?.is_superuser === true && areaFiltroAdmin != null) params.departamento_id = areaFiltroAdmin;
    if (filtroEstadoPrestamos !== 'todas') params.estado = filtroEstadoPrestamos;
    api.get<SolicitudPrestamo[]>('/prestamos/mi-area', { params })
      .then(res => setSolicitudesPrestamos(Array.isArray(res.data) ? res.data : []))
      .catch(() => setSolicitudesPrestamos([]))
      .finally(() => setLoadingPrestamos(false));
  };

  useEffect(() => {
    if (!puedeVerMiArea) return;
    if (activeTab === 'personal') loadPersonal();
    if (activeTab === 'asistencia') loadChecadas();
    if (activeTab === 'incidencias') loadIncidencias();
    if (activeTab === 'vacaciones') loadSolicitudesVacaciones();
    if (activeTab === 'prestamos') loadSolicitudesPrestamos();
  }, [puedeVerMiArea, activeTab, areaFiltroAdmin]);

  useEffect(() => {
    if (activeTab === 'vacaciones' && puedeVerMiArea) loadSolicitudesVacaciones();
  }, [filtroEstadoVacaciones]);

  useEffect(() => {
    if (activeTab === 'prestamos' && puedeVerMiArea) loadSolicitudesPrestamos();
  }, [filtroEstadoPrestamos]);

  useEffect(() => {
    if (activeTab === 'asistencia' && puedeVerMiArea) loadChecadas();
    if (activeTab === 'incidencias' && puedeVerMiArea) loadIncidencias();
  }, [quincena.year, quincena.month, quincena.num]);

  useEffect(() => {
    setPagChecadas(1);
    setPagIncidencias(1);
  }, [areaFiltroAdmin]);

  useEffect(() => { setPagChecadas(1); }, [quincena.year, quincena.month, quincena.num]);
  useEffect(() => { setPagIncidencias(1); }, [filtroJustificada, quincena.year, quincena.month, quincena.num, busquedaIncidencias]);

  const filteredInc = incidencias.filter(inc => {
    if (filtroJustificada === 'pendientes') return !inc.justificada;
    if (filtroJustificada === 'justificadas') return inc.justificada;
    return true;
  });

  const filteredIncBusqueda = (authMe?.is_superuser && busquedaIncidencias.trim())
    ? filteredInc.filter(inc => {
        const q = busquedaIncidencias.trim().toLowerCase();
        const nombre = (inc.empleado_nombre || empleadosMap[inc.empleado_id] || '').toLowerCase();
        const tipo = (tipoLabels[inc.tipo] || inc.tipo).toLowerCase();
        const desc = (inc.descripcion || '').toLowerCase();
        return nombre.includes(q) || tipo.includes(q) || desc.includes(q);
      })
    : filteredInc;

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

  const handleAprobarRechazarPrestamo = (aprobar: boolean) => {
    if (!modalAprobarPrestamo) return;
    setAprobandoPrestamo(true);
    api.post(`/prestamos/${modalAprobarPrestamo.id}/aprobar-departamento`, {
      aprobado: aprobar,
      comentarios: comentariosPrestamo.trim() || null,
    })
      .then(() => {
        loadSolicitudesPrestamos();
        setModalAprobarPrestamo(null);
        setComentariosPrestamo('');
      })
      .catch((err) => alert(err.response?.data?.detail ?? err.message ?? 'Error al autorizar o rechazar préstamo'))
      .finally(() => setAprobandoPrestamo(false));
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
        {(deptos.length > 0 || authMe?.is_superuser) &&
          (authMe?.is_superuser ? (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#555',
                fontSize: '0.9rem',
                backgroundColor: '#f0f9ff',
                padding: '6px 14px',
                borderRadius: '20px',
                border: '1px solid #bae6fd',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontWeight: 600 }}>Área:</span>
              <select
                value={areaFiltroAdmin === null ? '' : String(areaFiltroAdmin)}
                onChange={(e) => {
                  const v = e.target.value;
                  setAreaFiltroAdmin(v === '' ? null : Number(v));
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: '1px solid #bae6fd',
                  backgroundColor: '#fff',
                  fontSize: '0.9rem',
                  maxWidth: 340,
                  cursor: 'pointer',
                }}
              >
                <option value="">Todos los departamentos</option>
                {listaDeptosCat.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}{d.empresa?.nombre ? ` (${d.empresa.nombre})` : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span
              style={{
                color: '#555',
                fontSize: '0.9rem',
                backgroundColor: '#f0f9ff',
                padding: '4px 12px',
                borderRadius: '20px',
                border: '1px solid #bae6fd',
              }}
            >
              {deptos.map((d) => d.nombre).join(' · ')}
            </span>
          ))}
      </div>

      {/* Pestañas */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '20px' }}>
        <button style={tabStyle(activeTab === 'personal')} onClick={() => setActiveTab('personal')}>Personal del área</button>
        <button style={tabStyle(activeTab === 'asistencia')} onClick={() => setActiveTab('asistencia')}>Asistencia</button>
        <button style={tabStyle(activeTab === 'incidencias')} onClick={() => setActiveTab('incidencias')}>Incidencias</button>
        <button style={tabStyle(activeTab === 'vacaciones')} onClick={() => setActiveTab('vacaciones')}>Vacaciones</button>
        <button style={tabStyle(activeTab === 'prestamos')} onClick={() => setActiveTab('prestamos')}>Préstamos</button>
      </div>

      {/* ─── TAB: PERSONAL ─── */}
      {activeTab === 'personal' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <input
              type="search"
              placeholder="Buscar por nombre, número, email..."
              value={busquedaPersonal}
              onChange={e => setBusquedaPersonal(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', minWidth: '320px', width: '100%', maxWidth: '480px', outline: 'none' }}
            />
            <button
              onClick={loadPersonal} disabled={loadingPersonal}
              style={{ padding: '8px 16px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
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
          ) : (() => {
            const q = busquedaPersonal.trim().toLowerCase();
            const personalFiltrado = q
              ? personal.filter(emp => {
                  const nombreCompleto = fmtNombreEmpleado(emp).toLowerCase();
                  const num = (emp.numero_empleado || '').toLowerCase();
                  const email = (emp.email || '').toLowerCase();
                  const tel = (emp.telefono || '').toLowerCase();
                  const puesto = (emp.puesto?.nombre || '').toLowerCase();
                  const depto = (emp.departamento?.nombre || '').toLowerCase();
                  return nombreCompleto.includes(q) || num.includes(q) || email.includes(q) || tel.includes(q) || puesto.includes(q) || depto.includes(q);
                })
              : personal;
            return personalFiltrado.length === 0 && busquedaPersonal.trim() ? (
              <p style={{ color: '#666', padding: '24px', backgroundColor: '#f8f9fa', borderRadius: '8px', fontSize: '0.9rem' }}>
                No se encontraron empleados para &quot;{busquedaPersonal.trim()}&quot;.
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
                  {personalFiltrado.map(emp => (
                    <tr key={emp.id} style={{ transition: 'background 0.1s' }} onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ ...td, fontWeight: 600, color: '#374151' }}>{emp.numero_empleado}</td>
                      <td style={td}>{fmtNombreEmpleado(emp)}</td>
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
              <p style={{ marginTop: '8px', color: '#888', fontSize: '0.82rem' }}>
                {personalFiltrado.length} empleado{personalFiltrado.length !== 1 ? 's' : ''}
                {busquedaPersonal.trim() && personalFiltrado.length !== personal.length && ` (de ${personal.length} total)`}
              </p>
            </div>
            );
          })()}
        </>
      )}

      {/* ─── TAB: ASISTENCIA ─── */}
      {activeTab === 'asistencia' && (
        <>
          <div>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700 }}>Checadas del personal del área</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
              <div />
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (quincena.num === 1) {
                      setQuincena({ year: quincena.year, month: quincena.month - 1, num: 2 });
                    } else {
                      setQuincena({ ...quincena, num: 1 });
                    }
                  }}
                  style={{ padding: '8px 14px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, fontWeight: 600, boxShadow: '0 1px 3px rgba(14,165,233,0.4)' }}
                  title="Quincena anterior"
                >
                  ←
                </button>
                <span style={{ color: '#374151', fontSize: '0.9rem', fontWeight: 600, minWidth: '200px', textAlign: 'center' }}>
                  {formatQuincenaLabel(quincena.year, quincena.month, quincena.num)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (quincena.num === 2) {
                      setQuincena({ year: quincena.year, month: quincena.month + 1, num: 1 });
                    } else {
                      setQuincena({ ...quincena, num: 2 });
                    }
                  }}
                  style={{ padding: '8px 14px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, fontWeight: 600, boxShadow: '0 1px 3px rgba(14,165,233,0.4)' }}
                  title="Quincena siguiente"
                >
                  →
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={loadChecadas}
                  disabled={loadingChecadas}
                  style={{ padding: '7px 14px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
                >
                  {loadingChecadas ? 'Cargando...' : 'Actualizar'}
                </button>
              </div>
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
                incidenciasDelDia: { tipo: string; justificada: boolean }[];
                numChecadas: number;
              };
              const calcTotal = (row: DayRow): string => {
                const primera = row.primeraChecada;
                const ultima = row.ultimaChecada;
                if (primera == null || ultima == null || ultima <= primera) return '--';
                let totalMs = ultima - primera;
                if (row.salidaComerTs != null && row.regresoComerTs != null && row.regresoComerTs > row.salidaComerTs) {
                  totalMs -= (row.regresoComerTs - row.salidaComerTs);
                }
                const mins = Math.floor(totalMs / 60000);
                if (mins < 0) return '--';
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                return m === 0 ? `${h}h` : `${h}h ${m}m`;
              };

              const map = new Map<string, DayRow>();
              const tipo = (t: string) => String(t || '').toLowerCase();
              checadas.forEach(c => {
                const d = parseTimestampForMexico(c.timestamp);
                const fechaSort = toMexicoDateString(d);
                const fechaStr = d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Mexico_City' });
                const key = `${c.empleado_id}_${fechaSort}`;
                if (!map.has(key)) {
                  map.set(key, {
                    key,
                    numeroEmpleado: c.empleado_numero ?? '—',
                    empleadoNombre: c.empleado_nombre || empleadosMap[c.empleado_id] || `#${c.empleado_id}`,
                    empleado_id: c.empleado_id,
                    fecha: fechaStr,
                    fechaSort,
                    incidenciasDelDia: [],
                    numChecadas: 0,
                    esTiempoExtra: !!c.es_tiempo_extra,
                  });
                }
                const row = map.get(key)!;
                row.numChecadas++;
                const t = d.getTime();
                const tip = tipo(c.tipo);
                if (row.primeraChecada == null || t < row.primeraChecada) row.primeraChecada = t;
                if (row.ultimaChecada == null || t > row.ultimaChecada) row.ultimaChecada = t;
                const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                if (tip === 'entrada' && !row.entrada) row.entrada = hora;
                else if (tip === 'salida_comer') { if (!row.salida_comer) { row.salida_comer = hora; row.salidaComerTs = t; } }
                else if (tip === 'regreso_comer') { if (!row.regreso_comer) { row.regreso_comer = hora; row.regresoComerTs = t; } }
                else if (tip === 'salida' && !row.salida) row.salida = hora;
              });
              const dayRows = Array.from(map.values());
              dayRows.forEach(row => {
                let incs = incidencias
                  .filter(i => i.empleado_id === row.empleado_id && String(i.fecha).slice(0, 10) === row.fechaSort)
                  .map(i => ({ tipo: i.tipo, justificada: i.justificada }));
                if (row.numChecadas > 0) incs = incs.filter(i => i.tipo !== 'falta');
                row.incidenciasDelDia = incs;
              });
              dayRows.sort((a, b) => b.fechaSort.localeCompare(a.fechaSort) || a.empleadoNombre.localeCompare(b.empleadoNombre));

              const totalPagChecadas = Math.max(1, Math.ceil(dayRows.length / ITEMS_PER_PAGE));
              const startChecadas = (pagChecadas - 1) * ITEMS_PER_PAGE;
              const dayRowsPag = dayRows.slice(startChecadas, startChecadas + ITEMS_PER_PAGE);

              const incBg: Record<string, string> = {
                completa: '#d1fae5', horas_extra: '#d1fae5',
                retardo: '#fef3c7', salida_anticipada: '#fef9c3', incompleta: '#e5e7eb', falta: '#fee2e2',
              };

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
                    {dayRowsPag.map(row => (
                      <tr key={row.key}
                        style={{
                          borderBottom: '1px solid #eee',
                          backgroundColor: row.incidenciasDelDia.some(i => !i.justificada) ? ((incBg[row.incidenciasDelDia.find(i => !i.justificada)!.tipo] ?? '#fff7ed') + '88') : row.esTiempoExtra ? '#fff8e1' : undefined,
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
                          {row.incidenciasDelDia.length > 0 ? (
                            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {row.incidenciasDelDia.map((inc, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    padding: '2px 8px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600,
                                    backgroundColor: incBg[inc.tipo] ?? '#f3f4f6',
                                    color: '#374151',
                                    textDecoration: inc.justificada ? 'line-through' : 'none',
                                    opacity: inc.justificada ? 0.6 : 1,
                                  }}
                                >
                                  {tipoLabels[inc.tipo] || inc.tipo}
                                  {inc.justificada && ' ✓'}
                                </span>
                              ))}
                            </span>
                          ) : <span style={{ color: '#d1d5db' }}>—</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{calcTotal(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, color: '#888', fontSize: '0.82rem' }}>{dayRows.length} día{dayRows.length !== 1 ? 's' : ''} · {checadas.length} checada{checadas.length !== 1 ? 's' : ''} del personal del área</p>
                  {totalPagChecadas > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setPagChecadas(p => Math.max(1, p - 1))}
                        disabled={pagChecadas <= 1}
                        style={{ padding: '6px 12px', backgroundColor: pagChecadas <= 1 ? '#e5e7eb' : '#0ea5e9', color: pagChecadas <= 1 ? '#9ca3af' : 'white', border: 'none', borderRadius: '6px', cursor: pagChecadas <= 1 ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}
                      >
                        ← Anterior
                      </button>
                      <span style={{ fontSize: '0.85rem', color: '#555', fontWeight: 500 }}>Página {pagChecadas} de {totalPagChecadas}</span>
                      <button
                        type="button"
                        onClick={() => setPagChecadas(p => Math.min(totalPagChecadas, p + 1))}
                        disabled={pagChecadas >= totalPagChecadas}
                        style={{ padding: '6px 12px', backgroundColor: pagChecadas >= totalPagChecadas ? '#e5e7eb' : '#0ea5e9', color: pagChecadas >= totalPagChecadas ? '#9ca3af' : 'white', border: 'none', borderRadius: '6px', cursor: pagChecadas >= totalPagChecadas ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}
                      >
                        Siguiente →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ); })()}
          </div>
        </>
      )}

      {/* ─── TAB: INCIDENCIAS ─── */}
      {activeTab === 'incidencias' && (
        <>
          <div>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700 }}>Incidencias del personal del área</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
              <div />
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (quincena.num === 1) {
                      setQuincena({ year: quincena.year, month: quincena.month - 1, num: 2 });
                    } else {
                      setQuincena({ ...quincena, num: 1 });
                    }
                  }}
                  style={{ padding: '8px 14px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, fontWeight: 600, boxShadow: '0 1px 3px rgba(14,165,233,0.4)' }}
                  title="Quincena anterior"
                >
                  ←
                </button>
                <span style={{ color: '#374151', fontSize: '0.9rem', fontWeight: 600, minWidth: '200px', textAlign: 'center' }}>
                  {formatQuincenaLabel(quincena.year, quincena.month, quincena.num)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (quincena.num === 2) {
                      setQuincena({ year: quincena.year, month: quincena.month + 1, num: 1 });
                    } else {
                      setQuincena({ ...quincena, num: 2 });
                    }
                  }}
                  style={{ padding: '8px 14px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, fontWeight: 600, boxShadow: '0 1px 3px rgba(14,165,233,0.4)' }}
                  title="Quincena siguiente"
                >
                  →
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-end' }}>
                {authMe?.is_superuser && (
                  <input
                    type="search"
                    placeholder="Buscar por empleado, tipo, descripción..."
                    value={busquedaIncidencias}
                    onChange={e => setBusquedaIncidencias(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', height: '36px', boxSizing: 'border-box', minWidth: '240px', outline: 'none' }}
                  />
                )}
                <select
                  value={filtroJustificada}
                  onChange={e => setFiltroJustificada(e.target.value as 'todas' | 'pendientes' | 'justificadas')}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', height: '36px', boxSizing: 'border-box' }}
                >
                  <option value="pendientes">Pendientes de justificar</option>
                  <option value="justificadas">Justificadas</option>
                  <option value="todas">Todas</option>
                </select>
                <button
                  onClick={loadIncidencias} disabled={loadingIncidencias}
                  style={{ padding: '7px 14px', height: '36px', boxSizing: 'border-box', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
                >
                  {loadingIncidencias ? 'Cargando...' : 'Actualizar'}
                </button>
              </div>
            </div>
            <p style={{ margin: '0 0 12px 0', color: '#666', fontSize: '0.85rem' }}>
              Incidencias del personal de tu área en esta quincena (días 1-15 o 16-fin de mes).
            </p>
            {loadingIncidencias ? (
              <p style={{ color: '#666' }}>Cargando incidencias del personal del área...</p>
            ) : filteredIncBusqueda.length === 0 ? (
              <p style={{ color: '#666', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', fontSize: '0.9rem' }}>
                {busquedaIncidencias.trim() ? `No se encontraron incidencias para "${busquedaIncidencias.trim()}".` : `No hay incidencias del personal del área ${filtroJustificada === 'pendientes' ? 'pendientes' : filtroJustificada === 'justificadas' ? 'justificadas' : ''}.`}
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
                    {(() => {
                      const startInc = (pagIncidencias - 1) * ITEMS_PER_PAGE;
                      const incPag = filteredIncBusqueda.slice(startInc, startInc + ITEMS_PER_PAGE);
                      return incPag.map(inc => (
                      <tr key={inc.id} onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ ...td, fontWeight: 500 }}>{inc.empleado_nombre || empleadosMap[inc.empleado_id] || `#${inc.empleado_id}`}</td>
                        <td style={td}>{new Date(inc.fecha).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                        <td style={td}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600,
                            ...(tipoIncidenciasColores[inc.tipo] ?? { backgroundColor: '#f3f4f6', color: '#374151' }),
                          }}>
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
                    ));
                    })()}
                  </tbody>
                </table>
                {filteredIncBusqueda.length > ITEMS_PER_PAGE && (() => {
                  const totalPagInc = Math.max(1, Math.ceil(filteredIncBusqueda.length / ITEMS_PER_PAGE));
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setPagIncidencias(p => Math.max(1, p - 1))}
                        disabled={pagIncidencias <= 1}
                        style={{ padding: '6px 12px', backgroundColor: pagIncidencias <= 1 ? '#e5e7eb' : '#0ea5e9', color: pagIncidencias <= 1 ? '#9ca3af' : 'white', border: 'none', borderRadius: '6px', cursor: pagIncidencias <= 1 ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}
                      >
                        ← Anterior
                      </button>
                      <span style={{ fontSize: '0.85rem', color: '#555', fontWeight: 500 }}>Página {pagIncidencias} de {totalPagInc}</span>
                      <button
                        type="button"
                        onClick={() => setPagIncidencias(p => Math.min(totalPagInc, p + 1))}
                        disabled={pagIncidencias >= totalPagInc}
                        style={{ padding: '6px 12px', backgroundColor: pagIncidencias >= totalPagInc ? '#e5e7eb' : '#0ea5e9', color: pagIncidencias >= totalPagInc ? '#9ca3af' : 'white', border: 'none', borderRadius: '6px', cursor: pagIncidencias >= totalPagInc ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}
                      >
                        Siguiente →
                      </button>
                    </div>
                  );
                })()}
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
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', height: '36px', boxSizing: 'border-box' }}
            >
              <option value="pendientes">Pendientes de mi aprobación</option>
              <option value="todas">Todas</option>
              <option value="aprobada">Aprobadas</option>
              <option value="rechazada">Rechazadas</option>
            </select>
            <button
              onClick={loadSolicitudesVacaciones} disabled={loadingVacaciones}
              style={{ padding: '8px 16px', height: '36px', boxSizing: 'border-box', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
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

      {/* ─── TAB: PRÉSTAMOS ─── */}
      {activeTab === 'prestamos' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <select
              value={filtroEstadoPrestamos}
              onChange={e => setFiltroEstadoPrestamos(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', height: '36px', boxSizing: 'border-box' }}
            >
              <option value="pendiente">Pendientes</option>
              <option value="aprobada_departamento">Aprobadas por área</option>
              <option value="depositado">Depositadas</option>
              <option value="rechazada">Rechazadas</option>
              <option value="todas">Todas</option>
            </select>
            <button
              onClick={loadSolicitudesPrestamos}
              disabled={loadingPrestamos}
              style={{ padding: '8px 16px', height: '36px', boxSizing: 'border-box', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              {loadingPrestamos ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>
          {loadingPrestamos ? (
            <p style={{ color: '#666' }}>Cargando solicitudes de préstamos...</p>
          ) : solicitudesPrestamos.length === 0 ? (
            <p style={{ color: '#666', padding: '24px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              No hay solicitudes de préstamos para el filtro seleccionado.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <thead>
                  <tr>
                    <th style={th}>Folio</th>
                    <th style={th}>Empleado</th>
                    <th style={{ ...th, textAlign: 'right' }}>Monto</th>
                    <th style={{ ...th, textAlign: 'center' }}>Plazo</th>
                    <th style={th}>Estado</th>
                    <th style={th}>Motivo</th>
                    <th style={th}>Fecha</th>
                    <th style={{ ...th, textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudesPrestamos.map((s) => {
                    const empleadoNombre = s.empleado
                      ? fmtNombreEmpleado(s.empleado)
                      : (empleadosMap[s.empleado_id] || `#${s.empleado_id}`);
                    const montoNum = Number(s.monto || 0);
                    const estadoLabel: Record<string, string> = {
                      pendiente: 'Pendiente',
                      aprobada_departamento: 'Aprobada por área',
                      depositado: 'Depositada',
                      rechazada: 'Rechazada',
                    };
                    return (
                      <tr key={s.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{s.numero_solicitud || `#${s.id}`}</td>
                        <td style={td}>{empleadoNombre}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                          ${montoNum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>{s.plazo_meses} quincena{s.plazo_meses !== 1 ? 's' : ''}</td>
                        <td style={td}>{estadoLabel[s.estado] || s.estado}</td>
                        <td style={{ ...td, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.motivo || '—'}</td>
                        <td style={td}>{new Date(s.created_at).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          {s.estado === 'pendiente' ? (
                            <button
                              onClick={() => { setModalAprobarPrestamo(s); setComentariosPrestamo(''); }}
                              style={{ padding: '5px 12px', backgroundColor: '#0d9488', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}
                            >
                              Aprobar / Rechazar
                            </button>
                          ) : <span style={{ color: '#9ca3af' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
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

      {/* ─── MODAL APROBAR/RECHAZAR PRÉSTAMO ─── */}
      {modalAprobarPrestamo && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setModalAprobarPrestamo(null)} role="presentation">
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', maxWidth: '460px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()} role="dialog">
            <h2 style={{ marginTop: 0, marginBottom: '12px' }}>Autorizar o rechazar préstamo</h2>
            <p style={{ color: '#555', marginBottom: '6px', fontWeight: 500 }}>
              {modalAprobarPrestamo.empleado
                ? fmtNombreEmpleado(modalAprobarPrestamo.empleado)
                : (empleadosMap[modalAprobarPrestamo.empleado_id] || `#${modalAprobarPrestamo.empleado_id}`)}
            </p>
            <p style={{ color: '#555', marginBottom: '14px', fontSize: '0.9rem' }}>
              Folio: {modalAprobarPrestamo.numero_solicitud || `#${modalAprobarPrestamo.id}`} · Monto: ${Number(modalAprobarPrestamo.monto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Plazo: {modalAprobarPrestamo.plazo_meses} quincena{modalAprobarPrestamo.plazo_meses !== 1 ? 's' : ''}
            </p>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.9rem' }}>Comentarios (opcional)</label>
              <textarea value={comentariosPrestamo} onChange={e => setComentariosPrestamo(e.target.value)} rows={2}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', resize: 'vertical', fontSize: '0.9rem' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalAprobarPrestamo(null)}
                style={{ padding: '9px 18px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => handleAprobarRechazarPrestamo(false)} disabled={aprobandoPrestamo}
                style={{ padding: '9px 18px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                {aprobandoPrestamo ? '...' : 'Rechazar'}
              </button>
              <button onClick={() => handleAprobarRechazarPrestamo(true)} disabled={aprobandoPrestamo}
                style={{ padding: '9px 18px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                {aprobandoPrestamo ? '...' : 'Aprobar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
