import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Asistencia, Dispositivo, DispositivoCreate, Empleado } from '../../types';

interface AsistenciaConEmpleado extends Asistencia {
  empleado?: Empleado;
  dispositivo?: Dispositivo;
}

export const AsistenciaPage = () => {
  const [checadas, setChecadas] = useState<AsistenciaConEmpleado[]>([]);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [altaRemota, setAltaRemota] = useState({ dispositivo_id: '', numero_empleado: '', nombre: '' });
  const [usuariosPendientes, setUsuariosPendientes] = useState<{ id: number; numero_empleado: string; nombre: string; enviado: boolean }[]>([]);
  const [serverUrl, setServerUrl] = useState<string>('');
  const [filtros, setFiltros] = useState({
    empleado_id: '',
    dispositivo_id: '',
    fecha_inicio: '',
    fecha_fin: '',
  });

  useEffect(() => {
    loadData();
    
    // Actualizar datos automáticamente cada 15 segundos (usuarios pendientes se actualizan)
    const interval = setInterval(() => {
      loadData();
      if (altaRemota.dispositivo_id) {
        cargarUsuariosPendientes(Number(altaRemota.dispositivo_id));
      }
    }, 15000);
    
    return () => clearInterval(interval);
  }, [altaRemota.dispositivo_id]);

  const loadData = async () => {
    try {
      const [checadasRes, dispositivosRes, empleadosRes, serverRes] = await Promise.all([
        api.get('/asistencia/checadas?limit=100'),
        api.get('/asistencia/devices'),
        api.get('/personal/empleados'),
        api.get('/asistencia/server-url').catch(() => ({ data: { url: (api.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '') || window.location.origin } })),
      ]);
      setChecadas(checadasRes.data);
      setDispositivos(dispositivosRes.data);
      setEmpleados(empleadosRes.data || []);
      setServerUrl(serverRes.data?.url || '');
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = () => {
    setLoading(true);
    loadData();
  };

  const handleFiltros = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.empleado_id) params.append('empleado_id', filtros.empleado_id);
      if (filtros.dispositivo_id) params.append('dispositivo_id', filtros.dispositivo_id);
      if (filtros.fecha_inicio) params.append('fecha_inicio', filtros.fecha_inicio);
      if (filtros.fecha_fin) params.append('fecha_fin', filtros.fecha_fin);
      
      const response = await api.get(`/asistencia/checadas?${params.toString()}`);
      setChecadas(response.data);
    } catch (error) {
      console.error('Error al filtrar:', error);
    } finally {
      setLoading(false);
    }
  };

  const crearDispositivo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload: DispositivoCreate & { ip_local?: string } = {
      nombre: (formData.get('nombre') as string)?.trim() || '',
      ubicacion: (formData.get('ubicacion') as string)?.trim() || undefined,
      serial_number: (formData.get('serial_number') as string)?.trim() || undefined,
      ip_local: (formData.get('ip_local') as string)?.trim() || undefined,
    };
    try {
      await api.post('/asistencia/devices', payload);
      setShowDeviceForm(false);
      loadData();
    } catch (error) {
      console.error('Error al crear dispositivo:', error);
      alert('Error al crear dispositivo');
    }
  };

  const getEmpleadoNombre = (empleadoId: number) => {
    const empleado = empleados.find(e => e.id === empleadoId);
    if (!empleado) {
      // Recargar empleados si no está en la lista
      loadData();
      return `ID: ${empleadoId} (Cargando...)`;
    }
    const nombreCompleto = `${empleado.nombre} ${empleado.apellido_paterno || ''} ${empleado.apellido_materno || ''}`.trim();
    // Si el nombre contiene "(No registrado)", mostrar en rojo o con indicador
    if (nombreCompleto.includes('(No registrado)')) {
      return `${nombreCompleto} ⚠️`;
    }
    return nombreCompleto;
  };

  const getDispositivoNombre = (dispositivoId: number) => {
    const dispositivo = dispositivos.find(d => d.id === dispositivoId);
    return dispositivo?.nombre || `ID: ${dispositivoId}`;
  };

  const editarIpDispositivo = async (deviceId: number, ipActual: string) => {
    const ip = prompt('IP local del dispositivo (ej: 192.168.1.201):', ipActual || '');
    if (ip === null) return;
    try {
      await api.patch(`/asistencia/devices/${deviceId}`, { ip_local: ip.trim() || null });
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(`❌ ${err.response?.data?.detail || 'Error'}`);
    }
  };

  const eliminarDispositivo = async (deviceId: number, nombre: string) => {
    if (!confirm(`¿Eliminar el dispositivo "${nombre}"? No se puede deshacer.`)) return;
    try {
      await api.delete(`/asistencia/devices/${deviceId}`);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(`❌ ${err.response?.data?.detail || 'Error al eliminar'}`);
    }
  };

  const probarConexionReal = async (deviceId: number) => {
    try {
      const response = await api.post(`/asistencia/devices/${deviceId}/test-device-connection`);
      alert(`✅ ${response.data.message}`);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Error al probar conexión');
    }
  };

  const probarConexion = async (deviceId: number) => {
    try {
      const response = await api.post(`/asistencia/devices/${deviceId}/test-connection`);
      alert(`✅ ${response.data.message}`);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      const msg = err.response?.data?.detail || 'Error al probar conexión';
      alert(`❌ ${msg}`);
    }
  };

  const cargarUsuariosPendientes = async (deviceId: number) => {
    try {
      const res = await api.get(`/asistencia/devices/${deviceId}/pending-users?include_sent=true`);
      setUsuariosPendientes(res.data);
    } catch {
      setUsuariosPendientes([]);
    }
  };

  const forzarGetrequest = async (deviceId: number) => {
    if (!confirm('Forzar getrequest marcará los usuarios pendientes como enviados. El dispositivo físico NO recibirá los datos. ¿Continuar?')) return;
    try {
      const res = await api.post(`/asistencia/devices/${deviceId}/force-getrequest`);
      alert(`✅ Procesado.\n\nRespuesta:\n${res.data.response}`);
      cargarUsuariosPendientes(deviceId);
      loadData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(`❌ ${err.response?.data?.detail || 'Error'}`);
    }
  };

  const reintentarEnvio = async (deviceId: number, pendingId: number) => {
    try {
      await api.post(`/asistencia/devices/${deviceId}/pending-users/${pendingId}/retry`);
      cargarUsuariosPendientes(deviceId);
      loadData();
      alert('✅ Se reenviará en el próximo getrequest del dispositivo (30–60 s)');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(`❌ ${err.response?.data?.detail || 'Error'}`);
    }
  };

  const verVistaPreviaGetrequest = async (deviceId: number) => {
    try {
      const base = (api.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '') || window.location.origin;
      const res = await api.get(`/asistencia/devices/${deviceId}/preview-getrequest`, { params: { base_url: base } });
      const msg = res.data.pending_count > 0
        ? `Pendientes: ${res.data.pending_count}\n\nVista previa:\n${res.data.preview}\n\n---\nURL que debe llamar el dispositivo:\n${res.data.url_dispositivo}\n\n---\n¿Por qué no se envía?\n${res.data.porque_no_envia}`
        : `No hay usuarios pendientes. Agrega uno primero.`;
      alert(msg);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(`❌ ${err.response?.data?.detail || 'Error'}`);
    }
  };

  const iniciarRegistroHuella = async (deviceId: number, numeroEmpleado: string) => {
    try {
      await api.post(`/asistencia/devices/${deviceId}/start-enroll`, { numero_empleado: numeroEmpleado });
      alert(`✅ Registro de huella iniciado. El empleado debe acudir al dispositivo y colocar el dedo.`);
      cargarUsuariosPendientes(deviceId);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(`❌ ${err.response?.data?.detail || 'Error al iniciar registro'}`);
    }
  };

  const agregarUsuarioPendiente = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const deviceId = altaRemota.dispositivo_id;
    if (!deviceId) {
      alert('Selecciona un dispositivo');
      return;
    }
    const numero = altaRemota.numero_empleado.trim();
    const nombre = altaRemota.nombre.trim();
    if (!numero || !nombre) {
      alert('Número de empleado y nombre son requeridos');
      return;
    }
    try {
      await api.post(`/asistencia/devices/${deviceId}/enqueue-user`, { numero_empleado: numero, nombre });
      setAltaRemota({ ...altaRemota, numero_empleado: '', nombre: '' });
      cargarUsuariosPendientes(Number(deviceId));
      loadData();
      alert(`✅ Usuario agregado a la cola. El dispositivo lo recibirá en el próximo getrequest (30–60 s).`);
      setAltaRemota({ ...altaRemota, numero_empleado: '', nombre: '' });
      cargarUsuariosPendientes(Number(deviceId));
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(`❌ ${err.response?.data?.detail || 'Error al agregar'}`);
    }
  };

  const estadisticas = {
    totalChecadas: checadas.length,
    entradas: checadas.filter(c => c.tipo === 'entrada').length,
    salidas: checadas.filter(c => c.tipo === 'salida').length,
    dispositivosActivos: dispositivos.filter(d => d.activo).length,
  };

  if (loading && checadas.length === 0) {
    return <div style={{ padding: '20px' }}>Cargando...</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: 0 }}>Módulo de Asistencia</h1>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '0.875rem' }}>
            Los datos se actualizan automáticamente cada 30 segundos
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={refreshData}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Actualizando...' : '🔄 Actualizar'}
          </button>
          <button
            onClick={() => setShowDeviceForm(!showDeviceForm)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
          >
            {showDeviceForm ? 'Cancelar' : '+ Registrar Dispositivo'}
          </button>
        </div>
      </div>

      {/* Formulario de nuevo dispositivo */}
      {showDeviceForm && (
        <div style={{
          marginBottom: '30px',
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}>
          <h2>Registrar Nuevo Dispositivo</h2>
          <form onSubmit={crearDispositivo}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Nombre del Dispositivo *</label>
              <input
                type="text"
                name="nombre"
                required
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Ubicación</label>
              <input
                type="text"
                name="ubicacion"
                placeholder="Oficina Principal, Recepción, etc."
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>IP local (opcional)</label>
              <input
                type="text"
                name="ip_local"
                placeholder="Ej: 192.168.1.201 (para probar conexión real)"
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <small style={{ color: '#666' }}>Para probar si el dispositivo responde. El backend debe estar en la misma red.</small>
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Número de Serie (SN) - ZKTeco ADMS</label>
              <input
                type="text"
                name="serial_number"
                placeholder="Ej: DGD919000012345 (para push directo)"
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <small style={{ color: '#666' }}>Requerido si el dispositivo envía datos por ADMS. Ver en menú del dispositivo.</small>
            </div>
            <button
              type="submit"
              style={{
                padding: '10px 20px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
            >
              Registrar Dispositivo
            </button>
          </form>
        </div>
      )}

      {/* Alta remota - Enviar usuario al dispositivo */}
      <div style={{
        marginBottom: '30px',
        padding: '20px',
        backgroundColor: '#e8f5e9',
        borderRadius: '8px',
        border: '1px solid #4caf50',
      }}>
        <h2 style={{ margin: '0 0 15px 0', color: '#2e7d32' }}>Enviar usuario al dispositivo ZKTeco</h2>
        <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', fontSize: '0.9rem' }}>
          <strong>MB160:</strong> El ADMS (getrequest) no agrega usuarios en este modelo. Usa el <strong>agente local</strong> en un PC de la misma red:
          <code style={{ display: 'block', marginTop: '8px', padding: '8px', backgroundColor: '#fff', borderRadius: '4px' }}>
            cd agent-local && pip install pyzk && python main.py
          </code>
          Configura <code>config.yaml</code> con la IP del dispositivo (ej: 192.168.2.74) y la API Key del dispositivo.
        </div>
        <p style={{ margin: '0 0 10px 0', color: '#2e7d32', fontSize: '0.875rem' }}>
          Agrega el usuario aquí. Con el agente corriendo, lo recibirá en segundos.
        </p>
        <details style={{ marginBottom: '15px', padding: '10px', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: '6px', fontSize: '0.85rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 500 }}>Otras opciones</summary>
          <ul style={{ margin: '10px 0 0 0', paddingLeft: '20px' }}>
            <li><strong>Forzar getrequest</strong> – Solo marca como enviados (el dispositivo no recibe)</li>
            <li><strong>Revisar ADMS</strong> – COMM → Cloud Server. IP + Puerto 9081 (para checadas, no usuarios)</li>
          </ul>
        </details>
        <form onSubmit={agregarUsuarioPendiente}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px' }}>Dispositivo *</label>
              <select
                required
                value={altaRemota.dispositivo_id}
                onChange={(e) => {
                  const id = e.target.value;
                  setAltaRemota({ ...altaRemota, dispositivo_id: id });
                  if (id) cargarUsuariosPendientes(Number(id));
                }}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="">Seleccionar...</option>
                {dispositivos.filter(d => d.serial_number).map(d => (
                  <option key={d.id} value={d.id}>{d.nombre} (SN: {d.serial_number})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px' }}>Empleado (opcional)</label>
              <select
                value=""
                onChange={(e) => {
                  const empId = e.target.value;
                  if (empId) {
                    const emp = empleados.find(x => x.id === Number(empId));
                    if (emp) {
                      setAltaRemota({
                        ...altaRemota,
                        numero_empleado: emp.numero_empleado || '',
                        nombre: `${emp.nombre} ${emp.apellido_paterno || ''}`.trim()
                      });
                    }
                  }
                }}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="">-- Seleccionar empleado existente --</option>
                {empleados.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.numero_empleado} - {emp.nombre} {emp.apellido_paterno || ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px' }}>Número empleado *</label>
              <input
                type="text"
                value={altaRemota.numero_empleado}
                onChange={(e) => setAltaRemota({ ...altaRemota, numero_empleado: e.target.value })}
                placeholder="Ej: 101"
                required
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px' }}>Nombre *</label>
              <input
                type="text"
                value={altaRemota.nombre}
                onChange={(e) => setAltaRemota({ ...altaRemota, nombre: e.target.value })}
                placeholder="Ej: Juan Pérez"
                required
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="submit"
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ffc107',
                  color: '#000',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Agregar a cola
              </button>
            </div>
          </div>
        </form>
        {altaRemota.dispositivo_id && (
          <div style={{ marginTop: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <strong>Usuarios:</strong>
              <button
                type="button"
                onClick={() => forzarGetrequest(Number(altaRemota.dispositivo_id))}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                ⚡ Forzar getrequest
              </button>
              <button
                type="button"
                onClick={() => verVistaPreviaGetrequest(Number(altaRemota.dispositivo_id))}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                ¿Por qué no se envía? / Ver URL
              </button>
            </div>
            {usuariosPendientes.length === 0 ? (
              <p style={{ margin: '5px 0 0 0', color: '#666' }}>Ninguno. Agrega uno arriba.</p>
            ) : (
              <ul style={{ margin: '5px 0 0 0', paddingLeft: '20px', listStyle: 'none' }}>
                {usuariosPendientes.map(u => (
                  <li key={u.id} style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {u.numero_empleado} - {u.nombre}
                    {u.enviado ? (
                      <>
                        <span style={{ color: '#2e7d32', fontSize: '0.85rem' }}>✓ Enviado</span>
                        <button
                          type="button"
                          onClick={() => reintentarEnvio(Number(altaRemota.dispositivo_id), u.id)}
                          style={{ fontSize: '0.7rem', padding: '2px 6px', cursor: 'pointer', color: '#856404' }}
                          title="Si no aparece en el dispositivo, reintentar envío"
                        >
                          Reintentar
                        </button>
                      </>
                    ) : (
                      <span style={{ color: '#f57c00', fontSize: '0.85rem' }}>En cola</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Estadísticas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginBottom: '30px',
      }}>
        <div style={{
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}>
          <h3 style={{ margin: 0, color: '#666' }}>Total Checadas</h3>
          <p style={{ fontSize: '2rem', margin: '10px 0 0 0', fontWeight: 'bold' }}>{estadisticas.totalChecadas}</p>
        </div>
        <div style={{
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}>
          <h3 style={{ margin: 0, color: '#666' }}>Entradas</h3>
          <p style={{ fontSize: '2rem', margin: '10px 0 0 0', fontWeight: 'bold', color: '#28a745' }}>
            {estadisticas.entradas}
          </p>
        </div>
        <div style={{
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}>
          <h3 style={{ margin: 0, color: '#666' }}>Salidas</h3>
          <p style={{ fontSize: '2rem', margin: '10px 0 0 0', fontWeight: 'bold', color: '#dc3545' }}>
            {estadisticas.salidas}
          </p>
        </div>
        <div style={{
          padding: '20px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}>
          <h3 style={{ margin: 0, color: '#666' }}>Dispositivos Activos</h3>
          <p style={{ fontSize: '2rem', margin: '10px 0 0 0', fontWeight: 'bold', color: '#007bff' }}>
            {estadisticas.dispositivosActivos}
          </p>
        </div>
      </div>

      {/* Dispositivos */}
      <section style={{ marginBottom: '30px' }}>
        <h2>Dispositivos Registrados</h2>
        {dispositivos.length === 0 ? (
          <p style={{ color: '#666' }}>No hay dispositivos registrados. Registra uno para comenzar a recibir checadas.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {dispositivos.map((device) => (
              <div key={device.id} style={{
                padding: '20px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: 'white',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0 }}>{device.nombre}</h3>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                    backgroundColor: device.activo ? '#d4edda' : '#f8d7da',
                    color: device.activo ? '#155724' : '#721c24',
                  }}>
                    {device.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                {device.ubicacion && <p style={{ margin: '5px 0', color: '#666' }}>📍 {device.ubicacion}</p>}
                {device.serial_number && <p style={{ margin: '5px 0', color: '#666' }}>🔢 SN: {device.serial_number}</p>}
                <p style={{ margin: '5px 0', color: '#666', fontSize: '0.9rem' }}>
                  IP local:{' '}
                  {device.ip_local ? (
                    <span>{device.ip_local} <button type="button" onClick={() => editarIpDispositivo(device.id, device.ip_local || '')} style={{ fontSize: '0.75rem', padding: '2px 6px', cursor: 'pointer' }}>Editar</button></span>
                  ) : (
                    <button type="button" onClick={() => editarIpDispositivo(device.id, '')} style={{ fontSize: '0.8rem', padding: '2px 8px', cursor: 'pointer', color: '#007bff' }}>+ Agregar IP</button>
                  )}
                </p>
                {device.serial_number && (
                  <p style={{ margin: '5px 0', fontSize: '0.85rem', color: device.ultima_ip_conexion ? '#2e7d32' : '#856404' }}>
                    {device.ultima_ip_conexion && device.ultima_llamada_getrequest
                      ? (() => {
                          const s = device.ultima_llamada_getrequest || '';
                          const iso = s && !s.endsWith('Z') && !s.includes('+') ? s + 'Z' : s;
                          return `✅ Conexión real: ${new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} desde ${device.ultima_ip_conexion}`;
                        })()
                      : '⚠️ Sin conexión real registrada (el dispositivo debe llamar a getrequest/cdata)'}
                  </p>
                )}
                <p style={{ margin: '5px 0', fontSize: '0.8rem', color: '#666' }}>
                  <strong>ADMS:</strong> Server Address = IP (ej: 192.168.2.55), Puerto = 9081
                </p>
                <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => probarConexionReal(device.id)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.875rem',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    ✓ Probar conexión real
                  </button>
                  <button
                    onClick={() => probarConexion(device.id)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.875rem',
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    🔌 Probar config
                  </button>
                  <button
                    onClick={() => eliminarDispositivo(device.id, device.nombre)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.875rem',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ Eliminar
                  </button>
                </div>
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                  <small style={{ color: '#666', display: 'block', marginBottom: '5px' }}>API Key:</small>
                  <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{device.api_key}</code>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Filtros */}
      <section style={{ marginBottom: '30px', padding: '20px', backgroundColor: 'white', borderRadius: '8px' }}>
        <h2>Filtros de Búsqueda</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Empleado</label>
            <select
              value={filtros.empleado_id}
              onChange={(e) => setFiltros({ ...filtros, empleado_id: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            >
              <option value="">Todos</option>
              {empleados.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre} {emp.apellido_paterno || ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Dispositivo</label>
            <select
              value={filtros.dispositivo_id}
              onChange={(e) => setFiltros({ ...filtros, dispositivo_id: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            >
              <option value="">Todos</option>
              {dispositivos.map(dev => (
                <option key={dev.id} value={dev.id}>{dev.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Fecha Inicio</label>
            <input
              type="date"
              value={filtros.fecha_inicio}
              onChange={(e) => setFiltros({ ...filtros, fecha_inicio: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px' }}>Fecha Fin</label>
            <input
              type="date"
              value={filtros.fecha_fin}
              onChange={(e) => setFiltros({ ...filtros, fecha_fin: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>
        </div>
        <button
          onClick={handleFiltros}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          Aplicar Filtros
        </button>
      </section>

      {/* Tabla de Checadas */}
      <section>
        <h2>Registro de Checadas</h2>
        {checadas.length === 0 ? (
          <p style={{ color: '#666' }}>No hay checadas registradas aún.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '8px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Empleado</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Dispositivo</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Fecha/Hora</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Tipo</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {checadas.map((checada) => (
                  <tr key={checada.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '12px' }}>{getEmpleadoNombre(checada.empleado_id)}</td>
                    <td style={{ padding: '12px' }}>{getDispositivoNombre(checada.dispositivo_id)}</td>
                    <td style={{ padding: '12px' }}>
                      {new Date(checada.timestamp).toLocaleString('es-MX', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        backgroundColor: checada.tipo === 'entrada' ? '#d4edda' : '#f8d7da',
                        color: checada.tipo === 'entrada' ? '#155724' : '#721c24',
                      }}>
                        {checada.tipo === 'entrada' ? '✓ Entrada' : '✗ Salida'}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {checada.sincronizado ? (
                        <span style={{ color: '#28a745' }}>✓ Sincronizado</span>
                      ) : (
                        <span style={{ color: '#dc3545' }}>✗ Pendiente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
