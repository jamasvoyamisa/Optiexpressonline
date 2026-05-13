/**
 * Quincenas de calendario (1–15 y 16–fin de mes), etiquetas en español México.
 * Usar con fechas YYYY-MM-DD ya normalizadas a día calendario México (p. ej. toMexicoDateString).
 */

import { toMexicoDateString } from './date';

export function formatQuincenaLabel(year: number, month: number, num: 1 | 2): string {
  const mesNombre = new Date(year, month, 1).toLocaleDateString('es-MX', { month: 'long' });
  const mesCorto = new Date(year, month, 1).toLocaleDateString('es-MX', { month: 'short' });
  const mesCapitalized = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);
  if (num === 1) return `1° quincena ${mesCapitalized} ${year} (1 - 15 ${mesCorto})`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return `2° quincena ${mesCapitalized} ${year} (16 - ${lastDay} ${mesCorto})`;
}

/** Quincena según hoy en calendario México (America/Mexico_City). */
export function getQuincenaActualMexico(): { year: number; month: number; num: 1 | 2 } {
  const s = toMexicoDateString(new Date());
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  const num: 1 | 2 = d >= 16 ? 2 : 1;
  return { year: y, month: m - 1, num };
}

/** Rango ISO para API (fecha_inicio / fecha_fin); `month` es 0–11. */
export function getQuincenaRango(year: number, month: number, num: 1 | 2): { inicio: string; fin: string } {
  const m = String(month + 1).padStart(2, '0');
  if (num === 1) {
    return { inicio: `${year}-${m}-01T00:00:00`, fin: `${year}-${m}-15T23:59:59` };
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    inicio: `${year}-${m}-16T00:00:00`,
    fin: `${year}-${m}-${String(lastDay).padStart(2, '0')}T23:59:59`,
  };
}

export function quincenaAnterior(year: number, month: number, num: 1 | 2): { year: number; month: number; num: 1 | 2 } {
  if (num === 2) return { year, month, num: 1 };
  const pm = month - 1;
  if (pm < 0) return { year: year - 1, month: 11, num: 2 };
  return { year, month: pm, num: 2 };
}

export function quincenaSiguiente(year: number, month: number, num: 1 | 2): { year: number; month: number; num: 1 | 2 } {
  if (num === 1) return { year, month, num: 2 };
  const nm = month + 1;
  if (nm > 11) return { year: year + 1, month: 0, num: 1 };
  return { year, month: nm, num: 1 };
}

/** Día YYYY-MM-DD (México) → bloque de quincena para agrupar vistas. */
export function quincenaMetaForMexicoDay(fechaSort: string): {
  blockKey: string;
  label: string;
  year: number;
  monthIndex: number;
  num: 1 | 2;
} {
  const parts = fechaSort.split('-').map((x) => parseInt(x, 10));
  const year = parts[0];
  const month1 = parts[1];
  const day = parts[2];
  const monthIndex = month1 - 1;
  const num: 1 | 2 = day <= 15 ? 1 : 2;
  const label = formatQuincenaLabel(year, monthIndex, num);
  const blockKey = `${year}-${String(month1).padStart(2, '0')}-Q${num}`;
  return { blockKey, label, year, monthIndex, num };
}
