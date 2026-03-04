import { useState } from 'react';
import { PersonalPage } from '../personal/PersonalPage';
import { AsistenciaPage } from '../asistencia/AsistenciaPage';
import { VacacionesPage } from '../vacaciones/VacacionesPage';

type Tab = 'personal' | 'asistencia' | 'vacaciones';

const tabs: { key: Tab; label: string }[] = [
  { key: 'personal', label: 'Personal' },
  { key: 'asistencia', label: 'Asistencia' },
  { key: 'vacaciones', label: 'Vacaciones' },
];

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '12px 32px',
  cursor: 'pointer',
  border: 'none',
  borderBottom: active ? '3px solid #007bff' : '3px solid transparent',
  backgroundColor: 'transparent',
  fontWeight: active ? 700 : 400,
  fontSize: '1rem',
  color: active ? '#007bff' : '#888',
  transition: 'color 0.15s, border-color 0.15s',
});

export const RHPage = () => {
  const [activeTab, setActiveTab] = useState<Tab>('personal');

  return (
    <div>
      <div style={{
        display: 'flex',
        borderBottom: '2px solid #e5e7eb',
        backgroundColor: 'white',
        marginBottom: '0',
        paddingLeft: '20px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        {tabs.map(t => (
          <button key={t.key} style={tabStyle(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'personal' && <PersonalPage />}
      {activeTab === 'asistencia' && <AsistenciaPage />}
      {activeTab === 'vacaciones' && <VacacionesPage />}
    </div>
  );
};
