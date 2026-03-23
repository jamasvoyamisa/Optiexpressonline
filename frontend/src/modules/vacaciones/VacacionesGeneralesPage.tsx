import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import type {
  VacacionGeneralCreate,
  VacacionGeneralResponse,
  AplicarVacacionGeneralResultado,
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

const fmtDate = (s: string) => {
  if (!s) return '—';
  const d = s.includes('T') ? s.slice(0, 10) : s;
  return d;
};

export interface VacacionesGeneralesPageProps {
  /** Si true, se usa dentro de Configuración (sin título duplicado). */
  embedded?: boolean;
}

export const VacacionesGeneralesPage = ({ embedded = false }: VacacionesGeneralesPageProps) => {
  const [items, setItems] = useState<VacacionGeneralResponse[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaResponse[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartamentoResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloActivos, setSoloActivos] = useState(false);
  const [aplicandoId, setAplicandoId] = useState<number | null>(null);
  const [resultado, setResultado] = useState<AplicarVacacionGeneralResultado | null>(null);

  const [nombre, setNombre] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [alcance, setAlcance] = useState<VacacionGeneralCreate['alcance']>('global');
  const [empresaId, setEmpresaId] = useState<number | ''>('');
  const [departamentoId, setDepartamentoId] = useState<number | ''>('');
  const [diasLey, setDiasLey] = useState('2');
  const [diasRegalo, setDiasRegalo] = useState('1');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rList, rEmp, rDep] = await Promise.all([
        api.get<VacacionGeneralResponse[]>('/vacaciones/generales', {
          params: { solo_activos: soloActivos },
        }),
        api.get<EmpresaResponse[]>('/personal/empresas?limit=500'),
        api.get<DepartamentoResponse[]>('/personal/departamentos?limit=1000'),
      ]);
      setItems(rList.data);
      setEmpresas(rEmp.data);
      setDepartamentos(rDep.data);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'No se pudieron cargar las vacaciones generales (¿permisos RH/Admin?)';
      setError(typeof msg === 'string' ? msg : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [soloActivos]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const body: VacacionGeneralCreate = {
        nombre: nombre.trim(),
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        alcance,
        empresa_id: alcance === 'empresa' ? Number(empresaId) || undefined : undefined,
        departamento_id: alcance === 'departamento' ? Number(departamentoId) || undefined : undefined,
        dias_cuenta_ley: Number(diasLey.replace(',', '.')),
        dias_regalo_empresa: Number((diasRegalo || '0').replace(',', '.')),
        activo: true,
        notas: notas.trim() || undefined,
      };
      await api.post('/vacaciones/generales', body);
      setNombre('');
      setNotas('');
      await cargar();
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string | string[] } } })?.response?.data?.detail;
      setError(typeof d === 'string' ? d : Array.isArray(d) ? d.join(', ') : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const aplicar = async (id: number) => {
    if (!window.confirm('¿Aplicar esta vacación general a todos los empleados del alcance? Se descontarán días LFT y se registrarán días regalo (operación idempotente por empleado).')) {
      return;
    }
    setAplicandoId(id);
    setResultado(null);
    setError(null);
    try {
      const { data } = await api.post<AplicarVacacionGeneralResultado>(
        `/vacaciones/generales/${id}/aplicar`
      );
      setResultado(data);
      await cargar();
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === 'string' ? d : 'Error al aplicar');
    } finally {
      setAplicandoId(null);
    }
  };

  const deptoNombre = (id: number | null | undefined) =>
    departamentos.find((d) => d.id === id)?.nombre ?? '—';
  const empresaNombre = (id: number | null | undefined) =>
    empresas.find((e) => e.id === id)?.nombre ?? '—';

  return (
    <div style={{ padding: embedded ? 0 : '20px', maxWidth: 1200 }}>
      {!embedded && (
        <h2 style={{ marginTop: 0, color: '#0f172a' }}>Vacaciones generales y días empresa</h2>
      )}
      <p
        style={{
          color: '#64748b',
          fontSize: '0.95rem',
          maxWidth: 900,
          marginTop: embedded ? 0 : undefined,
        }}
      >
        Define periodos (ej. Semana Santa): <strong>días que cuentan como vacaciones de ley</strong> se descuentan del
        saldo del empleado (periodo vigente primero; si no alcanza, del siguiente). Los{' '}
        <strong>días regalo</strong> se registran sin descontar LFT. Alcance: global, por empresa o por departamento.
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

      {resultado && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: '#f0fdf4',
            color: '#166534',
            borderRadius: 8,
            border: '1px solid #bbf7d0',
          }}
        >
          Aplicación: {resultado.aplicados} de {resultado.empleados_totales} empleados.
          {resultado.omitidos.length > 0 && (
            <span> Omitidos (ya aplicados): {resultado.omitidos.length}.</span>
          )}
          {resultado.errores.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary>Errores ({resultado.errores.length})</summary>
              <ul style={{ fontSize: '0.85rem', margin: '8px 0 0 18px' }}>
                {resultado.errores.map((x, i) => (
                  <li key={i}>
                    Empleado #{x.empleado_id}: {x.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <form
        onSubmit={crear}
        style={{
          marginBottom: 28,
          padding: 20,
          background: '#fff',
          borderRadius: 10,
          border: '1px solid #e5e7eb',
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          alignItems: 'end',
        }}
      >
        <div style={{ gridColumn: '1 / -1', fontWeight: 700, color: '#334155' }}>Nueva vacación general</div>
        <label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Nombre</span>
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            placeholder="Ej. Semana Santa 2026"
          />
        </label>
        <label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Inicio</span>
          <input
            type="date"
            required
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          />
        </label>
        <label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Fin</span>
          <input
            type="date"
            required
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          />
        </label>
        <label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Alcance</span>
          <select
            value={alcance}
            onChange={(e) => setAlcance(e.target.value as VacacionGeneralCreate['alcance'])}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
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
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            >
              <option value="">Seleccione…</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
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
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
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
            Días cuentan LFT
          </span>
          <input
            type="text"
            inputMode="decimal"
            required
            value={diasLey}
            onChange={(e) => setDiasLey(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            placeholder="2"
          />
        </label>
        <label>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>
            Días regalo empresa
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={diasRegalo}
            onChange={(e) => setDiasRegalo(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            placeholder="0"
          />
        </label>
        <label style={{ gridColumn: 'span 2' }}>
          <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Notas</span>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            placeholder="Opcional"
          />
        </label>
        <div>
          <button
            type="submit"
            disabled={guardando}
            style={{
              padding: '10px 20px',
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: guardando ? 'wait' : 'pointer',
            }}
          >
            {guardando ? 'Guardando…' : 'Crear'}
          </button>
        </div>
      </form>

      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
          Solo periodos activos
        </label>
        <button
          type="button"
          onClick={() => void cargar()}
          style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff' }}
        >
          Actualizar lista
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#64748b' }}>Cargando…</p>
      ) : (
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Nombre</th>
                <th style={th}>Fechas</th>
                <th style={th}>Alcance</th>
                <th style={th}>LFT / Regalo</th>
                <th style={th}>Estado</th>
                <th style={th}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td style={td}>{row.nombre}</td>
                  <td style={td}>
                    {fmtDate(row.fecha_inicio)} → {fmtDate(row.fecha_fin)}
                  </td>
                  <td style={td}>
                    {row.alcance === 'global' && 'Global'}
                    {row.alcance === 'empresa' && `Empresa: ${empresaNombre(row.empresa_id)}`}
                    {row.alcance === 'departamento' && `Depto: ${deptoNombre(row.departamento_id)}`}
                  </td>
                  <td style={td}>
                    {row.dias_cuenta_ley} / {row.dias_regalo_empresa}
                  </td>
                  <td style={td}>{row.activo ? 'Activo' : 'Inactivo'}</td>
                  <td style={td}>
                    <button
                      type="button"
                      disabled={!row.activo || aplicandoId !== null}
                      onClick={() => void aplicar(row.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: 'none',
                        background: row.activo ? '#16a34a' : '#94a3b8',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        cursor: row.activo && aplicandoId === null ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {aplicandoId === row.id ? 'Aplicando…' : 'Aplicar a empleados'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <p style={{ padding: 24, color: '#64748b', margin: 0 }}>No hay registros.</p>
          )}
        </div>
      )}
    </div>
  );
};
