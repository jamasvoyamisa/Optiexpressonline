import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../../services/api';
import { toMexicoDateString } from '../../utils/date';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuth } from '../../hooks/useAuth';
import type { SolicitudVacaciones } from '../../types';
import {
  generarDocumentoVacaciones,
  type EmpleadoResumenVacaciones,
} from '../vacaciones/documentoVacaciones';
import { AccionesDocumentoVacaciones } from '../vacaciones/AccionesDocumentoVacaciones';

interface Solicitud {
  id: number;
  empleado_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_solicitados: number;
  motivo?: string | null;
  estado: string;
  jefe_aprobador_id?: number | null;
  jefe_aprobador_nombre?: string | null;
  jefe_aprobador_puesto?: string | null;
  fecha_aprobacion?: string | null;
  comentarios_aprobacion?: string | null;
  created_at: string;
  aceptacion_solicitante_at?: string | null;
  aceptacion_solicitante_ip?: string | null;
  aceptacion_solicitante_texto?: string | null;
  aceptacion_jefe_at?: string | null;
  aceptacion_jefe_ip?: string | null;
  aceptacion_rh_at?: string | null;
  aceptacion_rh_ip?: string | null;
  documento_firmado_ruta?: string | null;
  documento_firmado_nombre?: string | null;
  documento_firmado_at?: string | null;
  documento_firmado_por_id?: number | null;
  tiene_documento_firmado?: boolean;
}

interface PeriodoVacaciones {
  anios_antiguedad: number;
  dias_derecho: number;
  dias_tomados: number;
  dias_disponibles: number;
  fecha_aniversario?: string | null;
  fecha_limite_goce?: string | null;
  prescrito_por_plazo?: boolean;
  dias_pendientes_historico?: number;
}

interface Balance {
  año: number;
  dias_disponibles: number;
  dias_tomados: number;
  dias_pendientes: number;
  /** Suma de días disponibles en periodos vigentes menos adeudo por vacaciones generales sin periodo (puede ser negativo). */
  saldo_dias_lft_neto?: number;
  /** Días adeudados por vacaciones generales aplicadas antes de tener periodo LFT vigente. */
  dias_deuda_vacaciones_ley?: number;
  /** Bolsa extra-LFT (migración); ver docs del proyecto. */
  dias_saldo_migracion_vacaciones?: number;
  /** saldo_dias_lft_neto + dias_saldo_migracion_vacaciones */
  saldo_total_con_migracion?: number;
  periodo_actual?: PeriodoVacaciones | null;
  periodo_anterior?: PeriodoVacaciones | null;
  fecha_limite_goce?: string | null;
}

type TabKey = 'nueva' | 'pendientes' | 'registros';

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '12px 20px',
  cursor: 'pointer',
  border: 'none',
  borderBottom: active ? '3px solid #0ea5e9' : '3px solid transparent',
  backgroundColor: 'transparent',
  fontWeight: active ? 700 : 400,
  fontSize: '0.95rem',
  color: active ? '#0ea5e9' : '#666',
});

const th = { padding: '11px 13px', textAlign: 'left' as const, borderBottom: '2px solid #dee2e6', fontSize: '0.82rem', fontWeight: 600, color: '#555', backgroundColor: '#f8f9fa' };
const td = { padding: '10px 13px', borderBottom: '1px solid #f0f0f0', fontSize: '0.9rem' };

// Días en México: festivos y santoral (clave "mes-día", 1-12, 1-31)
const MEXICO_DAY_LABELS: Record<string, string> = {
  '1-1': 'Año Nuevo', '1-6': 'Día de Reyes', '1-17': 'San Antonio',
  '2-2': 'Candelaria', '2-5': 'Constitución', '2-14': 'San Valentín', '2-19': 'Día del Ejército',
  '3-8': 'Día de la Mujer', '3-19': 'San José', '3-21': 'Natalicio B. Juárez',
  '4-30': 'Día del Niño', '5-1': 'Día del Trabajo', '5-5': 'Batalla de Puebla', '5-10': 'Día de las Madres', '5-15': 'San Isidro',
  '6-1': 'Día de la Marina', '6-24': 'San Juan', '6-29': 'San Pedro y San Pablo',
  '7-16': 'Virgen del Carmen', '7-25': 'Santiago Apóstol',
  '8-15': 'Asunción', '8-24': 'San Bartolomé',
  '9-8': 'Natividad María', '9-16': 'Día Independencia', '9-29': 'San Miguel',
  '10-4': 'San Francisco', '10-12': 'Virgen del Pilar', '10-31': 'Halloween',
  '11-1': 'Todos los Santos', '11-2': 'Día de Muertos', '11-20': 'Revolución Mexicana', '11-22': 'Santa Cecilia',
  '12-8': 'Inmaculada Concepción', '12-12': 'Virgen de Guadalupe', '12-24': 'Nochebuena', '12-25': 'Navidad', '12-28': 'Santos Inocentes',
};
function getMexicoLabel(month: number, day: number): string | null {
  return MEXICO_DAY_LABELS[`${month + 1}-${day}`] ?? null;
}

interface DiaFestivo {
  id: number;
  fecha: string;  // 'YYYY-MM-DD'
  nombre: string;
  tipo: string;
  activo: boolean;
}

export const MisVacacionesPage = () => {
  const { authMe } = useAuth();
  const isMobile = useIsMobile();
  if (authMe?.exento_incidencias) {
    return <Navigate to="/" replace />;
  }
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('nueva');
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [aceptoSolicitud, setAceptoSolicitud] = useState(false);
  const [passwordSolicitud, setPasswordSolicitud] = useState('');
  const [modalSolicitar, setModalSolicitar] = useState(false);
  const [modalRechazo, setModalRechazo] = useState<{ motivo: string | null; comentario: string | null } | null>(null);
  const [modalCancelar, setModalCancelar] = useState<Solicitud | null>(null);
  const [loadingDoc, setLoadingDoc] = useState<number | null>(null);
  const [cancelando, setCancelando] = useState(false);
  // Festivos: Set de strings 'YYYY-MM-DD' activos, y mapa fecha→nombre
  const [festivosSet, setFestivosSet] = useState<Set<string>>(new Set());
  const [festivosNombre, setFestivosNombre] = useState<Record<string, string>>({});
  /** Días pasados con falta elegible para vacaciones retroactivas (ventana 7 días). */
  const [faltasRetroSet, setFaltasRetroSet] = useState<Set<string>>(new Set());

  const loadFestivos = (year: number) => {
    api.get<DiaFestivo[]>(`/asistencia/festivos?año=${year}&solo_activos=true`)
      .then(res => {
        const arr = Array.isArray(res.data) ? res.data : [];
        setFestivosSet(new Set(arr.map(f => f.fecha)));
        setFestivosNombre(Object.fromEntries(arr.map(f => [f.fecha, f.nombre])));
      })
      .catch(() => {});
  };

  const loadFaltasRetro = () => {
    api
      .get<{ fechas: string[] }>('/vacaciones/mis-faltas-retroactivas')
      .then((res) => {
        const fechas = Array.isArray(res.data?.fechas) ? res.data.fechas : [];
        setFaltasRetroSet(new Set(fechas));
      })
      .catch(() => setFaltasRetroSet(new Set()));
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Solicitud[]>('/vacaciones/mis-solicitudes?limit=500'),
      api.get<Balance>('/vacaciones/mi-balance'),
    ])
      .then(([solRes, balRes]) => {
        setSolicitudes(Array.isArray(solRes.data) ? solRes.data : []);
        const b = balRes.data as Balance | null;
        if (b) setBalance({ ...b, año: (b as Balance).año ?? new Date().getFullYear() });
        else setBalance(null);
      })
      .catch(() => {
        setSolicitudes([]);
        setBalance(null);
      })
      .finally(() => setLoading(false));
    loadFaltasRetro();
  };

  useEffect(() => {
    load();
    loadFestivos(new Date().getFullYear());
  }, []);

  // Calendario: lunes = 0, domingo = 6 (no elegible)
  const weekDaysFull = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const weekDaysShort = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const firstOfMonth = new Date(calYear, calMonth, 1);
  const lastOfMonth = new Date(calYear, calMonth + 1, 0);
  const startPad = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = lastOfMonth.getDate();
  const totalCells = startPad + daysInMonth;
  void Math.ceil(totalCells / 7); // rows — no se usa actualmente

  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  const todayLocal = toMexicoDateString(new Date());
  const isSunday = (y: number, m: number, day: number) => new Date(y, m, day).getDay() === 0;
  const isPast = (iso: string) => iso < todayLocal;

  const saldoNetoLft = balance
    ? Number(balance.saldo_dias_lft_neto ?? balance.dias_disponibles)
    : 0;
  const saldoMigracion = balance ? Number(balance.dias_saldo_migracion_vacaciones ?? 0) : 0;
  const saldoTotalVacaciones = balance
    ? Number(balance.saldo_total_con_migracion ?? saldoNetoLft + saldoMigracion)
    : 0;
  const diasDisponiblesParaSolicitar = balance
    ? saldoTotalVacaciones - Number(balance.dias_pendientes)
    : 0;
  /** Saldo rojo (negativo) o sin cupo neto: no se puede elegir fechas ni enviar solicitud. */
  const puedeElegirFechasEnCalendario =
    !loading && balance != null && diasDisponiblesParaSolicitar > 0;

  useEffect(() => {
    if (!puedeElegirFechasEnCalendario && (rangeStart || rangeEnd)) {
      setRangeStart(null);
      setRangeEnd(null);
    }
    if (!puedeElegirFechasEnCalendario && modalSolicitar) {
      setModalSolicitar(false);
    }
  }, [puedeElegirFechasEnCalendario, rangeStart, rangeEnd, modalSolicitar]);

  // Aprobadas por jefe o con constancia RH: el saldo ya se descontó al aprobar el jefe.
  const registros = solicitudes.filter(
    (s) => s.estado === 'aprobada' || s.estado === 'aprobada_jefe',
  );
  const pendientes = solicitudes.filter(
    (s) => s.estado === 'pendiente' || s.estado === 'rechazada',
  );
  const isDiaTomado = (iso: string) =>
    registros.some((s) => {
      const start = s.fecha_inicio.slice(0, 10);
      const end = s.fecha_fin.slice(0, 10);
      return iso >= start && iso <= end;
    });

  const handleDayClick = (iso: string, isSundayDay: boolean, isPastDay: boolean, isTomado: boolean) => {
    if (!puedeElegirFechasEnCalendario) return;
    const pastOk = isPastDay && faltasRetroSet.has(iso);
    if (isSundayDay || (isPastDay && !pastOk) || isTomado) return;
    if (!rangeStart) {
      setRangeStart(iso);
      setRangeEnd(null);
      return;
    }
    const end = rangeEnd || rangeStart;
    if (!rangeEnd) {
      if (iso < rangeStart) {
        setRangeStart(iso);
        setRangeEnd(rangeStart);
      } else {
        setRangeEnd(iso);
      }
      return;
    }
    // Clic en un día ya seleccionado: deseleccionar todo el rango
    if (iso >= rangeStart && iso <= end) {
      setRangeStart(null);
      setRangeEnd(null);
      return;
    }
    if (iso < rangeStart) setRangeStart(iso);
    else if (iso > end) setRangeEnd(iso);
  };

  const isInRange = (iso: string) => {
    if (!rangeStart) return false;
    const end = rangeEnd || rangeStart;
    return iso >= rangeStart && iso <= end;
  };


  const selectedCount = (() => {
    if (!rangeStart) return 0;
    const end = rangeEnd || rangeStart;
    let count = 0;
    const [sy, sm, sd] = rangeStart.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const startD = new Date(sy, sm - 1, sd);
    const endD = new Date(ey, em - 1, ed);
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0) continue; // domingo
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (festivosSet.has(iso)) continue; // festivo
      count++;
    }
    return count;
  })();

  const submitDesdeModal = () => {
    const start = rangeStart || rangeEnd;
    const end = rangeEnd || rangeStart;
    if (!start || !end) return;
    if (isPast(start)) {
      alert('La fecha de inicio no puede ser anterior al día de hoy.');
      return;
    }
    if (loading || !balance || diasDisponiblesParaSolicitar <= 0) {
      alert(
        balance && saldoTotalVacaciones < 0
          ? 'No puedes solicitar vacaciones mientras tu saldo total (LFT neto + migración) sea negativo.'
          : 'No puedes solicitar vacaciones: no tienes días disponibles netos (revisa saldo y solicitudes pendientes).',
      );
      return;
    }
    if (selectedCount > diasDisponiblesParaSolicitar) {
      alert(
        `No puedes solicitar más de ${diasDisponiblesParaSolicitar} día(s). Ajusta el periodo en el calendario.`,
      );
      return;
    }
    if (!aceptoSolicitud) {
      alert('Debes marcar la casilla de aceptación para enviar la solicitud.');
      return;
    }
    if (!passwordSolicitud.trim()) {
      alert('Indica tu contraseña para confirmar la solicitud.');
      return;
    }
    setSending(true);
    api
      .post('/vacaciones/mis-solicitudes', {
        fecha_inicio: new Date(start + 'T12:00:00').toISOString(),
        fecha_fin: new Date(end + 'T12:00:00').toISOString(),
        motivo: motivo.trim() || null,
        acepto: true,
        password: passwordSolicitud,
      })
      .then(() => {
        setModalSolicitar(false);
        setRangeStart(null);
        setRangeEnd(null);
        setMotivo('');
        setAceptoSolicitud(false);
        setPasswordSolicitud('');
        load();
        setActiveTab('pendientes');
      })
      .catch((err) => alert(err.response?.data?.detail || 'Error al crear la solicitud'))
      .finally(() => setSending(false));
  };

  const cancelarSolicitud = () => {
    if (!modalCancelar) return;
    setCancelando(true);
    api.put(`/vacaciones/mis-solicitudes/${modalCancelar.id}/cancelar`)
      .then(() => {
        setModalCancelar(null);
        load();
      })
      .catch(err => alert(err.response?.data?.detail || 'Error al cancelar la solicitud'))
      .finally(() => setCancelando(false));
  };

  const empDesdeAuth = (): EmpleadoResumenVacaciones | null => {
    if (!authMe) return null;
    return {
      id: authMe.id,
      nombre: authMe.nombre,
      apellido_paterno: authMe.apellido_paterno,
      apellido_materno: authMe.apellido_materno,
      numero_empleado: authMe.numero_empleado,
      fecha_ingreso: authMe.fecha_ingreso ?? null,
      departamento: authMe.departamentos?.[0]
        ? { id: authMe.departamentos[0].id, nombre: authMe.departamentos[0].nombre }
        : null,
    };
  };

  const verDocumento = async (sol: Solicitud) => {
    const w = window.open('', '_blank', 'width=820,height=920,scrollbars=yes');
    if (!w) {
      alert('Permite ventanas emergentes para ver el documento');
      return;
    }
    w.document.write(
      '<html><body style="font-family:system-ui;padding:40px;text-align:center;color:#666">Cargando documento...</body></html>',
    );
    setLoadingDoc(sol.id);
    const payload = sol as SolicitudVacaciones;
    try {
      const res = await api.get<EmpleadoResumenVacaciones>(`/personal/empleados/${sol.empleado_id}`);
      generarDocumentoVacaciones(payload, res.data, w);
    } catch {
      generarDocumentoVacaciones(payload, empDesdeAuth(), w);
    } finally {
      setLoadingDoc(null);
    }
  };

  const patchSolicitudDoc = (updated: Partial<Solicitud> & { id: number }) => {
    setSolicitudes((prev) =>
      prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
    );
  };

  const accionesDoc = (s: Solicitud, mobile: boolean) => (
    <AccionesDocumentoVacaciones
      solicitud={s}
      loadingPlantilla={loadingDoc === s.id}
      onVerPlantilla={() => verDocumento(s)}
      onActualizado={(u) => patchSolicitudDoc({ ...s, ...u })}
      permitirSubida={authMe?.vacaciones_pdf_firmado_habilitado === true}
      compact={!mobile}
      btnStyle={mobile ? btnDocMobile : btnDocDesktop}
      btnUploadStyle={
        mobile
          ? {
              ...btnDocMobile,
              backgroundColor: '#ccfbf1',
              color: '#0f766e',
              border: '1px solid #5eead4',
            }
          : {
              ...btnDocDesktop,
              backgroundColor: '#0f766e',
            }
      }
    />
  );

  const btnDocMobile: React.CSSProperties = {
    padding: '6px 14px',
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    border: '1px solid #7dd3fc',
    borderRadius: 20,
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: 700,
  };

  const btnDocDesktop: React.CSSProperties = {
    padding: '4px 10px',
    backgroundColor: '#0369a1',
    color: 'white',
    border: 'none',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };

  const sheetOverlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' };
  const sheetContainer: React.CSSProperties = isMobile
    ? { backgroundColor: 'white', borderRadius: '20px 20px 0 0', padding: '20px 20px calc(20px + env(safe-area-inset-bottom, 0px))', width: '100%', maxHeight: '85dvh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,0.2)' }
    : { backgroundColor: 'white', padding: '28px', borderRadius: '14px', maxWidth: '440px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' };
  const sheetHandle = isMobile ? (
    <div style={{ width: 40, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, margin: '0 auto 16px' }} />
  ) : null;

  const porVencerList: PeriodoVacaciones[] = balance?.periodo_anterior && Number(balance.periodo_anterior.dias_disponibles) > 0
    ? [balance.periodo_anterior] : [];

  return (
    <div style={{ padding: isMobile ? '0 0 30px' : '24px' }}>

      {/* ── MOBILE HEADER ── */}
      {isMobile ? (
        <div style={{ background: 'linear-gradient(135deg, #0f4c75 0%, #1b6ca8 60%, #0ea5e9 100%)', padding: '20px 16px 28px', marginBottom: -12, position: 'relative' }}>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>🌴 Vacaciones</div>
          {loading ? (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginTop: 8 }}>Cargando...</div>
          ) : balance ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 4 }}>
                <span style={{ color: 'white', fontWeight: 800, fontSize: '3.2rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {saldoTotalVacaciones < 0 ? saldoTotalVacaciones : `+${saldoTotalVacaciones}`}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', marginBottom: 8 }}>días disponibles</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)', marginBottom: 6, lineHeight: 1.35 }}>
                LFT neto: {saldoNetoLft} · Bolsa: {saldoMigracion}
              </div>
              {!puedeElegirFechasEnCalendario && (
                <div style={{ backgroundColor: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: '6px 12px', fontSize: '0.78rem', color: '#fca5a5', marginTop: 4 }}>
                  {saldoTotalVacaciones < 0 ? '⚠️ Saldo negativo — calendario bloqueado' : '⚠️ Sin días disponibles para solicitar'}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
                {[
                  { icon: '✈️', label: 'Tomados', val: Number(balance.dias_tomados), color: '#bae6fd' },
                  { icon: '⏳', label: 'Pendientes', val: Number(balance.dias_pendientes), color: '#fde68a' },
                  { icon: '⚠️', label: 'Por vencer', val: porVencerList.reduce((a, p) => a + Number(p.dias_disponibles), 0), color: porVencerList.length ? '#fca5a5' : '#bbf7d0' },
                ].map(({ icon, label, val, color }) => (
                  <div key={label} style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem' }}>{icon}</div>
                    <div style={{ color, fontWeight: 800, fontSize: '1.4rem', lineHeight: 1 }}>{val}</div>
                    <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.65rem', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <h1 style={{ marginBottom: '16px', fontSize: '1.6rem' }}>Vacaciones</h1>
      )}

      {/* ── DESKTOP balance cards ── */}
      {!isMobile && balance && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '18px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #bae6fd' }}>
            <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '4px' }}>Saldo LFT</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: saldoTotalVacaciones < 0 ? '#b91c1c' : saldoTotalVacaciones > 0 ? '#15803d' : '#6b7280' }}>{saldoTotalVacaciones}</div>
            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '8px', lineHeight: 1.35 }}>
              LFT neto: {saldoNetoLft} · Bolsa: {saldoMigracion} · Periodos vigentes: {Number(balance.dias_disponibles)} · Adeudo: {Number(balance.dias_deuda_vacaciones_ley ?? 0)}
            </div>
          </div>
          <div style={{ padding: '18px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '4px' }}>Días tomados</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0369a1' }}>{Number(balance.dias_tomados)}</div>
          </div>
          <div style={{ padding: '18px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '4px' }}>Pendientes (solicitados)</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#b45309' }}>{Number(balance.dias_pendientes)}</div>
          </div>
          <div style={{ padding: '18px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '8px' }}>Por vencer</div>
            {porVencerList.length === 0 ? (
              <div style={{ fontSize: '0.9rem', color: '#888' }}>Ningún periodo por prescribir</div>
            ) : (
              <div style={{ fontSize: '0.9rem' }}>
                {porVencerList.map((p, idx) => (
                  <div key={idx} style={{ marginBottom: idx < porVencerList.length - 1 ? '8px' : 0 }}>
                    <span style={{ fontWeight: 700, color: '#b91c1c' }}>{Number(p.dias_disponibles)} día{Number(p.dias_disponibles) !== 1 ? 's' : ''}</span>
                    <span style={{ color: '#555' }}> ({p.anios_antiguedad} año{p.anios_antiguedad !== 1 ? 's' : ''})</span>
                    {p.fecha_limite_goce && (
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
                        Vencen: {new Date(p.fecha_limite_goce + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'short' })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TABS ── */}
      <div style={isMobile
        ? { margin: '0 0 14px', padding: '14px 12px 0', backgroundColor: 'white', borderRadius: '20px 20px 0 0', position: 'relative', zIndex: 1 }
        : { marginBottom: '20px' }
      }>
        {isMobile ? (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 12 }}>
            {([
              { key: 'nueva', icon: '📅', label: 'Nueva' },
              { key: 'pendientes', icon: '⏳', label: 'Pendientes', badge: pendientes.length || undefined },
              { key: 'registros', icon: '✅', label: 'Ejercidas' },
            ] as { key: TabKey; icon: string; label: string; badge?: number }[]).map(({ key, icon, label, badge }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', flexShrink: 0, fontWeight: 700, fontSize: '0.82rem', transition: 'all 0.15s',
                  backgroundColor: activeTab === key ? '#0ea5e9' : '#f1f5f9',
                  color: activeTab === key ? 'white' : '#475569',
                  boxShadow: activeTab === key ? '0 2px 8px rgba(14,165,233,0.35)' : 'none',
                }}>
                <span>{icon}</span>
                <span>{label}</span>
                {badge != null && badge > 0 && (
                  <span style={{ backgroundColor: activeTab === key ? 'rgba(255,255,255,0.3)' : '#ef4444', color: 'white', borderRadius: 10, padding: '0 5px', fontSize: '0.68rem', fontWeight: 800 }}>{badge}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb' }}>
            {([
              { key: 'nueva', label: 'Nueva Solicitud' },
              { key: 'pendientes', label: 'Solicitudes Pendientes' },
              { key: 'registros', label: 'Vacaciones Ejercidas' },
            ] as { key: TabKey; label: string }[]).map(({ key, label }) => (
              <button key={key} style={tabStyle(activeTab === key)} onClick={() => setActiveTab(key)}>{label}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: isMobile ? '0 12px' : 0 }}>

      {/* Tab Registros: vacaciones ya tomadas (aprobadas) - estilo asistencia, con quien autorizó y fecha autorización */}
      {activeTab === 'registros' && (
        <>
          {loading && solicitudes.length === 0 ? (
            <p style={{ color: '#666' }}>Cargando...</p>
          ) : registros.length === 0 ? (
            <p style={{ color: '#666', padding: '24px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              No tienes vacaciones tomadas (aprobadas) registradas.
            </p>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {registros.map((s) => {
                const completada = s.fecha_fin.slice(0, 10) < todayLocal;
                return (
                  <div key={s.id} style={{ backgroundColor: 'white', borderRadius: 16, border: `1.5px solid ${completada ? '#a7f3d0' : '#bae6fd'}`, padding: '14px 16px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: '0.95rem' }}>
                          {new Date(s.fecha_inicio).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} — {new Date(s.fecha_fin).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                          Autorizó: {s.jefe_aprobador_nombre || '—'}
                          {s.jefe_aprobador_puesto ? ` · ${s.jefe_aprobador_puesto}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#0369a1', lineHeight: 1 }}>{s.dias_solicitados}</div>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>días</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700,
                      backgroundColor: completada ? '#d1fae5' : '#e0f2fe', color: completada ? '#065f46' : '#0369a1' }}>
                      {completada ? '✅ Completada' : '📅 Programada'}
                    </span>
                    {accionesDoc(s, true)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <thead>
                  <tr>
                    <th style={th}>Fecha inicio</th>
                    <th style={th}>Fecha fin</th>
                    <th style={{ ...th, textAlign: 'center' }}>Días</th>
                    <th style={th}>Autorizó</th>
                    <th style={th}>Fecha autorización</th>
                    <th style={th}>Comentarios</th>
                    <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                    <th style={{ ...th, textAlign: 'center' }}>Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((s) => {
                    const completada = s.fecha_fin.slice(0, 10) < todayLocal;
                    return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={td}>{new Date(s.fecha_inicio).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                      <td style={td}>{new Date(s.fecha_fin).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{s.dias_solicitados}</td>
                      <td style={td}>
                        {s.jefe_aprobador_nombre || '—'}
                        {s.jefe_aprobador_puesto ? (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{s.jefe_aprobador_puesto}</div>
                        ) : null}
                      </td>
                      <td style={td}>{s.fecha_aprobacion ? new Date(s.fecha_aprobacion).toLocaleDateString('es-MX', { dateStyle: 'short' }) : '—'}</td>
                      <td style={{ ...td, color: '#555' }}>{s.comentarios_aprobacion || '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {completada
                          ? <span style={{ backgroundColor: '#d1fae5', color: '#065f46', borderRadius: 5, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Completada</span>
                          : <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: 5, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Programada</span>
                        }
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {accionesDoc(s, false)}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ marginTop: '8px', color: '#888', fontSize: '0.82rem' }}>
                {registros.length} registro{registros.length !== 1 ? 's' : ''} de vacaciones tomadas
              </p>
            </div>
          )}
        </>
      )}

      {/* Tab Pendientes */}
      {activeTab === 'pendientes' && (
        <>
          {loading && solicitudes.length === 0 ? (
            <p style={{ color: '#666' }}>Cargando...</p>
          ) : pendientes.length === 0 ? (
            <p style={{ color: '#666', padding: '24px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
              No tienes solicitudes en proceso ni rechazadas.
            </p>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendientes.map((s) => {
                const estadoInfo = s.estado === 'rechazada'
                  ? { bg: '#fee2e2', color: '#991b1b', label: '❌ Rechazada', border: '#fca5a5' }
                  : s.estado === 'aprobada_jefe'
                    ? { bg: '#e0f2fe', color: '#0369a1', label: '🔄 En revisión RH', border: '#7dd3fc' }
                    : { bg: '#fef3c7', color: '#92400e', label: '⏳ Pendiente', border: '#fde68a' };
                return (
                  <div key={s.id} style={{ backgroundColor: 'white', borderRadius: 16, border: `1.5px solid ${estadoInfo.border}`, padding: '14px 16px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: '0.95rem' }}>
                          {new Date(s.fecha_inicio).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} — {new Date(s.fecha_fin).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        {s.motivo && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{s.motivo}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#b45309', lineHeight: 1 }}>{s.dias_solicitados}</div>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>días</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, backgroundColor: estadoInfo.bg, color: estadoInfo.color }}>
                        {estadoInfo.label}
                      </span>
                      {accionesDoc(s, true)}
                      {s.estado === 'rechazada' && (
                        <button onClick={() => setModalRechazo({ motivo: s.motivo ?? null, comentario: s.comentarios_aprobacion ?? null })}
                          style={{ padding: '6px 14px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 20, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                          Ver motivo
                        </button>
                      )}
                      {s.estado === 'pendiente' && (
                        <button onClick={() => setModalCancelar(s)}
                          style={{ padding: '6px 14px', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 20, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <thead>
                  <tr>
                    <th style={th}>Fecha inicio</th>
                    <th style={th}>Fecha fin</th>
                    <th style={{ ...th, textAlign: 'center' }}>Días</th>
                    <th style={th}>Motivo</th>
                    <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                    <th style={{ ...th, textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={td}>{new Date(s.fecha_inicio).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                      <td style={td}>{new Date(s.fecha_fin).toLocaleDateString('es-MX', { dateStyle: 'short' })}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{s.dias_solicitados}</td>
                      <td style={{ ...td, color: '#555' }}>{s.motivo || '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {s.estado === 'pendiente' && <span style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 5, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Pendiente de Aprobación</span>}
                        {s.estado === 'aprobada_jefe' && <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: 5, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>En revisión RH</span>}
                        {s.estado === 'rechazada' && <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 5, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Rechazada</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                          {accionesDoc(s, false)}
                          {s.estado === 'rechazada' && (
                            <button onClick={() => setModalRechazo({ motivo: s.motivo ?? null, comentario: s.comentarios_aprobacion ?? null })}
                              style={{ padding: '4px 10px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                              Ver
                            </button>
                          )}
                          {s.estado === 'pendiente' && (
                            <button onClick={() => setModalCancelar(s)}
                              style={{ padding: '4px 10px', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              Cancelar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Tab Nueva solicitud: calendario a ancho total + botón Solicitar + modal */}
      {activeTab === 'nueva' && (
        <div style={{ width: '100%' }}>
          {/* Barra superior */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            {!isMobile && <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Selecciona el período de vacaciones</h2>}
            {balance && !puedeElegirFechasEnCalendario && !isMobile && (
              <span style={{ color: '#b91c1c', fontWeight: 600, fontSize: '0.9rem', maxWidth: 420, textAlign: 'right', lineHeight: 1.35 }}>
                {saldoTotalVacaciones < 0
                  ? 'Saldo total negativo: no puedes solicitar vacaciones hasta regularizar el adeudo.'
                  : 'No tienes días netos disponibles para nuevas solicitudes.'}
              </span>
            )}
            {!isMobile && rangeStart && diasDisponiblesParaSolicitar > 0 && (
              <button type="button" onClick={() => { setAceptoSolicitud(false); setPasswordSolicitud(''); setModalSolicitar(true); }}
                style={{ padding: '12px 24px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}>
                Solicitar
              </button>
            )}
          </div>
          <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4 }}>
            Los días en ámbar son faltas de los últimos 7 días: puedes solicitarlos como vacaciones.
            Al autorizar el jefe se descuenta el saldo y se justifica la falta automáticamente.
          </p>

          {/* Navegación: flechas al lado del mes, grupo centrado */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '12px' }}>
            <button
              type="button"
              onClick={() => {
                if (calMonth === 0) {
                  setCalMonth(11); setCalYear(calYear - 1);
                  loadFestivos(calYear - 1);
                } else setCalMonth(calMonth - 1);
              }}
              style={{ padding: '8px 14px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
            >
              ←
            </button>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937' }}>
              {firstOfMonth.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }).replace(/^\w/, (c) => c.toUpperCase())}
            </span>
            <button
              type="button"
              onClick={() => {
                if (calMonth === 11) {
                  setCalMonth(0); setCalYear(calYear + 1);
                  loadFestivos(calYear + 1);
                } else setCalMonth(calMonth + 1);
              }}
              style={{ padding: '8px 14px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
            >
              →
            </button>
          </div>

          {/* Calendario */}
          <div style={{ backgroundColor: '#f1f5f9', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '20px', width: '100%', padding: isMobile ? '6px' : '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: isMobile ? '2px' : '4px', marginBottom: isMobile ? '4px' : '8px' }}>
              {(isMobile ? weekDaysShort : weekDaysFull).map((w) => (
                <div
                  key={w}
                  style={{
                    minHeight: isMobile ? '28px' : '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    backgroundColor: '#0369a1',
                    fontWeight: 700,
                    fontSize: isMobile ? '0.7rem' : '0.85rem',
                    color: 'white',
                  }}
                >
                  {w}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: isMobile ? '52px' : '88px', gap: isMobile ? '2px' : '4px', padding: 0 }}>
              {Array.from({ length: startPad }, (_, i) => (
                <div key={`pad-${i}`} style={{ minHeight: '80px' }} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const iso = toISO(new Date(calYear, calMonth, day));
                const sun = isSunday(calYear, calMonth, day);
                const past = isPast(iso);
                const pastConFalta = past && faltasRetroSet.has(iso);
                const yaTomado = isDiaTomado(iso);
                const esFestivo = festivosSet.has(iso);
                const festivoNombre = festivosNombre[iso] ?? null;
                // Festivos y domingos no elegibles; pasado solo si hay falta en ventana de 7 días
                const noElegible = sun || (past && !pastConFalta) || yaTomado || esFestivo || !puedeElegirFechasEnCalendario;
                const inRange = isInRange(iso);
                const mexicoLabel = festivoNombre ?? getMexicoLabel(calMonth, day);

                // Colores: festivo (naranja), pasado con falta (ámbar), pasado (gris), domingo (violeta), ya tomado (azul), en rango (verde), normal
                const bg =
                  pastConFalta && !inRange
                    ? '#fef3c7'
                    : past
                      ? '#f3f4f6'
                      : esFestivo
                        ? '#fff7ed'
                        : sun
                          ? '#f5f3ff'
                          : yaTomado
                            ? '#e0f2fe'
                            : inRange
                              ? '#dcfce7'
                              : '#fff';
                const fg =
                  pastConFalta && !inRange
                    ? '#92400e'
                    : past
                      ? '#9ca3af'
                      : esFestivo
                        ? '#c2410c'
                        : sun
                          ? '#8b7fa8'
                          : yaTomado
                            ? '#0369a1'
                            : inRange
                              ? '#15803d'
                              : '#1f2937';
                const labelColor = pastConFalta && !inRange
                  ? '#b45309'
                  : past
                    ? '#9ca3af'
                    : esFestivo
                      ? '#ea580c'
                      : sun
                        ? '#8b7fa8'
                        : yaTomado
                          ? '#1e3a8a'
                          : inRange
                            ? '#15803d'
                            : '#6b7280';
                return (
                  <button
                    key={iso}
                    type="button"
                    title={
                      pastConFalta
                        ? 'Día con falta: puedes solicitarlo como vacaciones (máx. 7 días)'
                        : mexicoLabel
                          ? (esFestivo ? `🎉 ${mexicoLabel}` : mexicoLabel)
                          : undefined
                    }
                    onClick={() => handleDayClick(iso, sun, past, yaTomado || esFestivo)}
                    disabled={noElegible}
                    style={{
                      height: '100%',
                      minHeight: isMobile ? '52px' : '88px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      paddingTop: isMobile ? '6px' : '10px',
                      paddingBottom: '4px',
                      paddingLeft: '2px',
                      paddingRight: '2px',
                      borderRadius: isMobile ? '6px' : '10px',
                      border: esFestivo ? '2px solid #fb923c' : '1px solid #e5e7eb',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                      fontSize: isMobile ? '0.85rem' : '1rem',
                      fontWeight: 700,
                      cursor: noElegible ? 'not-allowed' : 'pointer',
                      backgroundColor: bg,
                      color: fg,
                      opacity: noElegible ? 0.85 : 1,
                      overflow: 'hidden',
                    }}
                  >
                    <span style={{ lineHeight: 1 }}>{day}</span>
                    {mexicoLabel && !isMobile && (
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: esFestivo ? 700 : 500,
                        color: labelColor,
                        marginTop: '4px',
                        lineHeight: 1.2,
                        textAlign: 'center',
                        width: '100%',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical' as const,
                        wordBreak: 'break-word',
                      }}>
                        {esFestivo ? `🎉 ${mexicoLabel}` : mexicoLabel}
                      </span>
                    )}
                    {isMobile && esFestivo && (
                      <span style={{ fontSize: '0.6rem', marginTop: '2px', lineHeight: 1 }}>🎉</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      </div>{/* /padding wrapper */}

      {/* FAB "Solicitar" en móvil cuando hay rango seleccionado */}
      {isMobile && activeTab === 'nueva' && rangeStart && diasDisponiblesParaSolicitar > 0 && (
        <div style={{ position: 'fixed', bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)', zIndex: 60 }}>
          <button type="button" onClick={() => { setAceptoSolicitud(false); setPasswordSolicitud(''); setModalSolicitar(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: 50, cursor: 'pointer', fontWeight: 800, fontSize: '1rem', boxShadow: '0 6px 24px rgba(22,163,74,0.45)', whiteSpace: 'nowrap' }}>
            ✅ Solicitar {selectedCount} día{selectedCount !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* Modal: confirmar solicitud */}
      {modalSolicitar && (
        <div style={sheetOverlay} onClick={() => !sending && setModalSolicitar(false)} role="presentation">
          <div style={sheetContainer} onClick={(e) => e.stopPropagation()} role="dialog">
            {sheetHandle}
            <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.1rem' }}>Confirmar solicitud de vacaciones</h2>
            <dl style={{ margin: '0 0 14px', fontSize: '0.93rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Inicio', val: rangeStart ? new Date(rangeStart + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' }) : '—' },
                { label: 'Regreso', val: (rangeEnd || rangeStart) ? new Date((rangeEnd || rangeStart)! + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'long' }) : '—' },
                { label: 'Días a tomar', val: `${selectedCount} día${selectedCount !== 1 ? 's' : ''}` },
              ].map(({ label, val }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <dt style={{ color: '#666', fontWeight: 500 }}>{label}</dt>
                  <dd style={{ margin: 0, fontWeight: 700, color: label === 'Días a tomar' ? '#15803d' : '#1f2937' }}>{val}</dd>
                </div>
              ))}
              {balance && selectedCount > diasDisponiblesParaSolicitar && (
                <div style={{ marginTop: 8, padding: '10px', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: '0.88rem', fontWeight: 500 }}>
                  No puedes solicitar más de {diasDisponiblesParaSolicitar} días disponibles.
                </div>
              )}
            </dl>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.88rem' }}>Motivo (opcional)</label>
              <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Ej. vacaciones familiares"
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', resize: 'vertical', fontSize: '0.9rem', boxSizing: 'border-box' }} />
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, fontSize: '0.85rem', color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={aceptoSolicitud} onChange={(e) => setAceptoSolicitud(e.target.checked)}
                style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }} />
              <span>
                Declaro que solicito estas vacaciones de forma voluntaria, acepto las fechas indicadas y confirmo con mi contraseña.
              </span>
            </label>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.88rem' }}>Contraseña</label>
              <input
                type="password"
                value={passwordSolicitud}
                onChange={(e) => setPasswordSolicitud(e.target.value)}
                autoComplete="current-password"
                placeholder="Tu contraseña de acceso"
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => {
                if (sending) return;
                setModalSolicitar(false);
                setAceptoSolicitud(false);
                setPasswordSolicitud('');
              }}
                style={{ flex: 1, padding: '13px', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>
                Cancelar
              </button>
              <button type="button" onClick={submitDesdeModal}
                disabled={sending || !aceptoSolicitud || !passwordSolicitud.trim() || (!!balance && selectedCount > diasDisponiblesParaSolicitar)}
                style={{ flex: 2, padding: '13px', backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: 10, cursor: sending ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.95rem', opacity: (!aceptoSolicitud || !passwordSolicitud.trim() || (!!balance && selectedCount > diasDisponiblesParaSolicitar)) ? 0.6 : 1 }}>
                {sending ? 'Enviando...' : 'Confirmar solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar cancelación */}
      {modalCancelar && (
        <div onClick={() => !cancelando && setModalCancelar(null)} style={sheetOverlay}>
          <div onClick={e => e.stopPropagation()} style={sheetContainer}>
            {sheetHandle}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: '1.3rem' }}>⚠️</span>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#92400e' }}>Cancelar solicitud de vacaciones</h3>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#374151' }}>
              ¿Cancelar la solicitud del{' '}
              <strong>{new Date(modalCancelar.fecha_inicio).toLocaleDateString('es-MX', { dateStyle: 'long' })}</strong>{' '}
              al{' '}
              <strong>{new Date(modalCancelar.fecha_fin).toLocaleDateString('es-MX', { dateStyle: 'long' })}</strong>?
            </p>
            <p style={{ margin: '0 0 18px', fontSize: '0.82rem', color: '#6b7280', backgroundColor: '#f9fafb', padding: '8px 12px', borderRadius: 8 }}>
              Los <strong>{modalCancelar.dias_solicitados} días</strong> regresarán a tu saldo.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => !cancelando && setModalCancelar(null)} disabled={cancelando}
                style={{ flex: 1, padding: '13px', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 10, cursor: cancelando ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                Volver
              </button>
              <button type="button" onClick={cancelarSolicitud} disabled={cancelando}
                style={{ flex: 2, padding: '13px', backgroundColor: '#ea580c', color: 'white', border: 'none', borderRadius: 10, cursor: cancelando ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {cancelando ? 'Cancelando...' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: motivo de rechazo */}
      {modalRechazo && (
        <div onClick={() => setModalRechazo(null)} style={sheetOverlay}>
          <div onClick={e => e.stopPropagation()} style={sheetContainer}>
            {sheetHandle}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: '1.3rem' }}>❌</span>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#991b1b' }}>Solicitud rechazada</h3>
            </div>
            {modalRechazo.motivo && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motivo de la solicitud</p>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151', backgroundColor: '#f9fafb', padding: '8px 12px', borderRadius: 8 }}>{modalRechazo.motivo}</p>
              </div>
            )}
            <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comentario de rechazo</p>
            <p style={{ margin: '0 0 20px', fontSize: '0.9rem', color: '#374151', backgroundColor: '#fef2f2', padding: '10px 12px', borderRadius: 8, border: '1px solid #fecaca', minHeight: 44 }}>
              {modalRechazo.comentario || 'Sin comentarios adicionales.'}
            </p>
            <button onClick={() => setModalRechazo(null)}
              style={{ width: '100%', padding: '13px', backgroundColor: '#374151', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem' }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
