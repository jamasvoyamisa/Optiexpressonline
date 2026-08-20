import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { fmtNombreEmpleado } from '../../utils/format';
import { toMexicoDateString } from '../../utils/date';

type Empresa = {
  id: number;
  nombre: string;
  gestiona_descansos_rotativos?: boolean;
};

type Departamento = { id: number; nombre: string; empresa_id: number };

type Empleado = {
  id: number;
  nombre: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  numero_empleado?: string;
  empresa_id?: number | null;
  departamento_id?: number | null;
};

type Descanso = { id: number; empleado_id: number; fecha: string };

function mondayOfWeek(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const day = (d.getDay() + 6) % 7; // 0=lun
  d.setDate(d.getDate() - day);
  return toMexicoDateString(d);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return toMexicoDateString(d);
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default function DescansosProgramadosPage() {
  const { authMe } = useAuth();
  const puede =
    authMe?.is_superuser ||
    authMe?.is_rh ||
    authMe?.is_director ||
    (authMe?.departamentos_que_administro?.length ?? 0) > 0;

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [deptos, setDeptos] = useState<Departamento[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [deptoId, setDeptoId] = useState('');
  const [semanaLun, setSemanaLun] = useState(() => mondayOfWeek(toMexicoDateString(new Date())));
  const [marks, setMarks] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const diasSemana = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(semanaLun, i)),
    [semanaLun],
  );
  const semanaDom = diasSemana[6];

  const empresaSel = empresas.find((e) => String(e.id) === empresaId);
  const gestiona = !!empresaSel?.gestiona_descansos_rotativos;

  useEffect(() => {
    api
      .get<Empresa[]>('/personal/empresas?limit=200')
      .then((r) => setEmpresas(Array.isArray(r.data) ? r.data : []))
      .catch(() => setEmpresas([]));
  }, []);

  useEffect(() => {
    if (!empresaId) {
      setDeptos([]);
      setDeptoId('');
      return;
    }
    api
      .get<Departamento[]>(`/personal/departamentos?empresa_id=${empresaId}&limit=200`)
      .then((r) => setDeptos(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDeptos([]));
    setDeptoId('');
  }, [empresaId]);

  const cargar = useCallback(async () => {
    if (!empresaId || !gestiona) {
      setEmpleados([]);
      setMarks({});
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        empresa_id: empresaId,
        estado: 'activo',
        limit: '500',
      });
      if (deptoId) params.set('departamento_id', deptoId);
      const [empRes, desRes] = await Promise.all([
        api.get<Empleado[]>(`/personal/empleados?${params}`),
        api.get<Descanso[]>(
          `/asistencia/descansos-programados?fecha_inicio=${semanaLun}&fecha_fin=${semanaDom}&empresa_id=${empresaId}${
            deptoId ? `&departamento_id=${deptoId}` : ''
          }`,
        ),
      ]);
      const emps = Array.isArray(empRes.data) ? empRes.data : [];
      setEmpleados(emps);
      const next: Record<string, Set<string>> = {};
      for (const e of emps) next[String(e.id)] = new Set();
      for (const d of Array.isArray(desRes.data) ? desRes.data : []) {
        const k = String(d.empleado_id);
        if (!next[k]) next[k] = new Set();
        next[k].add(d.fecha.slice(0, 10));
      }
      setMarks(next);
    } catch {
      setEmpleados([]);
      setMarks({});
    } finally {
      setLoading(false);
    }
  }, [empresaId, deptoId, semanaLun, semanaDom, gestiona]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const toggle = (empleadoId: number, fecha: string) => {
    const k = String(empleadoId);
    setMarks((prev) => {
      const copy = { ...prev };
      const set = new Set(copy[k] || []);
      if (set.has(fecha)) set.delete(fecha);
      else set.add(fecha);
      copy[k] = set;
      return copy;
    });
  };

  const guardar = async () => {
    if (!gestiona) return;
    setSaving(true);
    try {
      const items: { empleado_id: number; fecha: string }[] = [];
      for (const e of empleados) {
        const set = marks[String(e.id)];
        if (!set) continue;
        for (const f of set) items.push({ empleado_id: e.id, fecha: f });
      }
      await api.put('/asistencia/descansos-programados', {
        fecha_inicio: semanaLun,
        fecha_fin: semanaDom,
        empleado_ids: empleados.map((e) => e.id),
        items,
      });
      alert('Descansos guardados');
      await cargar();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'No se pudo guardar';
      alert(typeof msg === 'string' ? msg : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!puede) {
    return <p style={{ padding: 24, color: '#64748b' }}>No tienes permiso para gestionar descansos.</p>;
  }

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 8px', color: '#1e3a5f' }}>Descansos programados</h2>
      <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.9rem', maxWidth: 720 }}>
        Solo empresas con «Gestiona descansos rotativos». Marca el día libre de cada persona en la semana;
        no se generará falta ese día.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem', fontWeight: 600 }}>
          Empresa
          <select
            value={empresaId}
            onChange={(e) => setEmpresaId(e.target.value)}
            style={{ minWidth: 200, padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
          >
            <option value="">Selecciona…</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
                {e.gestiona_descansos_rotativos ? '' : ' (sin flag)'}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem', fontWeight: 600 }}>
          Departamento
          <select
            value={deptoId}
            onChange={(e) => setDeptoId(e.target.value)}
            disabled={!empresaId}
            style={{ minWidth: 180, padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
          >
            <option value="">Todos</option>
            {deptos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem', fontWeight: 600 }}>
          Semana (lunes)
          <input
            type="date"
            value={semanaLun}
            onChange={(e) => setSemanaLun(mondayOfWeek(e.target.value || semanaLun))}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
          />
        </label>
        <button
          type="button"
          onClick={() => setSemanaLun(addDays(semanaLun, -7))}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
        >
          ← Semana
        </button>
        <button
          type="button"
          onClick={() => setSemanaLun(addDays(semanaLun, 7))}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
        >
          Semana →
        </button>
        <button
          type="button"
          disabled={!gestiona || saving || loading || empleados.length === 0}
          onClick={() => void guardar()}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#1e3a5f',
            color: '#fff',
            fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
            opacity: !gestiona || empleados.length === 0 ? 0.5 : 1,
          }}
        >
          {saving ? 'Guardando…' : 'Guardar semana'}
        </button>
      </div>

      {empresaId && !gestiona && (
        <div style={{ padding: 14, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, marginBottom: 16 }}>
          Esta empresa no tiene activado «Gestiona descansos rotativos». Actívalo en Configuración → Empresas.
        </div>
      )}

      {loading ? (
        <p style={{ color: '#64748b' }}>Cargando…</p>
      ) : gestiona && empleados.length === 0 ? (
        <p style={{ color: '#64748b' }}>No hay empleados activos con ese filtro.</p>
      ) : gestiona ? (
        <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ textAlign: 'left', padding: 10, borderBottom: '2px solid #e2e8f0' }}>Empleado</th>
                {diasSemana.map((f, i) => (
                  <th key={f} style={{ padding: 8, borderBottom: '2px solid #e2e8f0', textAlign: 'center', minWidth: 56 }}>
                    <div>{DIAS[i]}</div>
                    <div style={{ fontWeight: 500, color: '#64748b', fontSize: '0.72rem' }}>{f.slice(8)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {empleados.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: 10 }}>
                    <div style={{ fontWeight: 600 }}>{fmtNombreEmpleado(e)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{e.numero_empleado}</div>
                  </td>
                  {diasSemana.map((f) => {
                    const on = marks[String(e.id)]?.has(f);
                    return (
                      <td key={f} style={{ textAlign: 'center', padding: 4 }}>
                        <button
                          type="button"
                          onClick={() => toggle(e.id, f)}
                          title={on ? 'Quitar descanso' : 'Marcar descanso'}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            border: on ? '2px solid #0369a1' : '1px solid #e2e8f0',
                            background: on ? '#e0f2fe' : '#fff',
                            cursor: 'pointer',
                            fontWeight: 700,
                            color: on ? '#0369a1' : '#cbd5e1',
                          }}
                        >
                          {on ? 'D' : '·'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
