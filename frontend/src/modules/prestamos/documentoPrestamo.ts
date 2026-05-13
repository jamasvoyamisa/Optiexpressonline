/**
 * Genera el documento imprimible de solicitud de préstamo.
 * Estructura idéntica al PDF Solicitud-de-Prestamo-2026.
 */

interface EmpleadoDoc {
  id: number;
  numero_empleado?: string | null;
  nombre: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  direccion?: string | null;
  colonia?: string | null;
  cp?: string | null;
  ciudad?: string | null;
  rfc?: string | null;
  telefono?: string | null;
  puesto?: { nombre: string } | null;
  departamento?: { nombre: string } | null;
  empresa?: { nombre: string } | null;
  jefe?: { nombre: string; apellido_paterno?: string | null; apellido_materno?: string | null } | null;
}

interface SolicitudPrestamoDoc {
  id: number;
  numero_solicitud?: string | null;
  empleado_id: number;
  monto: string;
  plazo_meses: number;
  motivo?: string | null;
  descuento_quincenal?: string | null;
  estado?: string;
  referencia_bancaria?: string | null;
  fecha_deposito?: string | null;
  created_at: string;
}

const labelEstado = (e?: string) => {
  const x = (e || '').toLowerCase();
  const m: Record<string, string> = {
    pendiente: 'Pendiente',
    aprobada_departamento: 'Autorizada por departamento',
    depositado: 'Depositado',
    rechazada: 'Rechazada',
    cancelada: 'Cancelada',
  };
  return m[x] || e || '—';
};

const val = (x: string | null | undefined) => x ?? '';

const formatMonto = (x: string | number) => {
  const n = typeof x === 'string' ? parseFloat(x) : x;
  if (isNaN(n)) return '';
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const fmtPartes = (fecha: string) => {
  const d = new Date(fecha.includes('T') ? fecha : fecha + 'T12:00:00');
  return {
    dd: String(d.getDate()).padStart(2, '0'),
    mm: String(d.getMonth() + 1).padStart(2, '0'),
    aaaa: String(d.getFullYear()),
  };
};

export const generarDocumentoPrestamo = (
  sol: SolicitudPrestamoDoc,
  emp: EmpleadoDoc | null,
  targetWindow?: Window | null
) => {
  const hoy = fmtPartes(new Date().toISOString().slice(0, 10));
  const esBorrador = sol.estado === 'pendiente';
  const refBancaria = val(sol.referencia_bancaria);
  const fechaDep = sol.fecha_deposito
    ? fmtPartes(sol.fecha_deposito.includes('T') ? sol.fecha_deposito : sol.fecha_deposito + 'T12:00:00')
    : null;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // nombreCompleto no se usa directamente (los campos se inyectan por separado en el HTML)
  // const nombreCompleto = emp ? [emp.apellido_paterno, emp.apellido_materno, emp.nombre].filter(Boolean).join(' ') : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<base href="${baseUrl}/">
<title>Solicitud de Préstamo</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Arial', sans-serif;
    font-size: 11pt;
    color: #222;
    background: #d1d5db;
    padding: 20px 0 30px;
  }
  @media print {
    body { background: #fff; padding: 0; }
  }
  .no-print {
    padding: 10px 20px;
    background: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  @media print {
    .no-print { display: none !important; }
    @page {
      margin: 1.5cm;
      size: A4;
    }
  }

  .page {
    width: 21cm;
    min-height: 29.7cm;
    margin: 0 auto;
    padding: 1.8cm 1.8cm 1.4cm;
    background: #fff;
    border: 1px solid #b0b7c3;
    box-shadow: 0 4px 24px rgba(0,0,0,0.18);
  }
  @media print {
    .page {
      border: none;
      box-shadow: none;
      margin: 0;
    }
  }

  /* ── Encabezado ── */
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 0.5cm;
  }
  .logo-wrap {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .logo-wrap img {
    height: 52px;
    object-fit: contain;
  }
  .title-fecha {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 8px;
  }
  .doc-title {
    font-size: 22pt;
    font-weight: 700;
    color: #1a2e5a;
    letter-spacing: -0.3px;
    white-space: nowrap;
  }

  /* ── Franja Solicitante + Fecha ── */
  .sec-header-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-top: 1.1cm;
    margin-bottom: 1cm;
  }
  .sec-label {
    display: flex;
    flex-direction: column;
  }
  .sec-label .title {
    font-size: 13pt;
    font-weight: 700;
    color: #2c6fad;
  }
  .sec-label .subtitle {
    font-size: 9pt;
    color: #2c6fad;
    margin-top: 1px;
  }
  .fecha-box {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10pt;
    color: #222;
    padding-bottom: 4px;
  }
  .folio-fecha-wrap {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }
  .folio-box {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10pt;
    color: #222;
  }
  .fecha-box .cell {
    border-bottom: 1px solid #555;
    min-width: 36px;
    text-align: center;
    padding: 1px 4px;
  }
  .fecha-box .sep {
    color: #555;
  }

  /* ── Campos del formulario ── */
  .field-row {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    margin-bottom: 0.22cm;
  }
  .field {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    flex: 1;
  }
  .field.fixed-half { flex: 0 0 48%; }
  .field.fixed-third { flex: 0 0 31%; }
  .field-lbl {
    white-space: nowrap;
    font-size: 10pt;
    color: #222;
    flex-shrink: 0;
  }
  .field-val {
    flex: 1;
    border-bottom: 1px solid #666;
    min-width: 40px;
    font-size: 10pt;
    padding-bottom: 1px;
    color: #111;
  }
  /* sub-etiquetas de apellidos */
  .sublabels {
    display: flex;
    gap: 0;
    padding: 2px 0 0;
    margin-bottom: 0.15cm;
    padding-left: 4.3cm;
  }
  .sublabels span {
    flex: 1;
    font-size: 7.5pt;
    color: #666;
    text-align: center;
  }

  /* ── Sección Domicilio ── */
  .sec-dom {
    font-size: 15pt;
    font-weight: 700;
    color: #2c6fad;
    margin-top: 0.4cm;
    margin-bottom: 0.3cm;
  }

  /* ── Motivo / Pagos ── */
  .motivo-block {
    margin-top: 0.4cm;
  }
  .motivo-lbl {
    font-size: 10pt;
    color: #222;
    margin-bottom: 0.15cm;
  }
  .motivo-line {
    border-bottom: 1px solid #666;
    margin-bottom: 0.18cm;
    min-height: 16px;
    font-size: 10pt;
    color: #111;
  }

  .terminos-box {
    margin-top: 0.4cm;
    border: 1px solid #fed7aa;
    background: #fff7ed;
    border-radius: 6px;
    padding: 10px 12px;
    color: #7c2d12;
  }
  .terminos-title {
    font-size: 9.5pt;
    font-weight: 700;
    margin-bottom: 5px;
  }
  .terminos-text {
    font-size: 8.4pt;
    line-height: 1.45;
  }

  /* ── Firmas ── */
  .firmas-top {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    margin-top: 1.4cm;
  }
  .firma-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .firma-line-h {
    width: 100%;
    border-top: 1px solid #555;
    margin-bottom: 5px;
  }
  .firma-nombre {
    font-size: 10pt;
    font-weight: 700;
    color: #1a2e5a;
    text-align: center;
  }
  .firma-cargo {
    font-size: 8.5pt;
    color: #666;
    text-align: center;
    margin-top: 2px;
  }
  .firma-small-label {
    font-size: 7.5pt;
    font-weight: 700;
    color: #555;
    text-align: center;
    letter-spacing: 0.3px;
  }
  .firma-bottom-wrap {
    display: flex;
    justify-content: center;
    margin-top: 0.9cm;
  }
  .firma-col-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 220px;
  }

  /* ── Botones ── */
  .btn-print {
    padding: 7px 18px;
    background: #1a2e5a;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-close {
    padding: 7px 18px;
    background: #e2e8f0;
    color: #334155;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .borrador-tag {
    background: #fef9c3;
    border: 1px solid #fbbf24;
    color: #92400e;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
  }
</style>
</head>
<body>

<style id="print-override"></style>
<script>
  window.addEventListener('beforeprint', function() {
    document.getElementById('print-override').textContent =
      '@page { margin: 0; size: A4; }';
  });
  window.addEventListener('afterprint', function() {
    document.getElementById('print-override').textContent = '';
  });
</script>

<div class="no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
  <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
  ${esBorrador ? '<span class="borrador-tag">⚠️ Pendiente de aprobación</span>' : ''}
</div>

<div class="page">

  <!-- ── Encabezado: logo + título ── -->
  <div class="header">
    <div class="logo-wrap">
      <img src="/GPOCristal.png" alt="Grupo Cristal" onerror="this.style.display='none'"/>
    </div>
    <div class="title-fecha">
      <div class="doc-title">Solicitud de préstamo</div>
    </div>
  </div>

  <!-- ── Fila: Solicitante (izq) + Fecha (der) ── -->
  <div class="sec-header-row">
    <div class="sec-label">
      <span class="title">Solicitante</span>
      <span class="subtitle">Datos personales e información</span>
    </div>
    <div class="folio-fecha-wrap">
      <div class="folio-box">
        <span>No. solicitud:</span>
        <span class="cell" style="min-width:120px;">${val(sol.numero_solicitud) || `#${sol.id}`}</span>
      </div>
      <div class="fecha-box">
        <span>Fecha:</span>
        <span class="cell">${hoy.dd}</span>
        <span class="sep">|</span>
        <span class="cell">${hoy.mm}</span>
        <span class="sep">|</span>
        <span class="cell">${hoy.aaaa}</span>
      </div>
    </div>
  </div>

  <!-- Nombre de colaborador -->
  <div class="field-row" style="align-items:flex-end; gap:0;">
    <span class="field-lbl" style="flex-shrink:0; padding-right:8px;">Nombre de colaborador:</span>
    <span class="field-val" style="flex:1; text-align:center;">${val(emp?.apellido_paterno)}</span>
    <span class="field-val" style="flex:1; text-align:center; margin-left:4px;">${val(emp?.apellido_materno)}</span>
    <span class="field-val" style="flex:1; text-align:center; margin-left:4px;">${val(emp?.nombre)}</span>
  </div>
  <!-- sub-etiquetas Apellido Paterno / Materno / Nombre(s) -->
  <div class="sublabels">
    <span>Apellido Paterno</span>
    <span>Apellido Materno</span>
    <span>Nombre(s)</span>
  </div>

  <!-- Teléfono / RFC -->
  <div class="field-row">
    <div class="field fixed-half">
      <span class="field-lbl">Teléfono:</span>
      <span class="field-val">${val(emp?.telefono)}</span>
    </div>
    <div class="field fixed-half">
      <span class="field-lbl">RFC:</span>
      <span class="field-val">${val(emp?.rfc)}</span>
    </div>
  </div>

  <!-- Cantidad solicitada / Puesto -->
  <div class="field-row">
    <div class="field fixed-half">
      <span class="field-lbl">Cantidad solicitada: $</span>
      <span class="field-val" style="font-weight:600;">${formatMonto(sol.monto)}</span>
    </div>
    <div class="field fixed-half">
      <span class="field-lbl">Puesto:</span>
      <span class="field-val">${val(emp?.puesto?.nombre)}</span>
    </div>
  </div>

  <!-- ── Sección Domicilio ── -->
  <div class="sec-dom">Domicilio</div>

  <!-- Calle -->
  <div class="field-row">
    <div class="field">
      <span class="field-lbl">Calle:</span>
      <span class="field-val">${val(emp?.direccion)}</span>
    </div>
  </div>

  <!-- No. Interior / No. Exterior -->
  <div class="field-row">
    <div class="field fixed-half">
      <span class="field-lbl">No. Interior:</span>
      <span class="field-val"></span>
    </div>
    <div class="field fixed-half">
      <span class="field-lbl">No. Exterior:</span>
      <span class="field-val"></span>
    </div>
  </div>

  <!-- Colonia o Fraccionamiento -->
  <div class="field-row">
    <div class="field">
      <span class="field-lbl">Colonia o Fraccionamiento:</span>
      <span class="field-val">${val(emp?.colonia)}</span>
    </div>
  </div>

  <!-- Código Postal / Municipio -->
  <div class="field-row">
    <div class="field fixed-half">
      <span class="field-lbl">Código Postal:</span>
      <span class="field-val">${val(emp?.cp)}</span>
    </div>
    <div class="field fixed-half">
      <span class="field-lbl">Municipio:</span>
      <span class="field-val">${val(emp?.ciudad)}</span>
    </div>
  </div>

  <!-- Estado -->
  <div class="field-row">
    <div class="field fixed-half">
      <span class="field-lbl">Estado:</span>
      <span class="field-val"></span>
    </div>
  </div>

  <!-- ── Estado y depósito (flujo departamento + GG) ── -->
  <div class="motivo-block" style="margin-top:0.35cm;">
    <div class="motivo-lbl">Estado de la solicitud:</div>
    <div class="motivo-line" style="font-weight:600;">${labelEstado(sol.estado)}</div>
  </div>
  ${refBancaria ? `
  <div class="motivo-block">
    <div class="motivo-lbl">Referencia bancaria del depósito:</div>
    <div class="motivo-line" style="font-family:monospace;font-weight:600;">${refBancaria}</div>
    ${fechaDep ? `<div style="font-size:9pt;color:#555;margin-top:4px;">Fecha de depósito: ${fechaDep.dd}/${fechaDep.mm}/${fechaDep.aaaa}</div>` : ''}
  </div>
  ` : ''}

  <!-- ── Motivo ── -->
  <div class="motivo-block">
    <div class="motivo-lbl">Motivo de solicitud de préstamo:</div>
    <div class="motivo-line">${val(sol.motivo)}</div>
    <div class="motivo-line"></div>
  </div>

  <!-- ── Pagos parciales ── -->
  <div class="motivo-block">
    <div class="motivo-lbl">Pagos parciales propuestos:</div>
    <div class="motivo-line">${sol.descuento_quincenal ? formatMonto(sol.descuento_quincenal) : ''}</div>
    <div class="motivo-line"></div>
  </div>

  <div class="terminos-box">
    <div class="terminos-title">Términos de la solicitud</div>
    <div class="terminos-text">
      Esta solicitud de préstamo está sujeta a aprobación conforme a las políticas internas vigentes de la empresa.
      El registro y la firma de este formato no garantizan autorización ni depósito automático.
      La evaluación considera, entre otros criterios, antigüedad laboral, historial del colaborador y capacidad de descuento vía nómina.
      En caso de aprobación, el monto, plazo y descuento quincenal autorizados serán los que se determinen formalmente en el proceso interno.
    </div>
  </div>

  <!-- ── Firmas (3 columnas) ── -->
  <div class="firmas-top">
    <div class="firma-col">
      <div class="firma-line-h"></div>
      <div class="firma-small-label">NOMBRE Y FIRMA</div>
      <div class="firma-cargo">Solicitante</div>
    </div>
    <div class="firma-col">
      <div class="firma-line-h"></div>
      <div class="firma-small-label">NOMBRE Y FIRMA</div>
      <div class="firma-cargo">Jefe Directo</div>
    </div>
    <div class="firma-col">
      <div class="firma-line-h"></div>
      <div class="firma-small-label">NOMBRE Y FIRMA</div>
      <div class="firma-cargo">Gestión RH</div>
    </div>
  </div>

  <!-- ── Firma inferior centrada ── -->
  <div class="firma-bottom-wrap">
    <div class="firma-col-center">
      <div class="firma-line-h"></div>
      <div class="firma-nombre">Rafael Vargas Salinas</div>
      <div class="firma-cargo">Gerencia Administrativa</div>
    </div>
  </div>

</div>
</body>
</html>`;

  // Ancho: A4 (794px) + padding body (0) + borde + sombra + scrollbar ≈ 870px
  // Alto: limitado al 90% de la pantalla disponible; el documento se desplaza si no entra
  const screenH = typeof window !== 'undefined' ? Math.round(window.screen.availHeight * 0.9) : 950;
  const w = targetWindow ?? window.open('', '_blank', `width=870,height=${screenH},scrollbars=yes,resizable=yes`);
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Centra la ventana en la pantalla
    try {
      const screenW = window.screen.availWidth;
      const left = Math.round((screenW - 870) / 2);
      const top = Math.round((window.screen.availHeight - screenH) / 2);
      w.moveTo(left, top);
    } catch (_) { /* algunos navegadores bloquean moveTo */ }
  }
};
