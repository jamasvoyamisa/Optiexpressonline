import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import api from '../../services/api';
import { abrirArchivoAutenticado } from '../../utils/download';
import { generarPdfPrestamoConFirma } from './documentoPrestamo';

export type SolicitudDocPrestamo = {
  id: number;
  empleado_id: number;
  estado: string;
  tiene_documento_firmado?: boolean;
  documento_firmado_ruta?: string | null;
  documento_firmado_nombre?: string | null;
  monto?: string;
  plazo_meses?: number;
  motivo?: string | null;
  descuento_quincenal?: string | null;
  referencia_bancaria?: string | null;
  fecha_deposito?: string | null;
  created_at?: string;
  numero_solicitud?: string | null;
};

type EmpleadoLite = {
  id: number;
  nombre: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  numero_empleado?: string | null;
  direccion?: string | null;
  colonia?: string | null;
  cp?: string | null;
  ciudad?: string | null;
  rfc?: string | null;
  telefono?: string | null;
  puesto?: { nombre: string } | null;
  departamento?: { nombre: string } | null;
  empresa?: { nombre: string } | null;
};

type Props = {
  solicitud: SolicitudDocPrestamo;
  onVerPlantilla: () => void | Promise<void>;
  onActualizado?: (sol: SolicitudDocPrestamo) => void;
  loadingPlantilla?: boolean;
  compact?: boolean;
  /** Flag admin: PDF firmado / firma en pantalla. */
  permitirSubida?: boolean;
  /** Solo el dueño puede dibujar/subir imagen de firma. */
  esSolicitante?: boolean;
  /** Empleado ya cargado (p. ej. desde listado RH); si falta se pide al API al firmar. */
  empleadoDoc?: EmpleadoLite | null;
  btnStyle?: CSSProperties;
  btnUploadStyle?: CSSProperties;
  btnFirmaStyle?: CSSProperties;
};

function tieneFirmado(s: SolicitudDocPrestamo): boolean {
  if (typeof s.tiene_documento_firmado === 'boolean') return s.tiene_documento_firmado;
  return Boolean((s.documento_firmado_ruta || '').trim());
}

function puedeFirmarEstado(estado: string): boolean {
  const e = (estado || '').toLowerCase();
  return e === 'pendiente' || e === 'aprobada_departamento' || e === 'depositado';
}

function leerImagenComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = String(reader.result || '');
      if (!/^data:image\/(png|jpeg|jpg);base64,/i.test(r)) {
        reject(new Error('Solo se permiten imágenes PNG o JPG.'));
        return;
      }
      resolve(r);
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}

export function AccionesDocumentoPrestamos({
  solicitud,
  onVerPlantilla,
  onActualizado,
  loadingPlantilla = false,
  compact = false,
  permitirSubida = false,
  esSolicitante = false,
  empleadoDoc = null,
  btnStyle,
  btnUploadStyle,
  btnFirmaStyle,
}: Props) {
  const inputPdfRef = useRef<HTMLInputElement>(null);
  const inputImgRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [modalFirma, setModalFirma] = useState(false);
  const [modo, setModo] = useState<'dibujar' | 'imagen'>('dibujar');
  const [firmaTmp, setFirmaTmp] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  const firmado = tieneFirmado(solicitud);
  const estadoOk = puedeFirmarEstado(solicitud.estado);
  const subirOk = permitirSubida && estadoOk;
  const firmarOk = permitirSubida && estadoOk && esSolicitante;

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

  const firmaBtn: CSSProperties = btnFirmaStyle ?? {
    padding: compact ? '4px 10px' : '5px 12px',
    backgroundColor: '#1e3a5f',
    color: 'white',
    border: 'none',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: 600,
  };

  const limpiarFirmaTemporal = useCallback(() => {
    setFirmaTmp(null);
    setModo('dibujar');
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
      }
    }
  }, []);

  const cerrarModal = () => {
    setModalFirma(false);
    limpiarFirmaTemporal();
    setGenerando(false);
  };

  useEffect(() => {
    if (!modalFirma || modo !== 'dibujar') return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [modalFirma, modo]);

  const posCanvas = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * c.width,
      y: ((ev.clientY - r.top) / r.height) * c.height,
    };
  };

  const onPointerDown = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    drawing.current = true;
    c.setPointerCapture(ev.pointerId);
    const p = posCanvas(ev);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const onPointerMove = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = posCanvas(ev);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const onPointerUp = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    try {
      canvasRef.current?.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  };

  const canvasTieneTrazo = (): boolean => {
    const c = canvasRef.current;
    if (!c) return false;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    // Cualquier píxel no blanco
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) return true;
    }
    return false;
  };

  const subirPdfBlob = async (blob: Blob, filename: string) => {
    const fd = new FormData();
    fd.append('archivo', blob, filename);
    const res = await api.post<SolicitudDocPrestamo>(
      `/prestamos/${solicitud.id}/documento-firmado`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    onActualizado?.(res.data);
  };

  const verPdfFirmado = async () => {
    setLoadingPdf(true);
    try {
      await abrirArchivoAutenticado(`/prestamos/${solicitud.id}/documento-firmado`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'No se pudo abrir el PDF firmado');
    } finally {
      setLoadingPdf(false);
    }
  };

  const onPdfFileChange = async (ev: ChangeEvent<HTMLInputElement>) => {
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
      await subirPdfBlob(file, file.name);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Error al subir el PDF firmado';
      alert(typeof msg === 'string' ? msg : 'Error al subir el PDF firmado');
    } finally {
      setUploading(false);
    }
  };

  const onImgFileChange = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen de firma no puede superar 2 MB.');
      return;
    }
    try {
      const dataUrl = await leerImagenComoDataUrl(file);
      setFirmaTmp(dataUrl);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Imagen no válida');
    }
  };

  const confirmarFirmaYSubir = async () => {
    let dataUrl = firmaTmp;
    if (modo === 'dibujar') {
      if (!canvasTieneTrazo()) {
        alert('Dibuja tu firma en el recuadro o sube una imagen.');
        return;
      }
      dataUrl = canvasRef.current?.toDataURL('image/png') || null;
    }
    if (!dataUrl) {
      alert('Falta la firma.');
      return;
    }

    setGenerando(true);
    try {
      let emp = empleadoDoc;
      if (!emp) {
        const res = await api.get<EmpleadoLite>(`/personal/empleados/${solicitud.empleado_id}`);
        emp = res.data;
      }
      const blob = await generarPdfPrestamoConFirma(
        {
          id: solicitud.id,
          numero_solicitud: solicitud.numero_solicitud,
          empleado_id: solicitud.empleado_id,
          monto: solicitud.monto || '0',
          plazo_meses: solicitud.plazo_meses || 1,
          motivo: solicitud.motivo,
          descuento_quincenal: solicitud.descuento_quincenal,
          estado: solicitud.estado,
          referencia_bancaria: solicitud.referencia_bancaria,
          fecha_deposito: solicitud.fecha_deposito,
          created_at: solicitud.created_at || new Date().toISOString(),
        },
        emp,
        dataUrl,
      );
      // La imagen solo vivió en memoria; se descarta al cerrar el modal.
      await subirPdfBlob(blob, `prestamo_${solicitud.id}_firmado.pdf`);
      cerrarModal();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e instanceof Error ? e.message : 'No se pudo generar o subir el PDF firmado');
      alert(typeof msg === 'string' ? msg : 'No se pudo generar o subir el PDF firmado');
    } finally {
      setGenerando(false);
      setFirmaTmp(null);
    }
  };

  const busy = loadingPlantilla || loadingPdf || uploading || generando;

  return (
    <>
      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
        <input
          ref={inputPdfRef}
          type="file"
          accept="application/pdf,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => void onPdfFileChange(e)}
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
            {firmarOk && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  limpiarFirmaTemporal();
                  setModalFirma(true);
                }}
                style={{ ...firmaBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'wait' : 'pointer' }}
              >
                Volver a firmar
              </button>
            )}
            {subirOk && (
              <button
                type="button"
                disabled={busy}
                onClick={() => inputPdfRef.current?.click()}
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
            {firmarOk && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  limpiarFirmaTemporal();
                  setModalFirma(true);
                }}
                style={{ ...firmaBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'wait' : 'pointer' }}
              >
                Firmar
              </button>
            )}
            {subirOk && (
              <button
                type="button"
                disabled={busy}
                onClick={() => inputPdfRef.current?.click()}
                style={{ ...uploadBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'wait' : 'pointer' }}
              >
                {uploading ? '...' : 'Subir PDF firmado'}
              </button>
            )}
          </>
        )}
      </div>

      {modalFirma && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Firmar solicitud de préstamo"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            backgroundColor: 'rgba(15,23,42,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => {
            if (!generando) cerrarModal();
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              maxWidth: 440,
              width: '100%',
              padding: 20,
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 6px', color: '#1e3a5f', fontSize: '1.05rem' }}>
              Firmar solicitud
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4 }}>
              Dibuja tu firma o sube una imagen. Solo se genera el PDF de esta solicitud; la imagen no se guarda en el sistema.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setModo('dibujar');
                  setFirmaTmp(null);
                }}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 8,
                  border: modo === 'dibujar' ? '2px solid #1e3a5f' : '1px solid #e2e8f0',
                  background: modo === 'dibujar' ? '#eff6ff' : '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                }}
              >
                Dibujar
              </button>
              <button
                type="button"
                onClick={() => setModo('imagen')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 8,
                  border: modo === 'imagen' ? '2px solid #1e3a5f' : '1px solid #e2e8f0',
                  background: modo === 'imagen' ? '#eff6ff' : '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                }}
              >
                Subir imagen
              </button>
            </div>

            {modo === 'dibujar' ? (
              <div>
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={160}
                  style={{
                    width: '100%',
                    height: 160,
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    touchAction: 'none',
                    background: '#fff',
                    cursor: 'crosshair',
                  }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                />
                <button
                  type="button"
                  onClick={limpiarFirmaTemporal}
                  style={{
                    marginTop: 8,
                    padding: '6px 10px',
                    fontSize: '0.78rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    background: '#f8fafc',
                    cursor: 'pointer',
                  }}
                >
                  Limpiar
                </button>
              </div>
            ) : (
              <div>
                <input
                  ref={inputImgRef}
                  type="file"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  style={{ display: 'none' }}
                  onChange={(e) => void onImgFileChange(e)}
                />
                <button
                  type="button"
                  onClick={() => inputImgRef.current?.click()}
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 8,
                    border: '1px dashed #94a3b8',
                    background: '#f8fafc',
                    cursor: 'pointer',
                    fontWeight: 600,
                    color: '#334155',
                  }}
                >
                  Elegir PNG o JPG
                </button>
                {firmaTmp && (
                  <div style={{ marginTop: 10, textAlign: 'center' }}>
                    <img
                      src={firmaTmp}
                      alt="Vista previa firma"
                      style={{ maxHeight: 80, maxWidth: '100%', objectFit: 'contain' }}
                    />
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={generando}
                onClick={cerrarModal}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  cursor: generando ? 'wait' : 'pointer',
                  fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={generando}
                onClick={() => void confirmarFirmaYSubir()}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#1e3a5f',
                  color: '#fff',
                  cursor: generando ? 'wait' : 'pointer',
                  fontWeight: 700,
                  opacity: generando ? 0.75 : 1,
                }}
              >
                {generando ? 'Generando PDF…' : 'Firmar y guardar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
