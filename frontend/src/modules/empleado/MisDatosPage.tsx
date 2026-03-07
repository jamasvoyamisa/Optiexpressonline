import { useState, useEffect } from 'react';
import api from '../../services/api';
import type { EmpleadoResponse } from '../../types/api';

const cardBase: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '12px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  padding: '20px',
  transition: 'box-shadow 0.2s ease, transform 0.2s ease',
};

export const MisDatosPage = () => {
  const [empleado, setEmpleado] = useState<EmpleadoResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<EmpleadoResponse>('/personal/me')
      .then((res) => setEmpleado(res.data))
      .catch(() => setEmpleado(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '24px' }}>Cargando...</div>;
  if (!empleado) return <div style={{ padding: '24px' }}>No se pudieron cargar tus datos.</div>;

  const nombreCompleto = `${empleado.nombre} ${empleado.apellido_paterno || ''} ${empleado.apellido_materno || ''}`.trim();

  const Card = ({ title, rows }: { title: string; rows: { label: string; value: string | number | null | undefined }[] }) => {
    const [hover, setHover] = useState(false);
    return (
      <div
        style={{
          ...cardBase,
          boxShadow: hover ? '0 6px 16px rgba(0,0,0,0.08)' : cardBase.boxShadow,
          transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <h2 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#374151', fontWeight: 700 }}>{title}</h2>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontWeight: 600, width: '180px', flexShrink: 0, color: '#555' }}>{r.label}</span>
            <span style={{ color: '#1f2937' }}>{r.value ?? '-'}</span>
          </div>
        ))}
      </div>
    );
  };

  const cards: { title: string; rows: { label: string; value: string | number | null | undefined }[] }[] = [
    {
      title: 'Datos personales',
      rows: [
        { label: 'Número de empleado', value: empleado.numero_empleado },
        { label: 'Nombre', value: nombreCompleto },
        { label: 'Email', value: empleado.email ?? undefined },
        { label: 'Teléfono', value: empleado.telefono ?? undefined },
        { label: 'Usuario', value: empleado.username ?? undefined },
        { label: 'CURP', value: empleado.curp ?? undefined },
        { label: 'RFC', value: empleado.rfc ?? undefined },
        { label: 'NSS', value: empleado.nss ?? undefined },
        { label: 'Fecha de nacimiento', value: empleado.fecha_nacimiento ? new Date(empleado.fecha_nacimiento).toLocaleDateString('es-MX') : undefined },
      ],
    },
    {
      title: 'Datos laborales',
      rows: [
        { label: 'Empresa', value: empleado.empresa?.nombre },
        { label: 'Departamento', value: empleado.departamento?.nombre },
        { label: 'Puesto', value: empleado.puesto?.nombre },
        { label: 'Estado', value: empleado.estado },
        { label: 'Fecha de ingreso', value: empleado.fecha_ingreso ? new Date(empleado.fecha_ingreso).toLocaleDateString('es-MX') : undefined },
      ],
    },
    {
      title: 'Contacto de emergencia',
      rows: [
        { label: 'Nombre', value: empleado.contacto_emergencia ?? undefined },
        { label: 'Teléfono', value: empleado.telefono_emergencia ?? undefined },
      ],
    },
  ];

  if (empleado.direccion || empleado.colonia || empleado.cp || empleado.ciudad) {
    cards.push({
      title: 'Domicilio',
      rows: [
        { label: 'Dirección', value: empleado.direccion ?? undefined },
        { label: 'Colonia', value: empleado.colonia ?? undefined },
        { label: 'CP', value: empleado.cp ?? undefined },
        { label: 'Ciudad', value: empleado.ciudad ?? undefined },
      ],
    });
  }

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ marginBottom: '24px' }}>Mis datos</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
        {cards.map((c) => (
          <Card key={c.title} title={c.title} rows={c.rows} />
        ))}
      </div>
    </div>
  );
};
