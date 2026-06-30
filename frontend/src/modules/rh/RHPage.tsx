import { useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { PersonalPage } from '../personal/PersonalPage';
import { VacacionesPage } from '../vacaciones/VacacionesPage';
import { IncapacidadesPage } from './IncapacidadesPage';
import { PrestamosPage } from './PrestamosPage';
import { ReportesAsistenciaPage } from './ReportesAsistenciaPage';
import { SolicitudesVacacionesAprobarPage } from '../vacaciones/SolicitudesVacacionesAprobarPage';
import {
  rhMobileContentShell,
  rhMobileHero,
  rhMobileTabPill,
  rhMobileTabScroll,
} from './rhMobileStyles';

type Tab = 'personal' | 'vacaciones' | 'incapacidades' | 'prestamos' | 'reportes' | 'confirmar';

const tabs: { key: Tab; label: string; short: string }[] = [
  { key: 'personal', label: 'Empleados', short: 'Empleados' },
  { key: 'vacaciones', label: 'Solicitudes de Vacaciones', short: 'Vacaciones' },
  { key: 'confirmar', label: 'Solicitudes a confirmar', short: 'Confirmar' },
  { key: 'incapacidades', label: 'Incapacidades', short: 'Incapacidades' },
  { key: 'prestamos', label: 'Préstamos', short: 'Préstamos' },
  { key: 'reportes', label: 'Reportes de Asistencia', short: 'Reportes' },
];

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '12px 32px',
  cursor: 'pointer',
  border: 'none',
  borderBottom: active ? '3px solid #0ea5e9' : '3px solid transparent',
  backgroundColor: 'transparent',
  fontWeight: active ? 700 : 400,
  fontSize: '1rem',
  color: active ? '#0369a1' : '#888',
  transition: 'color 0.15s, border-color 0.15s',
  whiteSpace: 'nowrap',
});

export const RHPage = () => {
  const [activeTab, setActiveTab] = useState<Tab>('personal');
  const isMobile = useIsMobile();
  const activeLabel = tabs.find(t => t.key === activeTab)?.label ?? 'Recursos Humanos';

  if (isMobile) {
    return (
      <div style={{ padding: '0 0 24px', minHeight: '100%' }}>
        <div style={rhMobileHero}>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem', marginBottom: 4 }}>
            Recursos Humanos
          </div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.25rem', lineHeight: 1.2 }}>
            {activeLabel}
          </div>
        </div>

        <div style={rhMobileContentShell}>
          <div style={rhMobileTabScroll}>
            {tabs.map(t => (
              <button
                key={t.key}
                type="button"
                style={rhMobileTabPill(activeTab === t.key)}
                onClick={() => setActiveTab(t.key)}
              >
                {t.short}
              </button>
            ))}
          </div>

          {activeTab === 'personal' && <PersonalPage hideImport embeddedRh />}
          {activeTab === 'vacaciones' && <VacacionesPage embeddedRh />}
          {activeTab === 'confirmar' && <SolicitudesVacacionesAprobarPage embeddedRh />}
          {activeTab === 'incapacidades' && <IncapacidadesPage embeddedRh />}
          {activeTab === 'prestamos' && <PrestamosPage embeddedRh />}
          {activeTab === 'reportes' && <ReportesAsistenciaPage embeddedRh />}
        </div>
      </div>
    );
  }

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
        overflowX: 'auto',
      }}>
        {tabs.map(t => (
          <button key={t.key} style={tabStyle(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'personal' && <PersonalPage hideImport />}
      {activeTab === 'vacaciones' && <VacacionesPage />}
      {activeTab === 'confirmar' && <SolicitudesVacacionesAprobarPage />}
      {activeTab === 'incapacidades' && <IncapacidadesPage />}
      {activeTab === 'prestamos' && <PrestamosPage />}
      {activeTab === 'reportes' && <ReportesAsistenciaPage />}
    </div>
  );
};
