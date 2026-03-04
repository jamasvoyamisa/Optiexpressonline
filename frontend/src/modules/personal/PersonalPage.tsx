import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { Empleado, EmpleadoCreate, Dispositivo, Asistencia, EmpresaResponse, DepartamentoResponse } from '../../types';

interface FormData extends Omit<EmpleadoCreate, 'registrar_en_checador' | 'dispositivo_ids'> {
  registrar_en_checador: boolean;
  dispositivo_ids: number[];
}

const emptyForm: FormData = {
  numero_empleado: '', nombre: '', apellido_paterno: '', apellido_materno: '',
  email: '', telefono: '', empresa_id: undefined, departamento_id: undefined, puesto: '', curp: '', rfc: '', nss: '',
  direccion: '', fecha_nacimiento: '', contacto_emergencia: '', telefono_emergencia: '',
  fecha_ingreso: '', registrar_en_checador: false, dispositivo_ids: [],
};

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
  width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px',
  fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 500, color: '#374151',
};

const cardStyle: React.CSSProperties = {
  padding: '24px', backgroundColor: 'white', borderRadius: '10px',
  border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 24px', backgroundColor: '#007bff', color: 'white', border: 'none',
  borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
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

const modalSmall: React.CSSProperties = {
  backgroundColor: 'white', borderRadius: '12px', padding: '28px',
  maxWidth: '500px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

const modalLarge: React.CSSProperties = {
  ...modalSmall, maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto',
};

export const PersonalPage = () => {
  const [mainTab, setMainTab] = useState<'empleados' | 'empresas' | 'departamentos'>('empleados');
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaResponse[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartamentoResponse[]>([]);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);
  const [showDetalle, setShowDetalle] = useState(false);
  const [detalleTab, setDetalleTab] = useState<'info' | 'asistencias'>('info');
  const [empChecadas, setEmpChecadas] = useState<Asistencia[]>([]);
  const [loadingChecadas, setLoadingChecadas] = useState(false);

  // Modal formulario empleado (crear / editar)
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });

  // Modal empresa (crear / editar)
  const [showEmpresaModal, setShowEmpresaModal] = useState(false);
  const [editingEmpresaId, setEditingEmpresaId] = useState<number | null>(null);
  const [empresaForm, setEmpresaForm] = useState({ nombre: '', rfc: '', direccion: '', telefono: '' });

  // Modal departamento (crear / editar)
  const [showDeptoModal, setShowDeptoModal] = useState(false);
  const [editingDeptoId, setEditingDeptoId] = useState<number | null>(null);
  const [deptoForm, setDeptoForm] = useState({ nombre: '', empresa_id: 0 as number | undefined, jefe_id: null as number | null });

  // Modal checadores
  const [showChecadorModal, setShowChecadorModal] = useState(false);
  const [checadorTarget, setChecadorTarget] = useState<Empleado | null>(null);
  const [checadorDevices, setChecadorDevices] = useState<number[]>([]);

  // Modal huella (enroll + replicar)
  const [showHuellaModal, setShowHuellaModal] = useState(false);
  const [huellaTarget, setHuellaTarget] = useState<Empleado | null>(null);
  const [huellaTab, setHuellaTab] = useState<'registrar' | 'replicar'>('registrar');
  const [enrollDevice, setEnrollDevice] = useState<number | null>(null);
  const [replicarDevices, setReplicarDevices] = useState<number[]>([]);
  const [tieneHuella, setTieneHuella] = useState(false);
  const [enrollingHuella, setEnrollingHuella] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (filtroEstado) params.append('estado', filtroEstado);
      params.append('limit', '500');
      const [empRes, devRes, emprsRes, deptosRes] = await Promise.all([
        api.get(`/personal/empleados?${params.toString()}`),
        api.get('/asistencia/devices'),
        api.get('/personal/empresas?limit=500'),
        api.get('/personal/departamentos?limit=500'),
      ]);
      setEmpleados(empRes.data);
      setDispositivos(devRes.data);
      setEmpresas(emprsRes.data);
      setDepartamentos(deptosRes.data);
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  }, [search, filtroEstado]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleChange = (field: keyof FormData, value: string | boolean | number | number[] | undefined) => {
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
      puesto: emp.puesto || '',
      curp: emp.curp || '',
      rfc: emp.rfc || '',
      nss: emp.nss || '',
      direccion: emp.direccion || '',
      fecha_nacimiento: emp.fecha_nacimiento ? emp.fecha_nacimiento.slice(0, 10) : '',
      contacto_emergencia: emp.contacto_emergencia || '',
      telefono_emergencia: emp.telefono_emergencia || '',
      fecha_ingreso: emp.fecha_ingreso ? emp.fecha_ingreso.slice(0, 10) : '',
      registrar_en_checador: false,
      dispositivo_ids: [],
    });
    setEditingId(emp.id);
    setShowFormModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.numero_empleado.trim() || !form.nombre.trim()) {
      alert('Numero de empleado y nombre son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(form)) {
        if (key === 'dispositivo_ids') {
          if (Array.isArray(val) && val.length > 0) payload[key] = val;
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
        alert('Empleado actualizado');
      } else {
        await api.post('/personal/empleados', payload);
        const devCount = form.dispositivo_ids.length;
        alert(form.registrar_en_checador && devCount > 0
          ? `Empleado creado y agregado a ${devCount} checador(es)`
          : 'Empleado creado correctamente');
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
    setReplicarDevices([]);
    setEnrollDevice(null);
    setShowHuellaModal(true);
    try {
      const res = await api.get(`/asistencia/fingerprint-templates/${emp.numero_empleado}`);
      const tiene = Array.isArray(res.data) && res.data.length > 0;
      setTieneHuella(tiene);
      setHuellaTab(tiene ? 'replicar' : 'registrar');
    } catch {
      setTieneHuella(false);
      setHuellaTab('registrar');
    }
  };

  const iniciarEnrollHuella = async () => {
    if (!huellaTarget || !enrollDevice) { alert('Selecciona un dispositivo'); return; }
    setEnrollingHuella(true);
    try {
      await api.post(`/asistencia/devices/${enrollDevice}/start-enroll`, { numero_empleado: huellaTarget.numero_empleado });
      alert('Registro de huella iniciado. El empleado debe colocar el dedo en el dispositivo cuando se le indique.');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al iniciar registro de huella');
    } finally { setEnrollingHuella(false); }
  };

  const replicarHuella = async () => {
    if (!huellaTarget || replicarDevices.length === 0) { alert('Selecciona al menos un dispositivo destino'); return; }
    try {
      await api.post('/asistencia/replicate-fingerprint', { numero_empleado: huellaTarget.numero_empleado, dispositivo_ids: replicarDevices });
      alert(`Huella en proceso de replicacion a ${replicarDevices.length} dispositivo(s).`);
      setShowHuellaModal(false);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al replicar');
    }
  };

  // ---- Empresa CRUD ----
  const openNewEmpresa = () => {
    setEmpresaForm({ nombre: '', rfc: '', direccion: '', telefono: '' });
    setEditingEmpresaId(null);
    setShowEmpresaModal(true);
  };

  const startEditEmpresa = (emp: EmpresaResponse) => {
    setEmpresaForm({ nombre: emp.nombre, rfc: emp.rfc || '', direccion: emp.direccion || '', telefono: emp.telefono || '' });
    setEditingEmpresaId(emp.id);
    setShowEmpresaModal(true);
  };

  const handleEmpresaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaForm.nombre.trim()) { alert('El nombre de la empresa es obligatorio'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(empresaForm)) { if (v) payload[k] = v; }
      if (editingEmpresaId) {
        await api.put(`/personal/empresas/${editingEmpresaId}`, payload);
        alert('Empresa actualizada');
      } else {
        await api.post('/personal/empresas', payload);
        alert('Empresa creada');
      }
      setShowEmpresaModal(false);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al guardar empresa');
    } finally { setSaving(false); }
  };

  const toggleEmpresaActivo = async (emp: EmpresaResponse) => {
    try {
      await api.put(`/personal/empresas/${emp.id}`, { activo: !emp.activo });
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error');
    }
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

  const deptosForEmpresa = (empresaId?: number) => {
    if (!empresaId) return [];
    return departamentos.filter(d => d.empresa_id === empresaId && d.activo);
  };

  const empleadosForEmpresa = (empresaId?: number) => {
    if (!empresaId) return empleados.filter(e => e.estado === 'activo');
    return empleados.filter(e => e.empresa_id === empresaId && e.estado === 'activo');
  };

  const filteredEmpleados = filtroEmpresa
    ? empleados.filter(e => String(e.empresa_id) === filtroEmpresa)
    : empleados;

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

  const mainTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 28px', cursor: 'pointer', border: 'none',
    borderBottom: active ? '3px solid #007bff' : '3px solid transparent',
    backgroundColor: 'transparent', fontWeight: active ? 700 : 400,
    fontSize: '1rem', color: active ? '#007bff' : '#888',
  });

  return (
    <div style={{ padding: '20px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ margin: 0 }}>Gestion de Personal</h1>
      </div>

      {/* Main Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '20px' }}>
        <button style={mainTabStyle(mainTab === 'empleados')} onClick={() => setMainTab('empleados')}>Empleados</button>
        <button style={mainTabStyle(mainTab === 'departamentos')} onClick={() => setMainTab('departamentos')}>Departamentos</button>
        <button style={mainTabStyle(mainTab === 'empresas')} onClick={() => setMainTab('empresas')}>Empresas</button>
      </div>

      {/* ====== TAB: EMPRESAS ====== */}
      {mainTab === 'empresas' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ margin: 0, color: '#555' }}>{empresas.length} empresa(s) registrada(s)</p>
            <button onClick={openNewEmpresa} style={btnSuccess}>+ Nueva Empresa</button>
          </div>
          {empresas.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No hay empresas registradas.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    {['Nombre', 'RFC', 'Direccion', 'Telefono', 'Empleados', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {empresas.map(emp => {
                    const count = empleados.filter(e => e.empresa_id === emp.id).length;
                    return (
                      <tr key={emp.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '11px 14px', fontWeight: 500 }}>{emp.nombre}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{emp.rfc || '-'}</td>
                        <td style={{ padding: '11px 14px', color: '#555', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.direccion || '-'}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{emp.telefono || '-'}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 600 }}>{count}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: emp.activo ? '#d4edda' : '#f8d7da', color: emp.activo ? '#155724' : '#721c24', fontWeight: 500 }}>
                            {emp.activo ? 'Activa' : 'Inactiva'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => startEditEmpresa(emp)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px' }}>Editar</button>
                            <button onClick={() => toggleEmpresaActivo(emp)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: emp.activo ? '#dc3545' : '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>
                              {emp.activo ? 'Desactivar' : 'Activar'}
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

      {/* ====== TAB: EMPLEADOS ====== */}
      {mainTab === 'empleados' && (
        <>
          {/* Stats */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
            <button onClick={openNewForm} style={btnSuccess}>+ Nuevo Empleado</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            {[
              { label: 'Total', value: stats.total, color: '#333' },
              { label: 'Activos', value: stats.activos, color: '#28a745' },
              { label: 'Inactivos', value: stats.inactivos, color: '#ffc107' },
              { label: 'Bajas', value: stats.bajas, color: '#dc3545' },
            ].map(s => (
              <div key={s.label} style={{ ...cardStyle, padding: '16px' }}>
                <div style={{ color: '#888', fontSize: '0.82rem', marginBottom: '2px' }}>{s.label}</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 'bold', color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Search + Filters */}
          <div style={{ ...cardStyle, marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Buscar por nombre, numero o email..."
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadData()}
              style={{ ...inputStyle, maxWidth: '300px' }} />
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...inputStyle, maxWidth: '160px' }}>
              <option value="">Todos los estados</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
              <option value="baja">Bajas</option>
            </select>
            <select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)} style={{ ...inputStyle, maxWidth: '200px' }}>
              <option value="">Todas las empresas</option>
              {activeEmpresas.map(emp => (
                <option key={emp.id} value={String(emp.id)}>{emp.nombre}</option>
              ))}
            </select>
            <button onClick={loadData} style={btnPrimary}>Buscar</button>
          </div>

          {/* Table */}
          {filteredEmpleados.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No se encontraron empleados.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    {['No.', 'Nombre completo', 'Empresa', 'Depto.', 'Puesto', 'Telefono', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEmpleados.map(emp => (
                    <tr key={emp.id} style={{ borderBottom: '1px solid #eee' }} onDoubleClick={() => viewDetail(emp)}>
                      <td style={{ padding: '11px 14px', fontWeight: 500 }}>{emp.numero_empleado}</td>
                      <td style={{ padding: '11px 14px' }}>{nombreCompleto(emp)}</td>
                      <td style={{ padding: '11px 14px', color: '#555' }}>{emp.empresa?.nombre || getEmpresaNombre(emp.empresa_id)}</td>
                      <td style={{ padding: '11px 14px', color: '#555' }}>{emp.departamento?.nombre || getDeptoNombre(emp.departamento_id)}</td>
                      <td style={{ padding: '11px 14px', color: '#555' }}>{emp.puesto || '-'}</td>
                      <td style={{ padding: '11px 14px', color: '#555' }}>{emp.telefono || '-'}</td>
                      <td style={{ padding: '11px 14px' }}>{estadoBadge(emp.estado)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          <button onClick={() => viewDetail(emp)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px' }}>Ver</button>
                          <button onClick={() => startEdit(emp)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px' }}>Editar</button>
                          <button onClick={() => openChecadorModal(emp)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#6f42c1', color: 'white', border: 'none', borderRadius: '4px' }}>Checadores</button>
                          <button onClick={() => openHuellaModal(emp)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#20c997', color: 'white', border: 'none', borderRadius: '4px' }}>Huella</button>
                          {emp.estado !== 'baja' && (
                            <button onClick={() => handleBaja(emp)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>Baja</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ========== MODAL: FORMULARIO CREAR/EDITAR ========== */}
      {showFormModal && (
        <div style={modalOverlay} onClick={() => setShowFormModal(false)}>
          <div style={modalLarge} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{editingId ? 'Editar Empleado' : 'Alta de Empleado'}</h3>
              <button onClick={() => setShowFormModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                <legend style={{ fontWeight: 600, color: '#374151', padding: '0 8px' }}>Datos Basicos</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={labelStyle}>No. Empleado *</label>
                    <input style={inputStyle} value={form.numero_empleado} onChange={e => handleChange('numero_empleado', e.target.value)} required disabled={!!editingId} />
                  </div>
                  <div>
                    <label style={labelStyle}>Nombre *</label>
                    <input style={inputStyle} value={form.nombre} onChange={e => handleChange('nombre', e.target.value)} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Apellido Paterno</label>
                    <input style={inputStyle} value={form.apellido_paterno} onChange={e => handleChange('apellido_paterno', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Apellido Materno</label>
                    <input style={inputStyle} value={form.apellido_materno} onChange={e => handleChange('apellido_materno', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Fecha de Nacimiento</label>
                    <input type="date" style={inputStyle} value={form.fecha_nacimiento} onChange={e => handleChange('fecha_nacimiento', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Fecha de Ingreso</label>
                    <input type="date" style={inputStyle} value={form.fecha_ingreso} onChange={e => handleChange('fecha_ingreso', e.target.value)} />
                  </div>
                </div>
              </fieldset>

              <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                <legend style={{ fontWeight: 600, color: '#374151', padding: '0 8px' }}>Contacto</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input type="email" style={inputStyle} value={form.email} onChange={e => handleChange('email', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Telefono</label>
                    <input style={inputStyle} value={form.telefono} onChange={e => handleChange('telefono', e.target.value)} placeholder="10 digitos" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Direccion</label>
                    <input style={inputStyle} value={form.direccion} onChange={e => handleChange('direccion', e.target.value)} placeholder="Calle, numero, colonia, CP, ciudad" />
                  </div>
                </div>
              </fieldset>

              <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                <legend style={{ fontWeight: 600, color: '#374151', padding: '0 8px' }}>Contacto de Emergencia</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={labelStyle}>Nombre del contacto</label>
                    <input style={inputStyle} value={form.contacto_emergencia} onChange={e => handleChange('contacto_emergencia', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Telefono de emergencia</label>
                    <input style={inputStyle} value={form.telefono_emergencia} onChange={e => handleChange('telefono_emergencia', e.target.value)} />
                  </div>
                </div>
              </fieldset>

              <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                <legend style={{ fontWeight: 600, color: '#374151', padding: '0 8px' }}>Datos Laborales</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={labelStyle}>Empresa</label>
                    <select style={inputStyle}
                      value={form.empresa_id ?? ''}
                      onChange={e => handleChange('empresa_id', e.target.value ? Number(e.target.value) : undefined)}>

                      <option value="">-- Sin empresa --</option>
                      {activeEmpresas.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Departamento</label>
                    <select style={inputStyle}
                      value={form.departamento_id ?? ''}
                      onChange={e => handleChange('departamento_id', e.target.value ? Number(e.target.value) : undefined)}>
                      <option value="">-- Sin departamento --</option>
                      {deptosForEmpresa(form.empresa_id).map(d => (
                        <option key={d.id} value={d.id}>{d.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Puesto</label>
                    <input style={inputStyle} value={form.puesto} onChange={e => handleChange('puesto', e.target.value)} placeholder="Ej: Gerente, Vendedor..." />
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
              </fieldset>

              {!editingId && (
                <fieldset style={{ border: '1px solid #c3e6cb', borderRadius: '8px', padding: '20px', marginBottom: '20px', backgroundColor: '#f0fff4' }}>
                  <legend style={{ fontWeight: 600, color: '#2e7d32', padding: '0 8px' }}>Registrar en Checadores</legend>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.registrar_en_checador}
                        onChange={e => handleChange('registrar_en_checador', e.target.checked)}
                        style={{ width: '18px', height: '18px' }} />
                      <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Dar de alta en checadores biometricos al crear</span>
                    </label>
                  </div>
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
                </fieldset>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
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
              ['Contacto emergencia', emp.contacto_emergencia],
              ['Tel. emergencia', emp.telefono_emergencia],
            ],
          },
          {
            title: 'Datos Laborales',
            rows: [
              ['Empresa', emp.empresa?.nombre || getEmpresaNombre(emp.empresa_id)],
              ['Departamento', emp.departamento?.nombre || getDeptoNombre(emp.departamento_id)],
              ['Puesto', emp.puesto],
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
            const d = new Date(c.timestamp);
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
          borderBottom: active ? '3px solid #007bff' : '3px solid transparent',
          backgroundColor: 'transparent', fontWeight: active ? 600 : 400,
          fontSize: '0.9rem', color: active ? '#007bff' : '#888',
        });

        return (
          <div style={modalOverlay} onClick={() => setShowDetalle(false)}>
            <div style={modalLarge} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: '0 0 4px 0' }}>{nombreCompleto(emp)}</h2>
                  <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>No. {emp.numero_empleado} &middot; {emp.departamento || 'Sin departamento'} &middot; {emp.puesto || 'Sin puesto'}</p>
                </div>
                <button onClick={() => setShowDetalle(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {estadoBadge(emp.estado)}
                <button onClick={() => { setShowDetalle(false); startEdit(emp); }} style={{ ...btnPrimary, padding: '6px 16px', fontSize: '0.85rem' }}>Editar</button>
                <button onClick={() => { setShowDetalle(false); openChecadorModal(emp); }} style={{ ...btnPrimary, padding: '6px 16px', fontSize: '0.85rem', backgroundColor: '#6f42c1' }}>Enviar a Checadores</button>
                <button onClick={() => { setShowDetalle(false); openHuellaModal(emp); }} style={{ ...btnPrimary, padding: '6px 16px', fontSize: '0.85rem', backgroundColor: '#20c997' }}>Huella</button>
                {emp.estado !== 'baja' && (
                  <button onClick={() => handleBaja(emp)} style={{ ...btnDanger, padding: '6px 16px', fontSize: '0.85rem' }}>Dar de Baja</button>
                )}
              </div>

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
                        <h4 style={{ margin: '0 0 12px 0', color: '#007bff', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', fontSize: '0.95rem' }}>{section.title}</h4>
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
        <div style={modalOverlay} onClick={() => setShowChecadorModal(false)}>
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

      {/* ========== MODAL: HUELLA (REGISTRAR + REPLICAR) ========== */}
      {showHuellaModal && huellaTarget && (() => {
        const hTabStyle = (active: boolean): React.CSSProperties => ({
          padding: '8px 20px', cursor: 'pointer', border: 'none',
          borderBottom: active ? '3px solid #20c997' : '3px solid transparent',
          backgroundColor: 'transparent', fontWeight: active ? 600 : 400,
          fontSize: '0.9rem', color: active ? '#20c997' : '#888',
        });
        return (
          <div style={modalOverlay} onClick={() => setShowHuellaModal(false)}>
            <div style={{ ...modalSmall, maxWidth: '550px' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0 }}>Gestion de Huella</h3>
                <button onClick={() => setShowHuellaModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
              </div>
              <p style={{ color: '#666', margin: '0 0 16px', fontSize: '0.9rem' }}>
                {nombreCompleto(huellaTarget)} ({huellaTarget.numero_empleado})
              </p>

              {/* Estado de huella */}
              <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', backgroundColor: tieneHuella ? '#d4edda' : '#fff3cd' }}>
                <span style={{ fontWeight: 500, fontSize: '0.9rem', color: tieneHuella ? '#155724' : '#856404' }}>
                  {tieneHuella ? 'Huella registrada en el sistema' : 'Sin huella registrada'}
                </span>
              </div>

              {/* Sub-tabs */}
              <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '16px' }}>
                <button style={hTabStyle(huellaTab === 'registrar')} onClick={() => setHuellaTab('registrar')}>Registrar Huella</button>
                <button style={hTabStyle(huellaTab === 'replicar')} onClick={() => setHuellaTab('replicar')}>Replicar a Dispositivos</button>
              </div>

              {/* TAB: REGISTRAR */}
              {huellaTab === 'registrar' && (
                <div>
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
                    <button onClick={() => setShowHuellaModal(false)} style={btnSecondary}>Cancelar</button>
                    <button onClick={iniciarEnrollHuella}
                      style={enrollingHuella || !enrollDevice ? { ...btnPrimary, backgroundColor: '#20c997', opacity: 0.6, cursor: 'not-allowed' } : { ...btnPrimary, backgroundColor: '#20c997' }}
                      disabled={enrollingHuella || !enrollDevice}>
                      {enrollingHuella ? 'Iniciando...' : 'Iniciar Registro de Huella'}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: REPLICAR */}
              {huellaTab === 'replicar' && (
                <div>
                  {!tieneHuella ? (
                    <div style={{ padding: '20px', backgroundColor: '#fff3cd', borderRadius: '8px', marginBottom: '16px' }}>
                      <p style={{ margin: 0, color: '#856404', fontWeight: 500 }}>Este empleado no tiene huella registrada.</p>
                      <p style={{ margin: '8px 0 0', color: '#856404', fontSize: '0.85rem' }}>
                        Primero registra su huella en la pestana "Registrar Huella".
                      </p>
                    </div>
                  ) : (
                    <>
                      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#555' }}>
                        Selecciona los dispositivos a los que deseas copiar la huella:
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        {activeDevices.map(d => (
                          <label key={d.id} style={{
                            ...checkboxDeviceStyle,
                            backgroundColor: replicarDevices.includes(d.id) ? '#e0f2f1' : 'white',
                            borderColor: replicarDevices.includes(d.id) ? '#20c997' : '#d1d5db',
                          }}>
                            <input type="checkbox" checked={replicarDevices.includes(d.id)}
                              onChange={() => setReplicarDevices(prev =>
                                prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id]
                              )}
                              style={{ width: '16px', height: '16px' }} />
                            <div>
                              <div style={{ fontWeight: 500 }}>{d.nombre}</div>
                              {d.ubicacion && <div style={{ fontSize: '0.78rem', color: '#666' }}>{d.ubicacion}</div>}
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowHuellaModal(false)} style={btnSecondary}>Cancelar</button>
                    {tieneHuella && (
                      <button onClick={replicarHuella} style={{ ...btnPrimary, backgroundColor: '#20c997' }} disabled={replicarDevices.length === 0}>
                        Replicar a {replicarDevices.length} dispositivo(s)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ========== MODAL: CREAR/EDITAR EMPRESA ========== */}
      {showEmpresaModal && (
        <div style={modalOverlay} onClick={() => setShowEmpresaModal(false)}>
          <div style={modalSmall} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{editingEmpresaId ? 'Editar Empresa' : 'Nueva Empresa'}</h3>
              <button onClick={() => setShowEmpresaModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleEmpresaSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>Nombre de la empresa *</label>
                  <input style={inputStyle} value={empresaForm.nombre}
                    onChange={e => setEmpresaForm(p => ({ ...p, nombre: e.target.value }))} required />
                </div>
                <div>
                  <label style={labelStyle}>RFC</label>
                  <input style={inputStyle} value={empresaForm.rfc}
                    onChange={e => setEmpresaForm(p => ({ ...p, rfc: e.target.value.toUpperCase() }))} maxLength={13} placeholder="13 caracteres" />
                </div>
                <div>
                  <label style={labelStyle}>Direccion</label>
                  <input style={inputStyle} value={empresaForm.direccion}
                    onChange={e => setEmpresaForm(p => ({ ...p, direccion: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Telefono</label>
                  <input style={inputStyle} value={empresaForm.telefono}
                    onChange={e => setEmpresaForm(p => ({ ...p, telefono: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowEmpresaModal(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                  {saving ? 'Guardando...' : editingEmpresaId ? 'Guardar Cambios' : 'Crear Empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== MODAL: CREAR/EDITAR DEPARTAMENTO ========== */}
      {showDeptoModal && (
        <div style={modalOverlay} onClick={() => setShowDeptoModal(false)}>
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
    </div>
  );
};
