/**
 * Parsea un timestamp de checada para mostrar en hora México.
 * Si el string no tiene zona horaria (Z o +/-HH:MM), se asume UTC.
 */
export function parseTimestampForMexico(ts: string | Date): Date {
  if (ts instanceof Date) return ts;
  const s = String(ts);
  const hasTz = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s);
  return new Date(hasTz ? s : s + 'Z');
}

/** Fecha YYYY-MM-DD en zona horaria México (para agrupar checadas por día correcto). */
export function toMexicoDateString(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

/** Muestra YYYY/MM/DD a partir de ISO o datetime (solo presentación). */
export function formatFechaSlash(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, '/');
  return s;
}
