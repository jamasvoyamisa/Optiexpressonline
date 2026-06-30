import type { CSSProperties } from 'react';

/** Estilos compartidos para vistas móviles del módulo RH (iPhone). */

export const rhMobileHero: CSSProperties = {
  background: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 45%, #0ea5e9 100%)',
  padding: '18px 16px 26px',
  marginBottom: -12,
};

export const rhMobileContentShell: CSSProperties = {
  padding: '14px 12px 32px',
  backgroundColor: 'white',
  borderRadius: '20px 20px 0 0',
  position: 'relative',
  zIndex: 1,
  minHeight: 200,
};

export const rhMobileTabScroll: CSSProperties = {
  display: 'flex',
  gap: 8,
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'none',
  paddingBottom: 2,
  marginBottom: 12,
};

export const rhMobileTabPill = (active: boolean): CSSProperties => ({
  flexShrink: 0,
  padding: '8px 14px',
  borderRadius: 999,
  border: 'none',
  fontSize: '0.82rem',
  fontWeight: active ? 700 : 500,
  cursor: 'pointer',
  backgroundColor: active ? '#0ea5e9' : '#f1f5f9',
  color: active ? '#fff' : '#475569',
  whiteSpace: 'nowrap',
});

export const rhMobileCard: CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  padding: '14px 14px 12px',
  boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
};

export const rhMobileCardTitle: CSSProperties = {
  fontWeight: 700,
  fontSize: '0.92rem',
  color: '#0f172a',
  lineHeight: 1.3,
};

export const rhMobileCardSub: CSSProperties = {
  fontSize: '0.78rem',
  color: '#64748b',
  marginTop: 2,
};

export const rhMobileCardRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  fontSize: '0.8rem',
  color: '#475569',
  marginTop: 8,
};

export const rhMobileFilterStack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginBottom: 14,
};

export const rhMobileInput: CSSProperties = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  border: '1px solid #d1d5db',
  borderRadius: 10,
  fontSize: '16px',
  boxSizing: 'border-box',
  backgroundColor: '#fff',
};

export const rhMobileSelect: CSSProperties = {
  ...rhMobileInput,
  appearance: 'none' as const,
};

export const rhMobileBtnPrimary: CSSProperties = {
  width: '100%',
  minHeight: 44,
  padding: '10px 16px',
  border: 'none',
  borderRadius: 10,
  backgroundColor: '#059669',
  color: '#fff',
  fontWeight: 700,
  fontSize: '0.9rem',
  cursor: 'pointer',
};

export const rhMobileBtnSecondary: CSSProperties = {
  minHeight: 36,
  padding: '8px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  backgroundColor: '#fff',
  color: '#334155',
  fontWeight: 600,
  fontSize: '0.82rem',
  cursor: 'pointer',
};

export const rhMobileBadge = (bg: string, color: string): CSSProperties => ({
  display: 'inline-block',
  padding: '3px 9px',
  borderRadius: 6,
  fontSize: '0.72rem',
  fontWeight: 700,
  backgroundColor: bg,
  color,
  whiteSpace: 'nowrap',
});

export const rhMobileSheetOverlay = (isMobile: boolean): CSSProperties => ({
  position: 'fixed',
  inset: 0,
  zIndex: 120,
  backgroundColor: 'rgba(2,6,23,0.55)',
  display: 'flex',
  alignItems: isMobile ? 'flex-end' : 'center',
  justifyContent: 'center',
  padding: isMobile ? 0 : 16,
});

export const rhMobileSheetContainer = (isMobile: boolean): CSSProperties => (
  isMobile
    ? {
        width: '100%',
        maxHeight: '92dvh',
        overflowY: 'auto',
        backgroundColor: '#fff',
        borderRadius: '20px 20px 0 0',
        padding: '8px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
      }
    : {
        width: '100%',
        maxWidth: 520,
        maxHeight: '90vh',
        overflowY: 'auto',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: '20px 22px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
      }
);

export const rhMobileSheetHandle: CSSProperties = {
  width: 40,
  height: 4,
  backgroundColor: '#d1d5db',
  borderRadius: 2,
  margin: '0 auto 14px',
};
