import { useState, useEffect } from 'react';
import api from '../../services/api';
import { SolicitudVacaciones } from '../../types';

export const VacacionesPage = () => {
  const [solicitudes, setSolicitudes] = useState<SolicitudVacaciones[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSolicitudes();
  }, []);

  const loadSolicitudes = async () => {
    try {
      const response = await api.get('/vacaciones/solicitudes');
      setSolicitudes(response.data);
    } catch (error) {
      console.error('Error al cargar solicitudes:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Cargando solicitudes...</div>;
  }

  return (
    <div>
      <h1>Gestión de Vacaciones</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
        <thead>
          <tr style={{ backgroundColor: '#e5e7eb' }}>
            <th style={{ padding: '10px', textAlign: 'left' }}>Empleado ID</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Fecha Inicio</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Fecha Fin</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Días</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {solicitudes.map((solicitud) => (
            <tr key={solicitud.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '10px' }}>{solicitud.empleado_id}</td>
              <td style={{ padding: '10px' }}>{new Date(solicitud.fecha_inicio).toLocaleDateString()}</td>
              <td style={{ padding: '10px' }}>{new Date(solicitud.fecha_fin).toLocaleDateString()}</td>
              <td style={{ padding: '10px' }}>{solicitud.dias_solicitados}</td>
              <td style={{ padding: '10px' }}>{solicitud.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
