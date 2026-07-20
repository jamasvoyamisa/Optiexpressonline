import { useState, useEffect, useRef, useMemo } from 'react';
import api from '../../services/api';
import { Asistencia, Dispositivo, Empleado } from '../../types';
import { parseTimestampForMexico, toMexicoDateString } from '../../utils/date';
import { fmtNombreEmpleado } from '../../utils/format';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ChecadaMiniGrid } from '../../components/asistencia/ChecadaMiniGrid';
import {
  rhMobileBadge,
  rhMobileBtnPrimary,
  rhMobileBtnSecondary,
  rhMobileCard,
  rhMobileCardRow,
  rhMobileCardSub,
  rhMobileCardTitle,
  rhMobileFilterStack,
  rhMobileInput,
  rhMobileSelect,
} from '../rh/rhMobileStyles';

interface AsistenciaConEmpleado extends Asistencia {
  empleado?: Empleado;
  dispositivo?: Dispositivo;
}

const FILAS_POR_PAGINA = 25;

export const AsistenciaPage = () => {
  const isMobile = useIsMobile();
  const [checadas, setChecadas] = useState<AsistenciaConEmpleado[]>([]);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const hoy = toMexicoDateString(new Date());
  const [filtros, setFiltros] = useState({ dispositivo_id: '', fecha_inicio: hoy, fecha_fin: hoy });
  const [busquedaNombre, setBusquedaNombre] = useState('');
  const [pagina, setPagina] = useState(1);
  const filtrosRef = useRef(filtros);
  filtrosRef.current = filtros;

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const f = filtrosRef.current;
    try {
      const params = new URLSearchParams();
      params.set('limit', '500');
      if (f.dispositivo_id) params.append('dispositivo_id', f.dispositivo_id);
      if (f.fecha_inicio) params.append('fecha_inicio', f.fecha_inicio + 'T00:00:00');
      if (f.fecha_fin) params.append('fecha_fin', f.fecha_fin + 'T23:59:59');
      const empleadosParams = new URLSearchParams();
      empleadosParams.set('limit', '5000');
      // Sin usuarios especiales: no son personal operativo de checadas.
      const [checadasRes, dispositivosRes, empleadosRes] = await Promise.all([
        api.get(`/asistencia/checadas?${params.toString()}`),
        api.get('/asistencia/devices'),
        api.get(`/personal/empleados?${empleadosParams.toString()}`),
      ]);
      setChecadas(checadasRes.data);
      setDispositivos(dispositivosRes.data);
      setEmpleados(empleadosRes.data || []);
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFiltros = () => {
    setPagina(1);
    setLoading(true);
    loadData();
  };

  const getEmpleadoNombre = (checada: AsistenciaConEmpleado) => {
    if (checada.empleado_nombre) return checada.empleado_nombre;
    const empleado = empleados.find(e => e.id === checada.empleado_id);
    if (!empleado) return `ID: ${checada.empleado_id}`;
    return fmtNombreEmpleado(empleado);
  };

  const estadisticas = {
    totalChecadas: checadas.length,
    empleadosHoy: new Set(checadas.filter(c => {
      const hoy = new Date().toLocaleDateString('es-MX');
      return parseTimestampForMexico(c.timestamp).toLocaleDateString('es-MX') === hoy;
    }).map(c => c.empleado_id)).size,
    dispositivosActivos: dispositivos.filter(d => d.activo).length,
  };

  type DayRow = {
    key: string;
    numeroEmpleado: string;
    empleadoNombre: string;
    empresa: string;
    departamento: string;
    fecha: string;
    fechaSort: string;
    entrada?: string;
    salida_comer?: string;
    regreso_comer?: string;
    salida?: string;
    esTiempoExtra: boolean;
    totalHoras: string;
    /** Timestamp (ms) de la primera checada del día */
    primeraChecada?: number;
    /** Timestamp (ms) de la última checada del día */
    ultimaChecada?: number;
    /** Timestamp (ms) de salida a comer y regreso (para restar del total) */
    salidaComerTs?: number;
    regresoComerTs?: number;
  };

  const calcularHorasDelDia = (row: DayRow): string => {
    const primera = row.primeraChecada;
    const ultima = row.ultimaChecada;
    if (primera == null || ultima == null || ultima <= primera) return '--';
    let totalMs = ultima - primera;
    if (row.salidaComerTs != null && row.regresoComerTs != null && row.regresoComerTs > row.salidaComerTs) {
      totalMs -= (row.regresoComerTs - row.salidaComerTs);
    }
    const mins = Math.floor(totalMs / (1000 * 60));
    if (Number.isNaN(mins) || mins < 0) return '--';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (Number.isNaN(h) || Number.isNaN(m)) return '--';
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const dayRows: DayRow[] = useMemo(() => {
    const map = new Map<string, DayRow>();
    for (const c of checadas) {
      const d = parseTimestampForMexico(c.timestamp);
      const fechaStr = d.toLocaleDateString('es-MX', { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Mexico_City' });
      const fechaSort = toMexicoDateString(d);
      const empNombre = getEmpleadoNombre(c);
      const emp = empleados.find(e => e.id === c.empleado_id);
      const numeroEmp = emp?.numero_empleado ?? c.empleado_numero ?? '-';
      const depto = emp?.departamento?.nombre || c.departamento_nombre || '-';
      const empresaNombre = emp?.empresa?.nombre || c.empresa_nombre || '-';
      const key = `${c.empleado_id}_${fechaSort}`;
      if (!map.has(key)) {
        map.set(key, { key, numeroEmpleado: String(numeroEmp), empleadoNombre: empNombre, empresa: empresaNombre, departamento: depto, fecha: fechaStr, fechaSort, esTiempoExtra: false, totalHoras: '--' });
      }
      const row = map.get(key)!;
      if (c.es_tiempo_extra) row.esTiempoExtra = true;
      const t = d.getTime();
      if (row.primeraChecada == null) row.primeraChecada = t; else row.primeraChecada = Math.min(row.primeraChecada, t);
      if (row.ultimaChecada == null) row.ultimaChecada = t; else row.ultimaChecada = Math.max(row.ultimaChecada, t);
      const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      if (c.tipo === 'entrada' && !row.entrada) row.entrada = hora;
      else if (c.tipo === 'salida_comer') {
        if (!row.salida_comer) { row.salida_comer = hora; row.salidaComerTs = t; }
      } else if (c.tipo === 'regreso_comer') {
        if (!row.regreso_comer) { row.regreso_comer = hora; row.regresoComerTs = t; }
      } else if (c.tipo === 'salida' && !row.salida) row.salida = hora;
    }
    const list = Array.from(map.values());
    list.forEach(row => { row.totalHoras = calcularHorasDelDia(row); });
    return list.sort((a, b) => b.fechaSort.localeCompare(a.fechaSort) || a.empleadoNombre.localeCompare(b.empleadoNombre));
  }, [checadas, empleados]);

  const dayRowsFiltrados = useMemo(() => {
    const q = busquedaNombre.trim().toLowerCase();
    if (!q) return dayRows;
    return dayRows.filter(row =>
      row.empleadoNombre.toLowerCase().includes(q) ||
      row.numeroEmpleado.toLowerCase().includes(q)
    );
  }, [dayRows, busquedaNombre]);

  const totalPaginas = Math.max(1, Math.ceil(dayRowsFiltrados.length / FILAS_POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * FILAS_POR_PAGINA;
  const dayRowsPagina = dayRowsFiltrados.slice(inicio, inicio + FILAS_POR_PAGINA);

  useEffect(() => {
    setPagina(1);
  }, [busquedaNombre]);

  useEffect(() => {
    setPagina(p => Math.min(p, totalPaginas));
  }, [totalPaginas]);

  if (loading && checadas.length === 0) return <div style={{ padding: isMobile ? '14px' : '20px' }}>Cargando...</div>;

  const paginationBar = dayRowsFiltrados.length > FILAS_POR_PAGINA && (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '12px', padding: '0 4px' }}>
      <span style={{ color: '#555', fontSize: '0.85rem' }}>
        {inicio + 1}–{Math.min(inicio + FILAS_POR_PAGINA, dayRowsFiltrados.length)} de {dayRowsFiltrados.length}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          disabled={paginaSegura <= 1}
          onClick={() => setPagina(p => Math.max(1, p - 1))}
          style={isMobile ? { ...rhMobileBtnSecondary, minHeight: 36 } : { padding: '6px 14px', border: '1px solid #ccc', borderRadius: '6px', background: paginaSegura <= 1 ? '#f5f5f5' : 'white', cursor: paginaSegura <= 1 ? 'not-allowed' : 'pointer' }}
        >
          Anterior
        </button>
        <span style={{ color: '#333', fontSize: '0.85rem' }}>{paginaSegura}/{totalPaginas}</span>
        <button
          type="button"
          disabled={paginaSegura >= totalPaginas}
          onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
          style={isMobile ? { ...rhMobileBtnSecondary, minHeight: 36 } : { padding: '6px 14px', border: '1px solid #ccc', borderRadius: '6px', background: paginaSegura >= totalPaginas ? '#f5f5f5' : 'white', cursor: paginaSegura >= totalPaginas ? 'not-allowed' : 'pointer' }}
        >
          Siguiente
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: isMobile ? '14px 14px 30px' : '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? '1.2rem' : '1.6rem' }}>Asistencia</h1>
        <button
          type="button"
          onClick={() => { setLoading(true); loadData(); }}
          disabled={loading}
          style={isMobile
            ? { ...rhMobileBtnSecondary, minHeight: 40, opacity: loading ? 0.6 : 1 }
            : { padding: '8px 18px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: isMobile ? 8 : '16px', marginBottom: '20px' }}>
        {[
          { label: 'Total Checadas', value: estadisticas.totalChecadas, color: '#333' },
          { label: 'Empleados Hoy', value: estadisticas.empleadosHoy, color: '#28a745' },
          { label: 'Dispositivos', value: estadisticas.dispositivosActivos, color: '#0ea5e9' },
        ].map((s) => (
          <div key={s.label} style={{ padding: isMobile ? '12px' : '18px', backgroundColor: 'white', borderRadius: isMobile ? 12 : '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '2px' }}>{s.label}</div>
            <div style={{ fontSize: isMobile ? '1.35rem' : '1.8rem', fontWeight: 'bold', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: isMobile ? '12px' : '18px', backgroundColor: 'white', borderRadius: isMobile ? 12 : '8px', border: '1px solid #e5e7eb', marginBottom: '20px' }}>
        {!isMobile && <h3 style={{ margin: '0 0 12px 0' }}>Filtros</h3>}
        {isMobile ? (
          <div style={rhMobileFilterStack}>
            <input
              type="search"
              value={busquedaNombre}
              onChange={(e) => setBusquedaNombre(e.target.value)}
              placeholder="Buscar nombre o no. empleado"
              style={rhMobileInput}
            />
            <select
              value={filtros.dispositivo_id}
              onChange={(e) => setFiltros({ ...filtros, dispositivo_id: e.target.value })}
              style={rhMobileSelect}
            >
              <option value="">Todos los dispositivos</option>
              {dispositivos.map(dev => (
                <option key={dev.id} value={dev.id}>{dev.nombre}</option>
              ))}
            </select>
            <input type="date" value={filtros.fecha_inicio} onChange={(e) => setFiltros({ ...filtros, fecha_inicio: e.target.value })} style={rhMobileInput} />
            <input type="date" value={filtros.fecha_fin} onChange={(e) => setFiltros({ ...filtros, fecha_fin: e.target.value })} style={rhMobileInput} />
            <button type="button" onClick={handleFiltros} style={{ ...rhMobileBtnPrimary, backgroundColor: '#0ea5e9' }}>Aplicar filtros</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <input
              type="search"
              value={busquedaNombre}
              onChange={(e) => setBusquedaNombre(e.target.value)}
              placeholder="Buscar por nombre o no. empleado"
              style={{ flex: '1 1 200px', minWidth: '180px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <select
              value={filtros.dispositivo_id}
              onChange={(e) => setFiltros({ ...filtros, dispositivo_id: e.target.value })}
              style={{ flex: '1 1 180px', minWidth: '160px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            >
              <option value="">Todos los dispositivos</option>
              {dispositivos.map(dev => (
                <option key={dev.id} value={dev.id}>{dev.nombre}</option>
              ))}
            </select>
            <input type="date" value={filtros.fecha_inicio} onChange={(e) => setFiltros({ ...filtros, fecha_inicio: e.target.value })} style={{ flex: '1 1 150px', minWidth: '140px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
            <input type="date" value={filtros.fecha_fin} onChange={(e) => setFiltros({ ...filtros, fecha_fin: e.target.value })} style={{ flex: '1 1 150px', minWidth: '140px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }} />
            <button type="button" onClick={handleFiltros} style={{ flex: '0 0 auto', padding: '8px 20px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Aplicar Filtros
            </button>
          </div>
        )}
      </div>

      {dayRowsFiltrados.length === 0 ? (
        <p style={{ color: '#666', textAlign: 'center', padding: '32px 0' }}>
          {dayRows.length === 0 ? 'No hay checadas registradas.' : 'Ningún empleado coincide con la búsqueda.'}
        </p>
      ) : isMobile ? (
        <>
          {paginationBar}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dayRowsPagina.map(row => (
              <div key={row.key} style={{ ...rhMobileCard, backgroundColor: row.esTiempoExtra ? '#fff8e1' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={rhMobileCardTitle}>{row.empleadoNombre}</div>
                    <div style={rhMobileCardSub}>#{row.numeroEmpleado} · {row.departamento}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {row.esTiempoExtra && <span style={rhMobileBadge('#ff9800', '#fff')}>T.EXTRA</span>}
                    <span style={{ fontWeight: 800, color: '#0ea5e9', fontSize: '0.95rem' }}>{row.totalHoras}</span>
                  </div>
                </div>
                <div style={{ ...rhMobileCardRow, marginTop: 0 }}>
                  <span>{row.fecha}</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{row.empresa}</span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <ChecadaMiniGrid entrada={row.entrada} salida_comer={row.salida_comer} regreso_comer={row.regreso_comer} salida={row.salida} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          {paginationBar}
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>No.</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>Empleado</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>Empresa</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>Departamento</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', fontWeight: 600, color: '#555' }}>Fecha</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', fontWeight: 600, color: '#155724', backgroundColor: '#e8f5e9' }}>Entrada</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', fontWeight: 600, color: '#856404', backgroundColor: '#fff8e1' }}>Salida Comer</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', fontWeight: 600, color: '#004085', backgroundColor: '#e3f2fd' }}>Regreso Comer</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', fontWeight: 600, color: '#721c24', backgroundColor: '#fce4ec' }}>Salida</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', fontWeight: 600, color: '#333', backgroundColor: '#f0f0f0' }}>Total horas</th>
              </tr>
            </thead>
            <tbody>
              {dayRowsPagina.map(row => (
                <tr key={row.key} style={{
                  borderBottom: '1px solid #eee',
                  backgroundColor: row.esTiempoExtra ? '#fff8e1' : 'transparent',
                }}>
                  <td style={{ padding: '10px 14px', color: '#555', fontWeight: 500 }}>{row.numeroEmpleado}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{row.empleadoNombre}</td>
                  <td style={{ padding: '10px 14px', color: '#555' }}>{row.empresa}</td>
                  <td style={{ padding: '10px 14px', color: '#555' }}>{row.departamento}</td>
                  <td style={{ padding: '10px 14px', color: '#555', whiteSpace: 'nowrap' }}>
                    {row.fecha}
                    {row.esTiempoExtra && (
                      <span style={{
                        marginLeft: '8px', padding: '2px 8px', borderRadius: '4px',
                        fontSize: '0.72rem', fontWeight: 600,
                        backgroundColor: '#ff9800', color: 'white',
                      }}>T. EXTRA</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: row.entrada ? '#155724' : '#ccc' }}>{row.entrada || '--:--'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: row.salida_comer ? '#856404' : '#ccc' }}>{row.salida_comer || '--:--'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: row.regreso_comer ? '#004085' : '#ccc' }}>{row.regreso_comer || '--:--'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: row.salida ? '#721c24' : '#ccc' }}>{row.salida || '--:--'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#333' }}>{row.totalHoras}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
