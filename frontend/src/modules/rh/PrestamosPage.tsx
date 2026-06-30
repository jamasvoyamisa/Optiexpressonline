import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { fmtNombreEmpleado } from '../../utils/format';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { generarDocumentoPrestamo } from '../prestamos/documentoPrestamo';
import {
  rhMobileBadge,
  rhMobileBtnPrimary,
  rhMobileCard,
  rhMobileCardRow,
  rhMobileCardSub,
  rhMobileCardTitle,
  rhMobileFilterStack,
  rhMobileInput,
} from './rhMobileStyles';

interface Empleado {
  id: number;
  numero_empleado: string;
  nombre: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  empresa?: { id: number; nombre: string } | null;
  departamento?: { id: number; nombre: string; empresa_id?: number } | null;
}

interface SolicitudPrestamo {
  id: number;
  numero_solicitud?: string | null;
  empleado_id: number;
  monto: string;
  plazo_meses: number;
  motivo?: string | null;
  descuento_quincenal?: string | null;
  /** Saldo pendiente de liquidar (solo préstamos ya depositados; lo calcula el servidor). */
  saldo_restante?: string | number | null;
  estado: string;
  aprobado_por_id?: number | null;
  fecha_aprobacion?: string | null;
  comentarios_aprobacion?: string | null;
  referencia_bancaria?: string | null;
  fecha_deposito?: string | null;
  /** RH confirmó registro en nómina (post-depósito) */
  fecha_confirmacion_rh?: string | null;
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
  aprobada_departamento: 'Autorizada por departamento',
  depositado: 'Depositado',
  finalizado: 'Finalizado',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
};

const ESTADO_STYLE: Record<string, { bg: string; color: string }> = {
  pendiente: { bg: '#fef3c7', color: '#92400e' },
  aprobada_departamento: { bg: '#e0f2fe', color: '#0369a1' },
  depositado: { bg: '#d1fae5', color: '#065f46' },
  finalizado: { bg: '#ecfdf5', color: '#047857' },
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

const PRESTAMO_MAX_MONTO = 6000;
const PRESTAMO_MAX_QUINCENAS = 8;
const ESTADOS_PRESTAMO_ACTIVO = ['pendiente', 'aprobada_departamento', 'depositado'];

const emptyForm = {
  empleado_id: '',
  monto: '',
  plazo_meses: '4',
  motivo: '',
  es_excepcion: false,
};

const calcularDescuentoQuincenal = (monto: number, plazo: number) => {
  if (plazo <= 0 || isNaN(monto) || monto <= 0) return null;
  return Math.round((monto / plazo) * 100) / 100;
};

const formatMonto = (v: string | number) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
};

const prestamoEstaLiquidado = (sol: SolicitudPrestamo): boolean => {
  if (sol.estado === 'finalizado') return true;
  if (sol.estado !== 'depositado') return false;
  if (sol.saldo_restante == null || sol.saldo_restante === '') return false;
  const n = typeof sol.saldo_restante === 'string' ? parseFloat(sol.saldo_restante) : sol.saldo_restante;
  return !isNaN(n) && n <= 0;
};

/** Saldo por pagar vía nómina; si ya está pagado muestra «Finalizado». */
const formatSaldoPrestamo = (sol: SolicitudPrestamo) => {
  if (prestamoEstaLiquidado(sol)) return 'Finalizado';
  if (sol.estado !== 'depositado') return '—';
  if (sol.saldo_restante == null || sol.saldo_restante === '') return '—';
  const n = typeof sol.saldo_restante === 'string' ? parseFloat(sol.saldo_restante) : sol.saldo_restante;
  if (isNaN(n)) return '—';
  return formatMonto(n);
};

const nombreEmpleado = (e?: Empleado | null) => {
  if (!e) return '—';
  return fmtNombreEmpleado(e);
};

function dividirNumeroSolicitud(numero: string): { linea1: string; linea2: string } {
  const f = numero.trim();
  if (!f) return { linea1: '—', linea2: '' };
  const lastDash = f.lastIndexOf('-');
  if (lastDash > 0 && lastDash < f.length - 1) {
    return { linea1: f.slice(0, lastDash), linea2: f.slice(lastDash + 1) };
  }
  return { linea1: f, linea2: '' };
}

function NumeroSolicitudCelda({ numero }: { numero: string }) {
  const { linea1, linea2 } = dividirNumeroSolicitud(numero);
  return (
    <div style={{ lineHeight: 1.25 }}>
      <div style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>
        {linea1}
      </div>
      {linea2 ? (
        <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>
          {linea2}
        </div>
      ) : null}
    </div>
  );
}

export const PrestamosPage = ({ embeddedRh = false }: { embeddedRh?: boolean } = {}) => {
  const isMobile = useIsMobile();
  const compactRh = embeddedRh && isMobile;
  const { authMe } = useAuth();
  /** Vista completa del módulo (listados, alta RH): admin, RH o Director */
  const isRH = authMe?.is_superuser === true || authMe?.is_rh === true || authMe?.is_director === true;
  /** Confirmación en nómina: solo RH o admin (no Director) */
  const puedeConfirmarNominaRH = authMe?.is_superuser === true || authMe?.is_rh === true;

  const [solicitudes, setSolicitudes] = useState<SolicitudPrestamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [modalAprobar, setModalAprobar] = useState<SolicitudPrestamo | null>(null);
  const [modalDepositar, setModalDepositar] = useState<SolicitudPrestamo | null>(null);
  const [aprobando, setAprobando] = useState(false);
  const [depositando, setDepositando] = useState(false);
  const [comentariosAprobacion, setComentariosAprobacion] = useState('');
  const [referenciaDeposito, setReferenciaDeposito] = useState('');
  const [modalConfirmarRH, setModalConfirmarRH] = useState<SolicitudPrestamo | null>(null);
  const [comentariosConfirmarRH, setComentariosConfirmarRH] = useState('');
  const [confirmandoRH, setConfirmandoRH] = useState(false);

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [deptosPorEmpresa, setDeptosPorEmpresa] = useState<Departamento[]>([]);
  const [empleadosPorDepto, setEmpleadosPorDepto] = useState<Empleado[]>([]);
  const [formEmpresaId, setFormEmpresaId] = useState('');
  const [formDeptoId, setFormDeptoId] = useState('');
  const [loadingDeptos, setLoadingDeptos] = useState(false);
  const [loadingEmps, setLoadingEmps] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroDepto, setFiltroDepto] = useState('');
  const [deptosFiltro, setDeptosFiltro] = useState<Departamento[]>([]);
  const [empleadosMetaMap, setEmpleadosMetaMap] = useState<Record<number, Empleado>>({});
  const [loadError, setLoadError] = useState('');
  const [empleadoTienePrestamoActivo, setEmpleadoTienePrestamoActivo] = useState(false);
  const [verificandoPrestamosEmpleado, setVerificandoPrestamosEmpleado] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      if (isRH) params.set('limit', '500');
      else params.set('empleado_id', String(authMe?.id ?? ''));
      const res = await api.get<SolicitudPrestamo[]>(`/prestamos?${params}`);
      setSolicitudes(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      setSolicitudes([]);
      const msg = e?.response?.data?.detail || e?.message || 'Error al cargar préstamos';
      setLoadError(String(msg));
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

  // Catálogo para filtrar préstamos por empresa/departamento del empleado.
  useEffect(() => {
    api.get<Empleado[]>('/personal/empleados?limit=1000')
      .then(res => {
        const list = Array.isArray(res.data) ? res.data : [];
        const map: Record<number, Empleado> = {};
        list.forEach(e => { map[e.id] = e; });
        setEmpleadosMetaMap(map);
      })
      .catch(() => setEmpleadosMetaMap({}));
  }, []);

  useEffect(() => {
    setFiltroDepto('');
    setDeptosFiltro([]);
    if (!filtroEmpresa) return;
    api.get<Departamento[]>(`/personal/departamentos?empresa_id=${filtroEmpresa}&limit=200`)
      .then(res => setDeptosFiltro(Array.isArray(res.data) ? res.data : []))
      .catch(() => setDeptosFiltro([]));
  }, [filtroEmpresa]);

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

  useEffect(() => {
    if (!showModal || !isRH || !form.empleado_id) {
      setEmpleadoTienePrestamoActivo(false);
      return;
    }
    const id = Number(form.empleado_id);
    if (Number.isNaN(id)) return;
    setVerificandoPrestamosEmpleado(true);
    api
      .get<SolicitudPrestamo[]>(`prestamos?empleado_id=${id}&limit=100`)
      .then(res => {
        const list = Array.isArray(res.data) ? res.data : [];
        setEmpleadoTienePrestamoActivo(list.some(s => ESTADOS_PRESTAMO_ACTIVO.includes(s.estado)));
      })
      .catch(() => setEmpleadoTienePrestamoActivo(false))
      .finally(() => setVerificandoPrestamosEmpleado(false));
  }, [showModal, isRH, form.empleado_id]);

  const abrirNueva = () => {
    setForm(emptyForm);
    setFormEmpresaId('');
    setFormDeptoId('');
    setDeptosPorEmpresa([]);
    setEmpleadosPorDepto([]);
    setError('');
    setShowModal(true);
  };

  const puedeExcepcionPolitica = !!(authMe?.is_superuser || authMe?.is_director || authMe?.is_gerente_general);

  const guardar = async () => {
    if (!form.empleado_id) { setError('Selecciona un empleado'); return; }
    if (empleadoTienePrestamoActivo) {
      setError('Este empleado ya tiene un préstamo o solicitud activa. No se puede registrar otra hasta finalizar o cancelar la actual.');
      return;
    }
    const monto = parseFloat(form.monto);
    const plazo = parseInt(form.plazo_meses, 10);
    if (isNaN(monto) || monto <= 0) { setError('Monto debe ser mayor a cero'); return; }
    if (isNaN(plazo) || plazo < 1) { setError('Plazo debe ser al menos 1 quincena'); return; }
    const permitirExceder = puedeExcepcionPolitica && form.es_excepcion;
    if (!permitirExceder) {
      if (monto > PRESTAMO_MAX_MONTO) {
        setError(`El monto máximo es ${PRESTAMO_MAX_MONTO.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}. Para montos mayores, marque «Excepción» (solo Gerente General, Director o Administrador).`);
        return;
      }
      if (plazo > PRESTAMO_MAX_QUINCENAS) {
        setError(`El plazo máximo es ${PRESTAMO_MAX_QUINCENAS} quincenas. Use excepción si aplica.`);
        return;
      }
    }
    setGuardando(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        empleado_id: Number(form.empleado_id),
        monto,
        plazo_meses: plazo,
        motivo: form.motivo.trim() || null,
      };
      if (permitirExceder) payload.es_excepcion = true;
      await api.post('prestamos/rh', payload);
      setShowModal(false);
      cargar();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const puedeDepositarGG =
    authMe?.is_superuser === true || authMe?.is_director === true || authMe?.is_gerente_general === true;
  const puedeAutorizarDepto =
    authMe?.is_jefe === true ||
    authMe?.puede_ver_mi_area === true ||
    (authMe?.departamentos_que_administro?.length ?? 0) > 0;

  const aprobarRechazar = async (sol: SolicitudPrestamo, aprobado: boolean) => {
    setAprobando(true);
    try {
      await api.post(`prestamos/${sol.id}/aprobar-departamento`, { aprobado, comentarios: comentariosAprobacion || null });
      setModalAprobar(null);
      setComentariosAprobacion('');
      cargar();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error al procesar');
    } finally {
      setAprobando(false);
    }
  };

  const confirmarDeposito = async (sol: SolicitudPrestamo) => {
    const ref = referenciaDeposito.trim();
    if (ref.length < 3) {
      alert('Ingresa la referencia bancaria (mínimo 3 caracteres).');
      return;
    }
    setDepositando(true);
    try {
      await api.post(`prestamos/${sol.id}/depositar`, {
        referencia_bancaria: ref,
        comentarios: comentariosAprobacion.trim() || null,
      });
      setModalDepositar(null);
      setReferenciaDeposito('');
      setComentariosAprobacion('');
      cargar();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error al registrar depósito');
    } finally {
      setDepositando(false);
    }
  };

  const ejecutarConfirmarRH = async (sol: SolicitudPrestamo) => {
    setConfirmandoRH(true);
    try {
      await api.put(`prestamos/${sol.id}/confirmar-rh`, { comentarios: comentariosConfirmarRH.trim() || null });
      setModalConfirmarRH(null);
      setComentariosConfirmarRH('');
      cargar();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Error al confirmar en RH');
    } finally {
      setConfirmandoRH(false);
    }
  };

  const filtradas = solicitudes.filter(sol => {
    if (filtroEstado && sol.estado !== filtroEstado) return false;
    const empMeta = sol.empleado ?? empleadosMetaMap[sol.empleado_id];
    if (filtroEmpresa) {
      const empEmpresaId = empMeta?.empresa?.id;
      if (!empEmpresaId || String(empEmpresaId) !== filtroEmpresa) return false;
    }
    if (filtroDepto) {
      const empDeptoId = empMeta?.departamento?.id;
      if (!empDeptoId || String(empDeptoId) !== filtroDepto) return false;
    }
    if (busqueda) {
      const b = busqueda.toLowerCase();
      const nombre = nombreEmpleado(sol.empleado).toLowerCase();
      const num = sol.empleado?.numero_empleado?.toLowerCase() ?? '';
      if (!nombre.includes(b) && !num.includes(b)) return false;
    }
    return true;
  });

  return (
    <div style={{ padding: compactRh ? 0 : isMobile ? '12px' : '24px' }}>
      {!compactRh && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? '1.2rem' : '1.4rem' }}>Solicitudes de préstamos</h1>
          {isRH && !isMobile && (
            <button
              onClick={abrirNueva}
              style={{ padding: '9px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap' }}
            >
              + Registrar solicitud (RH)
            </button>
          )}
        </div>
      )}

      {isRH && isMobile && (
        <button type="button" onClick={abrirNueva} style={{ ...rhMobileBtnPrimary, marginBottom: 12, backgroundColor: '#28a745' }}>
          + Registrar solicitud (RH)
        </button>
      )}

      {isMobile ? (
        <div style={rhMobileFilterStack}>
          <input type="text" placeholder="Buscar empleado o No..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={rhMobileInput} />
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={rhMobileInput}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)} style={rhMobileInput}>
            <option value="">Empresa</option>
            {empresas.map(e => <option key={e.id} value={String(e.id)}>{e.nombre}</option>)}
          </select>
          <select value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)} disabled={!filtroEmpresa} style={rhMobileInput}>
            <option value="">Departamento</option>
            {deptosFiltro.map(d => <option key={d.id} value={String(d.id)}>{d.nombre}</option>)}
          </select>
        </div>
      ) : (
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
          <option value="aprobada_departamento">Autorizada por departamento</option>
          <option value="depositado">Depositado</option>
          <option value="finalizado">Finalizado</option>
          <option value="rechazada">Rechazada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)} style={{ ...filterControlStyle, width: 220 }}>
          <option value="">Todas las empresas</option>
          {empresas.map(e => <option key={e.id} value={String(e.id)}>{e.nombre}</option>)}
        </select>
        <select
          value={filtroDepto}
          onChange={e => setFiltroDepto(e.target.value)}
          disabled={!filtroEmpresa}
          style={{ ...filterControlStyle, width: 220, backgroundColor: !filtroEmpresa ? '#f9fafb' : 'white' }}
        >
          <option value="">Todos los departamentos</option>
          {deptosFiltro.map(d => <option key={d.id} value={String(d.id)}>{d.nombre}</option>)}
        </select>
        {(busqueda || filtroEstado || filtroEmpresa || filtroDepto) && (
          <button onClick={() => { setBusqueda(''); setFiltroEstado(''); setFiltroEmpresa(''); setFiltroDepto(''); }}
            style={{ padding: '7px 12px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
            ✕ Limpiar
          </button>
        )}
      </div>
      )}

      {loadError && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '0.88rem', marginBottom: '16px' }}>
          <strong>Error al cargar:</strong> {loadError}
          <button onClick={cargar} style={{ marginLeft: 12, padding: '3px 10px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>Reintentar</button>
        </div>
      )}
      {loading ? (
        <p style={{ color: '#666' }}>Cargando...</p>
      ) : filtradas.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', color: '#9ca3af' }}>
          {solicitudes.length === 0
            ? 'No hay solicitudes de préstamo registradas.'
            : 'No se encontraron solicitudes con los filtros aplicados.'}
        </div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtradas.map(sol => {
            const estadoStyle = ESTADO_STYLE[sol.estado] ?? ESTADO_STYLE.pendiente;
            const empMeta = sol.empleado ?? empleadosMetaMap[sol.empleado_id];
            return (
              <div key={sol.id} style={rhMobileCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div>
                    <div style={rhMobileCardTitle}>{nombreEmpleado(sol.empleado)}</div>
                    <div style={rhMobileCardSub}>No. {sol.empleado?.numero_empleado ?? '—'}</div>
                  </div>
                  <span style={rhMobileBadge(estadoStyle.bg, estadoStyle.color)}>{ESTADO_LABEL[sol.estado] ?? sol.estado}</span>
                </div>
                <div style={{ ...rhMobileCardRow, fontWeight: 700, color: '#0f172a', marginTop: 10 }}>
                  <span>{formatMonto(sol.monto)}</span>
                  <span>{sol.plazo_meses} quincenas</span>
                </div>
                <div style={rhMobileCardRow}>
                  <span>Desc./q: {sol.descuento_quincenal ? formatMonto(sol.descuento_quincenal) : '—'}</span>
                  <span>Saldo: {formatSaldoPrestamo(sol)}</span>
                </div>
                <div style={{ ...rhMobileCardSub, marginTop: 6 }}>{empMeta?.departamento?.nombre || '—'}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>No. solicitud</th>
                <th style={th}>Empleado</th>
                <th style={th}>Empresa</th>
                <th style={th}>Departamento</th>
                <th style={{ ...th, textAlign: 'right' }}>Monto</th>
                <th style={{ ...th, textAlign: 'center' }}>Plazo</th>
                <th style={{ ...th, textAlign: 'right' }}>Descuento/q</th>
                <th
                  style={{ ...th, textAlign: 'right' }}
                  title="Capital pendiente por liquidar (préstamos depositados; estimación por quincenas calendario)"
                >
                  Saldo
                </th>
                <th style={th}>Motivo</th>
                <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                <th style={th}>Ref. bancaria</th>
                <th style={{ ...th, textAlign: 'center' }}>RH nómina</th>
                <th style={th}>Fecha solicitud</th>
                {(isRH || puedeDepositarGG || puedeAutorizarDepto) && <th style={{ ...th, textAlign: 'center' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(sol => {
                const estadoStyle = ESTADO_STYLE[sol.estado] ?? ESTADO_STYLE.pendiente;
                const empMeta = sol.empleado ?? empleadosMetaMap[sol.empleado_id];
                return (
                  <tr key={sol.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={td}>
                      <NumeroSolicitudCelda numero={sol.numero_solicitud ?? `#${sol.id}`} />
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{nombreEmpleado(sol.empleado)}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>No. {sol.empleado?.numero_empleado ?? '—'}</div>
                    </td>
                    <td style={{ ...td, fontSize: '0.82rem', color: '#475569' }}>
                      {empMeta?.empresa?.nombre || '—'}
                    </td>
                    <td style={{ ...td, fontSize: '0.82rem', color: '#475569' }}>
                      {empMeta?.departamento?.nombre || '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatMonto(sol.monto)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{sol.plazo_meses} quincenas</td>
                    <td style={{ ...td, textAlign: 'right', color: '#0369a1' }}>{sol.descuento_quincenal ? formatMonto(sol.descuento_quincenal) : '—'}</td>
                    <td style={{
                      ...td,
                      textAlign: 'right',
                      fontWeight: 600,
                      color: prestamoEstaLiquidado(sol) ? '#047857' : sol.estado === 'depositado' ? '#0f766e' : '#9ca3af',
                    }}>
                      {formatSaldoPrestamo(sol)}
                    </td>
                    <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sol.motivo ?? ''}>
                      {sol.motivo || '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ backgroundColor: estadoStyle.bg, color: estadoStyle.color, borderRadius: 5, padding: '3px 9px', fontSize: '0.78rem', fontWeight: 600 }}>
                        {ESTADO_LABEL[sol.estado] ?? sol.estado}
                      </span>
                    </td>
                    <td style={{ ...td, fontSize: '0.8rem', fontFamily: 'monospace' }}>
                      {sol.referencia_bancaria || '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontSize: '0.78rem' }}>
                      {sol.estado === 'depositado' ? (
                        sol.fecha_confirmacion_rh ? (
                          <span style={{ color: '#065f46', fontWeight: 600 }}>✓ {new Date(sol.fecha_confirmacion_rh).toLocaleDateString('es-MX')}</span>
                        ) : (
                          <span style={{ color: '#b45309', fontWeight: 600 }}>Pendiente</span>
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={td}>{new Date(sol.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    {(isRH || puedeDepositarGG || puedeAutorizarDepto) && (
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
                                  const res = await api.get(`/personal/empleados/${sol.empleado_id}`);
                                  generarDocumentoPrestamo(sol, res.data, w);
                                } catch (err: any) {
                                  const fallbackEmp = sol.empleado ?? null;
                                  if (!fallbackEmp) {
                                    w.document.open();
                                    w.document.write('<html><body style="font-family:system-ui;padding:40px;color:#dc2626"><h2>Error al cargar el documento</h2><p>No se pudo obtener la información del empleado. Verifica que el servidor esté en línea e intenta de nuevo.</p><button onclick="window.close()">Cerrar</button></body></html>');
                                    w.document.close();
                                    return;
                                  }
                                  generarDocumentoPrestamo(sol, fallbackEmp, w);
                                }
                              })();
                            }}
                            style={{ padding: '4px 10px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                          >
                            Ver documento
                          </button>
                          {sol.estado === 'pendiente' && puedeAutorizarDepto && (
                            <button
                              type="button"
                              onClick={() => setModalAprobar(sol)}
                              style={{ padding: '4px 10px', backgroundColor: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                            >
                              Autorizar / Rechazar
                            </button>
                          )}
                          {sol.estado === 'aprobada_departamento' && puedeDepositarGG && (
                            <button
                              type="button"
                              onClick={() => {
                                setModalDepositar(sol);
                                setReferenciaDeposito('');
                                setComentariosAprobacion('');
                              }}
                              style={{ padding: '4px 10px', backgroundColor: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                            >
                              Registrar depósito
                            </button>
                          )}
                          {sol.estado === 'depositado' && puedeConfirmarNominaRH && !sol.fecha_confirmacion_rh && (
                            <button
                              type="button"
                              onClick={() => {
                                setModalConfirmarRH(sol);
                                setComentariosConfirmarRH('');
                              }}
                              style={{ padding: '4px 10px', backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                            >
                              Confirmar RH
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
            <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.45 }}>
              Política estándar: hasta <strong>{PRESTAMO_MAX_MONTO.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</strong> y{' '}
              <strong>{PRESTAMO_MAX_QUINCENAS} quincenas</strong>. Gerente General, Director o Administrador pueden marcar una excepción para montos o plazos mayores.
            </p>
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
                {verificandoPrestamosEmpleado && form.empleado_id && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>Comprobando préstamos del empleado…</p>
                )}
                {!verificandoPrestamosEmpleado && empleadoTienePrestamoActivo && (
                  <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#b45309', fontWeight: 600 }}>
                    Este empleado ya tiene una solicitud o préstamo activo. No puede haber más de uno a la vez.
                  </p>
                )}
              </div>
              {puedeExcepcionPolitica && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: '#92400e' }}>
                  <input
                    type="checkbox"
                    checked={form.es_excepcion}
                    onChange={e => setForm(f => ({ ...f, es_excepcion: e.target.checked }))}
                  />
                  Excepción a la política (montos o plazos mayores a lo estándar)
                </label>
              )}
              {form.es_excepcion && puedeExcepcionPolitica && (
                <div style={{ padding: '10px 12px', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, fontSize: '0.82rem', color: '#92400e' }}>
                  Esta solicitud superará los límites habituales. Use solo en situaciones especiales autorizadas.
                </div>
              )}
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Monto (MXN) *</label>
                <input
                  type="number"
                  min="0.01"
                  max={form.es_excepcion && puedeExcepcionPolitica ? undefined : PRESTAMO_MAX_MONTO}
                  step="0.01"
                  value={form.monto}
                  onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                  style={inputStyle}
                  placeholder={form.es_excepcion && puedeExcepcionPolitica ? 'Monto' : `Hasta ${PRESTAMO_MAX_MONTO.toLocaleString('es-MX')}`}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Plazo (quincenas) *</label>
                <input
                  type="number"
                  min={1}
                  max={form.es_excepcion && puedeExcepcionPolitica ? undefined : PRESTAMO_MAX_QUINCENAS}
                  value={form.plazo_meses}
                  onChange={e => setForm(f => ({ ...f, plazo_meses: e.target.value }))}
                  style={inputStyle}
                />
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginTop: 4 }}>
                  {(parseInt(form.plazo_meses, 10) || 0) || '—'} quincenas de descuento
                </span>
              </div>
              {(() => {
                const plazo = parseInt(form.plazo_meses, 10) || 0;
                const desc = calcularDescuentoQuincenal(parseFloat(form.monto) || 0, plazo);
                const quincenas = plazo;
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
              <button
                onClick={guardar}
                disabled={guardando || empleadoTienePrestamoActivo || verificandoPrestamosEmpleado}
                style={{
                  padding: '9px 18px',
                  backgroundColor: guardando || empleadoTienePrestamoActivo || verificandoPrestamosEmpleado ? '#94a3b8' : '#0ea5e9',
                  color: 'white',
                  border: 'none',
                  borderRadius: 7,
                  cursor: guardando || empleadoTienePrestamoActivo || verificandoPrestamosEmpleado ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                }}
              >
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
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
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700 }}>Autorizar préstamo (departamento)</h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#555' }}>
              Solicitud de {nombreEmpleado(modalAprobar.empleado)} — {formatMonto(modalAprobar.monto)} a {modalAprobar.plazo_meses} quincenas
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
              <button onClick={() => aprobarRechazar(modalAprobar, true)} disabled={aprobando} style={{ padding: '9px 18px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: 7, cursor: aprobando ? 'not-allowed' : 'pointer', fontWeight: 600 }}>Autorizar</button>
            </div>
          </div>
        </div>
      )}

      {modalConfirmarRH && (
        <div
          onClick={() => !confirmandoRH && setModalConfirmarRH(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: 12, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700 }}>Confirmar en RH (nómina)</h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#555' }}>
              Préstamo de {nombreEmpleado(modalConfirmarRH.empleado)} — {formatMonto(modalConfirmarRH.monto)} · Ref. {modalConfirmarRH.referencia_bancaria || '—'}
            </p>
            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#6b7280' }}>
              El empleado recibirá una notificación de que RH confirmó el registro en nómina.
            </p>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Comentarios (opcional)</label>
              <textarea value={comentariosConfirmarRH} onChange={e => setComentariosConfirmarRH(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="Opcional" rows={2} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !confirmandoRH && setModalConfirmarRH(null)} style={{ padding: '9px 18px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button type="button" onClick={() => ejecutarConfirmarRH(modalConfirmarRH)} disabled={confirmandoRH} style={{ padding: '9px 18px', backgroundColor: '#d97706', color: 'white', border: 'none', borderRadius: 7, cursor: confirmandoRH ? 'not-allowed' : 'pointer', fontWeight: 600 }}>{confirmandoRH ? '...' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}

      {modalDepositar && (
        <div
          onClick={() => !depositando && setModalDepositar(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: 12, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700 }}>Registrar depósito</h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#555' }}>
              Solicitud de {nombreEmpleado(modalDepositar.empleado)} — {formatMonto(modalDepositar.monto)} a {modalDepositar.plazo_meses} quincenas
              {modalDepositar.descuento_quincenal && (
                <span style={{ display: 'block', marginTop: 4, color: '#0369a1' }}>Descuento quincenal: {formatMonto(modalDepositar.descuento_quincenal)}</span>
              )}
            </p>
            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#6b7280' }}>Ingresa la referencia bancaria del depósito.</p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Referencia bancaria *</label>
              <input
                type="text"
                value={referenciaDeposito}
                onChange={e => setReferenciaDeposito(e.target.value)}
                style={inputStyle}
                placeholder="Folio o referencia"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Comentarios (opcional)</label>
              <textarea value={comentariosAprobacion} onChange={e => setComentariosAprobacion(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="Comentario opcional" rows={2} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !depositando && setModalDepositar(null)} style={{ padding: '9px 18px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button type="button" onClick={() => confirmarDeposito(modalDepositar)} disabled={depositando} style={{ padding: '9px 18px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: 7, cursor: depositando ? 'not-allowed' : 'pointer', fontWeight: 600 }}>{depositando ? '...' : 'Confirmar depósito'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
