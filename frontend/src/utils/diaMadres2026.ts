/** Ventana del aviso de Día de las Madres (calendario México).
 *  Visible del 7 al 10 de mayo de 2026 (jueves a domingo, el 10 es domingo).
 *  Ajusta estas fechas si vuelves a usar el aviso otro año.
 */
export const MOSTRAR_DIA_MADRES_2026 = true;
export const DIA_MADRES_DESDE_MX = '2026-05-07';
export const DIA_MADRES_HASTA_MX = '2026-05-10';

export function mexicoYmd(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function isDiaMadres2026VentanaActiva(forzar = false): boolean {
  if (forzar) return true;
  if (!MOSTRAR_DIA_MADRES_2026) return false;
  const ahora = mexicoYmd();
  return ahora >= DIA_MADRES_DESDE_MX && ahora <= DIA_MADRES_HASTA_MX;
}
