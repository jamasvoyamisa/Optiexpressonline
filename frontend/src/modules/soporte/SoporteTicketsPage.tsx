import { useEffect, useState } from 'react';
import api from '../../services/api';
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

export const SoporteTicketsPage = () => {
  const isMobile = useIsMobile();
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

  const updateEstado = async (ticket: Ticket) => {
    const next = siguienteEstado(ticket.estado);
    if (!next) return;
    setSavingId(ticket.id);
    try {
      await api.patch(`/soporte/tickets/${ticket.id}`, { estado: next });
      const actualizado = { ...ticket, estado: next };
      setTicketDetalle(actualizado);
      setTickets((prev) => prev.map((x) => (x.id === actualizado.id ? { ...x, estado: next } : x)));
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'No se pudo actualizar el estado');
    } finally {
      setSavingId(null);
    }
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
      notaResolucion: t.nota_resolucion,
    });
    abrirWhatsAppConMensaje(wa, texto);
  };

  const waTicketDisponible =
    showDetalle && ticketDetalle ? normalizarTelefonoWhatsAppMexico(ticketDetalle.telefono_solicitante) : null;

  return (
    <div style={{ padding: isMobile ? '14px 14px 30px' : 20 }}>
      <h1 style={{ marginTop: 0, marginBottom: 4, fontSize: isMobile ? '1.2rem' : '1.5rem' }}>Tickets de soporte</h1>
      <p style={{ marginTop: 0, marginBottom: 14, color: '#64748b', fontSize: isMobile ? '0.8rem' : '0.9rem' }}>Solo visible para TI y Administrador.</p>

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
          ) : tickets.map((t) => (
            <button key={t.id} onClick={() => verDetalle(t.id)} disabled={loadingDetalle}
              style={{ backgroundColor: 'white', borderRadius: 14, border: '1.5px solid #e5e7eb', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: '0.92rem', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.titulo}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#64748b' }}>{t.folio}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                  <span style={estiloPrioridad(t.prioridad)}>
                    {t.prioridad === 'critica' ? 'Crítica' : t.prioridad.charAt(0).toUpperCase() + t.prioridad.slice(1)}
                  </span>
                  <span style={estadoBadgeStyle(t.estado)}>{estadoLabel(t.estado)}</span>
                </div>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                {t.descripcion}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                  {t.nombre_solicitante} · {t.empresa_nombre || ''}
                  {t.tipo_ticket_nombre && <span style={{ marginLeft: 4, backgroundColor: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: 4 }}>{t.tipo_ticket_nombre}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(t.adjuntos_count || 0) > 0 && <span style={{ fontSize: 14 }}>📎</span>}
                  <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{new Date(t.created_at).toLocaleDateString('es-MX')}</span>
                </div>
              </div>
            </button>
          ))}
          <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', marginTop: 4 }}>{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</p>
        </div>
      ) : (
        /* ── Vista desktop: tabla ── */
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Folio', 'Solicitante', 'Título', 'Tipo', 'Empresa/Área', 'Prioridad', 'Estado', 'Creación', 'Cierre', 'Acciones'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 13, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{t.folio}</td>
                  <td style={{ padding: '10px 12px' }}>{t.nombre_solicitante}</td>
                  <td style={{ padding: '10px 12px', maxWidth: 280 }}>
                    <div style={{ fontWeight: 600 }}>{t.titulo}</div>
                    <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.descripcion}</div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>{t.tipo_ticket_nombre || '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>{t.empresa_nombre || '—'} / {t.departamento_nombre || '—'}</td>
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
        </div>
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
                    onClick={() => updateEstado(ticketDetalle)}
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

            {ticketDetalle.nota_resolucion && (
              <div style={{ ...sectionCard, marginBottom: 10, borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', color: '#065f46', fontWeight: 700, marginBottom: 6 }}>Nota de resolución</div>
                <div style={{ whiteSpace: 'pre-wrap', color: '#064e3b', fontSize: isMobile ? '0.88rem' : 'inherit' }}>{ticketDetalle.nota_resolucion}</div>
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
    </div>
  );
};
