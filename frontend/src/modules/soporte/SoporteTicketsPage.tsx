import { useEffect, useMemo, useState, useCallback } from 'react';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { descargarArchivo } from '../../utils/download';
import {
  abrirWhatsAppConMensaje,
  mensajeTicketSoporteWhatsapp,
  normalizarTelefonoWhatsAppMexico,
} from '../../utils/whatsapp';

type TicketEstado = 'abierto' | 'en_proceso' | 'resuelto' | 'cerrado';
type TicketPrioridad = 'baja' | 'media' | 'alta' | 'critica';

type Ticket = {
  id: number;
  folio: string;
  estado: TicketEstado;
  prioridad: TicketPrioridad;
  titulo: string;
  descripcion: string;
  nombre_solicitante: string;
  /** Prioridad: tel. asignado por la empresa (Personal → datos laborales); si no, tel. personal del empleado. */
  telefono_solicitante?: string | null;
  empresa_nombre?: string | null;
  departamento_nombre?: string | null;
  tipo_ticket_nombre?: string | null;
  adjuntos_count?: number;
  created_at: string;
  closed_at?: string | null;
  motivo_cierre?: string | null;
  nota_resolucion?: string | null;
};

type Adjunto = {
  id: number;
  ticket_id: number;
  nombre_original: string;
  mime_type?: string | null;
  tamano_bytes: number;
  created_at: string;
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 760,
  maxHeight: '90vh',
  overflowY: 'auto',
  background: '#fff',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  boxShadow: '0 20px 44px rgba(0,0,0,.25)',
  padding: 18,
};

const filtroSelectStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  padding: '0 12px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: '0.9rem',
  boxSizing: 'border-box',
  backgroundColor: '#fff',
};

const sectionCard: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  background: '#f8fafc',
  padding: 12,
};

const FILAS_POR_PAGINA = 25;

function dividirFolio(folio: string): { linea1: string; linea2: string } {
  const f = folio.trim();
  if (!f) return { linea1: '—', linea2: '' };
  const lastDash = f.lastIndexOf('-');
  if (lastDash > 0 && lastDash < f.length - 1) {
    return { linea1: f.slice(0, lastDash), linea2: f.slice(lastDash + 1) };
  }
  return { linea1: f, linea2: '' };
}

function FolioCelda({ folio }: { folio: string }) {
  const { linea1, linea2 } = dividirFolio(folio);
  return (
    <div style={{ lineHeight: 1.25 }}>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 10,
          fontWeight: 600,
          color: '#475569',
          whiteSpace: 'nowrap',
        }}
      >
        {linea1}
      </div>
      {linea2 ? (
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 10,
            color: '#64748b',
            whiteSpace: 'nowrap',
          }}
        >
          {linea2}
        </div>
      ) : null}
    </div>
  );
}

function dividirNombreSolicitante(nombre: string): { linea1: string; linea2: string } {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { linea1: '—', linea2: '' };
  if (partes.length === 1) return { linea1: partes[0], linea2: '' };
  return { linea1: partes[0], linea2: partes.slice(1).join(' ') };
}

function SolicitanteCelda({ nombre, maxWidth = 140 }: { nombre: string; maxWidth?: number }) {
  const { linea1, linea2 } = dividirNombreSolicitante(nombre);
  return (
    <div style={{ maxWidth, lineHeight: 1.25 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#334155',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {linea1}
      </div>
      {linea2 ? (
        <div
          style={{
            fontSize: 10,
            color: '#64748b',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {linea2}
        </div>
      ) : null}
    </div>
  );
}

function TituloCelda({
  titulo,
  descripcion,
  maxWidth = 280,
  descripcionLineas = 1,
}: {
  titulo: string;
  descripcion: string;
  maxWidth?: number;
  /** 1 = una línea con ellipsis; 2 = hasta dos líneas (tarjetas móviles). */
  descripcionLineas?: 1 | 2;
}) {
  return (
    <div style={{ maxWidth, lineHeight: 1.25 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#334155',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {titulo || '—'}
      </div>
      <div
        style={{
          fontSize: 10,
          color: '#64748b',
          marginTop: 2,
          overflow: 'hidden',
          ...(descripcionLineas === 2
            ? {
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as const,
              }
            : {
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }),
        }}
      >
        {descripcion || '—'}
      </div>
    </div>
  );
}

function EmpresaDeptoCelda({
  empresa,
  depto,
  maxWidth = 160,
}: {
  empresa?: string | null;
  depto?: string | null;
  maxWidth?: number;
}) {
  const emp = (empresa || '').trim() || '—';
  const dep = (depto || '').trim();
  return (
    <div style={{ maxWidth }}>
      <div style={{ fontWeight: 600 }}>{emp}</div>
      <div
        style={{
          fontSize: 12,
          color: '#64748b',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {dep || '—'}
      </div>
    </div>
  );
}

function PaginacionTickets({
  inicio,
  total,
  paginaSegura,
  totalPaginas,
  onAnterior,
  onSiguiente,
}: {
  inicio: number;
  total: number;
  paginaSegura: number;
  totalPaginas: number;
  onAnterior: () => void;
  onSiguiente: () => void;
}) {
  if (total <= FILAS_POR_PAGINA) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '12px', padding: '0 4px' }}>
      <span style={{ color: '#555', fontSize: '0.9rem' }}>
        Mostrando {inicio + 1}–{Math.min(inicio + FILAS_POR_PAGINA, total)} de {total} tickets
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          disabled={paginaSegura <= 1}
          onClick={onAnterior}
          style={{
            padding: '6px 14px',
            border: '1px solid #ccc',
            borderRadius: '6px',
            background: paginaSegura <= 1 ? '#f5f5f5' : 'white',
            cursor: paginaSegura <= 1 ? 'not-allowed' : 'pointer',
          }}
        >
          Anterior
        </button>
        <span style={{ color: '#333', fontSize: '0.9rem' }}>Página {paginaSegura} de {totalPaginas}</span>
        <button
          type="button"
          disabled={paginaSegura >= totalPaginas}
          onClick={onSiguiente}
          style={{
            padding: '6px 14px',
            border: '1px solid #ccc',
            borderRadius: '6px',
            background: paginaSegura >= totalPaginas ? '#f5f5f5' : 'white',
            cursor: paginaSegura >= totalPaginas ? 'not-allowed' : 'pointer',
          }}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

export const SoporteTicketsPage = () => {
  const isMobile = useIsMobile();
  const { authMe } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [ticketDetalle, setTicketDetalle] = useState<Ticket | null>(null);
  const [detalleAdjuntos, setDetalleAdjuntos] = useState<Adjunto[]>([]);
  const [showDetalle, setShowDetalle] = useState(false);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [showCierreModal, setShowCierreModal] = useState(false);
  const [cierreMotivo, setCierreMotivo] = useState('');
  const [cierreObservaciones, setCierreObservaciones] = useState('');
  const [cierreNextEstado, setCierreNextEstado] = useState<TicketEstado | null>(null);
  const [cierreTicket, setCierreTicket] = useState<Ticket | null>(null);
  const [showNuevoModal, setShowNuevoModal] = useState(false);
  const [loadingCatalogoInterno, setLoadingCatalogoInterno] = useState(false);
  const [loadingEmpleadosInterno, setLoadingEmpleadosInterno] = useState(false);
  const [catalogoInterno, setCatalogoInterno] = useState<{
    empresas: { id: number; nombre: string }[];
    clases: { id: number; nombre: string }[];
    tipos: { id: number; nombre: string; clase_id?: number | null }[];
  } | null>(null);
  const [empleadosInterno, setEmpleadosInterno] = useState<{ id: number; nombre_completo: string }[]>([]);
  const [nuevoEmpresaId, setNuevoEmpresaId] = useState('');
  const [nuevoEmpleadoId, setNuevoEmpleadoId] = useState('');
  const [nuevoClaseId, setNuevoClaseId] = useState('');
  const [nuevoTipoId, setNuevoTipoId] = useState('');
  const [nuevoTitulo, setNuevoTitulo] = useState('');
  const [nuevoDescripcion, setNuevoDescripcion] = useState('');
  const [nuevoPrioridad, setNuevoPrioridad] = useState<TicketPrioridad>('media');
  const [nuevoArchivos, setNuevoArchivos] = useState<File[]>([]);
  const [creandoTicket, setCreandoTicket] = useState(false);
  const [errorModalNuevo, setErrorModalNuevo] = useState('');
  const [pagina, setPagina] = useState(1);

  const cargar = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroEstado) params.set('estado', filtroEstado);
      if (filtroPrioridad) params.set('prioridad', filtroPrioridad);
      const res = await api.get(`/soporte/tickets${params.toString() ? `?${params.toString()}` : ''}`);
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      if (filtroTipo) {
        const ft = filtroTipo.toLowerCase();
        setTickets(items.filter((t: Ticket) => (t.tipo_ticket_nombre || '').toLowerCase() === ft));
      } else {
        setTickets(items);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [filtroEstado, filtroPrioridad, filtroTipo]);

  useEffect(() => {
    setPagina(1);
  }, [filtroEstado, filtroPrioridad, filtroTipo]);

  const totalPaginas = Math.max(1, Math.ceil(tickets.length / FILAS_POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * FILAS_POR_PAGINA;
  const ticketsPagina = useMemo(
    () => tickets.slice(inicio, inicio + FILAS_POR_PAGINA),
    [tickets, inicio],
  );

  useEffect(() => {
    setPagina((p) => Math.min(p, totalPaginas));
  }, [totalPaginas]);

  const estiloPrioridad = (p: TicketPrioridad): React.CSSProperties => {
    const m: Record<TicketPrioridad, { bg: string; c: string; label: string }> = {
      baja: { bg: '#dcfce7', c: '#166534', label: 'Baja' },
      media: { bg: '#fef3c7', c: '#92400e', label: 'Media' },
      alta: { bg: '#ffedd5', c: '#c2410c', label: 'Alta' },
      critica: { bg: '#fee2e2', c: '#b91c1c', label: 'Crítica' },
    };
    const it = m[p];
    return {
      backgroundColor: it.bg,
      color: it.c,
      borderRadius: 999,
      padding: '3px 10px',
      fontWeight: 700,
      fontSize: 12,
      display: 'inline-block',
      textTransform: 'none',
    };
  };

  const tiposUnicos = Array.from(new Set(tickets.map((t) => (t.tipo_ticket_nombre || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const estadoLabel = (e: TicketEstado) => {
    const map: Record<TicketEstado, string> = {
      abierto: 'Abierto',
      en_proceso: 'En proceso',
      resuelto: 'Resuelto',
      cerrado: 'Cerrado',
    };
    return map[e];
  };

  const estadoBadgeStyle = (e: TicketEstado): React.CSSProperties => {
    const map: Record<TicketEstado, { bg: string; c: string }> = {
      abierto: { bg: '#e0f2fe', c: '#075985' },
      en_proceso: { bg: '#fef3c7', c: '#92400e' },
      resuelto: { bg: '#dcfce7', c: '#166534' },
      cerrado: { bg: '#e5e7eb', c: '#334155' },
    };
    return {
      backgroundColor: map[e].bg,
      color: map[e].c,
      borderRadius: 999,
      padding: '3px 10px',
      fontWeight: 700,
      fontSize: 12,
      display: 'inline-block',
    };
  };

  const siguienteEstado = (estado: TicketEstado): TicketEstado | null => {
    const flujo: Record<TicketEstado, TicketEstado | null> = {
      abierto: 'en_proceso',
      en_proceso: 'resuelto',
      resuelto: 'cerrado',
      cerrado: null,
    };
    return flujo[estado];
  };

  const descargarAdjunto = async (adjunto: Adjunto) => {
    try {
      await descargarArchivo(`/soporte/adjuntos/${adjunto.id}/download`, adjunto.nombre_original);
    } catch (e: any) {
      alert(e?.message || 'No se pudo descargar el adjunto');
    }
  };

  const verDetalle = async (ticketId: number) => {
    setLoadingDetalle(true);
    try {
      const [ticketRes, adjRes] = await Promise.all([
        api.get(`/soporte/tickets/${ticketId}`),
        api.get(`/soporte/tickets/${ticketId}/adjuntos`),
      ]);
      setTicketDetalle(ticketRes.data || null);
      setDetalleAdjuntos(Array.isArray(adjRes.data) ? adjRes.data : []);
      setShowDetalle(true);
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'No se pudo cargar detalle del ticket');
    } finally {
      setLoadingDetalle(false);
    }
  };

  const sheetOverlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 80, backgroundColor: 'rgba(2,6,23,0.55)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 };
  const sheetContainer: React.CSSProperties = isMobile
    ? { backgroundColor: 'white', borderRadius: '20px 20px 0 0', padding: '16px 16px calc(20px + env(safe-area-inset-bottom, 0px))', width: '100%', maxHeight: '92dvh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,0,0,0.2)' }
    : { ...modalStyle };

  const requiereDatosCierre = (next: TicketEstado) => next === 'resuelto' || next === 'cerrado';

  const iniciarCambioEstado = (ticket: Ticket) => {
    const next = siguienteEstado(ticket.estado);
    if (!next) return;
    if (requiereDatosCierre(next)) {
      setCierreTicket(ticket);
      setCierreNextEstado(next);
      setCierreMotivo(ticket.motivo_cierre?.trim() || '');
      setCierreObservaciones(ticket.nota_resolucion?.trim() || '');
      setShowCierreModal(true);
      return;
    }
    void confirmarCambioEstado(ticket, next, null, null, false);
  };

  const cerrarModalCierre = () => {
    setShowCierreModal(false);
    setCierreTicket(null);
    setCierreNextEstado(null);
    setCierreMotivo('');
    setCierreObservaciones('');
  };

  const confirmarCambioEstado = async (
    ticket: Ticket,
    next: TicketEstado,
    motivo: string | null,
    observaciones: string | null,
    conWhatsApp: boolean,
  ) => {
    setSavingId(ticket.id);
    try {
      const payload: Record<string, string> = { estado: next };
      if (requiereDatosCierre(next)) {
        payload.motivo_cierre = (motivo || '').trim();
        payload.nota_resolucion = (observaciones || '').trim();
      }
      const res = await api.patch(`/soporte/tickets/${ticket.id}`, payload);
      const actualizado: Ticket = { ...ticket, ...res.data, estado: next };
      setTicketDetalle((prev) => (prev?.id === actualizado.id ? actualizado : prev));
      setTickets((prev) => prev.map((x) => (x.id === actualizado.id ? { ...actualizado, estado: next } : x)));
      cerrarModalCierre();
      if (conWhatsApp) {
        abrirWhatsAppTicket(actualizado);
      }
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'No se pudo actualizar el estado');
    } finally {
      setSavingId(null);
    }
  };

  const guardarCierre = (conWhatsApp: boolean) => {
    if (!cierreTicket || !cierreNextEstado) return;
    const motivo = cierreMotivo.trim();
    const obs = cierreObservaciones.trim();
    if (!motivo) {
      alert('Indica el motivo del cierre o resolución.');
      return;
    }
    if (!obs) {
      alert('Indica las observaciones para el solicitante.');
      return;
    }
    void confirmarCambioEstado(cierreTicket, cierreNextEstado, motivo, obs, conWhatsApp);
  };

  const abrirWhatsAppTicket = (t: Ticket) => {
    const wa = normalizarTelefonoWhatsAppMexico(t.telefono_solicitante);
    if (!wa) {
      alert(
        'Este ticket no tiene un número válido para WhatsApp. ' +
          'Captura el «Teléfono asignado por la empresa» en Personal → empleado → Datos laborales (o el teléfono personal si no hay asignado); los tickets nuevos tomarán ese dato al crearse desde el portal.',
      );
      return;
    }
    const texto = mensajeTicketSoporteWhatsapp({
      nombreSolicitante: t.nombre_solicitante,
      folio: t.folio,
      titulo: t.titulo,
      estadoLabel: estadoLabel(t.estado),
      motivoCierre: t.motivo_cierre,
      observaciones: t.nota_resolucion,
    });
    abrirWhatsAppConMensaje(wa, texto);
  };

  const waTicketDisponible =
    showDetalle && ticketDetalle ? normalizarTelefonoWhatsAppMexico(ticketDetalle.telefono_solicitante) : null;
  const waCierreDisponible = cierreTicket
    ? normalizarTelefonoWhatsAppMexico(cierreTicket.telefono_solicitante)
    : null;

  const tiposInternosFiltrados = (catalogoInterno?.tipos || []).filter(
    (t) => nuevoClaseId && String(t.clase_id) === nuevoClaseId,
  );

  const resetCamposNuevoTicket = () => {
    setNuevoEmpresaId('');
    setNuevoEmpleadoId('');
    setNuevoClaseId('');
    setNuevoTipoId('');
    setNuevoTitulo('');
    setNuevoDescripcion('');
    setNuevoPrioridad('media');
    setNuevoArchivos([]);
  };

  const cerrarModalNuevo = () => {
    setShowNuevoModal(false);
    setErrorModalNuevo('');
    resetCamposNuevoTicket();
  };

  const cargarFormularioInterno = useCallback(async () => {
    setLoadingCatalogoInterno(true);
    setLoadingEmpleadosInterno(true);
    setErrorModalNuevo('');
    try {
      const [catRes, empRes] = await Promise.all([
        api.get('/soporte/interno/catalogo'),
        api.get('/soporte/interno/empleados'),
      ]);
      setCatalogoInterno(catRes.data || null);
      setEmpleadosInterno(Array.isArray(empRes.data) ? empRes.data : []);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setCatalogoInterno(null);
      setEmpleadosInterno([]);
      setErrorModalNuevo(err?.response?.data?.detail || 'No se pudo cargar el formulario de tickets internos.');
      return false;
    } finally {
      setLoadingCatalogoInterno(false);
      setLoadingEmpleadosInterno(false);
    }
    return true;
  }, []);

  useEffect(() => {
    if (!authMe?.is_ti && !authMe?.is_superuser) return;
    void cargarFormularioInterno();
  }, [authMe?.is_ti, authMe?.is_superuser, cargarFormularioInterno]);

  useEffect(() => {
    if (!showNuevoModal || !authMe?.id || nuevoEmpleadoId) return;
    if (empleadosInterno.some((e) => e.id === authMe.id)) {
      setNuevoEmpleadoId(String(authMe.id));
    }
  }, [showNuevoModal, authMe?.id, empleadosInterno, nuevoEmpleadoId]);

  const abrirModalNuevo = async () => {
    setShowNuevoModal(true);
    resetCamposNuevoTicket();
    await cargarFormularioInterno();
  };

  const crearTicketInterno = async () => {
    const empresaId = Number(nuevoEmpresaId);
    const empleadoId = Number(nuevoEmpleadoId);
    const tipoId = Number(nuevoTipoId);
    const titulo = nuevoTitulo.trim();
    const descripcion = nuevoDescripcion.trim();
    if (!empresaId || !empleadoId || !tipoId) {
      alert('Selecciona empresa, quién registra y tipo de ticket.');
      return;
    }
    if (!titulo || !descripcion) {
      alert('Título y descripción son obligatorios.');
      return;
    }
    setCreandoTicket(true);
    try {
      const res = await api.post('/soporte/tickets', {
        empresa_id: empresaId,
        empleado_id: empleadoId,
        tipo_ticket_id: tipoId,
        titulo,
        descripcion,
        prioridad: nuevoPrioridad,
      });
      const creado = res.data as Ticket;
      if (nuevoArchivos.length > 0 && creado?.id) {
        const formData = new FormData();
        nuevoArchivos.forEach((f) => formData.append('files', f));
        await api.post(`/soporte/tickets/${creado.id}/adjuntos`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      cerrarModalNuevo();
      await cargar();
      alert(`Ticket creado: ${creado.folio || ''}`);
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'No se pudo crear el ticket');
    } finally {
      setCreandoTicket(false);
    }
  };

  return (
    <div style={{ padding: isMobile ? '14px 14px 30px' : 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 4, fontSize: isMobile ? '1.2rem' : '1.5rem' }}>Tickets de soporte</h1>
          <p style={{ marginTop: 0, marginBottom: 0, color: '#64748b', fontSize: isMobile ? '0.8rem' : '0.9rem' }}>
            Visible para TI y Administrador. Mantenimiento y Ventanas se registran aquí (no en el portal público); el administrador puede levantar estos tickets.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void abrirModalNuevo()}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#0ea5e9',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: isMobile ? '0.85rem' : '0.9rem',
            flexShrink: 0,
          }}
        >
          + Nuevo ticket
        </button>
      </div>

      {/* Filtros */}
      {isMobile ? (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14, WebkitOverflowScrolling: 'touch' }}>
          {[
            { label: 'Estado', value: filtroEstado, onChange: setFiltroEstado, options: [{ v: '', l: 'Todos' }, { v: 'abierto', l: 'Abierto' }, { v: 'en_proceso', l: 'En proceso' }, { v: 'resuelto', l: 'Resuelto' }, { v: 'cerrado', l: 'Cerrado' }] },
            { label: 'Prioridad', value: filtroPrioridad, onChange: setFiltroPrioridad, options: [{ v: '', l: 'Todas' }, { v: 'baja', l: 'Baja' }, { v: 'media', l: 'Media' }, { v: 'alta', l: 'Alta' }, { v: 'critica', l: 'Crítica' }] },
            { label: 'Tipo', value: filtroTipo, onChange: setFiltroTipo, options: [{ v: '', l: 'Todos' }, ...tiposUnicos.map(t => ({ v: t, l: t }))] },
          ].map(({ label, value, onChange, options }) => (
            <select key={label} value={value} onChange={e => onChange(e.target.value)}
              style={{ height: 34, padding: '0 10px', border: `1.5px solid ${value ? '#0ea5e9' : '#d1d5db'}`, borderRadius: 20, fontSize: '0.78rem', backgroundColor: value ? '#e0f2fe' : '#fff', color: value ? '#0369a1' : '#334155', fontWeight: value ? 700 : 400, flexShrink: 0, cursor: 'pointer' }}>
              {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          ))}
        </div>
      ) : (
        <div style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Tipo', value: filtroTipo, onChange: setFiltroTipo, options: [{ v: '', l: 'Todos' }, ...tiposUnicos.map(t => ({ v: t, l: t }))] },
            { label: 'Estado', value: filtroEstado, onChange: setFiltroEstado, options: [{ v: '', l: 'Todos' }, { v: 'abierto', l: 'Abierto' }, { v: 'en_proceso', l: 'En proceso' }, { v: 'resuelto', l: 'Resuelto' }, { v: 'cerrado', l: 'Cerrado' }] },
            { label: 'Prioridad', value: filtroPrioridad, onChange: setFiltroPrioridad, options: [{ v: '', l: 'Todas' }, { v: 'baja', l: 'Baja' }, { v: 'media', l: 'Media' }, { v: 'alta', l: 'Alta' }, { v: 'critica', l: 'Crítica' }] },
          ].map(({ label, value, onChange, options }) => (
            <div key={label}>
              <label style={{ fontSize: 13, color: '#334155', marginRight: 8 }}>{label}</label>
              <select value={value} onChange={e => onChange(e.target.value)} style={filtroSelectStyle}>
                {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {loading ? <p style={{ color: '#64748b' }}>Cargando...</p> : isMobile ? (
        /* ── Vista móvil: tarjetas ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tickets.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', backgroundColor: 'white', borderRadius: 14, border: '1px solid #e5e7eb', color: '#9ca3af' }}>
              No hay tickets con los filtros seleccionados
            </div>
          ) : (
            <>
          <PaginacionTickets
            inicio={inicio}
            total={tickets.length}
            paginaSegura={paginaSegura}
            totalPaginas={totalPaginas}
            onAnterior={() => setPagina((p) => Math.max(1, p - 1))}
            onSiguiente={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
          />
          {ticketsPagina.map((t) => (
            <button key={t.id} onClick={() => verDetalle(t.id)} disabled={loadingDetalle}
              style={{ backgroundColor: 'white', borderRadius: 14, border: '1.5px solid #e5e7eb', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TituloCelda titulo={t.titulo} descripcion={t.descripcion} maxWidth={999} descripcionLineas={2} />
                  <div style={{ marginTop: 4 }}>
                    <FolioCelda folio={t.folio} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                  <span style={estiloPrioridad(t.prioridad)}>
                    {t.prioridad === 'critica' ? 'Crítica' : t.prioridad.charAt(0).toUpperCase() + t.prioridad.slice(1)}
                  </span>
                  <span style={estadoBadgeStyle(t.estado)}>{estadoLabel(t.estado)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8, marginTop: 6 }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', minWidth: 0 }}>
                  <div style={{ marginBottom: 4 }}>
                    <SolicitanteCelda nombre={t.nombre_solicitante} maxWidth={200} />
                  </div>
                  <EmpresaDeptoCelda empresa={t.empresa_nombre} depto={t.departamento_nombre} maxWidth={200} />
                  {t.tipo_ticket_nombre && (
                    <span style={{ marginTop: 4, display: 'inline-block', backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: 4 }}>
                      {t.tipo_ticket_nombre}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(t.adjuntos_count || 0) > 0 && <span style={{ fontSize: 14 }}>📎</span>}
                  <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{new Date(t.created_at).toLocaleDateString('es-MX')}</span>
                </div>
              </div>
            </button>
          ))}
          <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', marginTop: 4 }}>
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
            {tickets.length > FILAS_POR_PAGINA ? ` · página ${paginaSegura} de ${totalPaginas}` : ''}
          </p>
            </>
          )}
        </div>
      ) : (
        /* ── Vista desktop: tabla ── */
        <>
          <PaginacionTickets
            inicio={inicio}
            total={tickets.length}
            paginaSegura={paginaSegura}
            totalPaginas={totalPaginas}
            onAnterior={() => setPagina((p) => Math.max(1, p - 1))}
            onSiguiente={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
          />
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
          {tickets.length === 0 ? (
            <p style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', margin: 0 }}>No hay tickets con los filtros seleccionados</p>
          ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Folio', 'Solicitante', 'Título', 'Tipo', 'Empresa / Depto.', 'Prioridad', 'Estado', 'Creación', 'Cierre', 'Acciones'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 13, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ticketsPagina.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <FolioCelda folio={t.folio} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <SolicitanteCelda nombre={t.nombre_solicitante} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <TituloCelda titulo={t.titulo} descripcion={t.descripcion} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>{t.tipo_ticket_nombre || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <EmpresaDeptoCelda empresa={t.empresa_nombre} depto={t.departamento_nombre} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={estiloPrioridad(t.prioridad)}>
                      {t.prioridad === 'critica' ? 'Crítica' : t.prioridad.charAt(0).toUpperCase() + t.prioridad.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}><span style={estadoBadgeStyle(t.estado)}>{estadoLabel(t.estado)}</span></td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
                    {t.created_at ? new Date(t.created_at).toLocaleDateString('es-MX') : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
                    {t.closed_at ? new Date(t.closed_at).toLocaleDateString('es-MX') : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button onClick={() => verDetalle(t.id)} disabled={loadingDetalle}
                        style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}>
                        Ver
                      </button>
                      {(t.adjuntos_count || 0) > 0 && <span title={`Adjuntos: ${t.adjuntos_count}`} style={{ fontSize: 16 }}>📎</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
        </>
      )}

      {/* Modal/Bottom-sheet detalle */}
      {showDetalle && ticketDetalle && (
        <div style={sheetOverlay} onClick={() => setShowDetalle(false)}>
          <div style={sheetContainer} onClick={(e) => e.stopPropagation()}>
            {isMobile && <div style={{ width: 40, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, margin: '0 auto 14px' }} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <h3 style={{ margin: '0 0 2px', fontSize: isMobile ? '1rem' : '1.1rem' }}>Detalle del ticket</h3>
                <div style={{ fontFamily: 'monospace', color: '#475569', fontSize: 13 }}>{ticketDetalle.folio}</div>
              </div>
              {!isMobile && (
                <button onClick={() => setShowDetalle(false)} style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>&times;</button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={estiloPrioridad(ticketDetalle.prioridad)}>
                  {ticketDetalle.prioridad === 'critica' ? 'Crítica' : ticketDetalle.prioridad.charAt(0).toUpperCase() + ticketDetalle.prioridad.slice(1)}
                </span>
                <span style={estadoBadgeStyle(ticketDetalle.estado)}>{estadoLabel(ticketDetalle.estado)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'stretch' : 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => abrirWhatsAppTicket(ticketDetalle)}
                  title={
                    waTicketDisponible
                      ? 'Abre WhatsApp con el número del ticket (asignado por la empresa o personal del empleado). Pulsa Enviar en WhatsApp.'
                      : 'Sin número en el ticket; revisa datos laborales del empleado en Personal.'
                  }
                  style={{
                    padding: isMobile ? '10px 14px' : '7px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: waTicketDisponible ? '#25D366' : '#94a3b8',
                    color: '#fff',
                    cursor: waTicketDisponible ? 'pointer' : 'not-allowed',
                    fontSize: isMobile ? '0.85rem' : 12,
                    fontWeight: 700,
                    flex: isMobile ? 1 : 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <span aria-hidden>💬</span> WhatsApp
                </button>
                {siguienteEstado(ticketDetalle.estado) && (
                  <button
                    onClick={() => iniciarCambioEstado(ticketDetalle)}
                    disabled={savingId === ticketDetalle.id}
                    style={{ padding: isMobile ? '10px 14px' : '7px 11px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: isMobile ? '0.85rem' : 12, fontWeight: 700, flex: isMobile ? 1 : 'none', marginTop: 0 }}
                  >
                    {savingId === ticketDetalle.id ? 'Guardando...' : `→ ${estadoLabel(siguienteEstado(ticketDetalle.estado) as TicketEstado)}`}
                  </button>
                )}
              </div>
            </div>

            <div style={{ ...sectionCard, marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: isMobile ? 8 : 8, fontSize: isMobile ? '0.82rem' : 'inherit' }}>
                {[
                  { k: 'Solicitante', v: ticketDetalle.nombre_solicitante },
                  { k: 'Teléfono (WhatsApp)', v: ticketDetalle.telefono_solicitante?.trim() || '—' },
                  { k: 'Tipo', v: ticketDetalle.tipo_ticket_nombre || '—' },
                  { k: 'Empresa', v: ticketDetalle.empresa_nombre || '—' },
                  { k: 'Depto.', v: ticketDetalle.departamento_nombre || '—' },
                  { k: 'Creación', v: new Date(ticketDetalle.created_at).toLocaleDateString('es-MX') },
                  { k: 'Cierre', v: ticketDetalle.closed_at ? new Date(ticketDetalle.closed_at).toLocaleDateString('es-MX') : '—' },
                ].map(({ k, v }) => (
                  <div key={k}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{k}</div>
                    <div style={{ fontWeight: 600, color: '#1e3a5f' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...sectionCard, marginBottom: 10 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', color: '#64748b', fontWeight: 700, marginBottom: 6 }}>Contenido</div>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: isMobile ? '0.95rem' : 'inherit' }}>{ticketDetalle.titulo}</div>
              <div style={{ whiteSpace: 'pre-wrap', color: '#334155', fontSize: isMobile ? '0.88rem' : 'inherit' }}>{ticketDetalle.descripcion}</div>
            </div>

            {(ticketDetalle.motivo_cierre || ticketDetalle.nota_resolucion) && (
              <div style={{ ...sectionCard, marginBottom: 10, borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', color: '#065f46', fontWeight: 700, marginBottom: 6 }}>Cierre / resolución</div>
                {ticketDetalle.motivo_cierre && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#047857', fontWeight: 700, marginBottom: 4 }}>Motivo</div>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#064e3b', fontSize: isMobile ? '0.88rem' : 'inherit' }}>{ticketDetalle.motivo_cierre}</div>
                  </div>
                )}
                {ticketDetalle.nota_resolucion && (
                  <div>
                    <div style={{ fontSize: 11, color: '#047857', fontWeight: 700, marginBottom: 4 }}>Observaciones</div>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#064e3b', fontSize: isMobile ? '0.88rem' : 'inherit' }}>{ticketDetalle.nota_resolucion}</div>
                  </div>
                )}
              </div>
            )}

            <div style={sectionCard}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', color: '#64748b', fontWeight: 700, marginBottom: 6 }}>Adjuntos</div>
              {!detalleAdjuntos.length ? (
                <div style={{ color: '#94a3b8', fontSize: '0.88rem' }}>Sin adjuntos</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detalleAdjuntos.map((a) => (
                    <button key={a.id} onClick={() => descargarAdjunto(a)}
                      style={{ textAlign: 'left', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: isMobile ? '10px 12px' : '6px 8px', fontSize: isMobile ? '0.88rem' : 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>📎</span> {a.nombre_original}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {isMobile && (
              <button onClick={() => setShowDetalle(false)}
                style={{ width: '100%', marginTop: 16, padding: '13px', backgroundColor: '#1e3a5f', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem' }}>
                Cerrar
              </button>
            )}
          </div>
        </div>
      )}

      {showCierreModal && cierreTicket && cierreNextEstado && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            backgroundColor: 'rgba(2,6,23,0.55)',
            display: 'flex',
            alignItems: isMobile ? 'flex-end' : 'center',
            justifyContent: 'center',
            padding: isMobile ? 0 : 16,
          }}
          onClick={cerrarModalCierre}
        >
          <div
            style={isMobile ? { ...sheetContainer, maxHeight: '85dvh' } : { ...modalStyle, maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            {isMobile && <div style={{ width: 40, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, margin: '0 auto 14px' }} />}
            <h3 style={{ margin: '0 0 4px', fontSize: isMobile ? '1rem' : '1.1rem' }}>
              {cierreNextEstado === 'cerrado' ? 'Cerrar ticket' : 'Resolver ticket'}
            </h3>
            <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: '0.85rem' }}>
              Folio {cierreTicket.folio} → {estadoLabel(cierreNextEstado)}. Estos datos se guardan y se incluyen en WhatsApp.
            </p>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Motivo <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              value={cierreMotivo}
              onChange={(e) => setCierreMotivo(e.target.value)}
              placeholder="Ej. Contraseña restablecida, equipo reemplazado…"
              maxLength={500}
              style={{ ...filtroSelectStyle, marginBottom: 12, height: 40 }}
            />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Observaciones <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <textarea
              value={cierreObservaciones}
              onChange={(e) => setCierreObservaciones(e.target.value)}
              placeholder="Detalle para el solicitante (aparece en el mensaje de WhatsApp)"
              rows={4}
              style={{
                ...filtroSelectStyle,
                height: 'auto',
                minHeight: 96,
                padding: '10px 12px',
                resize: 'vertical',
                marginBottom: 16,
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={cerrarModalCierre}
                disabled={savingId === cierreTicket.id}
                style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => guardarCierre(false)}
                disabled={savingId === cierreTicket.id}
                style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: '#1e3a5f', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                {savingId === cierreTicket.id ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => guardarCierre(true)}
                disabled={savingId === cierreTicket.id || !waCierreDisponible}
                title={waCierreDisponible ? 'Guarda y abre WhatsApp con el mensaje' : 'Sin teléfono en el ticket'}
                style={{
                  padding: '9px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: waCierreDisponible ? '#25D366' : '#94a3b8',
                  color: '#fff',
                  cursor: waCierreDisponible ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                }}
              >
                Guardar y WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {showNuevoModal && (
        <div style={sheetOverlay} onClick={cerrarModalNuevo}>
          <div style={sheetContainer} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: '1.15rem', color: '#1e3a5f' }}>Nuevo ticket (Mantenimiento / Ventanas)</h2>
            <p style={{ marginTop: 0, marginBottom: 14, color: '#64748b', fontSize: '0.85rem' }}>
              Registra el ticket personal de TI o Administrador. No aparecen en el portal público.
            </p>
            {errorModalNuevo ? (
              <p style={{ color: '#b91c1c', marginBottom: 12, fontSize: '0.85rem' }}>{errorModalNuevo}</p>
            ) : null}
            {loadingCatalogoInterno || loadingEmpleadosInterno ? (
              <p style={{ color: '#64748b' }}>Cargando formulario…</p>
            ) : !(catalogoInterno?.clases?.length) ? (
              <div style={{ color: '#b45309' }}>
                <p style={{ marginTop: 0 }}>
                  No hay categorías de Mantenimiento o Ventanas activas. Configúralas en Administración → Soporte (el nombre debe incluir
                  «mantenimiento» o «ventana») y marca la categoría y sus tipos como activos.
                </p>
                <button
                  type="button"
                  onClick={() => void cargarFormularioInterno()}
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #f59e0b', background: '#fffbeb', cursor: 'pointer', fontWeight: 600 }}
                >
                  Reintentar carga
                </button>
              </div>
            ) : empleadosInterno.length === 0 ? (
              <p style={{ color: '#b45309' }}>
                No hay personal de TI ni administradores activos para registrar. Revisa Personal (departamento TI o rol Administrador).
              </p>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                  Quién registra el ticket *
                </label>
                <select
                  value={nuevoEmpleadoId}
                  onChange={(e) => setNuevoEmpleadoId(e.target.value)}
                  style={{ ...filtroSelectStyle, marginBottom: 12 }}
                >
                  <option value="">Selecciona quién registra (TI o Administrador)</option>
                  {empleadosInterno.map((e) => (
                    <option key={e.id} value={String(e.id)}>{e.nombre_completo}</option>
                  ))}
                </select>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Empresa del reporte *</label>
                <select
                  value={nuevoEmpresaId}
                  onChange={(e) => setNuevoEmpresaId(e.target.value)}
                  style={{ ...filtroSelectStyle, marginBottom: 12 }}
                >
                  <option value="">Selecciona empresa</option>
                  {(catalogoInterno?.empresas || []).map((e) => (
                    <option key={e.id} value={String(e.id)}>{e.nombre}</option>
                  ))}
                </select>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Categoría *</label>
                <select
                  value={nuevoClaseId}
                  onChange={(e) => {
                    setNuevoClaseId(e.target.value);
                    setNuevoTipoId('');
                  }}
                  style={{ ...filtroSelectStyle, marginBottom: 12 }}
                >
                  <option value="">Selecciona categoría</option>
                  {(catalogoInterno?.clases || []).map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.nombre}</option>
                  ))}
                </select>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Tipo *</label>
                <select
                  value={nuevoTipoId}
                  onChange={(e) => setNuevoTipoId(e.target.value)}
                  disabled={!nuevoClaseId}
                  style={{ ...filtroSelectStyle, marginBottom: 12 }}
                >
                  <option value="">Selecciona tipo</option>
                  {tiposInternosFiltrados.map((t) => (
                    <option key={t.id} value={String(t.id)}>{t.nombre}</option>
                  ))}
                </select>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Prioridad</label>
                <select
                  value={nuevoPrioridad}
                  onChange={(e) => setNuevoPrioridad(e.target.value as TicketPrioridad)}
                  style={{ ...filtroSelectStyle, marginBottom: 12 }}
                >
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </select>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Título *</label>
                <input
                  type="text"
                  value={nuevoTitulo}
                  onChange={(e) => setNuevoTitulo(e.target.value)}
                  maxLength={255}
                  style={{ ...filtroSelectStyle, marginBottom: 12, height: 40 }}
                />
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Descripción *</label>
                <textarea
                  value={nuevoDescripcion}
                  onChange={(e) => setNuevoDescripcion(e.target.value)}
                  rows={4}
                  style={{
                    ...filtroSelectStyle,
                    height: 'auto',
                    minHeight: 96,
                    padding: '10px 12px',
                    resize: 'vertical',
                    marginBottom: 12,
                    fontFamily: 'inherit',
                  }}
                />
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Adjuntos (opcional)</label>
                <input
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(e) => setNuevoArchivos(Array.from(e.target.files || []))}
                  style={{ marginBottom: 16, fontSize: 13 }}
                />
              </>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={cerrarModalNuevo}
                disabled={creandoTicket}
                style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void crearTicketInterno()}
                disabled={
                  creandoTicket
                  || loadingCatalogoInterno
                  || loadingEmpleadosInterno
                  || !(catalogoInterno?.clases?.length)
                  || empleadosInterno.length === 0
                }
                style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: '#0ea5e9', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                {creandoTicket ? 'Creando…' : 'Crear ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
