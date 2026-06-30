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

/** Número de quincena en el ejercicio (1–24). Q1 = 1–15 ene, Q2 = 16–31 ene, … Q24 = 16–31 dic. */
export function numeroQuincenaAnual(_year: number, month1: number, numMes: 1 | 2): number {
  return (month1 - 1) * 2 + numMes;
}

export function numeroQuincenaAnualFromFin(fechaFin: string): number {
  const [y, m, d] = fechaFin.slice(0, 10).split('-').map((x) => parseInt(x, 10));
  const numMes: 1 | 2 = d <= 15 ? 1 : 2;
  return numeroQuincenaAnual(y, m, numMes);
}

export function formatNumeroQuincenaAnual(numero: number): string {
  return `Quincena ${numero}`;
}

/** Rango YYYY-MM-DD de la quincena `numero` (1–24) del `ejercicio`. */
export function rangoQuincenaAnual(ejercicio: number, numero: number): { inicio: string; fin: string } {
  if (numero < 1 || numero > 24) throw new Error('Quincena fuera de rango');
  const mes = Math.floor((numero - 1) / 2) + 1;
  const numMes: 1 | 2 = numero % 2 === 1 ? 1 : 2;
  const monthIndex = mes - 1;
  const { inicio, fin } = getQuincenaRango(ejercicio, monthIndex, numMes);
  return { inicio: inicio.slice(0, 10), fin: fin.slice(0, 10) };
}

export interface QuincenaEjercicioItem {
  numero: number;
  ejercicio: number;
  mes: number;
  quincena_mes: number;
  fecha_inicio: string;
  fecha_fin: string;
  etiqueta: string;
}

export function quincenaEsPasada(fechaFin: string): boolean {
  const hoy = toMexicoDateString(new Date());
  return fechaFin.slice(0, 10) < hoy;
}

export function quincenasDisponiblesEjercicio(ejercicio: number): QuincenaEjercicioItem[] {
  return listarQuincenasEjercicio(ejercicio).filter((q) => !quincenaEsPasada(q.fecha_fin));
}

export function listarQuincenasEjercicio(ejercicio: number): QuincenaEjercicioItem[] {
  const items: QuincenaEjercicioItem[] = [];
  for (let n = 1; n <= 24; n++) {
    const mes = Math.floor((n - 1) / 2) + 1;
    const quincena_mes: 1 | 2 = n % 2 === 1 ? 1 : 2;
    const { inicio, fin } = rangoQuincenaAnual(ejercicio, n);
    items.push({
      numero: n,
      ejercicio,
      mes,
      quincena_mes,
      fecha_inicio: inicio,
      fecha_fin: fin,
      etiqueta: `${formatNumeroQuincenaAnual(n)} — ${formatQuincenaLabel(ejercicio, mes - 1, quincena_mes)}`,
    });
  }
  return items;
}

/** Etiqueta corta para tablas: Quincena 8, M03/12, etc. */
export function etiquetaQuincenaPeriodo(periodo: {
  periodicidad?: string | null;
  numero_periodo?: number | null;
  periodo_etiqueta?: string | null;
  fecha_fin?: string;
}): string {
  if (periodo.periodo_etiqueta) {
    const m = periodo.periodo_etiqueta.match(/^(Quincena \d+|M\d{2}\/12|P\d{2}\/\d+)/);
    if (m) return m[0];
  }
  if (periodo.numero_periodo != null && (periodo.periodicidad ?? '04') === '04') {
    return formatNumeroQuincenaAnual(periodo.numero_periodo);
  }
  if (periodo.fecha_fin && (periodo.periodicidad ?? '04') === '04') {
    return formatNumeroQuincenaAnual(numeroQuincenaAnualFromFin(periodo.fecha_fin));
  }
  if (periodo.numero_periodo != null) {
    return `#${periodo.numero_periodo}`;
  }
  return '—';
}
