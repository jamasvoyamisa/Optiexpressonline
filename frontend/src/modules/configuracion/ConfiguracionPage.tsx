import { useState, useEffect } from 'react';
import api from '../../services/api';
import { fmtNombreEmpleado } from '../../utils/format';
import { useAuth } from '../../hooks/useAuth';
import { DepartamentoResponse, Dispositivo, DispositivoCreate, EmpresaResponse, EmpleadoResponse, PuestoResponse, SoporteTicketTipoResponse, UsuarioEspecialCreate } from '../../types';
import { VacacionesGeneralesPage } from '../vacaciones/VacacionesGeneralesPage';
import { ChecadasEspecialesPage } from './ChecadasEspecialesPage';

const toLocalDate = (iso: string) =>
  new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');

const fmtDate = (iso: string) =>
  toLocalDate(iso).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

type ConfigTab = 'dispositivos' | 'empresas' | 'horarios' | 'festivos' | 'vacaciones_generales' | 'checadas_especiales' | 'usuarios_especiales' | 'soporte';

function configTabSubtitle(tab: ConfigTab): string {
  switch (tab) {
    case 'dispositivos':
      return 'Dispositivos Biometricos';
    case 'empresas':
      return 'Empresas';
    case 'horarios':
      return 'Horarios de Trabajo';
    case 'festivos':
      return 'Días festivos (calendario LFT)';
    case 'vacaciones_generales':
      return 'Vacaciones generales y días otorgados por la empresa';
    case 'checadas_especiales':
      return 'Checadas especiales (horarios por fechas)';
    case 'usuarios_especiales':
      return 'Usuarios Especiales';
    case 'soporte':
      return 'Catálogo de tipos de ticket de soporte';
    default:
      return '';
  }
}

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

type UsuarioEspecialFormState = {
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  email: string;
  telefono: string;
  username: string;
  password: string;
  /** Si es true, solo se muestran casillas de empresas (alcance del director). */
  esDirector: boolean;
  empresa_id: number | '';
  departamento_id: number | '';
  puesto_id: number | '';
  /** Empresas que supervisa (solo modo director). */
  empresas_supervision_ids: number[];
};

const emptyUsuarioEspecialForm = (): UsuarioEspecialFormState => ({
  nombre: '',
  apellido_paterno: '',
  apellido_materno: '',
  email: '',
  telefono: '',
  username: '',
  password: '',
  esDirector: false,
  empresa_id: '',
  departamento_id: '',
  puesto_id: '',
  empresas_supervision_ids: [],
});

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

const modalEmpresa: React.CSSProperties = {
  backgroundColor: 'white', borderRadius: '12px', padding: '28px',
  maxWidth: '720px', width: '94%', maxHeight: '92vh', overflowY: 'auto',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

type EmpresaFormState = {
  nombre: string;
  rfc: string;
  capital_social: string;
  codigo_postal: string;
  domicilio: string;
  numero_exterior: string;
  numero_interior: string;
  colonia: string;
  municipio: string;
  estado: string;
  regimen_fiscal: string;
  telefono: string;
  dias_laborales: 'lun-sab' | 'lun-dom';
  trabaja_festivos: boolean;
};

const emptyEmpresaForm = (): EmpresaFormState => ({
  nombre: '',
  rfc: '',
  capital_social: '',
  codigo_postal: '',
  domicilio: '',
  numero_exterior: '',
  numero_interior: '',
  colonia: '',
  municipio: '',
  estado: '',
  regimen_fiscal: '',
  telefono: '',
  dias_laborales: 'lun-sab',
  trabaja_festivos: false,
});

function formatEmpresaDomicilioFiscal(emp: EmpresaResponse): string {
  const parts = [
    emp.domicilio,
    emp.numero_exterior ? `No. ext. ${emp.numero_exterior}` : '',
    emp.numero_interior ? `Int. ${emp.numero_interior}` : '',
    emp.colonia,
    emp.municipio,
    emp.estado,
    emp.codigo_postal ? `C.P. ${emp.codigo_postal}` : '',
  ].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return emp.direccion || '—';
}

const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 500, color: '#374151' };
const inputStyle: React.CSSProperties = { width: '100%', height: '38px', padding: '0 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' };
const btnSuccess: React.CSSProperties = { padding: '9px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap' };
const btnSecondary: React.CSSProperties = { padding: '9px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap' };

export const ConfiguracionPage = () => {
  const { authMe } = useAuth();
  const isSuperuser = authMe?.is_superuser === true;

  const [configTab, setConfigTab] = useState<ConfigTab>('dispositivos');
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaResponse[]>([]);
  const [empleados, setEmpleados] = useState<{ id: number; empresa_id?: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<number, boolean>>({});
  const [showEmpresaModal, setShowEmpresaModal] = useState(false);
  const [editingEmpresaId, setEditingEmpresaId] = useState<number | null>(null);
  const [empresaForm, setEmpresaForm] = useState<EmpresaFormState>(emptyEmpresaForm());
  const [regimenesSat, setRegimenesSat] = useState<{ code: string; descripcion: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [tiposSoporte, setTiposSoporte] = useState<SoporteTicketTipoResponse[]>([]);
  const [showTipoSoporteModal, setShowTipoSoporteModal] = useState(false);
  const [editingTipoSoporte, setEditingTipoSoporte] = useState<SoporteTicketTipoResponse | null>(null);
  const [tipoSoporteForm, setTipoSoporteForm] = useState({ nombre: '', activo: true });

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

  // Usuarios especiales (exento de incidencias)
  const [usuariosEspeciales, setUsuariosEspeciales] = useState<EmpleadoResponse[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartamentoResponse[]>([]);
  const [puestos, setPuestos] = useState<PuestoResponse[]>([]);
  const [loadingUsuariosEspeciales, setLoadingUsuariosEspeciales] = useState(false);
  const [showUsuarioEspecialModal, setShowUsuarioEspecialModal] = useState(false);
  const [usuarioEspecialModalMode, setUsuarioEspecialModalMode] = useState<'create' | 'edit'>('create');
  const [editingUsuarioEspecialId, setEditingUsuarioEspecialId] = useState<number | null>(null);
  const [loadingUsuarioEspecialDetalle, setLoadingUsuarioEspecialDetalle] = useState(false);
  /** Copia inicial al abrir «Ver» (evita perder empresa/depto/puesto al desmarcar director). */
  const [usuarioEspecialEditSnapshot, setUsuarioEspecialEditSnapshot] = useState<UsuarioEspecialFormState | null>(null);
  const [usuarioEspecialForm, setUsuarioEspecialForm] = useState<UsuarioEspecialFormState>(emptyUsuarioEspecialForm());
  const [togglingEspecial, setTogglingEspecial] = useState<number | null>(null);

  useEffect(() => {
    loadData();
    loadFestivos();
  }, []);

  useEffect(() => {
    if (configTab !== 'empresas') return;
    api.get<{ code: string; descripcion: string }[]>('/personal/regimenes-fiscales-sat')
      .then((res) => setRegimenesSat(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRegimenesSat([]));
  }, [configTab]);

  /** Solo administrador ve / usa pestañas Vacaciones generales y Checadas especiales */
  useEffect(() => {
    if (!isSuperuser && (configTab === 'vacaciones_generales' || configTab === 'checadas_especiales')) {
      setConfigTab('dispositivos');
    }
  }, [isSuperuser, configTab]);

  // Refresco frecuente de dispositivos (última conexión del agente) mientras está en esta pestaña
  useEffect(() => {
    if (configTab !== 'dispositivos') return;
    const cargarSoloDispositivos = () => {
      api.get('/asistencia/devices')
        .then(res => { setDispositivos(Array.isArray(res.data) ? res.data : []); })
        .catch(() => {});
    };
    cargarSoloDispositivos();
    const interval = setInterval(cargarSoloDispositivos, 10000);
    return () => clearInterval(interval);
  }, [configTab]);

  const loadUsuariosEspeciales = async () => {
    setLoadingUsuariosEspeciales(true);
    try {
      const res = await api.get<EmpleadoResponse[]>('/personal/empleados', { params: { exento_incidencias: true, limit: 500 } });
      setUsuariosEspeciales(Array.isArray(res.data) ? res.data : []);
    } catch {
      setUsuariosEspeciales([]);
    } finally {
      setLoadingUsuariosEspeciales(false);
    }
  };

  useEffect(() => {
    if (configTab === 'usuarios_especiales') loadUsuariosEspeciales();
  }, [configTab]);

  useEffect(() => {
    if (configTab === 'soporte' && isSuperuser) loadTiposSoporte();
  }, [configTab, isSuperuser]);

  const toggleExentoIncidencias = async (emp: EmpleadoResponse, valor: boolean) => {
    setTogglingEspecial(emp.id);
    try {
      await api.put(`/personal/empleados/${emp.id}`, { exento_incidencias: valor });
      loadUsuariosEspeciales();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || 'Error al actualizar');
    } finally {
      setTogglingEspecial(null);
    }
  };

  const departamentosPorEmpresaEspecial = usuarioEspecialForm.empresa_id === ''
    ? []
    : departamentos.filter((d) => d.activo && d.empresa_id === Number(usuarioEspecialForm.empresa_id));

  const puestosPorEmpresaDeptoEspecial = usuarioEspecialForm.empresa_id === '' || usuarioEspecialForm.departamento_id === ''
    ? []
    : puestos.filter((p) => {
        if (!p.activo) return false;
        const esGlobal = p.empresa_id == null && p.departamento_id == null;
        const esDelDepto = p.empresa_id === Number(usuarioEspecialForm.empresa_id) && p.departamento_id === Number(usuarioEspecialForm.departamento_id);
        return esGlobal || esDelDepto;
      });

  const puestoDirectorGlobalId = () => {
    const d = puestos.find(
      (p) =>
        p.activo &&
        p.empresa_id == null &&
        p.departamento_id == null &&
        (p.nombre || '').trim().toLowerCase() === 'director',
    );
    return d?.id;
  };

  const primerDepartamentoActivoEmpresa = (empresaId: number) => {
    const deps = departamentos
      .filter((d) => d.activo && d.empresa_id === empresaId)
      .sort((a, b) => a.id - b.id);
    return deps[0]?.id;
  };

  const toggleEmpresaSupervision = (empId: number) => {
    setUsuarioEspecialForm((p) => {
      const s = new Set(p.empresas_supervision_ids);
      if (s.has(empId)) s.delete(empId);
      else s.add(empId);
      return { ...p, empresas_supervision_ids: [...s] };
    });
  };

  const populateUsuarioEspecialFormFromEmpleado = (emp: EmpleadoResponse): UsuarioEspecialFormState => {
    const esDir = (emp.puesto?.nombre || '').trim().toLowerCase() === 'director';
    const sup =
      emp.empresas_supervisadas_ids && emp.empresas_supervisadas_ids.length > 0
        ? [...emp.empresas_supervisadas_ids]
        : esDir && emp.empresa_id
          ? [emp.empresa_id]
          : [];
    return {
      nombre: emp.nombre || '',
      apellido_paterno: emp.apellido_paterno || '',
      apellido_materno: emp.apellido_materno || '',
      email: emp.email || '',
      telefono: emp.telefono || '',
      username: emp.username || '',
      password: '',
      esDirector: esDir,
      empresa_id: emp.empresa_id ?? '',
      departamento_id: emp.departamento_id ?? '',
      puesto_id: emp.puesto_id ?? '',
      empresas_supervision_ids: sup,
    };
  };

  const openCrearUsuarioEspecial = () => {
    setUsuarioEspecialModalMode('create');
    setEditingUsuarioEspecialId(null);
    setUsuarioEspecialEditSnapshot(null);
    setUsuarioEspecialForm(emptyUsuarioEspecialForm());
    setShowUsuarioEspecialModal(true);
  };

  const openVerUsuarioEspecial = async (emp: EmpleadoResponse) => {
    setLoadingUsuarioEspecialDetalle(true);
    try {
      const res = await api.get<EmpleadoResponse>(`/personal/empleados/${emp.id}`);
      const populated = populateUsuarioEspecialFormFromEmpleado(res.data);
      setUsuarioEspecialForm(populated);
      setUsuarioEspecialEditSnapshot({ ...populated });
      setUsuarioEspecialModalMode('edit');
      setEditingUsuarioEspecialId(emp.id);
      setShowUsuarioEspecialModal(true);
    } catch {
      alert('No se pudo cargar el usuario.');
    } finally {
      setLoadingUsuarioEspecialDetalle(false);
    }
  };

  const closeUsuarioEspecialModal = () => {
    setShowUsuarioEspecialModal(false);
    setEditingUsuarioEspecialId(null);
    setUsuarioEspecialModalMode('create');
    setUsuarioEspecialEditSnapshot(null);
    setUsuarioEspecialForm(emptyUsuarioEspecialForm());
  };

  const handleGuardarUsuarioEspecial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuarioEspecialForm.nombre.trim()) { alert('El nombre es obligatorio'); return; }
    if (usuarioEspecialModalMode === 'edit' && editingUsuarioEspecialId == null) return;
    setSaving(true);
    try {
      const base = {
        nombre: usuarioEspecialForm.nombre.trim(),
        apellido_paterno: usuarioEspecialForm.apellido_paterno.trim() || undefined,
        apellido_materno: usuarioEspecialForm.apellido_materno.trim() || undefined,
        email: usuarioEspecialForm.email.trim() || undefined,
        telefono: usuarioEspecialForm.telefono.trim() || undefined,
        username: usuarioEspecialForm.username.trim() || undefined,
      };

      if (usuarioEspecialForm.esDirector) {
        const ids = usuarioEspecialForm.empresas_supervision_ids;
        if (ids.length === 0) {
          alert('Marca al menos una empresa que supervise el director.');
          setSaving(false);
          return;
        }
        const pid = puestoDirectorGlobalId();
        if (!pid) {
          alert('No existe el puesto global «Director» en el catálogo. Contacte al administrador del sistema.');
          setSaving(false);
          return;
        }
        for (const eid of ids) {
          if (!primerDepartamentoActivoEmpresa(eid)) {
            const nom = empresas.find((e) => e.id === eid)?.nombre || String(eid);
            alert(`La empresa «${nom}» no tiene departamento activo. Crea al menos un departamento antes.`);
            setSaving(false);
            return;
          }
        }
        const empresaPrimaria = Math.min(...ids);
        const deptId = primerDepartamentoActivoEmpresa(empresaPrimaria)!;
        const payload: UsuarioEspecialCreate = {
          ...base,
          password: usuarioEspecialForm.password.trim() || undefined,
          empresa_id: empresaPrimaria,
          departamento_id: deptId,
          puesto_id: pid,
          empresas_supervision_ids: [...ids],
        };
        if (usuarioEspecialModalMode === 'create') {
          await api.post('/personal/usuarios-especiales', payload);
          alert('Usuario especial creado');
        } else {
          const putBody: Record<string, unknown> = {
            ...base,
            empresa_id: empresaPrimaria,
            departamento_id: deptId,
            puesto_id: pid,
            empresas_supervision_ids: [...ids],
          };
          if (usuarioEspecialForm.password.trim()) putBody.password = usuarioEspecialForm.password.trim();
          await api.put(`/personal/empleados/${editingUsuarioEspecialId}`, putBody);
          alert('Usuario especial actualizado');
        }
      } else {
        if (usuarioEspecialForm.empresa_id === '' || usuarioEspecialForm.departamento_id === '' || usuarioEspecialForm.puesto_id === '') {
          alert('Empresa, departamento y puesto son obligatorios');
          setSaving(false);
          return;
        }
        const pr = puestos.find((x) => x.id === Number(usuarioEspecialForm.puesto_id));
        const payload: UsuarioEspecialCreate = {
          ...base,
          password: usuarioEspecialForm.password.trim() || undefined,
          empresa_id: Number(usuarioEspecialForm.empresa_id),
          departamento_id: Number(usuarioEspecialForm.departamento_id),
          puesto_id: Number(usuarioEspecialForm.puesto_id),
        };
        if (pr && (pr.nombre || '').trim().toLowerCase() === 'director') {
          payload.empresas_supervision_ids = [Number(usuarioEspecialForm.empresa_id)];
        }
        if (usuarioEspecialModalMode === 'create') {
          await api.post('/personal/usuarios-especiales', payload);
          alert('Usuario especial creado');
        } else {
          const putBody: Record<string, unknown> = {
            ...base,
            empresa_id: Number(usuarioEspecialForm.empresa_id),
            departamento_id: Number(usuarioEspecialForm.departamento_id),
            puesto_id: Number(usuarioEspecialForm.puesto_id),
          };
          if (pr && (pr.nombre || '').trim().toLowerCase() === 'director') {
            putBody.empresas_supervision_ids = [Number(usuarioEspecialForm.empresa_id)];
          }
          if (usuarioEspecialForm.password.trim()) putBody.password = usuarioEspecialForm.password.trim();
          await api.put(`/personal/empleados/${editingUsuarioEspecialId}`, putBody);
          alert('Usuario especial actualizado');
        }
      }

      closeUsuarioEspecialModal();
      loadUsuariosEspeciales();
      loadData();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      alert(e2.response?.data?.detail || 'Error al guardar usuario especial');
    } finally {
      setSaving(false);
    }
  };

  const loadTiposSoporte = async () => {
    try {
      const res = await api.get<SoporteTicketTipoResponse[]>('/soporte/tipos');
      setTiposSoporte(Array.isArray(res.data) ? res.data : []);
    } catch {
      setTiposSoporte([]);
    }
  };

  const openNewTipoSoporte = () => {
    setEditingTipoSoporte(null);
    setTipoSoporteForm({ nombre: '', activo: true });
    setShowTipoSoporteModal(true);
  };

  const startEditTipoSoporte = (tipo: SoporteTicketTipoResponse) => {
    setEditingTipoSoporte(tipo);
    setTipoSoporteForm({ nombre: tipo.nombre, activo: tipo.activo });
    setShowTipoSoporteModal(true);
  };

  const handleTipoSoporteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipoSoporteForm.nombre.trim()) {
      alert('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      if (editingTipoSoporte) {
        await api.put(`/soporte/tipos/${editingTipoSoporte.id}`, {
          nombre: tipoSoporteForm.nombre.trim(),
          activo: tipoSoporteForm.activo,
        });
      } else {
        await api.post('/soporte/tipos', {
          nombre: tipoSoporteForm.nombre.trim(),
          activo: tipoSoporteForm.activo,
        });
      }
      setShowTipoSoporteModal(false);
      setEditingTipoSoporte(null);
      setTipoSoporteForm({ nombre: '', activo: true });
      loadTiposSoporte();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      alert(e2.response?.data?.detail || 'Error al guardar tipo de ticket');
    } finally {
      setSaving(false);
    }
  };

  const loadFestivos = async (año?: number) => {
    const y = año ?? festivoAño;
    try {
      const res = await api.get(`/asistencia/festivos?año=${y}&solo_activos=false`);
      setFestivos(Array.isArray(res.data) ? res.data : []);
    } catch { /* silent */ }
  };

  const loadData = async () => {
    try {
      const [devRes, emprsRes, empRes, horRes, depRes, puestosRes] = await Promise.allSettled([
        api.get('/asistencia/devices'),
        api.get('/personal/empresas?limit=500'),
        api.get('/personal/empleados?limit=1000'),
        api.get('/asistencia/horarios'),
        api.get('/personal/departamentos?limit=1000'),
        api.get('/personal/puestos?limit=1000'),
      ]);
      if (devRes.status === 'fulfilled') setDispositivos(devRes.value?.data ?? []);
      if (emprsRes.status === 'fulfilled') setEmpresas(emprsRes.value?.data ?? []);
      if (empRes.status === 'fulfilled') setEmpleados(Array.isArray(empRes.value?.data) ? empRes.value.data : []);
      if (horRes.status === 'fulfilled') setHorarios(Array.isArray(horRes.value?.data) ? horRes.value.data : []);
      if (depRes.status === 'fulfilled') setDepartamentos(Array.isArray(depRes.value?.data) ? depRes.value.data : []);
      if (puestosRes.status === 'fulfilled') setPuestos(Array.isArray(puestosRes.value?.data) ? puestosRes.value.data : []);
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
    setEmpresaForm(emptyEmpresaForm());
    setEditingEmpresaId(null);
    setShowEmpresaModal(true);
  };

  const startEditEmpresa = (emp: EmpresaResponse) => {
    setEmpresaForm({
      nombre: emp.nombre,
      rfc: emp.rfc || '',
      capital_social:
        emp.capital_social != null && String(emp.capital_social) !== '' ? String(emp.capital_social) : '',
      codigo_postal: emp.codigo_postal || '',
      domicilio: emp.domicilio || '',
      numero_exterior: emp.numero_exterior || '',
      numero_interior: emp.numero_interior || '',
      colonia: emp.colonia || '',
      municipio: emp.municipio || '',
      estado: emp.estado || '',
      regimen_fiscal: emp.regimen_fiscal || '',
      telefono: emp.telefono || '',
      dias_laborales: emp.dias_laborales === 'lun-dom' ? 'lun-dom' : 'lun-sab',
      trabaja_festivos: !!emp.trabaja_festivos,
    });
    setEditingEmpresaId(emp.id);
    setShowEmpresaModal(true);
  };

  const regimenSatLabel = (code: string | null | undefined) => {
    if (!code) return '—';
    const r = regimenesSat.find((x) => x.code === code);
    return r ? `${code} — ${r.descripcion}` : code;
  };

  const handleEmpresaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaForm.nombre.trim()) { alert('La denominación o razón social es obligatoria'); return; }
    if (empresaForm.codigo_postal.trim() && !/^\d{5}$/.test(empresaForm.codigo_postal.trim())) {
      alert('El código postal debe tener 5 dígitos'); return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { nombre: empresaForm.nombre.trim() };
      if (empresaForm.rfc.trim()) payload.rfc = empresaForm.rfc.trim().toUpperCase();
      if (empresaForm.telefono.trim()) payload.telefono = empresaForm.telefono.trim();
      if (empresaForm.codigo_postal.trim()) payload.codigo_postal = empresaForm.codigo_postal.trim();
      if (empresaForm.domicilio.trim()) payload.domicilio = empresaForm.domicilio.trim();
      if (empresaForm.numero_exterior.trim()) payload.numero_exterior = empresaForm.numero_exterior.trim();
      if (empresaForm.numero_interior.trim()) payload.numero_interior = empresaForm.numero_interior.trim();
      if (empresaForm.colonia.trim()) payload.colonia = empresaForm.colonia.trim();
      if (empresaForm.municipio.trim()) payload.municipio = empresaForm.municipio.trim();
      if (empresaForm.estado.trim()) payload.estado = empresaForm.estado.trim();
      if (empresaForm.regimen_fiscal.trim()) payload.regimen_fiscal = empresaForm.regimen_fiscal.trim();
      const cap = empresaForm.capital_social.trim().replace(/,/g, '');
      if (cap) {
        const n = parseFloat(cap);
        if (!Number.isNaN(n)) payload.capital_social = n;
      }
      const dirParts = [
        empresaForm.domicilio.trim(),
        empresaForm.numero_exterior.trim() ? `No. ext. ${empresaForm.numero_exterior.trim()}` : '',
        empresaForm.numero_interior.trim() ? `Int. ${empresaForm.numero_interior.trim()}` : '',
        empresaForm.colonia.trim(),
        empresaForm.codigo_postal.trim(),
        empresaForm.municipio.trim(),
        empresaForm.estado.trim(),
      ].filter(Boolean);
      if (dirParts.length) payload.direccion = dirParts.join(', ');
      payload.dias_laborales = empresaForm.dias_laborales;
      payload.trabaja_festivos = empresaForm.trabaja_festivos;
      payload.checadas_remotas = true;
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
      const err = error as { response?: { data?: { detail?: string | string[] } } };
      const d = err.response?.data?.detail;
      const msg = Array.isArray(d) ? d.map((x) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: string }).msg) : String(x))).join(' ') : (d || 'Error al guardar empresa');
      alert(msg);
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
            {configTabSubtitle(configTab)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {configTab === 'dispositivos' && (
            <button
              onClick={() => setShowDeviceForm(!showDeviceForm)}
              style={{ padding: '9px 20px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap' }}
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
          {configTab === 'usuarios_especiales' && (
            <button onClick={openCrearUsuarioEspecial} style={btnSuccess}>+ Agregar usuario especial</button>
          )}
          {configTab === 'soporte' && isSuperuser && (
            <button onClick={openNewTipoSoporte} style={btnSuccess}>+ Nuevo tipo de ticket</button>
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
        {isSuperuser && (
          <button style={tabStyle(configTab === 'vacaciones_generales')} onClick={() => setConfigTab('vacaciones_generales')}>
            Vacaciones generales
          </button>
        )}
        {isSuperuser && (
          <button style={tabStyle(configTab === 'checadas_especiales')} onClick={() => setConfigTab('checadas_especiales')}>
            Checadas especiales
          </button>
        )}
        <button style={tabStyle(configTab === 'usuarios_especiales')} onClick={() => setConfigTab('usuarios_especiales')}>Usuarios especiales</button>
        {isSuperuser && (
          <button style={tabStyle(configTab === 'soporte')} onClick={() => setConfigTab('soporte')}>Soporte</button>
        )}
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
                  <input type="text" name="serial_number" placeholder="No necesario para agente" style={inputStyle} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>Opcional. El agente local no lo requiere.</span>
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

              {/* Última conexión del agente (portal web no usa agente) */}
              <p style={{ margin: '6px 0', fontSize: '0.9rem' }}>
                <span style={{ color: '#666', fontWeight: 600 }}>Última conexión del agente: </span>
                {(device.nombre || '').trim() === 'Portal Checadas Remotas' ? (
                  <span style={{ color: '#6b7280', fontStyle: 'italic' }}>Portal web — no aplica</span>
                ) : device.ultima_sync_agente ? (
                  <span style={{ color: '#1565c0', fontWeight: 600 }}>
                    {fmtDate(device.ultima_sync_agente)}
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
                {(device.nombre || '').trim() !== 'Portal Checadas Remotas' && (
                  <button onClick={() => probarComoAgente(device.id)} style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Probar agente
                  </button>
                )}
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
                    {['Razón social', 'RFC', 'Domicilio fiscal', 'C.P.', 'Régimen fiscal', 'Teléfono', 'Jornada', 'Festivos', 'Empleados', 'Estado', 'Acciones'].map(h => (
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
                        <td style={{ padding: '11px 14px', color: '#555' }}>{emp.rfc || '—'}</td>
                        <td style={{ padding: '11px 14px', color: '#555', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem' }} title={formatEmpresaDomicilioFiscal(emp)}>{formatEmpresaDomicilioFiscal(emp)}</td>
                        <td style={{ padding: '11px 14px', color: '#555', fontFamily: 'monospace' }}>{emp.codigo_postal || '—'}</td>
                        <td style={{ padding: '11px 14px', color: '#555', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem' }} title={regimenSatLabel(emp.regimen_fiscal)}>{regimenSatLabel(emp.regimen_fiscal)}</td>
                        <td style={{ padding: '11px 14px', color: '#555' }}>{emp.telefono || '—'}</td>
                        <td style={{ padding: '11px 14px', color: '#334155', fontWeight: 600 }}>
                          {emp.dias_laborales === 'lun-dom' ? 'Lun-Dom' : 'Lun-Sáb'}
                        </td>
                        <td style={{ padding: '11px 14px', color: emp.trabaja_festivos ? '#166534' : '#6b7280', fontWeight: 600 }}>
                          {emp.trabaja_festivos ? 'Sí' : 'No'}
                        </td>
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
          <div style={modalEmpresa} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{editingEmpresaId ? 'Editar empresa' : 'Nueva empresa'}</h3>
              <button type="button" onClick={() => setShowEmpresaModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999', lineHeight: 1 }}>&times;</button>
            </div>
            <form onSubmit={handleEmpresaSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Datos fiscales</p>
                <div>
                  <label style={labelStyle}>Denominación o razón social *</label>
                  <input style={inputStyle} value={empresaForm.nombre}
                    onChange={e => setEmpresaForm(p => ({ ...p, nombre: e.target.value }))} required placeholder="Nombre legal ante el SAT" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>RFC</label>
                    <input style={inputStyle} value={empresaForm.rfc}
                      onChange={e => setEmpresaForm(p => ({ ...p, rfc: e.target.value.toUpperCase() }))} maxLength={13} placeholder="12 o 13 caracteres" />
                  </div>
                  <div>
                    <label style={labelStyle}>Capital social (MXN)</label>
                    <input style={inputStyle} inputMode="decimal"
                      value={empresaForm.capital_social}
                      onChange={e => setEmpresaForm(p => ({ ...p, capital_social: e.target.value }))} placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Régimen fiscal (SAT)</label>
                  <select
                    style={inputStyle}
                    value={empresaForm.regimen_fiscal}
                    onChange={e => setEmpresaForm(p => ({ ...p, regimen_fiscal: e.target.value }))}
                  >
                    <option value="">— Seleccionar —</option>
                    {regimenesSat.map((r) => (
                      <option key={r.code} value={r.code}>{`${r.code} — ${r.descripcion}`}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginTop: 4 }}>Catálogo c_RegimenFiscal (CFDI 4.0)</span>
                </div>

                <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Domicilio fiscal</p>
                <div>
                  <label style={labelStyle}>Calle / domicilio</label>
                  <input style={inputStyle} value={empresaForm.domicilio}
                    onChange={e => setEmpresaForm(p => ({ ...p, domicilio: e.target.value }))} placeholder="Vía pública" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Núm. exterior</label>
                    <input style={inputStyle} value={empresaForm.numero_exterior}
                      onChange={e => setEmpresaForm(p => ({ ...p, numero_exterior: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Núm. interior</label>
                    <input style={inputStyle} value={empresaForm.numero_interior}
                      onChange={e => setEmpresaForm(p => ({ ...p, numero_interior: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Colonia</label>
                  <input style={inputStyle} value={empresaForm.colonia}
                    onChange={e => setEmpresaForm(p => ({ ...p, colonia: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Código postal</label>
                    <input style={inputStyle} value={empresaForm.codigo_postal} maxLength={5}
                      onChange={e => setEmpresaForm(p => ({ ...p, codigo_postal: e.target.value.replace(/\D/g, '').slice(0, 5) }))} placeholder="00000" />
                  </div>
                  <div>
                    <label style={labelStyle}>Municipio / alcaldía</label>
                    <input style={inputStyle} value={empresaForm.municipio}
                      onChange={e => setEmpresaForm(p => ({ ...p, municipio: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Estado</label>
                    <input style={inputStyle} value={empresaForm.estado}
                      onChange={e => setEmpresaForm(p => ({ ...p, estado: e.target.value }))} />
                  </div>
                </div>

                <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Contacto</p>
                <div>
                  <label style={labelStyle}>Teléfono</label>
                  <input style={inputStyle} value={empresaForm.telefono}
                    onChange={e => setEmpresaForm(p => ({ ...p, telefono: e.target.value }))} />
                </div>

                <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Jornada</p>
                <div>
                  <label style={labelStyle}>Días laborables de la empresa</label>
                  <select
                    style={inputStyle}
                    value={empresaForm.dias_laborales}
                    onChange={e => setEmpresaForm(p => ({ ...p, dias_laborales: (e.target.value as 'lun-sab' | 'lun-dom') }))}
                  >
                    <option value="lun-sab">Lunes a sábado</option>
                    <option value="lun-dom">Lunes a domingo</option>
                  </select>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                    Define si el domingo cuenta como día laborable para la lógica de checadas.
                  </span>
                </div>
                <div>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={empresaForm.trabaja_festivos}
                      onChange={e => setEmpresaForm(p => ({ ...p, trabaja_festivos: e.target.checked }))}
                    />
                    ¿La empresa trabaja días festivos?
                  </label>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                    Si está activo, en festivos sí se consideran checadas para esta empresa.
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowEmpresaModal(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                  {saving ? 'Guardando...' : editingEmpresaId ? 'Guardar cambios' : 'Crear empresa'}
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

      {/* ====== TAB: VACACIONES GENERALES (solo administrador) ====== */}
      {isSuperuser && configTab === 'vacaciones_generales' && (
        <VacacionesGeneralesPage embedded />
      )}

      {isSuperuser && configTab === 'checadas_especiales' && (
        <ChecadasEspecialesPage embedded />
      )}

      {/* ====== TAB: USUARIOS ESPECIALES ====== */}
      {configTab === 'usuarios_especiales' && (
        <div>
          <div style={{ padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '8px', marginBottom: '20px', border: '1px solid #bae6fd' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#0369a1' }}>
              <strong>Usuarios especiales</strong> no generan incidencias automáticas (faltas, retardos, salida anticipada, incompleta). Útil para directivos, visitas o personal con horarios flexibles.
            </p>
          </div>
          {loadingUsuariosEspeciales ? (
            <p style={{ color: '#666' }}>Cargando usuarios especiales...</p>
          ) : usuariosEspeciales.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
              <p style={{ color: '#6b7280', margin: 0 }}>No hay usuarios especiales configurados.</p>
              <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: '8px 0 0' }}>Usa "Agregar usuario especial" para asignar empleados que no generen incidencias.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>No.</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>Nombre</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>Departamento</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {usuariosEspeciales.map(emp => (
                    <tr key={emp.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '11px 14px', fontWeight: 500 }}>{(emp.numero_empleado || '').startsWith('ESP-') ? '—' : emp.numero_empleado}</td>
                      <td style={{ padding: '11px 14px' }}>{fmtNombreEmpleado(emp)}</td>
                      <td style={{ padding: '11px 14px', color: '#555' }}>{emp.departamento?.nombre || '—'}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => openVerUsuarioEspecial(emp)}
                          disabled={loadingUsuarioEspecialDetalle}
                          style={{ padding: '4px 12px', fontSize: '0.8rem', backgroundColor: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '4px', cursor: loadingUsuarioEspecialDetalle ? 'not-allowed' : 'pointer', marginRight: 8 }}
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleExentoIncidencias(emp, false)}
                          disabled={togglingEspecial === emp.id}
                          style={{ padding: '4px 12px', fontSize: '0.8rem', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: togglingEspecial === emp.id ? 'not-allowed' : 'pointer' }}
                        >
                          {togglingEspecial === emp.id ? '...' : 'Quitar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal Crear / Editar usuario especial */}
          {showUsuarioEspecialModal && (
            <div style={modalOverlay} onClick={closeUsuarioEspecialModal}>
              <div style={{ ...modalSmall, maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                    {usuarioEspecialModalMode === 'edit' ? 'Ver / editar usuario especial' : 'Agregar usuario especial'}
                  </h3>
                  <button type="button" onClick={closeUsuarioEspecialModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9ca3af' }}>&times;</button>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#6b7280' }}>
                  Usuario especial: no genera incidencias automáticas. Si es director, marca la casilla y elige solo las empresas; en otro caso elige empresa, departamento y puesto.
                  {usuarioEspecialModalMode === 'edit' && (
                    <span style={{ display: 'block', marginTop: 6 }}>El número de empleado no se modifica desde aquí.</span>
                  )}
                </p>
                <form onSubmit={handleGuardarUsuarioEspecial}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={labelStyle}>Nombre *</label>
                      <input style={inputStyle} value={usuarioEspecialForm.nombre} onChange={e => setUsuarioEspecialForm(p => ({ ...p, nombre: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={labelStyle}>Apellido paterno</label>
                      <input style={inputStyle} value={usuarioEspecialForm.apellido_paterno} onChange={e => setUsuarioEspecialForm(p => ({ ...p, apellido_paterno: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Apellido materno</label>
                      <input style={inputStyle} value={usuarioEspecialForm.apellido_materno} onChange={e => setUsuarioEspecialForm(p => ({ ...p, apellido_materno: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input style={inputStyle} type="email" value={usuarioEspecialForm.email} onChange={e => setUsuarioEspecialForm(p => ({ ...p, email: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Teléfono</label>
                      <input style={inputStyle} value={usuarioEspecialForm.telefono} onChange={e => setUsuarioEspecialForm(p => ({ ...p, telefono: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Usuario (opcional)</label>
                      <input style={inputStyle} value={usuarioEspecialForm.username} onChange={e => setUsuarioEspecialForm(p => ({ ...p, username: e.target.value.toLowerCase() }))} placeholder="Se autogenera si se deja vacío" />
                    </div>
                    <div>
                      <label style={labelStyle}>Contraseña (opcional)</label>
                      <input
                        style={inputStyle}
                        type="password"
                        value={usuarioEspecialForm.password}
                        onChange={e => setUsuarioEspecialForm(p => ({ ...p, password: e.target.value }))}
                        placeholder={usuarioEspecialModalMode === 'edit' ? 'Dejar vacío para no cambiar' : 'Si se omite, se usa un valor interno'}
                      />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, color: '#374151' }}>
                        <input
                          type="checkbox"
                          checked={usuarioEspecialForm.esDirector}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setUsuarioEspecialForm((p) => {
                              if (checked) {
                                return {
                                  ...p,
                                  esDirector: true,
                                  empresa_id: '',
                                  departamento_id: '',
                                  puesto_id: '',
                                  empresas_supervision_ids: p.empresa_id ? [Number(p.empresa_id)] : [],
                                };
                              }
                              if (usuarioEspecialModalMode === 'edit' && usuarioEspecialEditSnapshot) {
                                return {
                                  ...usuarioEspecialEditSnapshot,
                                  esDirector: false,
                                  password: p.password,
                                };
                              }
                              return {
                                ...p,
                                esDirector: false,
                                empresa_id: '',
                                departamento_id: '',
                                puesto_id: '',
                                empresas_supervision_ids: [],
                              };
                            });
                          }}
                          style={{ marginTop: 3 }}
                        />
                        <span>
                          Es director
                          <span style={{ display: 'block', fontWeight: 400, fontSize: '0.82rem', color: '#6b7280', marginTop: 4 }}>
                            Actívalo para elegir únicamente las empresas que supervisa (sin departamento ni puesto en pantalla).
                          </span>
                        </span>
                      </label>
                    </div>
                    {usuarioEspecialForm.esDirector ? (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={labelStyle}>Empresas que supervisa *</label>
                        <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#6b7280' }}>
                          Marca todas las razones sociales bajo su dirección. El número de empleado especial usará la empresa con ID menor entre las elegidas como domicilio técnico.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: 220, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
                          {empresas.filter((em) => em.activo).map((em) => (
                            <label key={em.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                              <input
                                type="checkbox"
                                checked={usuarioEspecialForm.empresas_supervision_ids.includes(em.id)}
                                onChange={() => toggleEmpresaSupervision(em.id)}
                              />
                              <span>{em.nombre}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label style={labelStyle}>Empresa *</label>
                          <select
                            style={inputStyle}
                            value={usuarioEspecialForm.empresa_id}
                            onChange={e => setUsuarioEspecialForm(p => ({
                              ...p,
                              empresa_id: e.target.value ? Number(e.target.value) : '',
                              departamento_id: '',
                              puesto_id: '',
                            }))}
                            required
                          >
                            <option value="">-- Seleccionar empresa --</option>
                            {empresas.filter(e => e.activo).map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Departamento *</label>
                          <select
                            style={inputStyle}
                            value={usuarioEspecialForm.departamento_id}
                            onChange={e => setUsuarioEspecialForm(p => ({ ...p, departamento_id: e.target.value ? Number(e.target.value) : '', puesto_id: '' }))}
                            required
                            disabled={usuarioEspecialForm.empresa_id === ''}
                          >
                            <option value="">-- Seleccionar departamento --</option>
                            {departamentosPorEmpresaEspecial.map(dep => <option key={dep.id} value={dep.id}>{dep.nombre}</option>)}
                          </select>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={labelStyle}>Puesto *</label>
                          <select
                            style={inputStyle}
                            value={usuarioEspecialForm.puesto_id}
                            onChange={e => setUsuarioEspecialForm(p => ({ ...p, puesto_id: e.target.value ? Number(e.target.value) : '' }))}
                            required
                            disabled={usuarioEspecialForm.empresa_id === '' || usuarioEspecialForm.departamento_id === ''}
                          >
                            <option value="">-- Seleccionar puesto --</option>
                            {puestosPorEmpresaDeptoEspecial.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#7c2d12', background: '#ffedd5', border: '1px solid #fdba74', borderRadius: 6, padding: '8px 10px' }}>
                    Usuario especial: no registra checadas (ni remotas ni de dispositivo).
                  </p>
                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" onClick={closeUsuarioEspecialModal} style={btnSecondary}>Cancelar</button>
                    <button type="submit" style={saving ? { ...btnSuccess, opacity: 0.6, cursor: 'not-allowed' } : btnSuccess} disabled={saving}>
                      {saving ? 'Guardando...' : usuarioEspecialModalMode === 'edit' ? 'Guardar cambios' : 'Crear usuario especial'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====== TAB: SOPORTE (solo administrador) ====== */}
      {isSuperuser && configTab === 'soporte' && (
        <div>
          <div style={{ padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '8px', marginBottom: '20px', border: '1px solid #bae6fd' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#0369a1' }}>
              Configura los tipos disponibles para los tickets del portal (ej. Soporte, Reemplazo, Mantenimiento).
            </p>
          </div>
          {tiposSoporte.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: '10px', backgroundColor: '#fff' }}>
              <p style={{ margin: 0, color: '#6b7280' }}>No hay tipos de ticket configurados.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>Nombre</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>Estado</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '0.85rem', color: '#555', fontWeight: 600 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tiposSoporte.map((tipo) => (
                    <tr key={tipo.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '11px 14px', fontWeight: 500 }}>{tipo.nombre}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: tipo.activo ? '#d4edda' : '#f8d7da', color: tipo.activo ? '#155724' : '#721c24', fontWeight: 500 }}>
                          {tipo.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                        <button onClick={() => startEditTipoSoporte(tipo)} style={{ padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', backgroundColor: '#ffc107', color: '#000', border: 'none', borderRadius: '4px' }}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showTipoSoporteModal && (
            <div style={modalOverlay} onClick={() => setShowTipoSoporteModal(false)}>
              <div style={{ ...modalSmall, maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid #e5e7eb' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{editingTipoSoporte ? 'Editar tipo de ticket' : 'Nuevo tipo de ticket'}</h3>
                  <button type="button" onClick={() => setShowTipoSoporteModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9ca3af' }}>&times;</button>
                </div>
                <form onSubmit={handleTipoSoporteSubmit}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <label style={labelStyle}>Nombre *</label>
                      <input
                        style={inputStyle}
                        value={tipoSoporteForm.nombre}
                        onChange={(e) => setTipoSoporteForm((p) => ({ ...p, nombre: e.target.value }))}
                        placeholder="Ej: Soporte, Reemplazo"
                        required
                      />
                    </div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={tipoSoporteForm.activo}
                        onChange={(e) => setTipoSoporteForm((p) => ({ ...p, activo: e.target.checked }))}
                      />
                      Activo
                    </label>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" onClick={() => setShowTipoSoporteModal(false)} style={btnSecondary}>Cancelar</button>
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
