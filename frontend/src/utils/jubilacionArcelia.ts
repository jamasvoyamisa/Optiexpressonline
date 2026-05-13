/** Misma ventana que la landing (calendario México). Ajustar fechas si repites el aviso. */
export const MOSTRAR_JUBILACION_ARCELIA = true;
export const JUBILACION_ARCELIA_DESDE_MX = '2026-04-29';
export const JUBILACION_ARCELIA_HASTA_MX = '2026-04-30';

export function mexicoYmd(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function isJubilacionArceliaVentanaActiva(forzar = false): boolean {
  if (forzar) return true;
  if (!MOSTRAR_JUBILACION_ARCELIA) return false;
  const ahora = mexicoYmd();
  return ahora >= JUBILACION_ARCELIA_DESDE_MX && ahora <= JUBILACION_ARCELIA_HASTA_MX;
}
