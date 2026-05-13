const path = require('path');
const fs = require('fs');
const PdfPrinter = require('pdfmake');

const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const printer = new PdfPrinter(fonts);

function normalizePrefijoDepartamento(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s ? s.slice(0, 12) : 'DEA';
}

/**
 * Genera el PDF de cotización en memoria (misma lógica que ipc.js quotation:export-pdf).
 * @returns {Promise<{ buffer: Buffer, cotizacionId: number|null, filename: string }>}
 */
async function quotationPdfToBuffer({ pool, session, data }) {
  const items = data.items || [];
  const cliente = data.cliente || {};
  const asesor = data.asesor || '';
  const total = items.reduce((acc, it) => acc + Number(it.precio || 0), 0);
  const prefijo = normalizePrefijoDepartamento(data?.prefijoCotizacion || session?.departamento);

  let cotizacionId = data.id || null;
  if (!cotizacionId) {
    try {
      const clienteId = cliente.id || null;
      const userId = session?.id || null;
      const [result] = await pool.execute(
        'INSERT INTO cotizaciones (fecha, cliente_id, asesor, total, user_id, prefijo_cotizacion) VALUES (NOW(), ?, ?, ?, ?, ?)',
        [clienteId, asesor || null, total, userId, prefijo]
      );
      cotizacionId = result.insertId;
      try {
        for (const it of items) {
          await pool.execute(
            'INSERT INTO cotizacion_detalles (cotizacion_id, nombre, precio) VALUES (?, ?, ?)',
            [cotizacionId, it.nombre, it.precio]
          );
        }
      } catch (_) {}
      try {
        await pool.execute(
          'CREATE TABLE IF NOT EXISTS cotizacion_opciones (\n            id INT AUTO_INCREMENT PRIMARY KEY,\n            cotizacion_id INT NOT NULL,\n            iva TINYINT(1) NOT NULL DEFAULT 0,\n            discount_rate DECIMAL(5,4) NOT NULL DEFAULT 0,\n            shipping_amount DECIMAL(12,2) NOT NULL DEFAULT 0,\n            validity_days INT NOT NULL DEFAULT 0,\n            notes TEXT,\n            FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE\n          )'
        );
        const o = data || {};
        await pool.execute(
          'INSERT INTO cotizacion_opciones (cotizacion_id, iva, discount_rate, shipping_amount, validity_days, notes) VALUES (?, ?, ?, ?, ?, ?)',
          [
            cotizacionId,
            o.iva ? 1 : 0,
            Number(o.discountRate || 0),
            Number(o.shippingAmount || 0),
            Number(o.validityDays || 0),
            typeof o.notes === 'string' ? o.notes : '',
          ]
        );
      } catch (_) {}
    } catch (_) {
      cotizacionId = null;
    }
  }

  const groups = new Map();
  for (const it of items) {
    const key = `${it.nombre}__${Number(it.precio).toFixed(2)}`;
    if (!groups.has(key)) {
      groups.set(key, { nombre: it.nombre, precio: Number(it.precio), count: 1 });
    } else {
      groups.get(key).count += 1;
    }
  }
  const rows = Array.from(groups.values()).map((g) => [
    { text: String(g.count), alignment: 'center', style: 'tableCell' },
    { text: g.nombre, style: 'tableCell' },
    { text: `$${g.precio.toFixed(2)}`, alignment: 'right', style: 'tableCell' },
    { text: `$${(g.precio * g.count).toFixed(2)}`, alignment: 'right', style: 'tableCell' },
  ]);
  const subtotal = Array.from(groups.values()).reduce((acc, g) => acc + g.precio * g.count, 0);
  const IVA_RATE = 0.16;
  const ivaSelected = !!(data && data.iva);
  const discountRate = Number((data && data.discountRate) || 0);
  const validityDays = Number((data && data.validityDays) || 0);
  const issueDate = new Date();
  const issueStr = issueDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: 'numeric' });
  const expiryDate = validityDays > 0 ? new Date(issueDate.getTime() + validityDays * 24 * 60 * 60 * 1000) : null;
  const expiryStr = expiryDate ? expiryDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: 'numeric' }) : null;
  const discountAmount = Number((subtotal * discountRate).toFixed(2));
  const baseAfterDiscount = Number((subtotal - discountAmount).toFixed(2));
  const shippingAmountRaw = Number(((data && data.shippingAmount) || 0));
  const shippingAmount = Number.isNaN(shippingAmountRaw) ? 0 : Math.max(0, shippingAmountRaw);
  const basePlusShipping = Number((baseAfterDiscount + shippingAmount).toFixed(2));
  const ivaAmount = ivaSelected ? Number((basePlusShipping * IVA_RATE).toFixed(2)) : 0;
  const grandTotal = Number((basePlusShipping + ivaAmount).toFixed(2));

  const body = [
    [
      { text: 'Cant.', style: 'tableHeader' },
      { text: 'Producto', style: 'tableHeader' },
      { text: 'Precio Unit.', style: 'tableHeader' },
      { text: 'Subtotal', style: 'tableHeader' },
    ],
    ...rows,
  ];

  let bgImageData = null;
  try {
    const candidates = [];
    const tryDirs = [
      path.join(__dirname, '..', 'src', 'renderer', 'assets'),
      path.join(process.cwd(), 'src', 'renderer', 'assets'),
    ];
    for (const dir of tryDirs) {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            if (/cotiz/i.test(f) && /\.(jpg|jpeg|png)$/i.test(f)) {
              candidates.push(path.join(dir, f));
            }
          }
        }
      } catch (_) {}
    }
    const found = candidates[0];
    if (found) {
      const buf = fs.readFileSync(found);
      const mime = found.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      bgImageData = `data:${mime};base64,${buf.toString('base64')}`;
    }
  } catch (_) {}

  const docDefinition = {
    pageSize: 'LETTER',
    pageMargins: [50, 180, 36, 50],
    content: [
      {
        columns: [
          {
            stack: [
              { text: 'Cotización', style: 'header' },
              { text: `Tipo / folio: ${prefijo}`, fontSize: 9, color: '#444444', margin: [0, 2, 0, 0] },
            ],
            width: '*',
          },
          {
            stack: [
              { text: `${prefijo}-COT-${cotizacionId ?? 'N/A'}`, style: 'header', fontSize: '10', alignment: 'right' },
              { text: issueStr, alignment: 'right', fontSize: '10' },
            ],
            width: 'auto',
          },
        ],
      },
      {
        columns: [
          {
            stack: [
              { text: `${cliente.nombre || ''}`, style: 'ref', bold: false, marginBottom: 2 },
              { text: `${cliente.direccion || ''}`, style: 'ref', bold: false, marginBottom: 2 },
              { text: `${cliente.rfc || cliente.RFC || ''}`, bold: false, marginBottom: 2 },
              { text: `${cliente.email || cliente.correo || ''}`, bold: false },
            ],
            width: '*',
            fontSize: 11,
          },
          {
            text: (() => {
              if (validityDays > 0 && expiryStr) {
                return `Asesor: ${asesor}\nValido Al ${expiryStr}`;
              }
              return `Asesor: ${asesor}`;
            })(),
            alignment: 'right',
            fontSize: '11',
            bold: false,
            width: 'auto',
            style: 'ref',
          },
        ],
      },
      '\n',
      {
        table: {
          headerRows: 1,
          widths: [50, '*', 100, 100],
          body: [...body],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#cccccc',
          vLineColor: () => '#cccccc',
        },
      },
      { text: '', margin: [0, 10, 0, 0] },
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 'auto',
            stack: [
              { columns: [
                { text: 'Subt:', style: 'tableTotalsLabel', alignment: 'right' },
                { text: `$${subtotal.toFixed(2)}`, style: 'tableTotalsValue', alignment: 'right' },
              ], columnGap: 8 },
              ...(discountRate > 0 ? [
                { columns: [
                  { text: 'Desc.:', style: 'tableTotalsLabel', alignment: 'right' },
                  { text: `-$${discountAmount.toFixed(2)}`, style: 'tableTotalsValue', alignment: 'right' },
                ], columnGap: 8 },
                { columns: [
                  { text: 'Subt:', style: 'tableTotalsLabel', alignment: 'right' },
                  { text: `$${baseAfterDiscount.toFixed(2)}`, style: 'tableTotalsValue', alignment: 'right' },
                ], columnGap: 8 },
              ] : []),
              ...(shippingAmount > 0 ? [
                { columns: [
                  { text: 'Envío:', style: 'tableTotalsLabel', alignment: 'right' },
                  { text: `$${shippingAmount.toFixed(2)}`, style: 'tableTotalsValue', alignment: 'right' },
                ], columnGap: 8 },
              ] : []),
              ...(ivaSelected ? [
                { columns: [
                  { text: 'IVA:', style: 'tableTotalsLabel', alignment: 'right' },
                  { text: `$${ivaAmount.toFixed(2)}`, style: 'tableTotalsValue', alignment: 'right' },
                ], columnGap: 8 },
              ] : []),
              { columns: [
                { text: 'Total:', style: 'tableTotalsLabelBold', alignment: 'right' },
                { text: `$${grandTotal.toFixed(2)}`, style: 'tableTotalsValueBold', alignment: 'right' },
              ], columnGap: 8 },
            ],
          },
        ],
      },
    ],
    images: bgImageData ? { bgTemplate: bgImageData } : undefined,
    background: bgImageData
      ? (_currentPage, pageSize) => ({
          image: 'bgTemplate',
          width: pageSize.width,
          height: pageSize.height,
          absolutePosition: { x: 0, y: 0 },
        })
      : undefined,
    styles: {
      header: { fontSize: 13, bold: true },
      ref: { fontSize: 12, bold: true },
      tableHeader: { bold: true, alignment: 'center' },
      tableCell: { fontSize: 10 },
      tableTotalsLabel: { fontSize: 10, bold: false },
      tableTotalsValue: { fontSize: 10, bold: false },
      tableTotalsLabelBold: { fontSize: 10, bold: true },
      tableTotalsValueBold: { fontSize: 10, bold: true },
    },
    defaultStyle: { font: 'Helvetica' },
  };

  try {
    const notes = String((data && data.notes) || '').trim();
    if (notes) {
      docDefinition.styles.notesHeader = { fontSize: 12, bold: true };
      docDefinition.styles.notesText = { fontSize: 10 };
      docDefinition.content.push('\n', { text: 'Notas', style: 'notesHeader' }, { text: notes, style: 'notesText' });
    }
  } catch (_) {}

  const year = new Date().getFullYear();
  const refNumber = cotizacionId ? `${prefijo}-COT-${cotizacionId}` : `${prefijo}-COT-N/A`;
  const filename = `${refNumber}_${year}.pdf`;

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  const chunks = [];
  pdfDoc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
  });
  pdfDoc.end();
  const buffer = await done;

  return { buffer, cotizacionId, filename };
}

module.exports = { quotationPdfToBuffer };
