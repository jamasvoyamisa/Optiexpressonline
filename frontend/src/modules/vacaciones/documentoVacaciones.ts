/**
 * Documento imprimible de solicitud de vacaciones (mismo formato para RH y empleado).
 */
import { toMexicoDateString } from '../../utils/date';
import type { SolicitudVacaciones } from '../../types';

export interface EmpleadoResumenVacaciones {
  id: number;
  nombre: string;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  numero_empleado: string;
  fecha_ingreso?: string | null;
  empresa?: { id: number; nombre: string } | null;
  departamento?: { id: number; nombre: string } | null;
  puesto?: { id: number; nombre: string } | null;
}

const fmtPartes = (iso: string | null | undefined) => {
  if (!iso) return { dd: '', mm: '', aaaa: '' };
  const d = new Date(iso.includes('T') ? iso : iso + 'T12:00:00');
  return {
    dd: String(d.getDate()).padStart(2, '0'),
    mm: String(d.getMonth() + 1).padStart(2, '0'),
    aaaa: String(d.getFullYear()),
  };
};

/** Fecha/hora de aceptación FES en zona México. */
const fmtAceptacionMx = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const s = String(iso);
  const hasTz = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s);
  const d = new Date(hasTz ? s : `${s}Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Mexico_City',
  });
};

const escapeHtml = (v: string) =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function generarDocumentoVacaciones(
  sol: SolicitudVacaciones,
  emp: EmpleadoResumenVacaciones | null,
  targetWindow?: Window | null,
) {
  const nombreCompleto = emp
    ? [emp.nombre, emp.apellido_paterno, emp.apellido_materno].filter(Boolean).join(' ')
    : `Empleado #${sol.empleado_id}`;
  const numEmp = emp?.numero_empleado ?? '—';
  const empresa = emp?.empresa?.nombre ?? '—';
  const departamento = emp?.departamento?.nombre ?? '—';
  const puesto = emp?.puesto?.nombre ?? '—';

  const hoyPartes = fmtPartes(toMexicoDateString(new Date()));
  const inicioPartes = fmtPartes(sol.fecha_inicio);
  const finPartes = fmtPartes(sol.fecha_fin);
  const ingresoPartes = fmtPartes(emp?.fecha_ingreso);

  const regresoPartes = (() => {
    const base = sol.fecha_fin;
    const d = new Date(base.includes('T') ? base : base + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return {
      dd: String(d.getDate()).padStart(2, '0'),
      mm: String(d.getMonth() + 1).padStart(2, '0'),
      aaaa: String(d.getFullYear()),
    };
  })();

  const esBorrador = sol.estado === 'pendiente';
  const ipSol = (sol.aceptacion_solicitante_ip || '').trim() || '—';
  const ipJefe = (sol.aceptacion_jefe_ip || '').trim() || '—';
  const ipRh = (sol.aceptacion_rh_ip || '').trim() || '—';
  const atSol = fmtAceptacionMx(sol.aceptacion_solicitante_at);
  const atJefe = fmtAceptacionMx(sol.aceptacion_jefe_at);
  const atRh = fmtAceptacionMx(sol.aceptacion_rh_at);
  const nombreJefe = (sol.jefe_aprobador_nombre || '').trim() || '—';
  const textoAceptacion = (sol.aceptacion_solicitante_texto || '').trim();
  const hayFes =
    !!(sol.aceptacion_solicitante_at || sol.aceptacion_jefe_at || sol.aceptacion_rh_at);

  const logoGrupo = new URL('../../assets/GPOCristal.png', import.meta.url).pathname;
  const logoRaiz = new URL('../../assets/Raiz.png', import.meta.url).pathname;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Solicitud de Vacaciones — ${nombreCompleto}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; }
  .no-print { padding: 12px 20px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 12px; }
  @media print { .no-print { display: none !important; } }
  .page { max-width: 740px; margin: 0 auto; padding: 40px 48px 48px; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
  .logo-area { display: flex; align-items: center; gap: 24px; }
  .doc-title { font-size: 22px; font-weight: 700; color: #1e3a8a; text-align: right; align-self: flex-end; }
  .fecha-header { display: flex; align-items: center; gap: 6px; margin-bottom: 20px; justify-content: flex-end; font-size: 12px; }
  .fecha-header .lbl { color: #555; }
  .fecha-cell { display: inline-block; min-width: 28px; text-align: center; border-bottom: 1.5px solid #1e3a8a; padding: 2px 4px; font-weight: 600; color: #1e3a8a; }
  .sep { color: #1e3a8a; font-weight: 700; }
  .sec-title { font-size: 14px; font-weight: 700; color: #1e3a8a; margin-bottom: 14px; }
  .form-row { display: flex; gap: 0; margin-bottom: 14px; align-items: flex-end; }
  .form-field { flex: 1; }
  .form-field + .form-field { margin-left: 24px; }
  .form-label { font-size: 11px; color: #444; margin-bottom: 3px; display: block; }
  .form-value { border-bottom: 1.5px solid #555; min-height: 20px; padding: 2px 2px 2px 0; font-size: 13px; font-weight: 500; color: #111; display: block; min-width: 60px; }
  .form-value.wide { min-width: 200px; }
  .dias-row { margin-bottom: 10px; font-size: 13px; }
  .dias-row .val { font-weight: 700; border-bottom: 1.5px solid #555; display: inline-block; min-width: 60px; text-align: center; margin-left: 6px; }
  .fecha-field { display: flex; align-items: flex-end; gap: 2px; }
  .fecha-field .fc { display: inline-block; border-bottom: 1.5px solid #555; text-align: center; padding: 2px 4px; font-weight: 600; min-width: 28px; font-size: 13px; }
  .fecha-field .fc.year { min-width: 44px; }
  .fecha-field .fsep { color: #555; padding: 0 2px; font-size: 13px; align-self: flex-end; margin-bottom: 2px; }
  .firmas-title { font-size: 16px; font-weight: 700; color: #1e3a8a; text-align: center; margin: 36px 0 40px; }
  .firmas-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px 32px; margin-bottom: 32px; }
  .firma-item { text-align: center; }
  .firma-line { border-top: 1.5px solid #555; margin-bottom: 6px; }
  .firma-nombre { font-size: 11px; font-weight: 700; color: #1a1a2e; }
  .firma-cargo { font-size: 10px; color: #555; margin-top: 2px; }
  .firma-fes { font-size: 9.5px; color: #334155; margin-top: 6px; line-height: 1.35; }
  .firmas-bottom { display: flex; justify-content: center; }
  .fes-box { margin-top: 28px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; background: #f8fafc; }
  .fes-box .sec-title { margin-bottom: 10px; }
  .fes-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  .fes-table th, .fes-table td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; vertical-align: top; }
  .fes-table th { background: #e2e8f0; color: #1e3a8a; font-size: 11px; }
  .fes-note { margin-top: 8px; font-size: 10px; color: #64748b; line-height: 1.35; }
  .borrador-banner { background: #fef9c3; border: 1px solid #fbbf24; color: #92400e; padding: 6px 14px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .btn-print { padding: 8px 20px; background: #1e3a8a; color: white; border: none; border-radius: 5px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-close { padding: 8px 20px; background: #e2e8f0; color: #334155; border: none; border-radius: 5px; font-size: 13px; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
<div class="no-print">
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
  <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
  ${esBorrador ? '<span class="borrador-banner">⚠️ Solicitud pendiente de aprobación</span>' : ''}
</div>
<div class="page">
  <div class="doc-header">
    <div class="logo-area" style="display:flex;align-items:center;gap:24px;">
      <img src="${logoGrupo}" alt="Grupo Cristal" style="height:48px;max-width:140px;object-fit:contain;" onerror="this.style.display='none'"/>
      <img src="${logoRaiz}" alt="Raiz" style="height:44px;max-width:120px;object-fit:contain;" onerror="this.style.display='none'"/>
    </div>
    <div class="doc-title">Solicitud de vacaciones</div>
  </div>

  <div class="fecha-header">
    <span class="lbl">Fecha:</span>
    <span class="fecha-cell">${hoyPartes.dd}</span>
    <span class="sep">|</span>
    <span class="fecha-cell">${hoyPartes.mm}</span>
    <span class="sep">|</span>
    <span class="fecha-cell">${hoyPartes.aaaa}</span>
  </div>

  <div class="sec-title">Solicitante</div>

  <div class="form-row">
    <div class="form-field">
      <span class="form-label">Nombre de colaborador:</span>
      <span class="form-value wide">${escapeHtml(nombreCompleto)}</span>
    </div>
  </div>

  <div class="form-row">
    <div class="form-field">
      <span class="form-label">No. de nómina:</span>
      <span class="form-value">${escapeHtml(String(numEmp))}</span>
    </div>
    <div class="form-field" style="display:flex;align-items:flex-end;gap:8px;">
      <span class="form-label" style="white-space:nowrap;">Fecha ingreso:</span>
      <div class="fecha-field">
        <span class="fc">${ingresoPartes.dd}</span>
        <span class="fsep">|</span>
        <span class="fc">${ingresoPartes.mm}</span>
        <span class="fsep">|</span>
        <span class="fc year">${ingresoPartes.aaaa}</span>
      </div>
    </div>
  </div>

  <div class="form-row">
    <div class="form-field">
      <span class="form-label">Empresa:</span>
      <span class="form-value">${escapeHtml(empresa)}</span>
    </div>
    <div class="form-field">
      <span class="form-label">Departamento:</span>
      <span class="form-value">${escapeHtml(departamento)}</span>
    </div>
  </div>

  <div class="form-row">
    <div class="form-field">
      <span class="form-label">Puesto:</span>
      <span class="form-value wide">${escapeHtml(puesto)}</span>
    </div>
  </div>

  <div style="margin-top: 20px;">
    <div class="dias-row">
      Días de vacaciones a tomar: <span class="val">${sol.dias_solicitados}</span>
    </div>
    <div class="form-row" style="align-items:center;margin-bottom:10px;">
      <span style="font-size:13px;min-width:80px;">Día Inicial:</span>
      <div class="fecha-field">
        <span class="fc">${inicioPartes.dd}</span><span class="fsep">|</span>
        <span class="fc">${inicioPartes.mm}</span><span class="fsep">|</span>
        <span class="fc year">${inicioPartes.aaaa}</span>
      </div>
    </div>
    <div class="form-row" style="align-items:center;margin-bottom:10px;">
      <span style="font-size:13px;min-width:80px;">Día Final:</span>
      <div class="fecha-field">
        <span class="fc">${finPartes.dd}</span><span class="fsep">|</span>
        <span class="fc">${finPartes.mm}</span><span class="fsep">|</span>
        <span class="fc year">${finPartes.aaaa}</span>
      </div>
    </div>
    <div class="form-row" style="align-items:center;margin-bottom:0;">
      <span style="font-size:13px;min-width:auto;margin-right:8px;">Día que se presenta a laborar después de vacaciones:</span>
      <div class="fecha-field">
        <span class="fc">${regresoPartes.dd}</span><span class="fsep">|</span>
        <span class="fc">${regresoPartes.mm}</span><span class="fsep">|</span>
        <span class="fc year">${regresoPartes.aaaa}</span>
      </div>
    </div>
  </div>

  ${hayFes ? `
  <div class="fes-box">
    <div class="sec-title">Constancia de aceptación electrónica (FES)</div>
    <table class="fes-table">
      <thead>
        <tr>
          <th>Rol</th>
          <th>Fecha y hora (México)</th>
          <th>IP del equipo</th>
          <th>Detalle</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Solicitante</td>
          <td>${escapeHtml(atSol)}</td>
          <td>${escapeHtml(ipSol)}</td>
          <td>${escapeHtml(nombreCompleto)}</td>
        </tr>
        <tr>
          <td>Jefe directo</td>
          <td>${escapeHtml(atJefe)}</td>
          <td>${escapeHtml(ipJefe)}</td>
          <td>${escapeHtml(nombreJefe)}</td>
        </tr>
        <tr>
          <td>Gestión RH</td>
          <td>${escapeHtml(atRh)}</td>
          <td>${escapeHtml(ipRh)}</td>
          <td>${sol.aceptacion_rh_at ? 'Confirmación formal RH' : '—'}</td>
        </tr>
      </tbody>
    </table>
    ${textoAceptacion ? `<p class="fes-note"><strong>Texto aceptado:</strong> ${escapeHtml(textoAceptacion)}</p>` : ''}
    <p class="fes-note">La IP corresponde a la del equipo según la red (reserva DHCP / inventario de TI). Firma electrónica simple (no e.firma SAT).</p>
  </div>
  ` : ''}

  <div class="firmas-title">Firmas para aprobación de solicitud</div>

  <div class="firmas-grid">
    <div class="firma-item">
      <div class="firma-line"></div>
      <div class="firma-nombre">${sol.aceptacion_solicitante_at ? escapeHtml(nombreCompleto) : 'NOMBRE Y FIRMA'}</div>
      <div class="firma-cargo">Solicitante</div>
      ${sol.aceptacion_solicitante_at ? `<div class="firma-fes">Aceptado electrónicamente<br/>${escapeHtml(atSol)}<br/>IP: ${escapeHtml(ipSol)}</div>` : ''}
    </div>
    <div class="firma-item">
      <div class="firma-line"></div>
      <div class="firma-nombre">${sol.aceptacion_jefe_at && nombreJefe !== '—' ? escapeHtml(nombreJefe) : 'NOMBRE Y FIRMA'}</div>
      <div class="firma-cargo">Jefe Directo</div>
      ${sol.aceptacion_jefe_at ? `<div class="firma-fes">Aceptado electrónicamente<br/>${escapeHtml(atJefe)}<br/>IP: ${escapeHtml(ipJefe)}</div>` : ''}
    </div>
    <div class="firma-item">
      <div class="firma-line"></div>
      <div class="firma-nombre">${sol.aceptacion_rh_at ? 'Gestión RH' : 'NOMBRE Y FIRMA'}</div>
      <div class="firma-cargo">Gestión RH</div>
      ${sol.aceptacion_rh_at ? `<div class="firma-fes">Aceptado electrónicamente<br/>${escapeHtml(atRh)}<br/>IP: ${escapeHtml(ipRh)}</div>` : ''}
    </div>
  </div>

  <div class="firmas-bottom">
    <div class="firma-item" style="min-width:220px;">
      <div class="firma-line"></div>
      <div class="firma-nombre">Rafael Vargas Salinas</div>
      <div class="firma-cargo">Gerencia Administrativa</div>
    </div>
  </div>
</div>
</body>
</html>`;

  const w = targetWindow ?? window.open('', '_blank', 'width=820,height=920,scrollbars=yes');
  if (!w) {
    alert('Permite ventanas emergentes para ver el documento');
    return;
  }
  w.document.write(html);
  w.document.close();
}
