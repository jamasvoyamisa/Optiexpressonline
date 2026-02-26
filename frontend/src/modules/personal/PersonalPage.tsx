import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Empleado } from '../../types';

export const PersonalPage = () => {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEmpleados();
  }, []);

  const loadEmpleados = async () => {
    try {
      const response = await api.get('/personal/empleados');
      setEmpleados(response.data);
    } catch (error) {
      console.error('Error al cargar empleados:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Cargando empleados...</div>;
  }

  return (
    <div>
      <h1>Gestión de Personal</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
        <thead>
          <tr style={{ backgroundColor: '#e5e7eb' }}>
            <th style={{ padding: '10px', textAlign: 'left' }}>Número</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Nombre</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Email</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {empleados.map((empleado) => (
            <tr key={empleado.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '10px' }}>{empleado.numero_empleado}</td>
              <td style={{ padding: '10px' }}>{empleado.nombre}</td>
              <td style={{ padding: '10px' }}>{empleado.email || '-'}</td>
              <td style={{ padding: '10px' }}>{empleado.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
