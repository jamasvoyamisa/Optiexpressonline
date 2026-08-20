import { useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import api from '../../services/api';
import { abrirArchivoAutenticado } from '../../utils/download';

export type SolicitudDocVacaciones = {
  id: number;
  estado: string;
  tiene_documento_firmado?: boolean;
  documento_firmado_ruta?: string | null;
  documento_firmado_nombre?: string | null;
};

type Props = {
  solicitud: SolicitudDocVacaciones;
  onVerPlantilla: () => void | Promise<void>;
  /** Tras subir/reemplazar PDF; recibe la solicitud actualizada del API si aplica. */
  onActualizado?: (sol: SolicitudDocVacaciones) => void;
  loadingPlantilla?: boolean;
  compact?: boolean;
  /** Si false (default hasta que Admin active), no muestra Subir/Reemplazar. */
  permitirSubida?: boolean;
  /** Estilo botón secundario (plantilla / ver PDF). */
  btnStyle?: CSSProperties;
  /** Estilo botón subir. */
  btnUploadStyle?: CSSProperties;
};

function tieneFirmado(s: SolicitudDocVacaciones): boolean {
  if (typeof s.tiene_documento_firmado === 'boolean') return s.tiene_documento_firmado;
  return Boolean((s.documento_firmado_ruta || '').trim());
}

function puedeSubir(estado: string): boolean {
  const e = (estado || '').toLowerCase();
  return e === 'aprobada_jefe' || e === 'aprobada';
}

export function AccionesDocumentoVacaciones({
  solicitud,
  onVerPlantilla,
  onActualizado,
  loadingPlantilla = false,
  compact = false,
  permitirSubida = false,
  btnStyle,
  btnUploadStyle,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [uploading, setUploading] = useState(false);
  const firmado = tieneFirmado(solicitud);
  const subirOk = permitirSubida && puedeSubir(solicitud.estado);

  const baseBtn: CSSProperties = btnStyle ?? {
    padding: compact ? '4px 10px' : '5px 12px',
    backgroundColor: '#0369a1',
    color: 'white',
    border: 'none',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: 600,
  };

  const uploadBtn: CSSProperties = btnUploadStyle ?? {
    padding: compact ? '4px 10px' : '5px 12px',
    backgroundColor: '#0f766e',
    color: 'white',
    border: 'none',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: 600,
  };

  const verPdfFirmado = async () => {
    setLoadingPdf(true);
    try {
      await abrirArchivoAutenticado(`/vacaciones/solicitudes/${solicitud.id}/documento-firmado`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'No se pudo abrir el PDF firmado');
    } finally {
      setLoadingPdf(false);
    }
  };

  const onFileChange = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Solo se permiten archivos PDF.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('El PDF no puede superar 10 MB.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const res = await api.post<SolicitudDocVacaciones>(
        `/vacaciones/solicitudes/${solicitud.id}/documento-firmado`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      onActualizado?.(res.data);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Error al subir el PDF firmado';
      alert(typeof msg === 'string' ? msg : 'Error al subir el PDF firmado');
    } finally {
      setUploading(false);
    }
  };

  const busy = loadingPlantilla || loadingPdf || uploading;

  return (
    <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
      {firmado ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void verPdfFirmado()}
            style={{ ...baseBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'wait' : 'pointer' }}
          >
            {loadingPdf ? '...' : 'Ver PDF firmado'}
          </button>
          {subirOk && (
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              style={{ ...uploadBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'wait' : 'pointer' }}
            >
              {uploading ? '...' : 'Reemplazar PDF'}
            </button>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onVerPlantilla()}
            style={{ ...baseBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'wait' : 'pointer' }}
          >
            {loadingPlantilla ? '...' : 'Ver documento'}
          </button>
          {subirOk && (
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              style={{ ...uploadBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'wait' : 'pointer' }}
            >
              {uploading ? '...' : 'Subir PDF firmado'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
