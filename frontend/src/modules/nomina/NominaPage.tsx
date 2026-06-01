import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { canAccessNomina } from '../../config/features';

// ── Tipos ─────────────────────────────────────────────────────────────────

interface CatalogoItem { clave: string; descripcion: string; }
interface EmpresaBasic { id: number; nombre: string; }
interface PeriodoNomina {
  id: number;
  empresa_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  tipo: string;
  periodicidad?: string;
  estado: string;
  total_percepciones?: string;
  total_deducciones?: string;
  total_neto?: string;
  notas?: string;
  created_at: string;
}

interface DetalleNomina {
  id: number;
  periodo_nomina_id: number;
  empleado_id: number;
  empleado_nombre?: string;
  dias_pagados?: string;
  dias_laborados?: string;
  dias_fuente?: string;
  total_percepciones?: string;
  total_gravado?: string;
  total_deducciones?: string;
  total_neto?: string;
  subsidio_causado?: string;
  percepciones_json?: string;
  deducciones_json?: string;
  cfdi_uuid?: string;
  cfdi_error?: string;
}

interface FiscalApiStatus {
  habilitado: boolean;
  sandbox: boolean;
  api_url: string;
  tiene_csd: boolean;
  modo: string;
  mensaje: string;
}

interface ConceptoLinea {
  clave?: string;
  concepto?: string;
  importe?: number;
  importe_gravado?: number;
  importe_exento?: number;
}

// ── Estilos base ──────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
  padding: '20px 22px', marginBottom: 20,
};
const label: React.CSSProperties = {
  display: 'block', marginBottom: 4, fontSize: '0.83rem', fontWeight: 500, color: '#374151',
};
const input: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px', border: '1px solid #d1d5db',
  borderRadius: 6, fontSize: '0.88rem', boxSizing: 'border-box',
};
const sel: React.CSSProperties = { ...input };
const btn = (color = '#2563eb'): React.CSSProperties => ({
  padding: '8px 18px', background: color, color: '#fff', border: 'none',
  borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: '0.87rem',
});
const row: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' };
const col = (flex = 1): React.CSSProperties => ({ flex, minWidth: 120 });

const ESTADO_COLOR: Record<string, string> = {
  borrador: '#f59e0b', calculada: '#3b82f6', timbrada: '#10b981', pagada: '#6b7280',
};

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 12, maxWidth: 920, width: '94%',
  maxHeight: '88vh', overflow: 'auto', padding: '22px 24px',
};

function parseLineas(json?: string): ConceptoLinea[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function money(v?: string | number | null) {
  if (v == null || v === '') return '—';
  return `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

// ── Componente principal ──────────────────────────────────────────────────

export const NominaPage = () => {
  const { authMe } = useAuth();
  const puedeAcceder = canAccessNomina(authMe?.is_superuser);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  const [periodicidadCat, setPeriodicidadCat] = useState<CatalogoItem[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaBasic[]>([]);
  const [empresaSelId, setEmpresaSelId] = useState<number | ''>('');

  const [periodos, setPeriodos] = useState<PeriodoNomina[]>([]);
  const [totalPeriodos, setTotalPeriodos] = useState(0);
  const [nuevoPeriodo, setNuevoPeriodo] = useState({
    empresa_id: '', fecha_inicio: '', fecha_fin: '', tipo: 'O', periodicidad: '04', notas: '',
  });
  const [creandoPeriodo, setCreandoPeriodo] = useState(false);
  const [calculandoId, setCalculandoId] = useState<number | null>(null);
  const [timbrandoId, setTimbrandoId] = useState<number | null>(null);
  const [fiscalApi, setFiscalApi] = useState<FiscalApiStatus | null>(null);

  const [detallePeriodoId, setDetallePeriodoId] = useState<number | null>(null);
  const [detalles, setDetalles] = useState<DetalleNomina[]>([]);
  const [cargandoDetalles, setCargandoDetalles] = useState(false);
  const [empleadoDetalle, setEmpleadoDetalle] = useState<DetalleNomina | null>(null);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [catRes, empRes, faRes] = await Promise.all([
          api.get('/nomina/catalogos'),
          api.get('/personal/empresas?limit=100'),
          api.get<FiscalApiStatus>('/nomina/fiscalapi/status').catch(() => ({ data: null })),
        ]);
        setPeriodicidadCat(catRes.data?.periodicidad_pago ?? []);
        setEmpresas(empRes.data?.items ?? empRes.data ?? []);
        setFiscalApi(faRes.data ?? null);
      } catch {
        setMsg({ tipo: 'err', texto: 'Error al cargar catálogos.' });
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  const cargarPeriodos = useCallback(() => {
    const q = empresaSelId ? `?empresa_id=${empresaSelId}` : '';
    api.get(`/nomina/periodos${q}`)
      .then(r => {
        setPeriodos(r.data.items ?? []);
        setTotalPeriodos(r.data.total ?? 0);
      })
      .catch(err => {
        const detalle = err?.response?.data?.detail;
        setMsg({ tipo: 'err', texto: typeof detalle === 'string' ? detalle : 'Error al cargar periodos.' });
      });
  }, [empresaSelId]);

  useEffect(() => { cargarPeriodos(); }, [cargarPeriodos]);

  const abrirDetallePeriodo = async (periodoId: number) => {
    setDetallePeriodoId(periodoId);
    setCargandoDetalles(true);
    setEmpleadoDetalle(null);
    try {
      const r = await api.get<DetalleNomina[]>(`/nomina/periodos/${periodoId}/detalles`);
      setDetalles(r.data ?? []);
    } catch {
      setMsg({ tipo: 'err', texto: 'No se pudo cargar el detalle del periodo.' });
      setDetallePeriodoId(null);
    } finally {
      setCargandoDetalles(false);
    }
  };

  const crearPeriodo = async () => {
    setCreandoPeriodo(true);
    setMsg(null);
    try {
      await api.post('/nomina/periodos', {
        ...nuevoPeriodo,
        empresa_id: Number(nuevoPeriodo.empresa_id),
      });
      setMsg({ tipo: 'ok', texto: 'Periodo creado.' });
      setNuevoPeriodo({ empresa_id: '', fecha_inicio: '', fecha_fin: '', tipo: 'O', periodicidad: '04', notas: '' });
      cargarPeriodos();
    } catch (err: unknown) {
      let texto = 'Error al crear periodo.';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: string | { msg?: string }[] };
        if (typeof d?.detail === 'string') texto = d.detail;
        else if (Array.isArray(d?.detail)) {
          const parts = d.detail.map((x) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: string }).msg) : '')).filter(Boolean);
          if (parts.length) texto = parts.join('; ');
        }
      }
      setMsg({ tipo: 'err', texto });
    } finally {
      setCreandoPeriodo(false);
    }
  };

  const eliminarPeriodo = async (id: number) => {
    if (!confirm('¿Eliminar este periodo (borrador)?')) return;
    try {
      await api.delete(`/nomina/periodos/${id}`);
      cargarPeriodos();
    } catch {
      setMsg({ tipo: 'err', texto: 'No se pudo eliminar (solo se pueden eliminar borradores).' });
    }
  };

  const calcularPeriodo = async (id: number) => {
    if (!confirm('Calcular nómina del periodo (ISR, subsidio, IMSS, días por asistencia). ¿Continuar?')) return;
    setCalculandoId(id);
    setMsg(null);
    try {
      const r = await api.post<{
        empleados_procesados: number;
        omitidos: { empleado_id: number; motivo: string }[];
        advertencias?: string[];
        totales: { percepciones: number; deducciones: number; neto: number };
      }>(`/nomina/periodos/${id}/calcular`);
      const om = r.data.omitidos?.length
        ? ` Omitidos: ${r.data.omitidos.map((o) => `#${o.empleado_id} ${o.motivo}`).join('; ')}.`
        : '';
      const adv = r.data.advertencias?.length ? ` ${r.data.advertencias.slice(0, 3).join(' ')}` : '';
      setMsg({
        tipo: 'ok',
        texto: `Nómina calculada: ${r.data.empleados_procesados} empleados. Neto $${r.data.totales?.neto?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.${om}${adv}`,
      });
      cargarPeriodos();
    } catch (err: unknown) {
      let texto = 'No se pudo calcular.';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: string };
        if (typeof d?.detail === 'string') texto = d.detail;
      }
      setMsg({ tipo: 'err', texto });
    } finally {
      setCalculandoId(null);
    }
  };

  const timbrarPeriodoPrueba = async (id: number) => {
    if (!confirm(
      'Timbrar recibos en FiscalAPI SANDBOX (pruebas, sin validez fiscal). ¿Continuar?'
    )) return;
    setTimbrandoId(id);
    setMsg(null);
    try {
      const r = await api.post<{
        timbrados: number;
        fallidos: number;
        fallos: { empleado_id: number; error: string }[];
        estado: string;
      }>(`/nomina/periodos/${id}/timbrar-prueba`);
      const errTxt = r.data.fallos?.length
        ? ` Errores: ${r.data.fallos.slice(0, 2).map(f => `#${f.empleado_id}: ${f.error}`).join('; ')}`
        : '';
      setMsg({
        tipo: r.data.fallidos > 0 && r.data.timbrados === 0 ? 'err' : 'ok',
        texto: `Timbrado sandbox: ${r.data.timbrados} OK, ${r.data.fallidos} fallidos. Estado: ${r.data.estado}.${errTxt}`,
      });
      cargarPeriodos();
    } catch (err: unknown) {
      let texto = 'No se pudo timbrar.';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { detail?: string };
        if (typeof d?.detail === 'string') texto = d.detail;
      }
      setMsg({ tipo: 'err', texto });
    } finally {
      setTimbrandoId(null);
    }
  };

  const exportarCsv = async (id: number) => {
    try {
      const r = await api.get(`/nomina/periodos/${id}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      const cd = r.headers['content-disposition'] as string | undefined;
      const match = cd?.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? `nomina_periodo_${id}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setMsg({ tipo: 'err', texto: 'No se pudo exportar (calcule el periodo primero).' });
    }
  };

  if (!puedeAcceder) {
    return (
      <div style={{ padding: 40, color: '#6b7280' }}>
        El módulo de nómina solo está disponible para el administrador del sistema.
      </div>
    );
  }

  const periodoModal = periodos.find(p => p.id === detallePeriodoId);

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100 }}>
      <h1 style={{ margin: '0 0 6px', fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>
        Nómina — Periodos
      </h1>
      <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: '0.9rem' }}>
        Cálculo v1: días por checadas (o calendario si no hay asistencia), ISR con subsidio, IMSS por ramos.
        Los datos fiscales de empresa y empleado se configuran en Configuración y Personal.
      </p>

      {fiscalApi && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 8, fontSize: '0.85rem',
          background: fiscalApi.habilitado ? '#eff6ff' : '#fefce8',
          border: `1px solid ${fiscalApi.habilitado ? '#93c5fd' : '#fde047'}`,
          color: fiscalApi.habilitado ? '#1e40af' : '#854d0e',
        }}>
          <strong>FiscalAPI ({fiscalApi.modo})</strong>
          {' — '}{fiscalApi.mensaje}
          {!fiscalApi.habilitado && (
            <span> Activa <code>NOMINA_FISCALAPI_ENABLED=true</code> y credenciales en backend/.env (cuenta en test.fiscalapi.com).</span>
          )}
          {fiscalApi.habilitado && !fiscalApi.tiene_csd && (
            <span> Opcional: agrega CSD de prueba en .env o registra el emisor en FiscalAPI.</span>
          )}
        </div>
      )}

      {msg && (
        <div style={{
          padding: '10px 16px', marginBottom: 16, borderRadius: 8,
          background: msg.tipo === 'ok' ? '#ecfdf5' : '#fef2f2',
          color: msg.tipo === 'ok' ? '#166534' : '#991b1b',
          border: `1px solid ${msg.tipo === 'ok' ? '#a7f3d0' : '#fca5a5'}`,
          fontSize: '0.88rem',
        }}>
          {msg.texto}
        </div>
      )}

      {loading && <p style={{ padding: 20, color: '#6b7280' }}>Cargando…</p>}

      {!loading && (
        <div style={card}>
          <h3 style={{ margin: '0 0 14px', fontSize: '1rem', color: '#111827' }}>Nuevo periodo</h3>
          <div style={row}>
            <div style={col()}>
              <label style={label}>Empresa</label>
              <select style={sel} value={nuevoPeriodo.empresa_id} onChange={e => setNuevoPeriodo(p => ({ ...p, empresa_id: e.target.value }))}>
                <option value="">— Empresa —</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div style={col()}>
              <label style={label}>Fecha inicio</label>
              <input style={input} type="date" value={nuevoPeriodo.fecha_inicio} onChange={e => setNuevoPeriodo(p => ({ ...p, fecha_inicio: e.target.value }))} />
            </div>
            <div style={col()}>
              <label style={label}>Fecha fin</label>
              <input style={input} type="date" value={nuevoPeriodo.fecha_fin} onChange={e => setNuevoPeriodo(p => ({ ...p, fecha_fin: e.target.value }))} />
            </div>
            <div style={col()}>
              <label style={label}>Tipo</label>
              <select style={sel} value={nuevoPeriodo.tipo} onChange={e => setNuevoPeriodo(p => ({ ...p, tipo: e.target.value }))}>
                <option value="O">Ordinaria</option>
                <option value="E">Extraordinaria</option>
              </select>
            </div>
            <div style={col()}>
              <label style={label}>Periodicidad</label>
              <select style={sel} value={nuevoPeriodo.periodicidad} onChange={e => setNuevoPeriodo(p => ({ ...p, periodicidad: e.target.value }))}>
                {periodicidadCat.length > 0
                  ? periodicidadCat.map(i => <option key={i.clave} value={i.clave}>{i.clave} – {i.descripcion}</option>)
                  : (
                    <>
                      <option value="04">04 – Quincenal</option>
                      <option value="05">05 – Mensual</option>
                      <option value="02">02 – Semanal</option>
                    </>
                  )
                }
              </select>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={label}>Notas</label>
            <input style={input} value={nuevoPeriodo.notas} onChange={e => setNuevoPeriodo(p => ({ ...p, notas: e.target.value }))} placeholder="Opcional" />
          </div>
          <div style={{ marginTop: 14 }}>
            <button
              style={btn('#059669')}
              disabled={creandoPeriodo || !nuevoPeriodo.empresa_id || !nuevoPeriodo.fecha_inicio || !nuevoPeriodo.fecha_fin}
              onClick={crearPeriodo}
            >
              {creandoPeriodo ? 'Creando…' : '+ Crear periodo'}
            </button>
          </div>

          <div style={{ ...row, marginTop: 28, marginBottom: 14, alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#111827', flex: 1 }}>
              Periodos — {totalPeriodos} en total
            </h3>
            <div>
              <label style={{ ...label, marginBottom: 0, marginRight: 8, display: 'inline' }}>Empresa:</label>
              <select style={{ ...sel, width: 'auto', minWidth: 200 }} value={String(empresaSelId)} onChange={e => setEmpresaSelId(Number(e.target.value) || '')}>
                <option value="">Todas</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
          </div>

          {periodos.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '0.88rem' }}>No hay periodos registrados.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['ID', 'Empresa', 'Inicio', 'Fin', 'Tipo', 'Estado', 'Neto', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodos.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 10px' }}>{p.id}</td>
                      <td style={{ padding: '8px 10px' }}>{empresas.find(e => e.id === p.empresa_id)?.nombre ?? p.empresa_id}</td>
                      <td style={{ padding: '8px 10px' }}>{p.fecha_inicio.slice(0, 10)}</td>
                      <td style={{ padding: '8px 10px' }}>{p.fecha_fin.slice(0, 10)}</td>
                      <td style={{ padding: '8px 10px' }}>{p.tipo === 'O' ? 'Ordinaria' : 'Extraordinaria'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px',
                          borderRadius: 12, fontSize: '0.8rem', fontWeight: 600,
                          background: (ESTADO_COLOR[p.estado] ?? '#6b7280') + '22',
                          color: ESTADO_COLOR[p.estado] ?? '#6b7280',
                        }}>
                          {p.estado}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        {p.total_neto ? money(p.total_neto) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {(p.estado === 'borrador' || p.estado === 'calculada') && (
                            <button
                              type="button"
                              style={{ ...btn('#059669'), padding: '4px 12px', fontSize: '0.8rem' }}
                              disabled={calculandoId === p.id}
                              onClick={() => calcularPeriodo(p.id)}
                            >
                              {calculandoId === p.id ? 'Calculando…' : p.estado === 'calculada' ? 'Recalcular' : 'Calcular nómina'}
                            </button>
                          )}
                          {p.estado === 'calculada' && (
                            <>
                              <button
                                type="button"
                                style={{ ...btn('#2563eb'), padding: '4px 12px', fontSize: '0.8rem' }}
                                onClick={() => abrirDetallePeriodo(p.id)}
                              >
                                Ver detalle
                              </button>
                              <button
                                type="button"
                                style={{ ...btn('#6b7280'), padding: '4px 12px', fontSize: '0.8rem' }}
                                onClick={() => exportarCsv(p.id)}
                              >
                                Exportar CSV
                              </button>
                              {fiscalApi?.habilitado && (
                                <button
                                  type="button"
                                  style={{ ...btn('#7c3aed'), padding: '4px 12px', fontSize: '0.8rem' }}
                                  disabled={timbrandoId === p.id}
                                  onClick={() => timbrarPeriodoPrueba(p.id)}
                                  title="Timbrar en FiscalAPI sandbox (pruebas)"
                                >
                                  {timbrandoId === p.id ? 'Timbrando…' : 'Timbrar prueba'}
                                </button>
                              )}
                            </>
                          )}
                          {p.estado === 'timbrada' && (
                            <>
                              <button
                                type="button"
                                style={{ ...btn('#2563eb'), padding: '4px 12px', fontSize: '0.8rem' }}
                                onClick={() => abrirDetallePeriodo(p.id)}
                              >
                                Ver detalle
                              </button>
                              <button
                                type="button"
                                style={{ ...btn('#6b7280'), padding: '4px 12px', fontSize: '0.8rem' }}
                                onClick={() => exportarCsv(p.id)}
                              >
                                Exportar CSV
                              </button>
                            </>
                          )}
                          {p.estado === 'borrador' && (
                            <button
                              type="button"
                              style={{ ...btn('#ef4444'), padding: '4px 12px', fontSize: '0.8rem' }}
                              onClick={() => eliminarPeriodo(p.id)}
                            >
                              Eliminar
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
        </div>
      )}

      {detallePeriodoId != null && (
        <div style={overlay} onClick={() => setDetallePeriodoId(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
                  Detalle periodo #{detallePeriodoId}
                </h2>
                {periodoModal && (
                  <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '0.85rem' }}>
                    {periodoModal.fecha_inicio.slice(0, 10)} — {periodoModal.fecha_fin.slice(0, 10)}
                    {' · '}Neto {money(periodoModal.total_neto)}
                  </p>
                )}
              </div>
              <button type="button" style={{ ...btn('#6b7280'), padding: '6px 14px' }} onClick={() => setDetallePeriodoId(null)}>
                Cerrar
              </button>
            </div>

            {cargandoDetalles && <p style={{ color: '#6b7280' }}>Cargando empleados…</p>}

            {!cargandoDetalles && detalles.length === 0 && (
              <p style={{ color: '#9ca3af' }}>Sin detalle. Calcule el periodo primero.</p>
            )}

            {!cargandoDetalles && detalles.length > 0 && !empleadoDetalle && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Empleado', 'Días lab.', 'Días pag.', 'Fuente', 'Percepciones', 'Deducciones', 'Neto', 'UUID', ''].map(h => (
                        <th key={h} style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detalles.map(d => (
                      <tr key={d.id}>
                        <td style={{ padding: '8px' }}>{d.empleado_nombre || `#${d.empleado_id}`}</td>
                        <td style={{ padding: '8px' }}>{d.dias_laborados ?? '—'}</td>
                        <td style={{ padding: '8px' }}>{d.dias_pagados ?? '—'}</td>
                        <td style={{ padding: '8px' }}>{d.dias_fuente ?? '—'}</td>
                        <td style={{ padding: '8px' }}>{money(d.total_percepciones)}</td>
                        <td style={{ padding: '8px' }}>{money(d.total_deducciones)}</td>
                        <td style={{ padding: '8px' }}>{money(d.total_neto)}</td>
                        <td style={{ padding: '8px', fontSize: '0.72rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.cfdi_uuid || (d.cfdi_error ? '⚠ error' : '—')}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <button
                            type="button"
                            style={{ ...btn('#2563eb'), padding: '4px 10px', fontSize: '0.78rem' }}
                            onClick={() => setEmpleadoDetalle(d)}
                          >
                            Conceptos
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {empleadoDetalle && (
              <div>
                <button
                  type="button"
                  style={{ ...btn('#6b7280'), padding: '4px 12px', fontSize: '0.8rem', marginBottom: 12 }}
                  onClick={() => setEmpleadoDetalle(null)}
                >
                  ← Volver a lista
                </button>
                <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>
                  {empleadoDetalle.empleado_nombre || `Empleado #${empleadoDetalle.empleado_id}`}
                </h3>
                <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#6b7280' }}>
                  Días: {empleadoDetalle.dias_laborados} laborados / {empleadoDetalle.dias_pagados} pagados
                  ({empleadoDetalle.dias_fuente}) · Subsidio {money(empleadoDetalle.subsidio_causado)} · Neto {money(empleadoDetalle.total_neto)}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>Percepciones</h4>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem' }}>
                      {parseLineas(empleadoDetalle.percepciones_json).map((c, i) => (
                        <li key={i}>
                          {c.concepto}: {money(c.importe_gravado ?? c.importe)}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>Deducciones</h4>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem' }}>
                      {parseLineas(empleadoDetalle.deducciones_json).map((c, i) => (
                        <li key={i}>
                          {c.concepto}: {money(c.importe)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NominaPage;
