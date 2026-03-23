import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { useIsMobile } from '../hooks/useIsMobile';
import { useNavigate } from 'react-router-dom';
import type { Dispositivo } from '../types';

interface Notificacion {
  id: number;
  titulo: string;
  mensaje?: string | null;
  tipo: string;
  referencia_id?: number | null;
  leida: boolean;
  created_at: string;
}

interface Props {
  dispositivos?: Dispositivo[];
}

const TIPO_COLOR: Record<string, string> = {
  nueva_solicitud: '#3b82f6',
  solicitud_aprobada_jefe: '#f59e0b',
  solicitud_aprobada: '#10b981',
  solicitud_rechazada: '#ef4444',
  solicitud_pendiente_rh: '#8b5cf6',
  cumpleanos_felicitacion: '#f43f8e',
};

const TIPO_ICONO: Record<string, string> = {
  cumpleanos_felicitacion: '🎂',
};

const MS_1_DIA = 24 * 60 * 60 * 1000;
const NOMBRE_DISPOSITIVO_PORTAL = 'Portal Checadas Remotas';

/** Dispositivos que no deben generar alertas de conexión (portal web no tiene agente) */
const esDispositivoPortal = (d: Dispositivo) => (d.nombre || '').trim() === NOMBRE_DISPOSITIVO_PORTAL;

function timeAgo(dateStr: string): string {
  // Sin 'Z': el navegador lo trata como hora local (México), que es como lo guarda el servidor
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} día${days > 1 ? 's' : ''}`;
}

export const NotificationBell = ({ dispositivos = [] }: Props) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const dispositivosConAlertas = dispositivos.filter(d => !esDispositivoPortal(d));
  const inactivos = dispositivosConAlertas.filter(d => !d.activo);
  const sinConexion = dispositivosConAlertas.filter(d => {
    const u = d.ultima_sync_agente;
    if (!u) return true;
    const diff = Date.now() - new Date(u.endsWith('Z') || u.includes('+') ? u : u + 'Z').getTime();
    return diff > MS_1_DIA;
  });
  const totalAlertas = new Set([...inactivos.map(d => d.id), ...sinConexion.map(d => d.id)]).size;
  const [open, setOpen] = useState(false);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [incidenciasPorJustificar, setIncidenciasPorJustificar] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await api.get<{ total_no_leidas: number; incidencias_por_justificar?: number; notificaciones: Notificacion[] }>(
        '/notificaciones/mis-notificaciones?limit=30',
      );
      setNotificaciones(res.data.notificaciones);
      setNoLeidas(res.data.total_no_leidas);
      setIncidenciasPorJustificar(res.data.incidencias_por_justificar ?? 0);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    cargar();
    intervalRef.current = setInterval(cargar, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [cargar]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const marcarLeida = async (id: number) => {
    try {
      await api.put(`/notificaciones/${id}/leer`);
      setNotificaciones(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
      setNoLeidas(prev => Math.max(0, prev - 1));
    } catch { /* silencioso */ }
  };

  const marcarTodasLeidas = async () => {
    try {
      await api.put('/notificaciones/marcar-todas-leidas');
      setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
      setNoLeidas(0);
    } catch { /* silencioso */ }
  };

  const irAIncidenciasPendientes = () => {
    setOpen(false);
    navigate('/mi-area?tab=incidencias&justificada=pendientes');
  };

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      {/* Botón campana */}
      <button
        type="button"
        onClick={() => { setOpen(v => !v); if (!open) cargar(); }}
        title="Notificaciones"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          color: 'rgba(255,255,255,0.9)',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'white')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.9)')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {(noLeidas + totalAlertas + incidenciasPorJustificar) > 0 && (
          <span style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            minWidth: '16px',
            height: '16px',
            padding: '0 4px',
            borderRadius: '8px',
            backgroundColor: '#ef4444',
            color: 'white',
            fontSize: '0.65rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}>
            {(noLeidas + totalAlertas + incidenciasPorJustificar) > 99 ? '99+' : (noLeidas + totalAlertas + incidenciasPorJustificar)}
          </span>
        )}
      </button>

      {/* Panel desplegable */}
      {open && (
        <div style={isMobile ? {
          position: 'fixed',
          top: '60px',
          left: '8px',
          right: '8px',
          width: 'auto',
          maxHeight: '70vh',
          overflowY: 'auto',
          backgroundColor: 'white',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          zIndex: 1000,
          border: '1px solid #e5e7eb',
        } : {
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: '340px',
          maxHeight: '480px',
          overflowY: 'auto',
          backgroundColor: 'white',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 1000,
          border: '1px solid #e5e7eb',
        }}>
          {/* Encabezado */}
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            backgroundColor: 'white',
            zIndex: 1,
          }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1f2937' }}>
              Notificaciones{(noLeidas + totalAlertas + incidenciasPorJustificar) > 0 && <span style={{ color: '#ef4444' }}> ({noLeidas + totalAlertas + incidenciasPorJustificar})</span>}
            </span>
            {noLeidas > 0 && (
              <button
                type="button"
                onClick={marcarTodasLeidas}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  color: '#0ea5e9',
                  fontWeight: 600,
                  padding: '2px 6px',
                }}
              >
                Marcar todas leídas
              </button>
            )}
          </div>

          {/* ── Alertas de dispositivos (solo admin) ── */}
          {totalAlertas > 0 && (
            <div style={{ borderBottom: '1px solid #e5e7eb' }}>
              <div style={{
                padding: '8px 14px 4px',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#b45309',
                backgroundColor: '#fffbeb',
              }}>
                Alertas de dispositivos
              </div>
              {inactivos.map(d => (
                <div key={`inactivo-${d.id}`} style={{
                  padding: '8px 14px',
                  borderBottom: '1px solid #f3f4f6',
                  backgroundColor: '#fef2f2',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                }}>
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    backgroundColor: '#dc2626', flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#991b1b' }}>
                      Dispositivo inactivo
                    </div>
                    <div style={{ fontSize: '0.77rem', color: '#b91c1c' }}>
                      {d.nombre}{d.ubicacion ? ` · ${d.ubicacion}` : ''}
                    </div>
                  </div>
                </div>
              ))}
              {sinConexion.filter(d => d.activo).map(d => (
                <div key={`sync-${d.id}`} style={{
                  padding: '8px 14px',
                  borderBottom: '1px solid #f3f4f6',
                  backgroundColor: '#fffbeb',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                }}>
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    backgroundColor: '#d97706', flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#92400e' }}>
                      Sin conexión +1 día
                    </div>
                    <div style={{ fontSize: '0.77rem', color: '#b45309' }}>
                      {d.nombre}{d.ubicacion ? ` · ${d.ubicacion}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Alerta diaria: incidencias por justificar ── */}
          {incidenciasPorJustificar > 0 && (
            <div style={{ borderBottom: '1px solid #e5e7eb' }}>
              <div style={{
                padding: '8px 14px',
                backgroundColor: '#fff7ed',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
                cursor: 'pointer',
              }}
              onClick={irAIncidenciasPendientes}
              title="Ir a incidencias pendientes de justificar">
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#c2410c', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#9a3412' }}>
                    Incidencias por justificar: {incidenciasPorJustificar}
                  </div>
                  <div style={{ fontSize: '0.77rem', color: '#b45309' }}>
                    Se muestran incidencias pendientes de días anteriores (alerta diaria).
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Notificaciones del sistema ── */}
          {notificaciones.length > 0 && (
            <div style={{
              padding: '8px 14px 4px',
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#6b7280',
              backgroundColor: '#f9fafb',
            }}>
              Actividad reciente
            </div>
          )}
          {notificaciones.length === 0 && totalAlertas === 0 && incidenciasPorJustificar === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
              No hay notificaciones
            </div>
          ) : notificaciones.length === 0 ? null : (
            <div>
              {notificaciones.map(n => (
                <div
                  key={n.id}
                  onClick={() => { if (!n.leida) marcarLeida(n.id); }}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid #f3f4f6',
                    cursor: n.leida ? 'default' : 'pointer',
                    backgroundColor: n.leida ? 'white' : '#f0f9ff',
                    transition: 'background 0.1s',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                  }}
                  onMouseEnter={e => { if (!n.leida) (e.currentTarget as HTMLDivElement).style.backgroundColor = '#e8eeff'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = n.leida ? 'white' : '#f0f9ff'; }}
                >
                  {/* Indicador de tipo */}
                  {TIPO_ICONO[n.tipo] ? (
                    <span style={{ fontSize: '1.1rem', flexShrink: 0, lineHeight: 1, marginTop: '2px' }}>
                      {TIPO_ICONO[n.tipo]}
                    </span>
                  ) : (
                    <div style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: TIPO_COLOR[n.tipo] ?? '#6b7280',
                      flexShrink: 0,
                      marginTop: '6px',
                    }} />
                  )}

                  {/* Contenido */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '0.82rem',
                      fontWeight: n.leida ? 500 : 700,
                      color: '#1f2937',
                      marginBottom: '2px',
                      lineHeight: 1.3,
                    }}>
                      {n.titulo}
                    </div>
                    {n.mensaje && (
                      <div style={{ fontSize: '0.77rem', color: '#6b7280', lineHeight: 1.4, marginBottom: '3px' }}>
                        {n.mensaje}
                      </div>
                    )}
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>

                  {/* Indicador no leída */}
                  {!n.leida && (
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#0ea5e9',
                      flexShrink: 0,
                      marginTop: '5px',
                    }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
