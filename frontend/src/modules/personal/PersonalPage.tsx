import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { parseTimestampForMexico } from '../../utils/date';
import { useAuth } from '../../hooks/useAuth';
import { Empleado, EmpleadoCreate, Dispositivo, Asistencia, EmpresaResponse, DepartamentoResponse, PuestoResponse } from '../../types';

interface FormData extends Omit<EmpleadoCreate, 'registrar_en_checador' | 'dispositivo_ids'> {
  registrar_en_checador: boolean;
  dispositivo_ids: number[];
  password?: string;
  username?: string;
  horario_id?: number;
  horario_sabado_id?: number | null;
}

interface HorarioSimple {
  id: number;
  nombre: string;
  hora_entrada: string;
  hora_salida: string;
  hora_salida_sabado?: string | null;
  activo: boolean;
}

const emptyForm: FormData = {
  numero_empleado: '', nombre: '', apellido_paterno: '', apellido_materno: '',
  email: '', telefono: '', username: '', empresa_id: undefined, departamento_id: undefined, puesto_id: undefined, curp: '', rfc: '', nss: '',
  direccion: '', colonia: '', cp: '', ciudad: '', fecha_nacimiento: '', contacto_emergencia: '', telefono_emergencia: '',
  fecha_ingreso: '', registrar_en_checador: false, dispositivo_ids: [], password: '', horario_id: undefined, horario_sabado_id: null,
};

const normalizeStr = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

const estadoBadge = (estado: string) => {
  const map: Record<string, { bg: string; text: string }> = {
    activo: { bg: '#d4edda', text: '#155724' },
    inactivo: { bg: '#fff3cd', text: '#856404' },
    baja: { bg: '#f8d7da', text: '#721c24' },
  };
  const c = map[estado] || map.activo;
  return (
    <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: c.bg, color: c.text, fontWeight: 500 }}>
      {estado.charAt(0).toUpperCase() + estado.slice(1)}
    </span>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%', height: '38px', padding: '0 12px', border: '1px solid #d1d5db', borderRadius: '6px',
  fontSize: '0.9rem', lineHeight: '38px', outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 500, color: '#374151',
};

const cardStyle: React.CSSProperties = {
  padding: '24px', backgroundColor: 'white', borderRadius: '10px',
  border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

const btnPrimary: React.CSSProperties = {
  padding: '9px 20px', backgroundColor: '#0ea5e9', color: 'white', border: 'none',
  borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap',
};

const btnSuccess: React.CSSProperties = { ...btnPrimary, backgroundColor: '#28a745' };
const btnDanger: React.CSSProperties = { ...btnPrimary, backgroundColor: '#dc3545' };
const btnSecondary: React.CSSProperties = { ...btnPrimary, backgroundColor: '#6c757d' };

const checkboxDeviceStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
  borderRadius: '6px', border: '1px solid #d1d5db', cursor: 'pointer',
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

// Overlay para sub-modales que se abren encima del modal de detalle
const subModalOverlay: React.CSSProperties = {
  ...modalOverlay,
  zIndex: 1100,
  backgroundColor: 'rgba(0,0,0,0.55)',
};

const modalSmall: React.CSSProperties = {
  backgroundColor: 'white', borderRadius: '12px', padding: '28px',
  maxWidth: '500px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

const modalLarge: React.CSSProperties = {
  ...modalSmall, maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto',
};


// ────────────────────────────────────────────────────────────────────────────
// Panel de permisos especiales (solo admin)
// ────────────────────────────────────────────────────────────────────────────
function PermisosEspecialesPanel({ emp, onUpdated }: { emp: Empleado; onUpdated: (updated: Empleado) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (campo: 'exento_incidencias' | 'puede_checar_remoto', valor: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch<Empleado>(`/personal/empleados/${emp.id}/permisos-especiales`, { [campo]: valor });
      onUpdated(res.data);
    } catch {
      setError('No se pudo guardar el cambio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginBottom: '14px', padding: '10px 14px', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '6px' }}>
      <p style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 600, color: '#6c757d' }}>Permisos especiales</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.88rem' }}>
          <input
            type="checkbox"
            checked={emp.exento_incidencias ?? false}
            disabled={saving}
            onChange={e => toggle('exento_incidencias', e.target.checked)}
          />
          Exento de incidencias (no aparece en reportes de asistencia)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.88rem' }}>
          <input
            type="checkbox"
            checked={emp.puede_checar_remoto ?? false}
            disabled={saving}
            onChange={e => toggle('puede_checar_remoto', e.target.checked)}
          />
          Puede checar remotamente (portal web)
        </label>
      </div>
      {error && <p style={{ margin: '6px 0 0', color: '#dc3545', fontSize: '0.8rem' }}>{error}</p>}
    </div>
  );
}


export const PersonalPage = () => {
  const { authMe } = useAuth();
  const isAdmin = authMe?.is_superuser === true;
  const [mainTab, setMainTab] = useState<'empleados' | 'departamentos' | 'puestos'>('empleados');
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaResponse[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartamentoResponse[]>([]);
  const [puestos, setPuestos] = useState<PuestoResponse[]>([]);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [horarios, setHorarios] = useState<HorarioSimple[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('activo');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroDepto, setFiltroDepto] = useState('');
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 30;
  const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);
  const [showDetalle, setShowDetalle] = useState(false);
  const [detalleTab, setDetalleTab] = useState<'info' | 'asistencias'>('info');
  const [empChecadas, setEmpChecadas] = useState<Asistencia[]>([]);
  const [loadingChecadas, setLoadingChecadas] = useState(false);

  // Modal formulario empleado (crear / editar)
  const [showFormModal, setShowFormModal] = useState(false);
  const [formTab, setFormTab] = useState<'personales' | 'laborales'>('personales');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [usernameManual, setUsernameManual] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [numeroManual, setNumeroManual] = useState(false);

  // Modal departamento (crear / editar)
  const [showDeptoModal, setShowDeptoModal] = useState(false);
  const [editingDeptoId, setEditingDeptoId] = useState<number | null>(null);
  const [deptoForm, setDeptoForm] = useState({ nombre: '', empresa_id: 0 as number | undefined, jefe_id: null as number | null });

  // Modal puesto (crear / editar)
  const [showPuestoModal, setShowPuestoModal] = useState(false);
  const [editingPuestoId, setEditingPuestoId] = useState<number | null>(null);
  const [puestoForm, setPuestoForm] = useState({ empresa_id: undefined as number | undefined, departamento_id: undefined as number | undefined, nombre: '', orden: 0, activo: true });
  const [filtroEmpresaPuesto, setFiltroEmpresaPuesto] = useState('');
  const [filtroDeptoPuesto, setFiltroDeptoPuesto] = useState('');

  // Modal checadores
  const [showChecadorModal, setShowChecadorModal] = useState(false);
  const [checadorTarget, setChecadorTarget] = useState<Empleado | null>(null);
  const [checadorDevices, setChecadorDevices] = useState<number[]>([]);

  // Modal huella (solo registrar; cola de replicación eliminada)
  const [showHuellaModal, setShowHuellaModal] = useState(false);
  const [huellaTarget, setHuellaTarget] = useState<Empleado | null>(null);
  const [enrollDevice, setEnrollDevice] = useState<number | null>(null);
  const [tieneHuella, setTieneHuella] = useState(false);
  const [huellaTemplates, setHuellaTemplates] = useState<{ id: number; finger_index: number; source_device_nombre: string | null; updated_at: string | null }[]>([]);
  const [enrollingHuella, setEnrollingHuella] = useState(false);
  const [enrollStatus, setEnrollStatus] = useState<'idle' | 'completed'>('idle');
  const [, setEnrollId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (filtroEstado) params.append('estado', filtroEstado);
      params.append('limit', '500');
      const [empRes, devRes, emprsRes, deptosRes, puestosRes, horRes] = await Promise.all([
        api.get(`/personal/empleados?${params.toString()}`),
        api.get('/asistencia/devices'),
        api.get('/personal/empresas?limit=500'),
        api.get('/personal/departamentos?limit=500'),
        api.get('/personal/puestos'), // sin activo = todos (para puestos tab); form filtra activos
        api.get('/asistencia/horarios?activo=true'),
      ]);
      setEmpleados(empRes.data);
      setDispositivos(devRes.data);
      setEmpresas(emprsRes.data);
      setDepartamentos(deptosRes.data);
      setPuestos(puestosRes.data);
      setHorarios(Array.isArray(horRes.data) ? horRes.data : []);
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  }, [search, filtroEstado]);

  useEffect(() => { loadData(); }, [loadData]);

  // Sincronizar selectedEmpleado cuando se recarga la lista (p.ej. después de editar)
  useEffect(() => {
    if (!selectedEmpleado) return;
    const updated = empleados.find(e => e.id === selectedEmpleado.id);
    if (updated) setSelectedEmpleado(updated);
  }, [empleados]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generar username al escribir nombre/apellido (solo en alta, no edición, no si el usuario lo editó manualmente)
  useEffect(() => {
    if (editingId || usernameManual) return;
    const letra = normalizeStr(form.nombre).charAt(0);
    const ap = normalizeStr(form.apellido_paterno || '');
    if (letra && ap) {
      setForm(prev => ({ ...prev, username: letra + ap }));
    }
  }, [form.nombre, form.apellido_paterno, editingId, usernameManual]);

  // Auto-rellenar numero_empleado al seleccionar empresa (solo en alta, no en edición, no si lo editó manualmente)
  useEffect(() => {
    if (editingId || numeroManual || !form.empresa_id) return;
    let cancelled = false;
    api.get(`/personal/empleados/next-numero?empresa_id=${form.empresa_id}`)
      .then(res => { if (!cancelled) setForm(prev => ({ ...prev, numero_empleado: res.data.numero_empleado })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [form.empresa_id, editingId, numeroManual]);

  // Verificar disponibilidad del username cuando cambia
  useEffect(() => {
    if (!form.username || !showFormModal) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ username: form.username! });
        if (editingId) params.append('exclude_id', String(editingId));
        const res = await api.get(`/personal/empleados/check-username?${params}`);
        setUsernameStatus(res.data.available ? 'available' : 'taken');
      } catch { setUsernameStatus('idle'); }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.username, editingId, showFormModal]);

  const handleChange = (field: keyof FormData, value: string | boolean | number | number[] | null | undefined) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const toggleDeviceInForm = (deviceId: number) => {
    setForm(prev => {
      const ids = prev.dispositivo_ids.includes(deviceId)
        ? prev.dispositivo_ids.filter(id => id !== deviceId)
        : [...prev.dispositivo_ids, deviceId];
      return { ...prev, dispositivo_ids: ids };
    });
  };

  const openNewForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setUsernameManual(false);
    setUsernameStatus('idle');
    setNumeroManual(false);
    setFormTab('personales');
    setShowFormModal(true);
  };

  const startEdit = (emp: Empleado) => {
    setForm({
      numero_empleado: emp.numero_empleado,
      nombre: emp.nombre,
      apellido_paterno: emp.apellido_paterno || '',
      apellido_materno: emp.apellido_materno || '',
      email: emp.email || '',
      telefono: emp.telefono || '',
      empresa_id: emp.empresa_id ?? undefined,
      departamento_id: emp.departamento_id ?? undefined,
      puesto_id: emp.puesto_id ?? undefined,
      curp: emp.curp || '',
      rfc: emp.rfc || '',
      nss: emp.nss || '',
      direccion: emp.direccion || '',
      colonia: emp.colonia || '',
      cp: emp.cp || '',
      ciudad: emp.ciudad || '',
      fecha_nacimiento: emp.fecha_nacimiento ? emp.fecha_nacimiento.slice(0, 10) : '',
      contacto_emergencia: emp.contacto_emergencia || '',
      telefono_emergencia: emp.telefono_emergencia || '',
      fecha_ingreso: emp.fecha_ingreso ? emp.fecha_ingreso.slice(0, 10) : '',
      registrar_en_checador: false,
      dispositivo_ids: [],
      password: '',
      username: emp.username || '',
      horario_id: emp.horario_id ?? undefined,
      horario_sabado_id: emp.horario_sabado_id ?? null,
    });
    setEditingId(emp.id);
    setUsernameManual(false);
    setUsernameStatus('idle');
    setFormTab('personales');
    setShowFormModal(true);
  };

  const formTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px', cursor: 'pointer', border: 'none',
    borderBottom: active ? '3px solid #0ea5e9' : '3px solid transparent',
    backgroundColor: active ? 'rgba(0,123,255,0.08)' : 'transparent',
    fontWeight: active ? 600 : 400, fontSize: '0.88rem', color: active ? '#0ea5e9' : '#555',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.numero_empleado.trim() || !form.nombre.trim() || !form.apellido_paterno?.trim() || !form.apellido_materno?.trim() || !form.fecha_nacimiento) {
      alert('Complete todos los datos personales obligatorios: No. empleado, nombre, apellidos y fecha de nacimiento.');
      return;
    }
    if (!form.empresa_id || !form.departamento_id || !form.puesto_id || !form.fecha_ingreso) {
      alert('Complete todos los datos laborales obligatorios: empresa, departamento, puesto y fecha de ingreso.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(form)) {
        if (key === 'dispositivo_ids') {
          if (Array.isArray(val) && val.length > 0) payload[key] = val;
        } else if (key === 'horario_id' || key === 'horario_sabado_id') {
          payload[key] = val ?? null;
        } else if (val !== '' && val !== null && val !== undefined && val !== false) {
          payload[key] = val;
        } else if (key === 'registrar_en_checador') {
          payload[key] = val;
        }
      }

      if (editingId) {
        delete payload.numero_empleado;
        delete payload.registrar_en_checador;
        delete payload.dispositivo_ids;
        await api.put(`/personal/empleados/${editingId}`, payload);
        alert(payload.password ? 'Empleado y contraseña actualizados' : 'Empleado actualizado');
      } else {
        await api.post('/personal/empleados', payload);
        const devCount = form.dispositivo_ids.length;
        const usuario = (form.username || form.numero_empleado || '').trim() || form.numero_empleado;
        const msgLogin = form.password?.trim()
          ? `Ya puede hacer login con usuario "${usuario}" (o número de empleado) y la contraseña indicada.`
          : `Ya puede hacer login con usuario y contraseña: ${form.numero_empleado}`;
        alert(
          (form.registrar_en_checador && devCount > 0 ? `Empleado creado y agregado a ${devCount} checador(es). ` : 'Empleado creado. ') + msgLogin
        );
      }
      setShowFormModal(false);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleBaja = async (emp: Empleado) => {
    if (!confirm(`Dar de baja a ${emp.nombre} ${emp.apellido_paterno || ''}?`)) return;
    try {
      await api.delete(`/personal/empleados/${emp.id}`);
      loadData();
      if (selectedEmpleado?.id === emp.id) { setSelectedEmpleado(null); setShowDetalle(false); }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al dar de baja');
    }
  };

  const openChecadorModal = (emp: Empleado) => {
    setChecadorTarget(emp);
    setChecadorDevices([]);
    setShowChecadorModal(true);
  };

  const enviarAChecadores = async () => {
    if (!checadorTarget || checadorDevices.length === 0) { alert('Selecciona al menos un dispositivo'); return; }
    const nombre = `${checadorTarget.nombre} ${checadorTarget.apellido_paterno || ''} ${checadorTarget.apellido_materno || ''}`.trim();
    try {
      const params = checadorDevices.map(id => `dispositivo_ids=${id}`).join('&');
      await api.post(`/asistencia/enqueue-user-multi?${params}`, { numero_empleado: checadorTarget.numero_empleado, nombre });
      alert(`Empleado agregado a ${checadorDevices.length} checador(es). El agente lo enviara en ~30 segundos.`);
      setShowChecadorModal(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error');
    }
  };

  const openHuellaModal = async (emp: Empleado) => {
    setHuellaTarget(emp);
    setEnrollDevice(null);
    setEnrollStatus('idle');
    setEnrollId(null);
    setHuellaTemplates([]);
    setShowHuellaModal(true);
    try {
      const res = await api.get(`/asistencia/fingerprint-templates/${emp.numero_empleado}`);
      const templates = Array.isArray(res.data) ? res.data : [];
      setHuellaTemplates(templates);
      setTieneHuella(templates.length > 0);
    } catch {
      setTieneHuella(false);
      setHuellaTemplates([]);
    }
  };

  const iniciarEnrollHuella = async () => {
    if (!huellaTarget || !enrollDevice) { alert('Selecciona un dispositivo'); return; }
    setEnrollingHuella(true);
    try {
      await api.post(`/asistencia/devices/${enrollDevice}/start-enroll`, { numero_empleado: huellaTarget.numero_empleado });
      setEnrollStatus('completed');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al enviar solicitud de registro de huella');
    } finally { setEnrollingHuella(false); }
  };

  const cerrarHuellaModal = () => {
    setEnrollStatus('idle');
    setEnrollId(null);
    setShowHuellaModal(false);
  };


  const getEmpresaNombre = (empresaId?: number | null) => {
    if (!empresaId) return '-';
    const emp = empresas.find(e => e.id === empresaId);
    return emp ? emp.nombre : '-';
  };

  const getDeptoNombre = (deptoId?: number | null) => {
    if (!deptoId) return '-';
    const d = departamentos.find(dep => dep.id === deptoId);
    return d ? d.nombre : '-';
  };

  // ---- Departamento CRUD ----
  const openNewDepto = () => {
    setDeptoForm({ nombre: '', empresa_id: undefined, jefe_id: null });
    setEditingDeptoId(null);
    setShowDeptoModal(true);
  };

  const startEditDepto = (d: DepartamentoResponse) => {
    setDeptoForm({ nombre: d.nombre, empresa_id: d.empresa_id, jefe_id: d.jefe_id ?? null });
    setEditingDeptoId(d.id);
    setShowDeptoModal(true);
  };

  const handleDeptoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptoForm.nombre.trim() || !deptoForm.empresa_id) { alert('Nombre y empresa son obligatorios'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { nombre: deptoForm.nombre, empresa_id: deptoForm.empresa_id };
      if (deptoForm.jefe_id) payload.jefe_id = deptoForm.jefe_id;
      if (editingDeptoId) {
        await api.put(`/personal/departamentos/${editingDeptoId}`, payload);
        alert('Departamento actualizado');
      } else {
        await api.post('/personal/departamentos', payload);
        alert('Departamento creado');
      }
      setShowDeptoModal(false);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al guardar departamento');
    } finally { setSaving(false); }
  };

  const toggleDeptoActivo = async (d: DepartamentoResponse) => {
    try {
      await api.put(`/personal/departamentos/${d.id}`, { activo: !d.activo });
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error');
    }
  };

  // ---- Puesto CRUD ----
  const PUESTOS_RESERVADOS = ['director', 'gerente general', 'rh'];
  const isPuestoReservado = (nombre: string) => PUESTOS_RESERVADOS.includes((nombre || '').trim().toLowerCase());

  const openNewPuesto = () => {
    const maxOrden = puestos.length > 0 ? Math.max(...puestos.map(p => p.orden), 0) + 1 : 0;
    const primeraEmpresa = activeEmpresas[0]?.id;
    const primerDepto = primeraEmpresa ? deptosForEmpresa(primeraEmpresa)[0]?.id : undefined;
    setPuestoForm({ empresa_id: primeraEmpresa, departamento_id: primerDepto, nombre: '', orden: maxOrden, activo: true });
    setEditingPuestoId(null);
    setShowPuestoModal(true);
  };

  const startEditPuesto = (p: PuestoResponse) => {
    setPuestoForm({
      empresa_id: p.empresa_id ?? undefined,
      departamento_id: p.departamento_id ?? undefined,
      nombre: p.nombre,
      orden: p.orden,
      activo: p.activo,
    });
    setEditingPuestoId(p.id);
    setShowPuestoModal(true);
  };

  const handlePuestoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puestoForm.nombre.trim()) { alert('Nombre es obligatorio'); return; }
    if (!editingPuestoId) {
      if (isPuestoReservado(puestoForm.nombre)) {
        alert('No se puede crear: Director, Gerente General y RH son asignados por el Administrador.');
        return;
      }
      if (!puestoForm.empresa_id || !puestoForm.departamento_id) {
        alert('Selecciona empresa y departamento para crear el puesto.');
        return;
      }
    }
    setSaving(true);
    try {
      if (editingPuestoId) {
        await api.put(`/personal/puestos/${editingPuestoId}`, { nombre: puestoForm.nombre, orden: puestoForm.orden, activo: puestoForm.activo });
        alert('Puesto actualizado');
      } else {
        await api.post('/personal/puestos', {
          empresa_id: puestoForm.empresa_id,
          departamento_id: puestoForm.departamento_id,
          nombre: puestoForm.nombre.trim(),
          orden: puestoForm.orden,
          activo: puestoForm.activo,
        });
        alert('Puesto creado');
      }
      setShowPuestoModal(false);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al guardar puesto');
    } finally { setSaving(false); }
  };

  const togglePuestoActivo = async (p: PuestoResponse) => {
    if (isPuestoReservado(p.nombre)) { alert('No se puede desactivar: Director, Gerente General y RH son puestos del sistema.'); return; }
    try {
      await api.put(`/personal/puestos/${p.id}`, { activo: !p.activo });
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error');
    }
  };

  const deletePuesto = async (p: PuestoResponse) => {
    if (isPuestoReservado(p.nombre)) { alert('No se puede eliminar: Director, Gerente General y RH son puestos del sistema.'); return; }
    if (!confirm(`¿Eliminar el puesto "${p.nombre}"?`)) return;
    try {
      await api.delete(`/personal/puestos/${p.id}`);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al eliminar');
    }
  };

  const deptosForEmpresa = (empresaId?: number) => {
    if (!empresaId) return [];
    return departamentos.filter(d => d.empresa_id === empresaId && d.activo);
  };

  const empleadosForEmpresa = (empresaId?: number) => {
    if (!empresaId) return empleados.filter(e => e.estado === 'activo');
    return empleados.filter(e => e.empresa_id === empresaId && e.estado === 'activo');
  };

  const filteredEmpleados = empleados.filter(e => {
    if (filtroEmpresa && String(e.empresa_id) !== filtroEmpresa) return false;
    if (filtroDepto && String(e.departamento_id) !== filtroDepto) return false;
    return true;
  });

  const loadChecadas = async (empleadoId: number) => {
    setLoadingChecadas(true);
    try {
      const res = await api.get(`/asistencia/checadas?empleado_id=${empleadoId}&limit=200`);
      setEmpChecadas(res.data);
    } catch {
      setEmpChecadas([]);
    } finally {
      setLoadingChecadas(false);
    }
  };

  const viewDetail = (emp: Empleado) => {
    setSelectedEmpleado(emp);
    setDetalleTab('info');
    setEmpChecadas([]);
    setShowDetalle(true);
  };

  const nombreCompleto = (emp: Empleado) =>
    `${emp.nombre} ${emp.apellido_paterno || ''} ${emp.apellido_materno || ''}`.trim();

  if (loading && empleados.length === 0) return <div style={{ padding: '20px' }}>Cargando...</div>;

  const stats = {
    total: filteredEmpleados.length,
    activos: filteredEmpleados.filter(e => e.estado === 'activo').length,
    inactivos: filteredEmpleados.filter(e => e.estado === 'inactivo').length,
    bajas: filteredEmpleados.filter(e => e.estado === 'baja').length,
  };

  const activeDevices = dispositivos.filter(d => d.activo);
  const activeEmpresas = empresas.filter(e => e.activo);
  // Puestos para el formulario de empleado: globales (Director, Gerente General, RH) + los del departamento seleccionado
  const activePuestos = puestos.filter(p => {
    if (!p.activo) return false;
    const esGlobal = p.empresa_id == null && p.departamento_id == null;
    const esDelDepto = form.empresa_id && form.departamento_id &&
      p.empresa_id === form.empresa_id && p.departamento_id === form.departamento_id;
    if (esGlobal || esDelDepto) {
      if (isAdmin) return true;
      if (editingId && form.puesto_id === p.id && isPuestoReservado(p.nombre)) return true;
      return !isPuestoReservado(p.nombre);
    }
    return false;
  });

  const mainTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 28px', cursor: 'pointer', border: 'none',
    borderBottom: active ? '3px solid #0ea5e9' : '3px solid transparent',
    backgroundColor: 'transparent', fontWeight: active ? 700 : 400,
    fontSize: '1rem', color: active ? '#0ea5e9' : '#888',
  });

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ margin: 0 }}>Gestion de Personal</h1>
      </div>

      {/* Main Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '20px' }}>
        <button style={mainTabStyle(mainTab === 'empleados')} onClick={() => setMainTab('empleados')}>Empleados</button>
        <button style={mainTabStyle(mainTab === 'departamentos')} onClick={() => setMainTab('departamentos')}>Departamentos</button>
        <button style={mainTabStyle(mainTab === 'puestos')} onClick={() => setMainTab('puestos')}>Puestos</button>
      </div>

      {/* ====== TAB: DEPARTAMENTOS ====== */}
      {mainTab === 'departamentos' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ margin: 0, color: '#555' }}>{departamentos.length} departamento(s) registrado(s)</p>
            <button onClick={openNewDepto} style={btnSuccess}>+ Nuevo Departamento</button>
          </div>
          {departamentos.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No hay departamentos registrados.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    {['Nombre', 'Empresa', 'Jefe', 'Empleados', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {departamentos.map(d => {
                    const count = empleados.filter(e => e.departamento_id === d.id).length;
                    return (
                      <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '11px 14px', fontWeight: 500 }}>{d.nombre}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{d.empresa?.nombre || getEmpresaNombre(d.empresa_id)}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{d.jefe_nombre || '-'}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 600 }}>{count}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: d.activo ? '#d4edda' : '#f8d7da', color: d.activo ? '#155724' : '#721c24', fontWeight: 500 }}>
                            {d.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => startEditDepto(d)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px' }}>Editar</button>
                            <button onClick={() => toggleDeptoActivo(d)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: d.activo ? '#dc3545' : '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>
                              {d.activo ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ====== TAB: PUESTOS ====== */}
      {mainTab === 'puestos' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <p style={{ margin: 0, color: '#555' }}>
                {puestos.filter(p => {
                  if (filtroEmpresaPuesto && (p.empresa_id !== Number(filtroEmpresaPuesto))) return false;
                  if (filtroDeptoPuesto && (p.departamento_id !== Number(filtroDeptoPuesto))) return false;
                  return true;
                }).length} puesto(s) registrado(s)
              </p>
              <select value={filtroEmpresaPuesto} onChange={e => { setFiltroEmpresaPuesto(e.target.value); setFiltroDeptoPuesto(''); }} style={{ ...inputStyle, maxWidth: '180px' }}>
                <option value="">Todas las empresas</option>
                {activeEmpresas.map(emp => (
                  <option key={emp.id} value={String(emp.id)}>{emp.nombre}</option>
                ))}
              </select>
              <select value={filtroDeptoPuesto} onChange={e => setFiltroDeptoPuesto(e.target.value)} style={{ ...inputStyle, maxWidth: '180px' }} disabled={!filtroEmpresaPuesto}>
                <option value="">Todos los departamentos</option>
                {deptosForEmpresa(filtroEmpresaPuesto ? Number(filtroEmpresaPuesto) : undefined).map(d => (
                  <option key={d.id} value={String(d.id)}>{d.nombre}</option>
                ))}
              </select>
            </div>
            <button onClick={openNewPuesto} style={btnSuccess}>+ Nuevo Puesto</button>
          </div>
          {puestos.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No hay puestos registrados.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    {['Nombre', 'Empresa', 'Departamento', 'Orden', 'Empleados', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {puestos
                    .filter(p => {
                      if (filtroEmpresaPuesto && (p.empresa_id !== Number(filtroEmpresaPuesto))) return false;
                      if (filtroDeptoPuesto && (p.departamento_id !== Number(filtroDeptoPuesto))) return false;
                      return true;
                    })
                    .map(p => {
                    const count = empleados.filter(e => e.puesto_id === p.id).length;
                    const reservado = isPuestoReservado(p.nombre);
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '11px 14px', fontWeight: 500 }}>{p.nombre}{reservado ? ' (sistema)' : ''}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{p.empresa_nombre ?? '—'}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{p.departamento_nombre ?? '—'}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{p.orden}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 600 }}>{count}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: p.activo ? '#d4edda' : '#f8d7da', color: p.activo ? '#155724' : '#721c24', fontWeight: 500 }}>
                            {p.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => startEditPuesto(p)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px' }}>Editar</button>
                            {!reservado && (
                              <>
                                <button onClick={() => togglePuestoActivo(p)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: p.activo ? '#dc3545' : '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>
                                  {p.activo ? 'Desactivar' : 'Activar'}
                                </button>
                                <button onClick={() => deletePuesto(p)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>Eliminar</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ====== TAB: EMPLEADOS ====== */}
      {mainTab === 'empleados' && (
        <>
          {/* Stats + botón en la misma línea */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
            {[
              { label: 'Total', value: stats.total, color: '#333' },
              { label: 'Activos', value: stats.activos, color: '#28a745' },
              { label: 'Inactivos', value: stats.inactivos, color: '#ffc107' },
              { label: 'Bajas', value: stats.bajas, color: '#dc3545' },
            ].map(s => (
              <div key={s.label} style={{ ...cardStyle, padding: '12px 16px', minWidth: '90px', flex: '1 1 90px', maxWidth: '140px' }}>
                <div style={{ color: '#888', fontSize: '0.78rem', marginBottom: '2px' }}>{s.label}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: s.color }}>{s.value}</div>
              </div>
            ))}
            <button onClick={openNewForm} style={{ ...btnSuccess, marginLeft: 'auto' }}>+ Nuevo Empleado</button>
          </div>

          {/* Search + Filters */}
          <div style={{ ...cardStyle, marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Buscar por nombre, numero o email..."
              value={search} onChange={e => { setSearch(e.target.value); setPagina(1); }}
              onKeyDown={e => e.key === 'Enter' && loadData()}
              style={{ ...inputStyle, maxWidth: '300px' }} />
            <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1); }} style={{ ...inputStyle, maxWidth: '160px' }}>
              <option value="">Todos los estados</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
              <option value="baja">Bajas</option>
            </select>
            <select value={filtroEmpresa} onChange={e => { setFiltroEmpresa(e.target.value); setFiltroDepto(''); setPagina(1); }} style={{ ...inputStyle, maxWidth: '200px' }}>
              <option value="">Todas las empresas</option>
              {activeEmpresas.map(emp => (
                <option key={emp.id} value={String(emp.id)}>{emp.nombre}</option>
              ))}
            </select>
            <select
              value={filtroDepto}
              onChange={e => { setFiltroDepto(e.target.value); setPagina(1); }}
              style={{ ...inputStyle, maxWidth: '200px' }}
              disabled={!filtroEmpresa}
            >
              <option value="">Todos los departamentos</option>
              {departamentos
                .filter(d => !filtroEmpresa || String(d.empresa_id) === filtroEmpresa)
                .map(d => (
                  <option key={d.id} value={String(d.id)}>{d.nombre}</option>
                ))
              }
            </select>
            <button onClick={loadData} style={btnPrimary}>Buscar</button>
          </div>

          {/* Table */}
          {(() => {
            const totalPaginas = Math.max(1, Math.ceil(filteredEmpleados.length / POR_PAGINA));
            const paginaReal = Math.min(pagina, totalPaginas);
            const inicio = (paginaReal - 1) * POR_PAGINA;
            const empPagina = filteredEmpleados.slice(inicio, inicio + POR_PAGINA);

            const btnPag = (activo: boolean): React.CSSProperties => ({
              padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: '5px',
              backgroundColor: activo ? '#0ea5e9' : 'white',
              color: activo ? 'white' : '#374151',
              cursor: activo ? 'default' : 'pointer', fontSize: '0.82rem', fontWeight: activo ? 700 : 400,
            });

            return filteredEmpleados.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No se encontraron empleados.</p>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8f9fa' }}>
                        {['No.', 'Nombre completo', 'Empresa', 'Depto.', 'Puesto', 'Jefe inmediato', 'Telefono', 'Estado', 'Acciones'].map(h => (
                          <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {empPagina.map(emp => (
                        <tr key={emp.id} style={{ borderBottom: '1px solid #eee' }} onDoubleClick={() => viewDetail(emp)}>
                          <td style={{ padding: '11px 14px', fontWeight: 500 }}>{emp.numero_empleado}</td>
                          <td style={{ padding: '11px 14px' }}>{nombreCompleto(emp)}</td>
                          <td style={{ padding: '11px 14px', color: '#555' }}>{emp.empresa?.nombre || getEmpresaNombre(emp.empresa_id)}</td>
                          <td style={{ padding: '11px 14px', color: '#555' }}>{emp.departamento?.nombre || getDeptoNombre(emp.departamento_id)}</td>
                          <td style={{ padding: '11px 14px', color: '#555' }}>{emp.puesto?.nombre || '-'}</td>
                          <td style={{ padding: '11px 14px', color: '#555' }}>{emp.jefe ? `${emp.jefe.nombre} ${emp.jefe.apellido_paterno || ''} ${emp.jefe.apellido_materno || ''}`.trim() : '-'}</td>
                          <td style={{ padding: '11px 14px', color: '#555' }}>{emp.telefono || '-'}</td>
                          <td style={{ padding: '11px 14px' }}>{estadoBadge(emp.estado)}</td>
                          <td style={{ padding: '11px 14px' }}>
                            <button onClick={() => viewDetail(emp)} style={{ padding: '4px 12px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px' }}>Ver</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Paginación */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                    {filteredEmpleados.length} empleado(s) · mostrando {inicio + 1}–{Math.min(inicio + POR_PAGINA, filteredEmpleados.length)}
                  </span>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button style={{ ...btnPag(false), opacity: paginaReal === 1 ? 0.4 : 1 }} disabled={paginaReal === 1} onClick={() => setPagina(1)}>«</button>
                    <button style={{ ...btnPag(false), opacity: paginaReal === 1 ? 0.4 : 1 }} disabled={paginaReal === 1} onClick={() => setPagina(p => p - 1)}>‹</button>
                    {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPaginas || Math.abs(p - paginaReal) <= 2)
                      .reduce<(number | 'sep')[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('sep');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === 'sep'
                          ? <span key={`s${i}`} style={{ padding: '5px 4px', color: '#9ca3af', fontSize: '0.82rem' }}>…</span>
                          : <button key={p} style={btnPag(p === paginaReal)} onClick={() => setPagina(p as number)}>{p}</button>
                      )
                    }
                    <button style={{ ...btnPag(false), opacity: paginaReal === totalPaginas ? 0.4 : 1 }} disabled={paginaReal === totalPaginas} onClick={() => setPagina(p => p + 1)}>›</button>
                    <button style={{ ...btnPag(false), opacity: paginaReal === totalPaginas ? 0.4 : 1 }} disabled={paginaReal === totalPaginas} onClick={() => setPagina(totalPaginas)}>»</button>
                  </div>
                </div>
              </>
            );
          })()}
        </>
      )}

      {/* ========== MODAL: FORMULARIO CREAR/EDITAR ========== */}
      {showFormModal && (
        <div style={subModalOverlay} onClick={() => setShowFormModal(false)}>
          <div style={modalLarge} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{editingId ? 'Editar Empleado' : 'Alta de Empleado'}</h3>
              <button onClick={() => setShowFormModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', borderBottom: '2px solid #e5e7eb', marginBottom: '16px' }}>
                <button type="button" style={formTabStyle(formTab === 'personales')} onClick={() => setFormTab('personales')}>
                  Datos personales
                </button>
                <button type="button" style={formTabStyle(formTab === 'laborales')} onClick={() => setFormTab('laborales')}>
                  Datos laborales
                </button>
              </div>

              {formTab === 'personales' && (
                <div style={{ padding: '8px 0 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                    <div>
                      <label style={labelStyle}>Nombre *</label>
                      <input style={inputStyle} value={form.nombre} onChange={e => handleChange('nombre', e.target.value)} required />
                    </div>
                    <div>
                      <label style={labelStyle}>Apellido Paterno *</label>
                      <input style={inputStyle} value={form.apellido_paterno} onChange={e => handleChange('apellido_paterno', e.target.value)} required />
                    </div>
                    <div>
                      <label style={labelStyle}>Apellido Materno *</label>
                      <input style={inputStyle} value={form.apellido_materno} onChange={e => handleChange('apellido_materno', e.target.value)} required />
                    </div>
                    <div>
                      <label style={labelStyle}>Fecha de Nacimiento *</label>
                      <input type="date" style={inputStyle} value={form.fecha_nacimiento} onChange={e => handleChange('fecha_nacimiento', e.target.value)} required />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Direccion</label>
                      <input style={inputStyle} value={form.direccion} onChange={e => handleChange('direccion', e.target.value)} placeholder="Calle y numero" />
                    </div>
                    <div>
                      <label style={labelStyle}>Colonia</label>
                      <input style={inputStyle} value={form.colonia} onChange={e => handleChange('colonia', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>CP</label>
                      <input style={inputStyle} value={form.cp} onChange={e => handleChange('cp', e.target.value)} placeholder="5 digitos" maxLength={5} />
                    </div>
                    <div>
                      <label style={labelStyle}>Ciudad</label>
                      <input style={inputStyle} value={form.ciudad} onChange={e => handleChange('ciudad', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Telefono</label>
                      <input style={inputStyle} value={form.telefono} onChange={e => handleChange('telefono', e.target.value)} placeholder="10 digitos" />
                    </div>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input type="email" style={inputStyle} value={form.email} onChange={e => handleChange('email', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Contacto de emergencia</label>
                      <input style={inputStyle} value={form.contacto_emergencia} onChange={e => handleChange('contacto_emergencia', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Telefono de emergencia</label>
                      <input style={inputStyle} value={form.telefono_emergencia} onChange={e => handleChange('telefono_emergencia', e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {formTab === 'laborales' && (
                <div style={{ padding: '8px 0 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                    <div>
                      <label style={labelStyle}>Empresa *</label>
                      <select style={inputStyle}
                        value={form.empresa_id ?? ''}
                        onChange={e => {
                          setNumeroManual(false);
                          handleChange('empresa_id', e.target.value ? Number(e.target.value) : undefined);
                        }}
                        required>
                        <option value="">-- Seleccione empresa --</option>
                        {activeEmpresas.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>No. Empleado *</label>
                      <input
                        style={inputStyle}
                        value={form.numero_empleado}
                        onChange={e => { setNumeroManual(true); handleChange('numero_empleado', e.target.value); }}
                        required
                        disabled={!!editingId}
                        placeholder={form.empresa_id ? 'Auto-asignado' : 'Seleccione empresa primero'}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Departamento *</label>
                      <select style={inputStyle}
                        value={form.departamento_id ?? ''}
                        onChange={e => handleChange('departamento_id', e.target.value ? Number(e.target.value) : undefined)}
                        required>
                        <option value="">-- Seleccione departamento --</option>
                        {deptosForEmpresa(form.empresa_id).map(d => (
                          <option key={d.id} value={d.id}>{d.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Puesto *</label>
                      <select style={inputStyle}
                        value={form.puesto_id ?? ''}
                        onChange={e => handleChange('puesto_id', e.target.value ? Number(e.target.value) : undefined)}
                        required>
                        <option value="">-- Seleccione puesto --</option>
                        {activePuestos.map(p => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Horario de trabajo (Lun–Vie)</label>
                      <select
                        style={inputStyle}
                        value={form.horario_id ?? ''}
                        onChange={e => handleChange('horario_id', e.target.value ? Number(e.target.value) : undefined)}
                      >
                        <option value="">-- Sin horario asignado --</option>
                        {horarios.map(h => (
                          <option key={h.id} value={h.id}>{h.nombre} ({h.hora_entrada} – {h.hora_salida})</option>
                        ))}
                      </select>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                        Se usa para detectar retardos y faltas automáticamente
                      </span>
                    </div>
                    <div>
                      <label style={labelStyle}>Horario sábado</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <input
                          type="checkbox"
                          id="chk-trabaja-sabado"
                          checked={form.horario_sabado_id !== null && form.horario_sabado_id !== undefined}
                          onChange={e => handleChange('horario_sabado_id', e.target.checked ? (horarios[0]?.id ?? null) : null)}
                          style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                        />
                        <label htmlFor="chk-trabaja-sabado" style={{ fontSize: '0.85rem', color: '#374151', cursor: 'pointer', margin: 0 }}>
                          ¿Trabaja los sábados?
                        </label>
                      </div>
                      {(form.horario_sabado_id !== null && form.horario_sabado_id !== undefined) ? (
                        <select
                          style={{ ...inputStyle, borderColor: '#d97706' }}
                          value={form.horario_sabado_id ?? ''}
                          onChange={e => handleChange('horario_sabado_id', e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">-- Selecciona horario sábado --</option>
                          {horarios.map(h => (
                            <option key={h.id} value={h.id}>
                              {h.nombre} ({h.hora_entrada} – {h.hora_salida_sabado || h.hora_salida})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                          No se generarán incidencias los sábados
                        </span>
                      )}
                    </div>
                    <div>
                      <label style={labelStyle}>Fecha de ingreso *</label>
                      <input type="date" style={inputStyle} value={form.fecha_ingreso} onChange={e => handleChange('fecha_ingreso', e.target.value)} required />
                    </div>
                    <div>
                      <label style={labelStyle}>CURP</label>
                      <input style={inputStyle} value={form.curp} onChange={e => handleChange('curp', e.target.value.toUpperCase())} maxLength={18} placeholder="18 caracteres" />
                    </div>
                    <div>
                      <label style={labelStyle}>RFC</label>
                      <input style={inputStyle} value={form.rfc} onChange={e => handleChange('rfc', e.target.value.toUpperCase())} maxLength={13} placeholder="13 caracteres" />
                    </div>
                    <div>
                      <label style={labelStyle}>NSS (IMSS)</label>
                      <input style={inputStyle} value={form.nss} onChange={e => handleChange('nss', e.target.value)} maxLength={11} placeholder="11 digitos" />
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginBottom: '16px' }}>
                    <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '0.88rem', color: '#374151' }}>Acceso al sistema</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', maxWidth: '520px' }}>
                      <div>
                        <label style={labelStyle}>Usuario</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            style={{ ...inputStyle, paddingRight: '28px', borderColor: usernameStatus === 'taken' ? '#dc3545' : usernameStatus === 'available' ? '#28a745' : undefined }}
                            value={form.username || ''}
                            onChange={e => {
                              setUsernameManual(true);
                              handleChange('username', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                            }}
                            placeholder="Auto-generado"
                            autoComplete="off"
                          />
                          {usernameStatus === 'checking' && (
                            <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#6b7280' }}>...</span>
                          )}
                          {usernameStatus === 'available' && (
                            <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#28a745', fontWeight: 700 }}>✓</span>
                          )}
                          {usernameStatus === 'taken' && (
                            <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#dc3545', fontWeight: 700 }}>✗</span>
                          )}
                        </div>
                        {usernameStatus === 'taken' && (
                          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#dc3545' }}>Usuario ya en uso</p>
                        )}
                        <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                          1a letra del nombre + apellido paterno
                        </p>
                      </div>
                      <div>
                        <label style={labelStyle}>
                          {editingId ? 'Nueva contraseña' : 'Contraseña inicial'}
                        </label>
                        <input
                          type="password"
                          style={inputStyle}
                          value={form.password || ''}
                          onChange={e => handleChange('password', e.target.value)}
                          placeholder={editingId ? 'Dejar vacio para no cambiar' : 'Por defecto: primeros 8 del RFC'}
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                  </div>
                  {!editingId && (
                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '10px' }}>
                        <input type="checkbox" checked={form.registrar_en_checador}
                          onChange={e => handleChange('registrar_en_checador', e.target.checked)}
                          style={{ width: '18px', height: '18px' }} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Dar de alta en checadores biometricos al crear</span>
                      </label>
                      {form.registrar_en_checador && (
                        <div>
                          <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: '#555' }}>Selecciona los dispositivos:</p>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {activeDevices.map(d => (
                              <label key={d.id} style={{
                                ...checkboxDeviceStyle,
                                backgroundColor: form.dispositivo_ids.includes(d.id) ? '#e8f5e9' : 'white',
                                borderColor: form.dispositivo_ids.includes(d.id) ? '#4caf50' : '#d1d5db',
                              }}>
                                <input type="checkbox" checked={form.dispositivo_ids.includes(d.id)}
                                  onChange={() => toggleDeviceInForm(d.id)}
                                  style={{ width: '16px', height: '16px' }} />
                                <div>
                                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{d.nombre}</div>
                                  {d.ubicacion && <div style={{ fontSize: '0.78rem', color: '#666' }}>{d.ubicacion}</div>}
                                </div>
                              </label>
                            ))}
                          </div>
                          {activeDevices.length === 0 && <p style={{ color: '#999', fontSize: '0.85rem' }}>No hay dispositivos activos.</p>}
                          {form.dispositivo_ids.length > 0 && (
                            <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: '#2e7d32', fontWeight: 500 }}>
                              {form.dispositivo_ids.length} dispositivo(s) seleccionado(s)
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                <button type="button" onClick={() => setShowFormModal(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                  {saving ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Crear Empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== MODAL: DETALLE ========== */}
      {showDetalle && selectedEmpleado && (() => {
        const emp = selectedEmpleado;
        const sections: { title: string; rows: [string, string | undefined | null][] }[] = [
          {
            title: 'Datos Personales',
            rows: [
              ['No. Empleado', emp.numero_empleado],
              ['Nombre', nombreCompleto(emp)],
              ['Fecha de Nacimiento', emp.fecha_nacimiento ? new Date(emp.fecha_nacimiento).toLocaleDateString('es-MX') : undefined],
              ['CURP', emp.curp],
              ['RFC', emp.rfc],
              ['NSS (IMSS)', emp.nss],
            ],
          },
          {
            title: 'Contacto',
            rows: [
              ['Email', emp.email],
              ['Telefono', emp.telefono],
              ['Direccion', emp.direccion],
              ['Colonia', emp.colonia],
              ['CP', emp.cp],
              ['Ciudad', emp.ciudad],
              ['Contacto emergencia', emp.contacto_emergencia],
              ['Tel. emergencia', emp.telefono_emergencia],
            ],
          },
          {
            title: 'Datos Laborales',
            rows: [
              ['Empresa', emp.empresa?.nombre || getEmpresaNombre(emp.empresa_id)],
              ['Departamento', emp.departamento?.nombre || getDeptoNombre(emp.departamento_id)],
              ['Puesto', emp.puesto?.nombre],
              ['Estado', emp.estado],
              ['Fecha de Ingreso', emp.fecha_ingreso ? new Date(emp.fecha_ingreso).toLocaleDateString('es-MX') : undefined],
              ['Fecha de Baja', emp.fecha_baja ? new Date(emp.fecha_baja).toLocaleDateString('es-MX') : undefined],
            ],
          },
        ];

        type EmpDayRow = { key: string; fecha: string; fechaSort: string; entrada?: string; salida_comer?: string; regreso_comer?: string; salida?: string; esTiempoExtra: boolean };
        const empDayRows: EmpDayRow[] = (() => {
          const map = new Map<string, EmpDayRow>();
          for (const c of empChecadas) {
            const d = parseTimestampForMexico(c.timestamp);
            const fechaSort = d.toISOString().slice(0, 10);
            const fechaStr = d.toLocaleDateString('es-MX', { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' });
            if (!map.has(fechaSort)) map.set(fechaSort, { key: fechaSort, fecha: fechaStr, fechaSort, esTiempoExtra: false });
            const row = map.get(fechaSort)!;
            if (c.es_tiempo_extra) row.esTiempoExtra = true;
            const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            if (c.tipo === 'entrada' && !row.entrada) row.entrada = hora;
            else if (c.tipo === 'salida_comer' && !row.salida_comer) row.salida_comer = hora;
            else if (c.tipo === 'regreso_comer' && !row.regreso_comer) row.regreso_comer = hora;
            else if (c.tipo === 'salida' && !row.salida) row.salida = hora;
          }
          return Array.from(map.values()).sort((a, b) => b.fechaSort.localeCompare(a.fechaSort));
        })();

        const detTabStyle = (active: boolean): React.CSSProperties => ({
          padding: '8px 20px', cursor: 'pointer', border: 'none',
          borderBottom: active ? '3px solid #0ea5e9' : '3px solid transparent',
          backgroundColor: 'transparent', fontWeight: active ? 600 : 400,
          fontSize: '0.9rem', color: active ? '#0ea5e9' : '#888',
        });

        return (
          <div style={modalOverlay} onClick={() => setShowDetalle(false)}>
            <div style={modalLarge} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: '0 0 4px 0' }}>{nombreCompleto(emp)}</h2>
                  <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>No. {emp.numero_empleado} &middot; {emp.departamento?.nombre || 'Sin departamento'} &middot; {emp.puesto?.nombre || 'Sin puesto'}</p>
                </div>
                <button onClick={() => setShowDetalle(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
              </div>

              {/* Barra de acciones — siempre visible dentro del modal */}
              <div style={{
                display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px',
                padding: '10px 14px', backgroundColor: '#f0f9ff',
                borderRadius: '8px', border: '1px solid #bae6fd',
                alignItems: 'center',
              }}>
                {estadoBadge(emp.estado)}
                <div style={{ width: '1px', height: '24px', backgroundColor: '#bae6fd', margin: '0 4px' }} />
                <button onClick={() => startEdit(emp)} style={{ ...btnPrimary, padding: '6px 16px', fontSize: '0.85rem' }}>
                  Editar
                </button>
                <button onClick={() => openChecadorModal(emp)} style={{ ...btnPrimary, padding: '6px 16px', fontSize: '0.85rem', backgroundColor: '#6f42c1' }}>
                  Enviar a Checadores
                </button>
                <button onClick={() => openHuellaModal(emp)} style={{ ...btnPrimary, padding: '6px 16px', fontSize: '0.85rem', backgroundColor: '#20c997' }}>
                  Gestion Huella
                </button>
                {emp.estado !== 'baja' && (
                  <button onClick={() => handleBaja(emp)} style={{ ...btnDanger, padding: '6px 16px', fontSize: '0.85rem' }}>
                    Dar de Baja
                  </button>
                )}
              </div>

              {/* Panel de permisos especiales — solo admin */}
              {isAdmin && (
                <PermisosEspecialesPanel
                  emp={emp}
                  onUpdated={(updated) => {
                    setEmpleados((prev) => prev.map((e) => e.id === updated.id ? updated : e));
                    setSelectedEmpleado(updated);
                  }}
                />
              )}

              {/* Sub-tabs dentro del detalle */}
              <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '16px' }}>
                <button style={detTabStyle(detalleTab === 'info')} onClick={() => setDetalleTab('info')}>Informacion</button>
                <button style={detTabStyle(detalleTab === 'asistencias')} onClick={() => {
                  setDetalleTab('asistencias');
                  if (empChecadas.length === 0) loadChecadas(emp.id);
                }}>Asistencias</button>
              </div>
              {detalleTab === 'info' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    {sections.map(section => (
                      <div key={section.title} style={{ padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <h4 style={{ margin: '0 0 12px 0', color: '#0ea5e9', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', fontSize: '0.95rem' }}>{section.title}</h4>
                        {section.rows.map(([label, val]) => (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f3f4f6' }}>
                            <span style={{ color: '#666', fontSize: '0.85rem' }}>{label}</span>
                            <span style={{ fontWeight: 500, fontSize: '0.85rem', textAlign: 'right' }}>{val || '-'}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '16px', fontSize: '0.8rem', color: '#aaa' }}>
                    Creado: {emp.created_at ? new Date(emp.created_at).toLocaleString('es-MX') : '-'}
                    {emp.updated_at && <> &middot; Actualizado: {new Date(emp.updated_at).toLocaleString('es-MX')}</>}
                  </div>
                </>
              )}

              {detalleTab === 'asistencias' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <p style={{ margin: 0, color: '#555', fontSize: '0.9rem' }}>
                      {empChecadas.length} registro(s)
                    </p>
                    <button onClick={() => loadChecadas(emp.id)} style={{ ...btnPrimary, padding: '6px 14px', fontSize: '0.8rem' }} disabled={loadingChecadas}>
                      {loadingChecadas ? 'Cargando...' : 'Actualizar'}
                    </button>
                  </div>

                  {loadingChecadas && empChecadas.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#888', padding: '20px 0' }}>Cargando asistencias...</p>
                  ) : empDayRows.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#888', padding: '20px 0' }}>No hay asistencias registradas para este empleado.</p>
                  ) : (
                    <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0 }}>
                            <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontWeight: 600, color: '#555' }}>Fecha</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontWeight: 600, color: '#155724', backgroundColor: '#e8f5e9' }}>Entrada</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontWeight: 600, color: '#856404', backgroundColor: '#fff8e1' }}>Salida Comer</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontWeight: 600, color: '#004085', backgroundColor: '#e3f2fd' }}>Regreso Comer</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontWeight: 600, color: '#721c24', backgroundColor: '#fce4ec' }}>Salida</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empDayRows.map(row => (
                            <tr key={row.key} style={{
                              borderBottom: '1px solid #eee',
                              backgroundColor: row.esTiempoExtra ? '#fff8e1' : 'transparent',
                            }}>
                              <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                {row.fecha}
                                {row.esTiempoExtra && (
                                  <span style={{
                                    marginLeft: '8px', padding: '2px 8px', borderRadius: '4px',
                                    fontSize: '0.72rem', fontWeight: 600,
                                    backgroundColor: '#ff9800', color: 'white',
                                  }}>T. EXTRA</span>
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: row.entrada ? '#155724' : '#ccc' }}>{row.entrada || '--:--'}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: row.salida_comer ? '#856404' : '#ccc' }}>{row.salida_comer || '--:--'}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: row.regreso_comer ? '#004085' : '#ccc' }}>{row.regreso_comer || '--:--'}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: row.salida ? '#721c24' : '#ccc' }}>{row.salida || '--:--'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ========== MODAL: ENVIAR A CHECADORES ========== */}
      {showChecadorModal && checadorTarget && (
        <div style={subModalOverlay} onClick={() => setShowChecadorModal(false)}>
          <div style={modalSmall} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px' }}>Enviar a Checadores</h3>
            <p style={{ color: '#666', margin: '0 0 16px', fontSize: '0.9rem' }}>
              {nombreCompleto(checadorTarget)} ({checadorTarget.numero_empleado})
            </p>
            <p style={{ fontSize: '0.85rem', color: '#555', margin: '0 0 12px' }}>Selecciona los dispositivos:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {activeDevices.map(d => (
                <label key={d.id} style={{
                  ...checkboxDeviceStyle,
                  backgroundColor: checadorDevices.includes(d.id) ? '#e8f5e9' : 'white',
                  borderColor: checadorDevices.includes(d.id) ? '#4caf50' : '#d1d5db',
                }}>
                  <input type="checkbox" checked={checadorDevices.includes(d.id)}
                    onChange={() => setChecadorDevices(prev =>
                      prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id]
                    )}
                    style={{ width: '16px', height: '16px' }} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{d.nombre}</div>
                    {d.ubicacion && <div style={{ fontSize: '0.78rem', color: '#666' }}>{d.ubicacion}</div>}
                  </div>
                </label>
              ))}
              {activeDevices.length === 0 && <p style={{ color: '#999' }}>No hay dispositivos activos.</p>}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowChecadorModal(false)} style={btnSecondary}>Cancelar</button>
              <button onClick={enviarAChecadores} style={btnSuccess} disabled={checadorDevices.length === 0}>
                Enviar a {checadorDevices.length} dispositivo(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL: REGISTRAR HUELLA ========== */}
      {showHuellaModal && huellaTarget && (() => {
        return (
          <div style={subModalOverlay} onClick={cerrarHuellaModal}>
            <div style={{ ...modalSmall, maxWidth: '550px' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0 }}>Registrar Huella</h3>
                <button onClick={cerrarHuellaModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
              </div>
              <p style={{ color: '#666', margin: '0 0 16px', fontSize: '0.9rem' }}>
                {nombreCompleto(huellaTarget)} ({huellaTarget.numero_empleado})
              </p>

              {/* Estado de huella */}
              {tieneHuella ? (
                <div style={{ padding: '12px 14px', borderRadius: '8px', marginBottom: '16px', backgroundColor: '#d4edda', border: '1px solid #c3e6cb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: huellaTemplates.length > 0 ? '8px' : 0 }}>
                    <span style={{ color: '#155724', fontWeight: 700, fontSize: '1rem' }}>&#10003;</span>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#155724' }}>
                      {huellaTemplates.length} huella{huellaTemplates.length !== 1 ? 's' : ''} registrada{huellaTemplates.length !== 1 ? 's' : ''} en el sistema
                    </span>
                  </div>
                  {huellaTemplates.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {huellaTemplates.map(t => (
                        <span key={t.id} style={{ padding: '3px 10px', borderRadius: '20px', backgroundColor: '#b8dfc8', color: '#155724', fontSize: '0.78rem', fontWeight: 500 }}>
                          Dedo {t.finger_index + 1}{t.source_device_nombre ? ` · ${t.source_device_nombre}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', backgroundColor: '#fff3cd', border: '1px solid #ffeeba' }}>
                  <span style={{ fontWeight: 500, fontSize: '0.9rem', color: '#856404' }}>Sin huella registrada en el sistema</span>
                </div>
              )}

              <div>
                  {/* Confirmacion: solicitud enviada al agente */}
                  {enrollStatus === 'completed' && (
                    <div style={{ padding: '16px', backgroundColor: '#d4edda', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <span style={{ fontSize: '1.4rem', color: '#155724', lineHeight: 1 }}>&#10003;</span>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: '0.95rem', color: '#155724', margin: '0 0 4px' }}>
                          Solicitud de registro enviada
                        </p>
                        <p style={{ color: '#155724', fontSize: '0.85rem', margin: 0 }}>
                          El agente procesara el registro de huella en el siguiente ciclo. Pide al empleado que coloque el dedo en el checador cuando el dispositivo lo solicite.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Formulario de seleccion de dispositivo */}
                  {enrollStatus === 'idle' && (
                    <>
                      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#555' }}>
                        Selecciona el dispositivo donde el empleado registrara su huella. Debe estar presente fisicamente frente al checador.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        {activeDevices.map(d => (
                          <label key={d.id} style={{
                            ...checkboxDeviceStyle,
                            backgroundColor: enrollDevice === d.id ? '#e0f2f1' : 'white',
                            borderColor: enrollDevice === d.id ? '#20c997' : '#d1d5db',
                          }}>
                            <input type="radio" name="enrollDevice" checked={enrollDevice === d.id}
                              onChange={() => setEnrollDevice(d.id)}
                              style={{ width: '16px', height: '16px' }} />
                            <div>
                              <div style={{ fontWeight: 500 }}>{d.nombre}</div>
                              {d.ubicacion && <div style={{ fontSize: '0.78rem', color: '#666' }}>{d.ubicacion}</div>}
                            </div>
                          </label>
                        ))}
                        {activeDevices.length === 0 && <p style={{ color: '#999', fontSize: '0.85rem' }}>No hay dispositivos activos.</p>}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button onClick={cerrarHuellaModal} style={btnSecondary}>Cancelar</button>
                        <button onClick={iniciarEnrollHuella}
                          style={enrollingHuella || !enrollDevice ? { ...btnPrimary, backgroundColor: '#20c997', opacity: 0.6, cursor: 'not-allowed' } : { ...btnPrimary, backgroundColor: '#20c997' }}
                          disabled={enrollingHuella || !enrollDevice}>
                          {enrollingHuella ? 'Iniciando...' : 'Iniciar Registro de Huella'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
            </div>
          </div>
        );
      })()}

      {/* ========== MODAL: CREAR/EDITAR DEPARTAMENTO ========== */}
      {showDeptoModal && (
        <div style={subModalOverlay} onClick={() => setShowDeptoModal(false)}>
          <div style={modalSmall} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{editingDeptoId ? 'Editar Departamento' : 'Nuevo Departamento'}</h3>
              <button onClick={() => setShowDeptoModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleDeptoSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>Nombre del departamento *</label>
                  <input style={inputStyle} value={deptoForm.nombre}
                    onChange={e => setDeptoForm(p => ({ ...p, nombre: e.target.value }))} required />
                </div>
                <div>
                  <label style={labelStyle}>Empresa *</label>
                  <select style={inputStyle} value={deptoForm.empresa_id ?? ''}
                    onChange={e => setDeptoForm(p => ({ ...p, empresa_id: e.target.value ? Number(e.target.value) : undefined, jefe_id: null }))} required>
                    <option value="">-- Seleccionar empresa --</option>
                    {activeEmpresas.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Jefe del departamento</label>
                  <select style={inputStyle} value={deptoForm.jefe_id ?? ''}
                    onChange={e => setDeptoForm(p => ({ ...p, jefe_id: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">-- Sin jefe asignado --</option>
                    {empleadosForEmpresa(deptoForm.empresa_id).map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.numero_empleado} - {emp.nombre} {emp.apellido_paterno || ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowDeptoModal(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                  {saving ? 'Guardando...' : editingDeptoId ? 'Guardar Cambios' : 'Crear Departamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== MODAL: CREAR/EDITAR PUESTO ========== */}
      {showPuestoModal && (
        <div style={subModalOverlay} onClick={() => setShowPuestoModal(false)}>
          <div style={modalSmall} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{editingPuestoId ? 'Editar Puesto' : 'Nuevo Puesto'}</h3>
              <button onClick={() => setShowPuestoModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handlePuestoSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                {!editingPuestoId && (
                  <>
                    <div>
                      <label style={labelStyle}>Empresa *</label>
                      <select style={inputStyle} value={puestoForm.empresa_id ?? ''}
                        onChange={e => setPuestoForm(p => ({ ...p, empresa_id: e.target.value ? Number(e.target.value) : undefined, departamento_id: undefined }))} required>
                        <option value="">-- Seleccionar empresa --</option>
                        {activeEmpresas.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Departamento *</label>
                      <select style={inputStyle} value={puestoForm.departamento_id ?? ''}
                        onChange={e => setPuestoForm(p => ({ ...p, departamento_id: e.target.value ? Number(e.target.value) : undefined }))}
                        required disabled={!puestoForm.empresa_id}>
                        <option value="">-- Seleccionar departamento --</option>
                        {deptosForEmpresa(puestoForm.empresa_id).map(d => (
                          <option key={d.id} value={d.id}>{d.nombre}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                {editingPuestoId && (puestoForm.empresa_id != null || puestoForm.departamento_id != null) && (
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
                    {puestos.find(x => x.id === editingPuestoId)?.empresa_nombre || '—'} / {puestos.find(x => x.id === editingPuestoId)?.departamento_nombre || '—'}
                  </p>
                )}
                <div>
                  <label style={labelStyle}>Nombre del puesto *</label>
                  <input style={inputStyle} value={puestoForm.nombre}
                    onChange={e => setPuestoForm(p => ({ ...p, nombre: e.target.value }))}
                    placeholder="Ej: Operador, Vendedor" required disabled={!!editingPuestoId && isPuestoReservado(puestoForm.nombre)} />
                  {!editingPuestoId && (
                    <p style={{ fontSize: '0.78rem', color: '#666', margin: '4px 0 0' }}>No se pueden crear: Director, Gerente General, RH</p>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Orden</label>
                  <input type="number" style={inputStyle} value={puestoForm.orden}
                    onChange={e => setPuestoForm(p => ({ ...p, orden: parseInt(e.target.value, 10) || 0 }))} min={0} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" id="puesto-activo" checked={puestoForm.activo}
                    onChange={e => setPuestoForm(p => ({ ...p, activo: e.target.checked }))} />
                  <label htmlFor="puesto-activo" style={{ cursor: 'pointer', fontSize: '0.9rem' }}>Activo</label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowPuestoModal(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                  {saving ? 'Guardando...' : editingPuestoId ? 'Guardar Cambios' : 'Crear Puesto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
