import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Dispositivo, DispositivoCreate, EmpresaResponse } from '../../types';

const toLocalDate = (iso: string) =>
  new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');

const fmtDate = (iso: string) =>
  toLocalDate(iso).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

/** Muestra "Hoy 14:30", "Ayer 14:30", "Hace 2 días", etc. */
const fmtRelativo = (iso: string): string => {
  const d = toLocalDate(iso);
  const now = new Date();
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  const fecha = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  if (fecha.getTime() === hoy.getTime()) return `Hoy ${hora}`;
  if (fecha.getTime() === ayer.getTime()) return `Ayer ${hora}`;
  const dias = Math.floor((hoy.getTime() - fecha.getTime()) / (24 * 60 * 60 * 1000));
  if (dias >= 2 && dias <= 6) return `Hace ${dias} días`;
  if (dias >= 7 && dias < 14) return `Hace 1 semana`;
  if (dias >= 14 && dias < 30) return `Hace ${Math.floor(dias / 7)} semanas`;
  return fmtDate(iso);
};

type ConfigTab = 'dispositivos' | 'empresas' | 'horarios' | 'festivos';

interface DiaFestivo {
  id: number;
  fecha: string;
  nombre: string;
  tipo: string;
  activo: boolean;
}

interface Horario {
  id: number;
  nombre: string;
  hora_entrada: string;
  hora_salida: string;
  hora_salida_sabado: string | null;
  dias_semana: string | null;
  tolerancia_minutos: number;
  activo: boolean;
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 28px', cursor: 'pointer', border: 'none',
  borderBottom: active ? '3px solid #0ea5e9' : '3px solid transparent',
  backgroundColor: 'transparent', fontWeight: active ? 700 : 400,
  fontSize: '1rem', color: active ? '#0ea5e9' : '#888',
});

const modalOverlay: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const modalSmall: React.CSSProperties = {
  backgroundColor: 'white', borderRadius: '12px', padding: '28px',
  maxWidth: '500px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 500, color: '#374151' };
const inputStyle: React.CSSProperties = { width: '100%', height: '38px', padding: '0 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' };
const btnSuccess: React.CSSProperties = { padding: '10px 24px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' };
const btnSecondary: React.CSSProperties = { padding: '10px 24px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' };

export const ConfiguracionPage = () => {
  const [configTab, setConfigTab] = useState<ConfigTab>('dispositivos');
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaResponse[]>([]);
  const [empleados, setEmpleados] = useState<{ id: number; empresa_id?: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<number, boolean>>({});
  const [showEmpresaModal, setShowEmpresaModal] = useState(false);
  const [editingEmpresaId, setEditingEmpresaId] = useState<number | null>(null);
  const [empresaForm, setEmpresaForm] = useState({ nombre: '', rfc: '', direccion: '', telefono: '' });
  const [saving, setSaving] = useState(false);

  // Festivos state
  const [festivos, setFestivos] = useState<DiaFestivo[]>([]);
  const [festivoAño, setFestivoAño] = useState<number>(new Date().getFullYear());
  const [showFestivoModal, setShowFestivoModal] = useState(false);
  const [festivoForm, setFestivoForm] = useState({ fecha: '', nombre: '', tipo: 'LFT' });
  const [generandoFestivos, setGenerandoFestivos] = useState(false);

  // Horarios state
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [showHorarioModal, setShowHorarioModal] = useState(false);
  const [editingHorarioId, setEditingHorarioId] = useState<number | null>(null);
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const emptyHorario = { nombre: '', hora_entrada: '08:00', hora_salida: '17:00', hora_salida_sabado: '', tolerancia_minutos: 15, dias_semana: '1,2,3,4,5' };
  const [horarioForm, setHorarioForm] = useState(emptyHorario);
  const [diasSeleccionados, setDiasSeleccionados] = useState<number[]>([1, 2, 3, 4, 5]);
  const [trabajaSabado, setTrabajaSabado] = useState(false);

  useEffect(() => {
    loadData();
    loadFestivos();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadFestivos = async (año?: number) => {
    const y = año ?? festivoAño;
    try {
      const res = await api.get(`/asistencia/festivos?año=${y}&solo_activos=false`);
      setFestivos(Array.isArray(res.data) ? res.data : []);
    } catch { /* silent */ }
  };

  const loadData = async () => {
    try {
      const [devRes, emprsRes, empRes, horRes] = await Promise.allSettled([
        api.get('/asistencia/devices'),
        api.get('/personal/empresas?limit=500'),
        api.get('/personal/empleados?limit=2000'),
        api.get('/asistencia/horarios'),
      ]);
      if (devRes.status === 'fulfilled') setDispositivos(devRes.value?.data ?? []);
      if (emprsRes.status === 'fulfilled') setEmpresas(emprsRes.value?.data ?? []);
      if (empRes.status === 'fulfilled') setEmpleados(Array.isArray(empRes.value?.data) ? empRes.value.data : []);
      if (horRes.status === 'fulfilled') setHorarios(Array.isArray(horRes.value?.data) ? horRes.value.data : []);
    } catch (error) {
      console.error('Error en loadData:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerarFestivos = async () => {
    setGenerandoFestivos(true);
    try {
      const res = await api.post(`/asistencia/festivos/generar/${festivoAño}`);
      alert(`Año ${festivoAño}: ${res.data.creados} festivos creados, ${res.data.omitidos} ya existían.`);
      loadFestivos(festivoAño);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || 'Error al generar festivos');
    } finally {
      setGenerandoFestivos(false);
    }
  };

  const handleFestivoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!festivoForm.fecha || !festivoForm.nombre.trim()) { alert('Fecha y nombre son obligatorios'); return; }
    setSaving(true);
    try {
      await api.post('/asistencia/festivos', festivoForm);
      setShowFestivoModal(false);
      setFestivoForm({ fecha: '', nombre: '', tipo: 'LFT' });
      loadFestivos();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const toggleFestivoActivo = async (f: DiaFestivo) => {
    try {
      await api.patch(`/asistencia/festivos/${f.id}`, { activo: !f.activo });
      loadFestivos();
    } catch { alert('Error al actualizar'); }
  };

  const deleteFestivo = async (f: DiaFestivo) => {
    if (!confirm(`¿Eliminar "${f.nombre}" (${f.fecha})?`)) return;
    try {
      await api.delete(`/asistencia/festivos/${f.id}`);
      loadFestivos();
    } catch { alert('Error al eliminar'); }
  };

  const openNewHorario = () => {
    setHorarioForm(emptyHorario);
    setDiasSeleccionados([1, 2, 3, 4, 5]);
    setTrabajaSabado(false);
    setEditingHorarioId(null);
    setShowHorarioModal(true);
  };

  const startEditHorario = (h: Horario) => {
    const tieneSabado = !!h.hora_salida_sabado;
    setTrabajaSabado(tieneSabado);
    const dias = h.dias_semana ? h.dias_semana.split(',').map(Number).filter(d => d !== 6).filter(Boolean) : [];
    setDiasSeleccionados(dias);
    setHorarioForm({
      nombre: h.nombre,
      hora_entrada: h.hora_entrada,
      hora_salida: h.hora_salida,
      hora_salida_sabado: h.hora_salida_sabado || '',
      tolerancia_minutos: h.tolerancia_minutos,
      dias_semana: h.dias_semana || '',
    });
    setEditingHorarioId(h.id);
    setShowHorarioModal(true);
  };

  const handleHorarioSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!horarioForm.nombre.trim()) { alert('El nombre del horario es obligatorio'); return; }
    if (trabajaSabado && !horarioForm.hora_salida_sabado) { alert('Indica la hora de salida del sábado'); return; }
    setSaving(true);
    try {
      const diasBase = diasSeleccionados.filter(d => d !== 6).sort();
      const payload = {
        ...horarioForm,
        hora_salida_sabado: trabajaSabado ? horarioForm.hora_salida_sabado : null,
        dias_semana: diasBase.join(','),
      };
      if (editingHorarioId) {
        await api.put(`/asistencia/horarios/${editingHorarioId}`, payload);
      } else {
        await api.post('/asistencia/horarios', payload);
      }
      setShowHorarioModal(false);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al guardar horario');
    } finally {
      setSaving(false);
    }
  };

  const toggleHorarioActivo = async (h: Horario) => {
    try {
      if (h.activo) {
        await api.delete(`/asistencia/horarios/${h.id}`);
      } else {
        await api.put(`/asistencia/horarios/${h.id}`, { activo: true });
      }
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error');
    }
  };

  const toggleDia = (num: number) => {
    setDiasSeleccionados(prev =>
      prev.includes(num) ? prev.filter(d => d !== num) : [...prev, num]
    );
  };

  const crearDispositivo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const nombre = (formData.get('nombre') as string)?.trim() || '';
    const ubicacion = (formData.get('ubicacion') as string)?.trim() || undefined;
    const ip_local = (formData.get('ip_local') as string)?.trim() || undefined;
    const serial_number = (formData.get('serial_number') as string)?.trim() || undefined;
    const payload: DispositivoCreate = { nombre, ubicacion, ip_local, serial_number };
    try {
      await api.post('/asistencia/devices', payload);
      setShowDeviceForm(false);
      loadData();
    } catch {
      alert('Error al crear dispositivo');
    }
  };

  const eliminarDispositivo = async (deviceId: number, nombre: string) => {
    if (!confirm(`Eliminar el dispositivo "${nombre}"? No se puede deshacer.`)) return;
    try {
      await api.delete(`/asistencia/devices/${deviceId}`);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al eliminar');
    }
  };

  const probarComoAgente = async (deviceId: number) => {
    const dev = dispositivos.find(d => d.id === deviceId);
    if (!dev?.api_key) { alert('No hay API Key para este dispositivo'); return; }
    try {
      const base = api.defaults.baseURL || `${window.location.origin}/api/v1`;
      const url = `${base.replace(/\/$/, '')}/asistencia/agent/pending-users`;
      const res = await fetch(url, { headers: { 'X-API-Key': dev.api_key, 'Content-Type': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        const count = Array.isArray(data) ? data.length : 0;
        alert(`Conexion con agente OK\nDispositivo: ${dev.nombre}\nUsuarios pendientes: ${count}`);
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Error: ' + (err.detail || `HTTP ${res.status}`));
      }
    } catch (e: unknown) { alert('Error: ' + (e as Error).message); }
  };

  const copiarApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey).then(() => {
      alert('API Key copiada al portapapeles');
    }).catch(() => {
      prompt('Copia la API Key:', apiKey);
    });
  };

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
    } finally {
      setSaving(false);
    }
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

  if (loading) return <div style={{ padding: '20px' }}>Cargando...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ margin: 0 }}>Configuracion</h1>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: '0.9rem' }}>
            {configTab === 'dispositivos' ? 'Dispositivos biometricos' : configTab === 'empresas' ? 'Empresas' : 'Horarios de trabajo'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {configTab === 'dispositivos' && (
            <button
              onClick={() => setShowDeviceForm(!showDeviceForm)}
              style={{ padding: '8px 18px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
            >
              {showDeviceForm ? 'Cancelar' : '+ Registrar Dispositivo'}
            </button>
          )}
          {configTab === 'empresas' && (
            <button onClick={openNewEmpresa} style={btnSuccess}>+ Nueva Empresa</button>
          )}
          {configTab === 'horarios' && (
            <button onClick={openNewHorario} style={btnSuccess}>+ Nuevo Horario</button>
          )}
          {configTab === 'festivos' && (
            <button onClick={() => setShowFestivoModal(true)} style={btnSuccess}>+ Agregar Festivo</button>
          )}
          <button
            onClick={() => { setLoading(true); loadData(); }}
            disabled={loading}
            style={{ padding: '8px 18px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '5px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '20px' }}>
        <button style={tabStyle(configTab === 'dispositivos')} onClick={() => setConfigTab('dispositivos')}>Dispositivos</button>
        <button style={tabStyle(configTab === 'empresas')} onClick={() => setConfigTab('empresas')}>Empresas</button>
        <button style={tabStyle(configTab === 'horarios')} onClick={() => setConfigTab('horarios')}>Horarios</button>
        <button style={tabStyle(configTab === 'festivos')} onClick={() => { setConfigTab('festivos'); loadFestivos(); }}>Días Festivos</button>
      </div>

      {/* ====== TAB: DISPOSITIVOS ====== */}
      {configTab === 'dispositivos' && (
        <>
      {/* Modal nuevo dispositivo */}
      {showDeviceForm && (
        <div style={modalOverlay} onClick={() => setShowDeviceForm(false)}>
          <div style={{ ...modalSmall, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Registrar nuevo dispositivo</h3>
              <button type="button" onClick={() => setShowDeviceForm(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={crearDispositivo}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>Nombre del equipo *</label>
                  <input type="text" name="nombre" required placeholder="Ej: Checador Entrada" style={inputStyle} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>Identificador del dispositivo en el sistema</span>
                </div>
                <div>
                  <label style={labelStyle}>Ubicacion</label>
                  <input type="text" name="ubicacion" placeholder="Ej: Recepcion, Oficina 1" style={inputStyle} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>Lugar donde esta instalado</span>
                </div>
                <div>
                  <label style={labelStyle}>IP local</label>
                  <input type="text" name="ip_local" placeholder="Ej: 192.168.1.201" style={inputStyle} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>IP del checador en la red (para probar conexion)</span>
                </div>
                <div>
                  <label style={labelStyle}>Numero de serie (SN)</label>
                  <input type="text" name="serial_number" placeholder="Opcional, para ADMS/iClock" style={inputStyle} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>Si usas agente local, puedes dejarlo vacio</span>
                </div>
              </div>
              <div style={{ padding: '10px 12px', backgroundColor: '#f0f9ff', borderRadius: '6px', marginBottom: '20px', fontSize: '0.8rem', color: '#0369a1' }}>
                Al guardar se generara una API Key. Configurala en el <strong>config.yaml</strong> del agente en la PC que controla este dispositivo.
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowDeviceForm(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={btnSuccess}>Registrar dispositivo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Total</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#333' }}>{dispositivos.length}</div>
        </div>
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Activos</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#28a745' }}>{dispositivos.filter(d => d.activo).length}</div>
        </div>
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Inactivos</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#dc3545' }}>{dispositivos.filter(d => !d.activo).length}</div>
        </div>
      </div>

      {/* Lista de dispositivos */}
      {dispositivos.length === 0 ? (
        <p style={{ color: '#666', textAlign: 'center', padding: '40px 0' }}>No hay dispositivos. Registra uno para comenzar.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {dispositivos.map((device) => (
            <div key={device.id} style={{ padding: '18px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0 }}>{device.nombre}</h4>
                <span style={{
                  padding: '3px 8px', borderRadius: '4px', fontSize: '0.8rem',
                  backgroundColor: device.activo ? '#d4edda' : '#f8d7da',
                  color: device.activo ? '#155724' : '#721c24',
                }}>
                  {device.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              {device.ubicacion && <p style={{ margin: '4px 0', color: '#666', fontSize: '0.9rem' }}>Ubicacion: {device.ubicacion}</p>}

              {/* Última conexión del agente (la que importa para recibir datos) */}
              <p style={{ margin: '6px 0', fontSize: '0.9rem' }}>
                <span style={{ color: '#666', fontWeight: 600 }}>Última conexión del agente: </span>
                {device.ultima_sync_agente ? (
                  <span style={{ color: '#1565c0', fontWeight: 600 }}>
                    {fmtRelativo(device.ultima_sync_agente)}
                  </span>
                ) : (
                  <span style={{ color: '#e65100', fontWeight: 500 }}>Sin conexión — el agente no ha llamado al servidor</span>
                )}
              </p>

              {/* API Key con mostrar/ocultar y copiar */}
              <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ color: '#666', fontSize: '0.8rem', fontWeight: 500 }}>API Key para el agente</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setShowApiKey(prev => ({ ...prev, [device.id]: !prev[device.id] }))}
                      style={{ fontSize: '0.7rem', padding: '2px 8px', cursor: 'pointer', color: '#0ea5e9', background: 'none', border: '1px solid #0ea5e9', borderRadius: '3px' }}
                    >
                      {showApiKey[device.id] ? 'Ocultar' : 'Mostrar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => copiarApiKey(device.api_key)}
                      style={{ fontSize: '0.7rem', padding: '2px 8px', cursor: 'pointer', color: '#28a745', background: 'none', border: '1px solid #28a745', borderRadius: '3px' }}
                    >
                      Copiar
                    </button>
                  </div>
                </div>
                {showApiKey[device.id] ? (
                  <code style={{ wordBreak: 'break-all', fontSize: '0.75rem', color: '#333' }}>{device.api_key}</code>
                ) : (
                  <code style={{ fontSize: '0.75rem', color: '#999' }}>{'*'.repeat(32)}</code>
                )}
              </div>

              {/* Acciones */}
              <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button onClick={() => probarComoAgente(device.id)} style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Probar agente
                </button>
                <button onClick={() => eliminarDispositivo(device.id, device.nombre)} style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {/* ====== TAB: EMPRESAS ====== */}
      {configTab === 'empresas' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ margin: 0, color: '#555' }}>{empresas.length} empresa(s) registrada(s)</p>
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

      {/* ====== TAB: HORARIOS ====== */}
      {configTab === 'horarios' && (
        <>
          {horarios.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
              <p>No hay horarios registrados. Crea el primero.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    {['Nombre', 'Entrada', 'Salida L-V', 'Salida Sáb', 'Tolerancia', 'Días (L-V)', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {horarios.map(h => {
                    const dias = h.dias_semana ? h.dias_semana.split(',').map(Number).filter(d => d !== 6) : [];
                    const diasLabel = dias.map(d => DIAS[d - 1] || '').filter(Boolean).join(', ') || 'L-V';
                    return (
                      <tr key={h.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '11px 14px', fontWeight: 500 }}>{h.nombre}</td>
                        <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 600, color: '#059669' }}>{h.hora_entrada}</td>
                        <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 600, color: '#dc2626' }}>{h.hora_salida}</td>
                        <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 600, color: h.hora_salida_sabado ? '#d97706' : '#9ca3af' }}>
                          {h.hora_salida_sabado || '—'}
                        </td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{h.tolerancia_minutos} min</td>
                        <td style={{ padding: '11px 14px', color: '#555', fontSize: '0.85rem' }}>{diasLabel}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: h.activo ? '#d4edda' : '#f8d7da', color: h.activo ? '#155724' : '#721c24', fontWeight: 500 }}>
                            {h.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => startEditHorario(h)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px' }}>Editar</button>
                            <button onClick={() => toggleHorarioActivo(h)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: h.activo ? '#dc3545' : '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>
                              {h.activo ? 'Desactivar' : 'Activar'}
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

      {/* Modal Crear/Editar Horario */}
      {showHorarioModal && (
        <div style={modalOverlay} onClick={() => setShowHorarioModal(false)}>
          <div style={modalSmall} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{editingHorarioId ? 'Editar Horario' : 'Nuevo Horario'}</h3>
              <button onClick={() => setShowHorarioModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleHorarioSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>Nombre *</label>
                  <input style={inputStyle} value={horarioForm.nombre} onChange={e => setHorarioForm(p => ({ ...p, nombre: e.target.value }))} required placeholder="Ej: Turno General" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Hora de entrada *</label>
                    <input type="time" style={inputStyle} value={horarioForm.hora_entrada} onChange={e => setHorarioForm(p => ({ ...p, hora_entrada: e.target.value }))} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Hora de salida (Lun–Vie) *</label>
                    <input type="time" style={inputStyle} value={horarioForm.hora_salida} onChange={e => setHorarioForm(p => ({ ...p, hora_salida: e.target.value }))} required />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Tolerancia (minutos)</label>
                  <input type="number" min={0} max={60} style={inputStyle} value={horarioForm.tolerancia_minutos} onChange={e => setHorarioForm(p => ({ ...p, tolerancia_minutos: parseInt(e.target.value) || 0 }))} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>Aplica a retardo y salida anticipada (mismo valor para todos los días)</span>
                </div>
                <div>
                  <label style={labelStyle}>Días laborables (Lun–Vie)</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {DIAS.slice(0, 5).map((d, i) => {
                      const num = i + 1;
                      const active = diasSeleccionados.includes(num);
                      return (
                        <button type="button" key={num} onClick={() => toggleDia(num)} style={{ padding: '4px 10px', borderRadius: '4px', border: `1px solid ${active ? '#0ea5e9' : '#d1d5db'}`, backgroundColor: active ? '#0ea5e9' : 'white', color: active ? 'white' : '#374151', cursor: 'pointer', fontSize: '0.82rem', fontWeight: active ? 600 : 400 }}>
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Sección sábado ── */}
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', color: '#374151' }}>
                    <input
                      type="checkbox"
                      checked={trabajaSabado}
                      onChange={e => { setTrabajaSabado(e.target.checked); if (!e.target.checked) setHorarioForm(p => ({ ...p, hora_salida_sabado: '' })); }}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    ¿Trabaja los sábados?
                  </label>
                  {trabajaSabado && (
                    <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={labelStyle}>Hora de entrada sábado</label>
                        <span style={{ fontSize: '0.78rem', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Usa la misma hora de entrada general</span>
                        <input type="time" style={{ ...inputStyle, backgroundColor: '#f3f4f6', color: '#9ca3af' }} value={horarioForm.hora_entrada} disabled />
                      </div>
                      <div>
                        <label style={labelStyle}>Hora de salida sábado *</label>
                        <input type="time" style={{ ...inputStyle, borderColor: '#d97706' }} value={horarioForm.hora_salida_sabado || ''} onChange={e => setHorarioForm(p => ({ ...p, hora_salida_sabado: e.target.value }))} required={trabajaSabado} />
                      </div>
                    </div>
                  )}
                  {!trabajaSabado && (
                    <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '6px 0 0 24px' }}>
                      El sábado NO es laborable — no se generarán incidencias ese día.
                    </p>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowHorarioModal(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                  {saving ? 'Guardando...' : editingHorarioId ? 'Guardar Cambios' : 'Crear Horario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear/Editar Empresa */}
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

      {/* ====== TAB: DÍAS FESTIVOS ====== */}
      {configTab === 'festivos' && (
        <div>
          {/* Controles de año + auto-generar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontWeight: 600, color: '#374151' }}>Año:</label>
              <input
                type="number" min={2020} max={2099}
                value={festivoAño}
                onChange={e => { const y = Number(e.target.value); setFestivoAño(y); loadFestivos(y); }}
                style={{ width: '90px', height: '36px', padding: '0 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>
            <button
              onClick={handleGenerarFestivos}
              disabled={generandoFestivos}
              style={{ padding: '8px 18px', backgroundColor: '#0369a1', color: 'white', border: 'none', borderRadius: '6px', cursor: generandoFestivos ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.875rem', opacity: generandoFestivos ? 0.6 : 1 }}
            >
              {generandoFestivos ? 'Generando...' : `⚡ Generar LFT ${festivoAño}`}
            </button>
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              Genera automáticamente los días de asueto del Art. 74 LFT + Semana Santa
            </span>
          </div>

          {/* Tabla de festivos */}
          <div style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Fecha</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Nombre</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Tipo</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Activo</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {festivos.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>
                    No hay días festivos para {festivoAño}. Usa "Generar LFT" para agregarlos automáticamente.
                  </td></tr>
                ) : festivos.map((f, i) => {
                  const fechaLocal = new Date(f.fecha + 'T12:00:00');
                  const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
                  const diaNombre = diasSemana[fechaLocal.getDay()];
                  return (
                    <tr key={f.id} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none', opacity: f.activo ? 1 : 0.45 }}>
                      <td style={{ padding: '12px 16px', fontSize: '0.9rem', fontWeight: 500 }}>
                        {fechaLocal.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
                        <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: '#6b7280' }}>({diaNombre})</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{f.nombre}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                          backgroundColor: f.tipo === 'LFT' ? '#e0f2fe' : '#fef9c3',
                          color: f.tipo === 'LFT' ? '#0369a1' : '#854d0e',
                        }}>
                          {f.tipo === 'LFT' ? 'Obligatorio LFT' : 'Adicional'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => toggleFestivoActivo(f)}
                          style={{ padding: '4px 14px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, backgroundColor: f.activo ? '#dcfce7' : '#f3f4f6', color: f.activo ? '#15803d' : '#6b7280' }}
                        >
                          {f.activo ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => deleteFestivo(f)}
                          style={{ padding: '4px 12px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', backgroundColor: '#fee2e2', color: '#dc2626' }}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Modal agregar festivo manual */}
          {showFestivoModal && (
            <div style={modalOverlay} onClick={() => setShowFestivoModal(false)}>
              <div style={{ ...modalSmall, maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Agregar día festivo</h3>
                  <button type="button" onClick={() => setShowFestivoModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9ca3af' }}>&times;</button>
                </div>
                <form onSubmit={handleFestivoSubmit}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                    <div>
                      <label style={labelStyle}>Fecha *</label>
                      <input type="date" style={inputStyle} value={festivoForm.fecha}
                        onChange={e => setFestivoForm(p => ({ ...p, fecha: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={labelStyle}>Nombre *</label>
                      <input style={inputStyle} placeholder="Ej. Fundación del municipio" value={festivoForm.nombre}
                        onChange={e => setFestivoForm(p => ({ ...p, nombre: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={labelStyle}>Tipo</label>
                      <select style={inputStyle} value={festivoForm.tipo}
                        onChange={e => setFestivoForm(p => ({ ...p, tipo: e.target.value }))}>
                        <option value="LFT">Obligatorio LFT</option>
                        <option value="adicional">Adicional / empresa</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setShowFestivoModal(false)} style={btnSecondary}>Cancelar</button>
                    <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
