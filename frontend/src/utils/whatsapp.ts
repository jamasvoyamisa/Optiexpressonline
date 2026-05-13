/**
 * Enlaces wa.me para abrir WhatsApp (app o Web) con mensaje prellenado.
 * El envío lo confirma el usuario en WhatsApp.
 */

/** Dígitos internacionales sin + (ej. 5215512345678) para https://wa.me/… */
export function normalizarTelefonoWhatsAppMexico(telefono: string | null | undefined): string | null {
  if (!telefono || !String(telefono).trim()) return null;
  const d = String(telefono).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('521') && d.length >= 13) return d.length > 13 ? d.slice(0, 13) : d;
  if (d.startsWith('52') && d.length === 12) return `521${d.slice(2)}`;
  if (d.length === 10) return `521${d}`;
  if (d.length === 11 && d.startsWith('1')) return `521${d.slice(1)}`;
  return d.length >= 12 ? d : null;
}

export function construirUrlWhatsApp(numeroInternacionalSinMas: string, texto: string): string {
  const t = texto.length > 3500 ? `${texto.slice(0, 3497)}...` : texto;
  return `https://wa.me/${numeroInternacionalSinMas}?text=${encodeURIComponent(t)}`;
}

export function mensajeTicketSoporteWhatsapp(opts: {
  nombreSolicitante: string;
  folio: string;
  titulo: string;
  estadoLabel: string;
  notaResolucion?: string | null;
}): string {
  const nombre = (opts.nombreSolicitante || 'Usuario').trim();
  const tit = (opts.titulo || '—').trim();
  const lines = [
    `Hola ${nombre},`,
    '',
    'Te escribimos desde Soporte TI (Optiexpress) por tu ticket:',
    '',
    `Folio: ${opts.folio}`,
    `Estado: ${opts.estadoLabel}`,
    `Asunto: ${tit}`,
  ];
  if ((opts.notaResolucion || '').trim()) {
    lines.push('', 'Nota:', String(opts.notaResolucion).trim().slice(0, 800));
  }
  lines.push('', 'Saludos.');
  return lines.join('\n');
}

export function abrirWhatsAppConMensaje(numeroInternacionalSinMas: string, texto: string): void {
  const url = construirUrlWhatsApp(numeroInternacionalSinMas, texto);
  window.open(url, '_blank', 'noopener,noreferrer');
}
