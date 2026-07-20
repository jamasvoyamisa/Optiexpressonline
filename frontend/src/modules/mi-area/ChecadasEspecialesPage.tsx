import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useIsMobile';
import api from '../../services/api';
import { parseTimestampForMexico } from '../../utils/date';
import {
  rhMobileBtnPrimary,
  rhMobileBtnSecondary,
  rhMobileCard,
  rhMobileCardRow,
  rhMobileCardSub,
  rhMobileCardTitle,
} from '../rh/rhMobileStyles';
import type {
  AlcanceChecadaEspecial,
  AsistenciaResponse,
  ChecadaEspecialCreate,
  ChecadaEspecialResponse,
  ChecadaEspecialUpdate,
  EmpresaResponse,
  DepartamentoResponse,
} from '../../types/api';

const th: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '2px solid #dee2e6',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#555',
  backgroundColor: '#f8f9fa',
};
const td: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #f0f0f0',
  fontSize: '0.88rem',
  verticalAlign: 'middle',
};

const field: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
};

const TZ = 'America/Mexico_City';

function axiosDetail(err: unknown): string {
  const d = (err as { response?: { data?: { detail?: string | string[] } } })?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.join(', ');
  return err instanceof Error ? err.message : 'Error';
}

function formatYmd(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatYmdDisplay(s: string): string {
  try {
    const d = parseYmd(s);
    return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return s;
  }
}

function fechaCell(row: ChecadaEspecialResponse): string {
  return String(row.fecha).slice(0, 10);
}

function empresaNombre(empresas: EmpresaResponse[], id: number | null | undefined): string {
  if (id == null) return '—';
  return empresas.find((e) => e.id === id)?.nombre ?? `#${id}`;
}

function deptoNombre(departamentos: DepartamentoResponse[], id: number | null | undefined): string {
  if (id == null) return '—';
  return departamentos.find((d) => d.id === id)?.nombre ?? `#${id}`;
}

const TIPO_CHECADA_LABEL: Record<string, string> = {
  entrada: 'Entrada',
  salida_comer: 'Salida comer',
  regreso_comer: 'Regreso comer',
  salida: 'Salida',
};

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

type VistaChecadasEsp = 'reglas' | 'auditoria';

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    border: 'none',
    borderBottom: active ? '2px solid #0ea5e9' : '2px solid transparent',
    background: 'transparent',
    color: active ? '#0f172a' : '#64748b',
    fontWeight: active ? 700 : 500,
    fontSize: '0.88rem',
    cursor: 'pointer',
  };
}

/** Auditoría de checadas del portal remoto (motivo + ubicación). Solo admin. */
function AuditoriaPortalPanel() {
  const isMobile = useIsMobile();
  const hoy = formatYmd(new Date());
  const [fechaInicio, setFechaInicio] = useState(hoy);
  const [fechaFin, setFechaFin] = useState(hoy);
  const [busqueda, setBusqueda] = useState('');
  const [items, setItems] = useState<AsistenciaResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '500');
      params.set('solo_portal_remoto', 'true');
      if (fechaInicio) params.set('fecha_inicio', `${fechaInicio}T00:00:00`);
      if (fechaFin) params.set('fecha_fin', `${fechaFin}T23:59:59`);
      const res = await api.get<AsistenciaResponse[]>(`/asistencia/checadas?${params.toString()}`);
      setItems(res.data || []);
    } catch (e) {
      setError(axiosDetail(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fechaInicio, fechaFin]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const nom = (c.empleado_nombre || '').toLowerCase();
      const num = (c.empleado_numero || '').toLowerCase();
      const mot = (c.motivo_remoto_label || c.motivo_remoto || '').toLowerCase();
      return nom.includes(q) || num.includes(q) || mot.includes(q);
    });
  }, [items, busqueda]);

  return (
    <div>
      <p style={{ color: '#64748b', fontSize: '0.95rem', maxWidth: 900, marginTop: 0, marginBottom: 16 }}>
        Checadas registradas por el <strong>portal remoto</strong>: motivo y ubicación al momento de checar.
        Uso administrativo (auditoría). No sustituye el reporte operativo de RH.
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'flex-end',
          marginBottom: 16,
          padding: isMobile ? 12 : 16,
          background: '#fff',
          borderRadius: 10,
          border: '1px solid #e5e7eb',
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: 4 }}>Desde</label>
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} style={{ ...field, width: isMobile ? '100%' : 150 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: 4 }}>Hasta</label>
          <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} style={{ ...field, width: isMobile ? '100%' : 150 }} />
        </div>
        <div style={{ flex: 1, minWidth: isMobile ? '100%' : 180 }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: 4 }}>Buscar</label>
          <input
            type="search"
            placeholder="Nombre, número o motivo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ ...field }}
          />
        </div>
        <button type="button" onClick={() => void load()} style={rhMobileBtnPrimary}>
          {loading ? 'Cargando…' : 'Consultar'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f2', color: '#991b1b', borderRadius: 8, border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <p style={{ color: '#64748b' }}>Cargando…</p>
      ) : filtrados.length === 0 ? (
        <p style={{ color: '#64748b', padding: '12px 0' }}>No hay checadas de portal remoto en el rango.</p>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtrados.map((c) => {
            const d = parseTimestampForMexico(c.timestamp);
            const fecha = d.toLocaleDateString('es-MX', { dateStyle: 'medium', timeZone: 'America/Mexico_City' });
            const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
            const hasGeo = c.latitud != null && c.longitud != null;
            return (
              <div key={c.id} style={rhMobileCard}>
                <div style={rhMobileCardTitle}>{c.empleado_nombre || '—'}</div>
                <div style={rhMobileCardSub}>#{c.empleado_numero || '—'} · {c.departamento_nombre || '—'}</div>
                <div style={{ ...rhMobileCardRow, marginTop: 8 }}>
                  <span>{fecha} · {hora}</span>
                  <span style={{ fontWeight: 600 }}>{TIPO_CHECADA_LABEL[c.tipo] ?? c.tipo}</span>
                </div>
                {(c.motivo_remoto_label || c.motivo_remoto) && (
                  <div style={{ marginTop: 8, fontSize: '0.82rem', color: '#075985', fontWeight: 600 }}>
                    Portal: {c.motivo_remoto_label || c.motivo_remoto}
                  </div>
                )}
                {hasGeo && (
                  <a
                    href={mapsUrl(Number(c.latitud), Number(c.longitud))}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-block', marginTop: 8, fontSize: '0.82rem', color: '#0369a1', fontWeight: 600 }}
                  >
                    Ver ubicación en mapa
                    {c.geo_precision_m != null ? ` (±${Math.round(Number(c.geo_precision_m))} m)` : ''}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Fecha / hora</th>
                <th style={th}>No.</th>
                <th style={th}>Empleado</th>
                <th style={th}>Depto</th>
                <th style={th}>Tipo</th>
                <th style={th}>Motivo</th>
                <th style={th}>Ubicación</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => {
                const d = parseTimestampForMexico(c.timestamp);
                const fecha = d.toLocaleString('es-MX', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                  timeZone: 'America/Mexico_City',
                });
                const hasGeo = c.latitud != null && c.longitud != null;
                return (
                  <tr key={c.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fecha}</td>
                    <td style={td}>{c.empleado_numero || '—'}</td>
                    <td style={{ ...td, fontWeight: 500 }}>{c.empleado_nombre || '—'}</td>
                    <td style={td}>{c.departamento_nombre || '—'}</td>
                    <td style={td}>{TIPO_CHECADA_LABEL[c.tipo] ?? c.tipo}</td>
                    <td style={{ ...td, color: '#075985', fontWeight: 600 }}>
                      {c.motivo_remoto_label || c.motivo_remoto || '—'}
                    </td>
                    <td style={td}>
                      {hasGeo ? (
                        <a
                          href={mapsUrl(Number(c.latitud), Number(c.longitud))}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#0369a1', fontWeight: 600 }}
                        >
                          Mapa
                          {c.geo_precision_m != null ? ` (±${Math.round(Number(c.geo_precision_m))} m)` : ''}
                        </a>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Sin geo</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ margin: 0, padding: '10px 14px', fontSize: '0.8rem', color: '#64748b' }}>
            {filtrados.length} checada{filtrados.length !== 1 ? 's' : ''} de portal remoto
          </p>
        </div>
      )}
    </div>
  );
}

export interface ChecadasEspecialesEditorProps {
  embedded?: boolean;
}

export function ChecadasEspecialesEditor({ embedded = false }: ChecadasEspecialesEditorProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [vista, setVista] = useState<VistaChecadasEsp>('reglas');
  const [empresas, setEmpresas] = useState<EmpresaResponse[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartamentoResponse[]>([]);
  const [items, setItems] = useState<ChecadaEspecialResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [nombre, setNombre] = useState('');
  const [fecha, setFecha] = useState(() => formatYmd(new Date()));
  const [horaEntrada, setHoraEntrada] = useState('09:00');
  const [horaSalida, setHoraSalida] = useState('18:00');
  const [tolerancia, setTolerancia] = useState(15);
  const [checadasReq, setChecadasReq] = useState<2 | 4>(4);
  const [alcance, setAlcance] = useState<AlcanceChecadaEspecial>('global');
  const [empresaId, setEmpresaId] = useState<number | ''>('');
  const [departamentoId, setDepartamentoId] = useState<number | ''>('');
  const [empresaExcluidaId, setEmpresaExcluidaId] = useState<number | ''>('');
  const [notas, setNotas] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rList, rEmp, rDep] = await Promise.all([
        api.get<ChecadaEspecialResponse[]>('/asistencia/checadas-especiales'),
        api.get<EmpresaResponse[]>('/personal/empresas?limit=500'),
        api.get<DepartamentoResponse[]>('/personal/departamentos?limit=1000'),
      ]);
      const list = Array.isArray(rList.data) ? rList.data : [];
      setItems([...list].sort((a, b) => b.id - a.id));
      setEmpresas(Array.isArray(rEmp.data) ? rEmp.data : []);
      setDepartamentos(Array.isArray(rDep.data) ? rDep.data : []);
    } catch (e) {
      setError(axiosDetail(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setNombre('');
    setFecha(formatYmd(new Date()));
    setHoraEntrada('09:00');
    setHoraSalida('18:00');
    setTolerancia(15);
    setChecadasReq(4);
    setAlcance('global');
    setEmpresaId('');
    setDepartamentoId('');
    setEmpresaExcluidaId('');
    setNotas('');
  };

  const startEdit = (row: ChecadaEspecialResponse) => {
    setEditingId(row.id);
    setNombre(row.nombre);
    setFecha(fechaCell(row));
    setHoraEntrada(row.hora_entrada?.slice(0, 5) ?? '09:00');
    setHoraSalida(row.hora_salida?.slice(0, 5) ?? '18:00');
    setTolerancia(row.tolerancia_minutos ?? 15);
    setChecadasReq((row.checadas_requeridas === 2 ? 2 : 4) as 2 | 4);
    const a = (row.alcance || 'global').toLowerCase();
    if (a === 'empresa' || a === 'departamento' || a === 'global') {
      setAlcance(a as AlcanceChecadaEspecial);
    } else {
      setAlcance('global');
    }
    const eid = row.empresa_id ?? row.empresa_id_legacy;
    const did = row.departamento_id ?? row.departamento_id_legacy;
    setEmpresaId(eid != null && eid !== undefined ? eid : '');
    setDepartamentoId(did != null && did !== undefined ? did : '');
    const ex = row.empresas_excluidas?.[0];
    setEmpresaExcluidaId(ex != null ? ex : '');
    setNotas(row.notas ?? '');
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const buildPayload = (): ChecadaEspecialCreate | null => {
    const nombreTrim = nombre.trim();
    if (!nombreTrim) {
      setError('Indica un nombre para la regla.');
      return null;
    }
    if (alcance === 'empresa' && (empresaId === '' || empresaId === undefined)) {
      setError('Selecciona la empresa.');
      return null;
    }
    if (alcance === 'departamento' && (departamentoId === '' || departamentoId === undefined)) {
      setError('Selecciona el departamento.');
      return null;
    }
    const excl = empresaExcluidaId === '' ? [] : [Number(empresaExcluidaId)];
    return {
      nombre: nombreTrim,
      fecha,
      hora_entrada: horaEntrada || null,
      hora_salida: horaSalida || null,
      tolerancia_minutos: tolerancia,
      checadas_requeridas: checadasReq,
      alcance,
      empresa_id: alcance === 'empresa' ? Number(empresaId) : undefined,
      departamento_id: alcance === 'departamento' ? Number(departamentoId) : undefined,
      empresas_excluidas: excl,
      notas: notas.trim() || null,
      activo: true,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId != null) {
        const upd: ChecadaEspecialUpdate = { ...payload };
        await api.put<ChecadaEspecialResponse>(`/asistencia/checadas-especiales/${editingId}`, upd);
      } else {
        await api.post<ChecadaEspecialResponse>('/asistencia/checadas-especiales', payload);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(axiosDetail(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Eliminar esta regla de checadas especiales?')) return;
    setError(null);
    try {
      await api.delete(`/asistencia/checadas-especiales/${id}`);
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      setError(axiosDetail(err));
    }
  };

  const resumenAlcance = useMemo(() => {
    return (row: ChecadaEspecialResponse) => {
      const a = (row.alcance || 'global').toLowerCase();
      const eid = row.empresa_id ?? row.empresa_id_legacy;
      const did = row.departamento_id ?? row.departamento_id_legacy;
      let base = 'Global';
      if (a === 'empresa' && eid != null) base = `Empresa: ${empresaNombre(empresas, eid)}`;
      if (a === 'departamento' && did != null) base = `Depto: ${deptoNombre(departamentos, did)}`;
      const exc = row.empresas_excluidas ?? [];
      if (exc.length === 0) return base;
      const exs = exc.map((id) => empresaNombre(empresas, id)).join(', ');
      return (
        <>
          {base}
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>Excluye: {exs}</div>
        </>
      );
    };
  }, [empresas, departamentos]);

  return (
    <div style={{ padding: embedded ? 0 : isMobile ? '14px 14px 30px' : '20px', maxWidth: isMobile ? undefined : 1200 }}>
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => navigate('/mi-area')}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
          >
            ← Volver
          </button>
          <h2 style={{ margin: 0, color: '#0f172a' }}>Checadas especiales</h2>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 16,
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <button type="button" style={tabBtnStyle(vista === 'reglas')} onClick={() => setVista('reglas')}>
          Reglas de día especial
        </button>
        <button type="button" style={tabBtnStyle(vista === 'auditoria')} onClick={() => setVista('auditoria')}>
          Auditoría portal remoto
        </button>
      </div>

      {vista === 'auditoria' ? (
        <AuditoriaPortalPanel />
      ) : (
      <>
      <p
        style={{
          color: '#64748b',
          fontSize: '0.95rem',
          maxWidth: 900,
          marginTop: embedded ? 0 : 0,
          marginBottom: 16,
        }}
      >
        Un día concreto, horario y tolerancia; <strong>2 o 4 checadas</strong>. Alcance como en vacaciones generales:{' '}
        <strong>global</strong>, <strong>una empresa</strong> o <strong>un departamento</strong>. Opcionalmente{' '}
        <strong>excluye una empresa</strong> del efecto de la regla.
      </p>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: '#fef2f2',
            color: '#991b1b',
            borderRadius: 8,
            border: '1px solid #fecaca',
          }}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          marginBottom: 28,
          padding: 20,
          background: '#fff',
          borderRadius: 10,
          border: '1px solid #e5e7eb',
          display: 'grid',
          gap: 12,
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
          alignItems: 'end',
        }}
      >
        <div style={{ gridColumn: '1 / -1', fontWeight: 700, color: '#334155' }}>
          {editingId != null ? `Editar regla #${editingId}` : 'Nueva regla'}
        </div>
        <label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Nombre</span>
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            style={field}
            placeholder="Ej. Medio día 24 dic"
          />
        </label>
        <label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Día</span>
          <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} style={field} />
        </label>
        <label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Entrada</span>
          <input type="time" value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} style={field} />
        </label>
        <label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Salida</span>
          <input type="time" value={horaSalida} onChange={(e) => setHoraSalida(e.target.value)} style={field} />
        </label>
        <label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Tolerancia (min)</span>
          <input
            type="number"
            min={0}
            max={120}
            value={tolerancia}
            onChange={(e) => setTolerancia(Number(e.target.value))}
            style={field}
          />
        </label>
        <label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Checadas</span>
          <select
            value={checadasReq}
            onChange={(e) => setChecadasReq(Number(e.target.value) as 2 | 4)}
            style={field}
          >
            <option value={4}>4 (día completo)</option>
            <option value={2}>2 (medio turno)</option>
          </select>
        </label>
        <label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Alcance</span>
          <select
            value={alcance}
            onChange={(e) => setAlcance(e.target.value as AlcanceChecadaEspecial)}
            style={field}
          >
            <option value="global">Global (todos los activos)</option>
            <option value="empresa">Una empresa</option>
            <option value="departamento">Un departamento</option>
          </select>
        </label>
        {alcance === 'empresa' && (
          <label>
            <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Empresa</span>
            <select
              required
              value={empresaId === '' ? '' : String(empresaId)}
              onChange={(e) => setEmpresaId(e.target.value ? Number(e.target.value) : '')}
              style={field}
            >
              <option value="">Seleccione…</option>
              {empresas.map((em) => (
                <option key={em.id} value={em.id}>
                  {em.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        {alcance === 'departamento' && (
          <label>
            <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>
              Departamento
            </span>
            <select
              required
              value={departamentoId === '' ? '' : String(departamentoId)}
              onChange={(e) => setDepartamentoId(e.target.value ? Number(e.target.value) : '')}
              style={field}
            >
              <option value="">Seleccione…</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                  {d.empresa?.nombre ? ` (${d.empresa.nombre})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>
            Excluir empresa (opcional)
          </span>
          <select
            value={empresaExcluidaId === '' ? '' : String(empresaExcluidaId)}
            onChange={(e) => setEmpresaExcluidaId(e.target.value ? Number(e.target.value) : '')}
            style={field}
          >
            <option value="">Ninguna</option>
            {empresas.map((em) => (
              <option key={`ex-${em.id}`} value={em.id}>
                {em.nombre}
              </option>
            ))}
          </select>
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Notas</span>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            style={field}
            placeholder="Opcional"
          />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '10px 20px',
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Guardando…' : editingId != null ? 'Guardar' : 'Crear'}
          </button>
          {editingId != null && (
            <button
              type="button"
              onClick={resetForm}
              style={{
                padding: '10px 20px',
                background: '#e5e7eb',
                color: '#374151',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => void load()}
          style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff' }}
        >
          Actualizar lista
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#64748b' }}>Cargando…</p>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((row) => (
            <div key={row.id} style={rhMobileCard}>
              <div style={rhMobileCardTitle}>{row.nombre}</div>
              <div style={rhMobileCardSub}>{formatYmdDisplay(fechaCell(row))}</div>
              <div style={rhMobileCardRow}>
                <span>Horario</span>
                <span>{row.hora_entrada?.slice(0, 5) ?? '—'} – {row.hora_salida?.slice(0, 5) ?? '—'}</span>
              </div>
              <div style={rhMobileCardRow}><span>Checadas</span><span>{row.checadas_requeridas}</span></div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 6 }}>{resumenAlcance(row)}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => startEdit(row)} style={{ ...rhMobileBtnSecondary, flex: 1, minHeight: 40 }}>Editar</button>
                <button type="button" onClick={() => void handleDelete(row.id)} style={{ ...rhMobileBtnSecondary, flex: 1, minHeight: 40, color: '#b91c1c', borderColor: '#fecaca' }}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Nombre</th>
                <th style={th}>Día</th>
                <th style={th}>Horario</th>
                <th style={th}>Chec.</th>
                <th style={th}>Alcance</th>
                <th style={th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td style={td}>{row.nombre}</td>
                  <td style={td}>
                    {formatYmdDisplay(fechaCell(row))}
                    {row.fecha_fin && String(row.fecha_fin).slice(0, 10) !== fechaCell(row) && (
                      <span style={{ color: '#64748b', fontSize: '0.82rem' }}>
                        {' '}
                        — {formatYmdDisplay(String(row.fecha_fin).slice(0, 10))}
                      </span>
                    )}
                  </td>
                  <td style={td}>
                    {row.hora_entrada?.slice(0, 5) ?? '—'} – {row.hora_salida?.slice(0, 5) ?? '—'}
                    <span style={{ color: '#64748b', fontSize: '0.8rem' }}> ({row.tolerancia_minutos ?? 0} min)</span>
                  </td>
                  <td style={td}>{row.checadas_requeridas}</td>
                  <td style={{ ...td, maxWidth: 280 }}>{resumenAlcance(row)}</td>
                  <td style={td}>
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      style={{
                        marginRight: 8,
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(row.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: 'none',
                        background: '#fee2e2',
                        color: '#b91c1c',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                      }}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <p style={{ padding: 24, color: '#64748b', margin: 0 }}>No hay reglas. Crea una arriba.</p>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}

export default function ChecadasEspecialesPage() {
  const navigate = useNavigate();
  const { authMe, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated && authMe && authMe.is_superuser !== true) {
      navigate('/mi-area', { replace: true });
    }
  }, [loading, isAuthenticated, authMe, navigate]);

  if (loading || !authMe || authMe.is_superuser !== true) {
    return (
      <div style={{ padding: 20, color: '#64748b' }}>
        Cargando…
      </div>
    );
  }

  return <ChecadasEspecialesEditor />;
}
