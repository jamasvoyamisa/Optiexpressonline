/**
 * Enlaces whatsapp:// para abrir la aplicación de WhatsApp (escritorio o móvil)
 * con mensaje prellenado. El envío lo confirma el usuario en WhatsApp.
 */

function truncarTextoWhatsApp(texto: string): string {
  return texto.length > 3500 ? `${texto.slice(0, 3497)}...` : texto;
}

/** Dígitos internacionales sin + (ej. 5215512345678) para whatsapp://send?phone=… */
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
  const t = truncarTextoWhatsApp(texto);
  return `whatsapp://send?phone=${numeroInternacionalSinMas}&text=${encodeURIComponent(t)}`;
}

function abrirEnlaceWhatsApp(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function mensajeTicketSoporteWhatsapp(opts: {
  nombreSolicitante: string;
  folio: string;
  titulo: string;
  estadoLabel: string;
  motivoCierre?: string | null;
  observaciones?: string | null;
  /** @deprecated usar observaciones */
  notaResolucion?: string | null;
}): string {
  const nombre = (opts.nombreSolicitante || 'Usuario').trim();
  const tit = (opts.titulo || '—').trim();
  const observaciones = (opts.observaciones ?? opts.notaResolucion ?? '').trim();
  const motivo = (opts.motivoCierre || '').trim();
  const lines = [
    `Hola ${nombre},`,
    '',
    'Te escribimos desde Soporte TI (Optiexpress) por tu ticket:',
    '',
    `Folio: ${opts.folio}`,
    `Estado: ${opts.estadoLabel}`,
    `Asunto: ${tit}`,
  ];
  if (motivo) {
    lines.push('', `Motivo: ${motivo.slice(0, 500)}`);
  }
  if (observaciones) {
    lines.push('', 'Observaciones:', observaciones.slice(0, 800));
  }
  lines.push('', 'Saludos.');
  return lines.join('\n');
}

export function abrirWhatsAppConMensaje(numeroInternacionalSinMas: string, texto: string): void {
  abrirEnlaceWhatsApp(construirUrlWhatsApp(numeroInternacionalSinMas, texto));
}
