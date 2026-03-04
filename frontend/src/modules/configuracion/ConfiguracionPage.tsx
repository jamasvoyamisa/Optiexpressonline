import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Dispositivo, DispositivoCreate } from '../../types';

export const ConfiguracionPage = () => {
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<number, boolean>>({});

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const res = await api.get('/asistencia/devices');
      setDispositivos(res.data);
    } catch (error) {
      console.error('Error al cargar dispositivos:', error);
    } finally {
      setLoading(false);
    }
  };

  const crearDispositivo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload: DispositivoCreate = {
      nombre: (formData.get('nombre') as string)?.trim() || '',
      ubicacion: (formData.get('ubicacion') as string)?.trim() || undefined,
      serial_number: (formData.get('serial_number') as string)?.trim() || undefined,
    };
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

  if (loading) return <div style={{ padding: '20px' }}>Cargando...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0 }}>Configuracion</h1>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: '0.9rem' }}>Administracion de dispositivos biometricos</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowDeviceForm(!showDeviceForm)}
            style={{ padding: '8px 18px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
          >
            {showDeviceForm ? 'Cancelar' : '+ Registrar Dispositivo'}
          </button>
          <button
            onClick={() => { setLoading(true); loadData(); }}
            disabled={loading}
            style={{ padding: '8px 18px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '5px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Formulario nuevo dispositivo */}
      {showDeviceForm && (
        <div style={{ marginBottom: '24px', padding: '20px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 16px 0' }}>Nuevo Dispositivo</h3>
          <form onSubmit={crearDispositivo}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>Nombre *</label>
                <input type="text" name="nombre" required placeholder="Ej: Checador Entrada" style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>Ubicacion</label>
                <input type="text" name="ubicacion" placeholder="Oficina, Recepcion..." style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>Numero de Serie (SN)</label>
                <input type="text" name="serial_number" placeholder="AEVL232161707" style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }} />
              </div>
            </div>
            <button type="submit" style={{ padding: '8px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
              Registrar
            </button>
          </form>
          <p style={{ margin: '12px 0 0', color: '#888', fontSize: '0.8rem' }}>
            Al registrar se generara una API Key. Usala en el config.yaml del agente local.
          </p>
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
              {device.serial_number && <p style={{ margin: '4px 0', color: '#666', fontSize: '0.9rem' }}>SN: <code style={{ fontSize: '0.85rem' }}>{device.serial_number}</code></p>}
              <p style={{ margin: '6px 0', fontSize: '0.85rem' }}>
                <span style={{ color: '#666' }}>Ultima sincronizacion: </span>
                {device.ultima_sync_agente ? (
                  <span style={{ color: '#2e7d32', fontWeight: 500 }}>
                    {new Date(device.ultima_sync_agente).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                ) : (
                  <span style={{ color: '#999' }}>Sin conexion</span>
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
                      style={{ fontSize: '0.7rem', padding: '2px 8px', cursor: 'pointer', color: '#6366f1', background: 'none', border: '1px solid #6366f1', borderRadius: '3px' }}
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
                <button onClick={() => probarComoAgente(device.id)} style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
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
    </div>
  );
};
