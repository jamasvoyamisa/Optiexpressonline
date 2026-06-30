/** Cuadrícula 4 columnas: entrada, salida comer, regreso, salida. */

export interface ChecadaMiniGridProps {
  entrada?: string;
  salida_comer?: string;
  regreso_comer?: string;
  salida?: string;
}

const SLOTS = [
  { key: 'entrada', label: '↓ Entrada', color: '#155724', bg: '#e8f5e9' },
  { key: 'salida_comer', label: '🍽 Sal.', color: '#856404', bg: '#fff8e1' },
  { key: 'regreso_comer', label: '🔙 Reg.', color: '#004085', bg: '#e3f2fd' },
  { key: 'salida', label: '↑ Salida', color: '#721c24', bg: '#fce4ec' },
] as const;

export function ChecadaMiniGrid({ entrada, salida_comer, regreso_comer, salida }: ChecadaMiniGridProps) {
  const vals: Record<string, string | undefined> = { entrada, salida_comer, regreso_comer, salida };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5 }}>
      {SLOTS.map(({ key, label, color, bg }) => {
        const val = vals[key];
        return (
          <div key={key} style={{ backgroundColor: bg, borderRadius: 8, padding: '5px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.58rem', color: '#888', marginBottom: 2 }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: val ? color : '#d1d5db' }}>{val || '--:--'}</div>
          </div>
        );
      })}
    </div>
  );
}
