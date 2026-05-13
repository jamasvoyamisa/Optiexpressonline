/**
 * Descarga un archivo protegido usando fetch con ?download_token=xxx.
 * Si el backend responde JSON de error (401/403/500), muestra mensaje en vez de
 * descargar un .json (caso observado especialmente en Chrome).
 */
import { authStorage } from '../services/authStorage';
import api from '../services/api';

function obtenerNombreArchivoDesdeContentDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const utf8 = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ''));
  const simple = cd.match(/filename=([^;]+)/i);
  if (simple?.[1]) return simple[1].trim().replace(/^"|"$/g, '');
  return null;
}

export async function descargarArchivo(
  ruta: string,
  nombreFallback = 'archivo',
  _mimeType?: string,
): Promise<void> {
  const token = authStorage.getToken();
  if (!token) {
    throw new Error('Sesión expirada. Por favor vuelve a iniciar sesión.');
  }
  const base = (api.defaults.baseURL ?? '/api/v1').replace(/\/$/, '');
  const rutaLimpia = ruta.replace(/^\//, '');
  const sep = rutaLimpia.includes('?') ? '&' : '?';
  const url = `${base}/${rutaLimpia}${sep}download_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { method: 'GET' });
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const esJson = contentType.includes('application/json');

  if (!res.ok || esJson) {
    const text = await res.text();
    let detail = `Error al descargar archivo (HTTP ${res.status})`;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      if (parsed?.detail) detail = parsed.detail;
    } catch {
      if (text?.trim()) detail = text.trim();
    }
    throw new Error(detail);
  }

  const blob = await res.blob();
  const nombre = obtenerNombreArchivoDesdeContentDisposition(res.headers.get('content-disposition')) || nombreFallback;
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.setAttribute('download', nombre);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
