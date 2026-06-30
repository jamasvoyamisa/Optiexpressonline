/** Colores suaves de puntualidad (%), compartidos en portal y RH. */

export interface EstiloPuntualidad {
  /** Color del texto / badge */
  text: string;
  /** Fondo del badge */
  bg: string;
  /** Barra de progreso */
  bar: string;
  /** Etiqueta opcional del rango */
  tier: string;
}

/**
 * Escala gradual (no alarmista):
 * ≥95 excelente · ≥85 muy bien · ≥75 bien · ≥65 regular · ≥50 bajo · &lt;50 por mejorar
 */
export function estiloPuntualidad(pct: number): EstiloPuntualidad {
  if (pct >= 95) {
    return { text: '#047857', bg: '#ecfdf5', bar: '#6ee7b7', tier: 'Excelente' };
  }
  if (pct >= 85) {
    return { text: '#0f766e', bg: '#f0fdfa', bar: '#5eead4', tier: 'Muy bien' };
  }
  if (pct >= 75) {
    return { text: '#0369a1', bg: '#f0f9ff', bar: '#7dd3fc', tier: 'Bien' };
  }
  if (pct >= 65) {
    return { text: '#a16207', bg: '#fefce8', bar: '#fde68a', tier: 'Regular' };
  }
  if (pct >= 50) {
    return { text: '#b45309', bg: '#fffbeb', bar: '#fcd34d', tier: 'Bajo' };
  }
  return { text: '#9d174d', bg: '#fdf2f8', bar: '#f9a8d4', tier: 'Por mejorar' };
}
