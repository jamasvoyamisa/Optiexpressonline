const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const { pool, rootEnvPath } = require('./db');
const { quotationPdfToBuffer } = require('./pdf-export');
const logger = require('../src/logger');

const router = express.Router();

/** Límite simple de intentos de login por IP (memoria; suficiente para un solo proceso) */
const loginRate = new Map();
function rateLimitLogin(req, res, next) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
  const now = Date.now();
  const win = 60_000;
  const max = 25;
  let rec = loginRate.get(ip);
  if (!rec || now - rec.t > win) {
    rec = { t: now, n: 0 };
  }
  rec.n += 1;
  loginRate.set(ip, rec);
  if (rec.n > max) {
    return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera un minuto.' });
  }
  next();
}

function sanitizeText(s, max) {
  if (s == null) return '';
  const t = String(s).replace(/\u0000/g, '');
  return t.length > max ? t.slice(0, max) : t;
}

const TABLES = {
  equipos: 'equipos',
  lentes_contacto: 'lentes_contacto',
  insumos: 'insumos',
  accesorios: 'accesorios',
  soluciones_lc: 'soluciones_lc',
};

function mapCategoryToTable(category) {
  return TABLES[category];
}

function getSessionUser(req) {
  return req.session && req.session.user ? req.session.user : null;
}

/** Sesión válida solo con usuario de BD (id) o fallback admin explícito; evita objetos corruptos/vacíos. */
function sessionUserOk(u) {
  if (!u || typeof u !== 'object') return false;
  const un = String(u.username ?? '').trim();
  if (!un) return false;
  if (u.id != null && Number.isFinite(Number(u.id))) return true;
  if (un === 'admin' && String(u.role) === 'admin') return true;
  return false;
}

function getQuotation(req) {
  if (!req.session.quotation) {
    req.session.quotation = { cliente: null, asesor: null, items: [], options: {} };
  }
  return req.session.quotation;
}

function requireAuth(req, res, next) {
  const u = getSessionUser(req);
  if (!sessionUserOk(u)) {
    res.set('Cache-Control', 'no-store, private');
    return res.status(401).json({ error: 'No autenticado' });
  }
  next();
}

function requireAdmin(req, res, next) {
  const u = getSessionUser(req);
  if (!sessionUserOk(u) || String(u.role) !== 'admin') {
    res.set('Cache-Control', 'no-store, private');
    return res.status(403).json({ error: 'No autorizado' });
  }
  next();
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha512').update(salt + String(password)).digest('hex');
  return { salt, hash };
}

/** Prefijo alfanumérico para folio (DEA-COT-123); define el “tipo” de cotización por departamento */
function normalizePrefijoDepartamento(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s ? s.slice(0, 12) : 'DEA';
}

let schemaDepartamentoPromise = null;
function ensureDepartamentoSchema() {
  if (!schemaDepartamentoPromise) {
    schemaDepartamentoPromise = (async () => {
      try {
        await pool.query("ALTER TABLE usuarios ADD COLUMN departamento VARCHAR(32) NOT NULL DEFAULT 'DEA'");
      } catch (e) {
        if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('[cotizaciones] usuarios.departamento:', e.message);
      }
      try {
        await pool.query("ALTER TABLE cotizaciones ADD COLUMN prefijo_cotizacion VARCHAR(16) NOT NULL DEFAULT 'DEA'");
      } catch (e) {
        if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('[cotizaciones] cotizaciones.prefijo_cotizacion:', e.message);
      }
    })();
  }
  return schemaDepartamentoPromise;
}

async function hasUsuariosTable() {
  try {
    const [rows] = await pool.query(
      `SELECT 1 AS ok FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'usuarios' LIMIT 1`
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (_) {
    return false;
  }
}

/** Nueva sesión tras login (mitiga fijación de sesión). */
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

// --- Auth ---
router.post('/auth/login', rateLimitLogin, express.json({ limit: '32kb' }), asyncHandler(async (req, res) => {
  const identifier = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!identifier || !password) {
    return res.json({ ok: false, error: 'Usuario y contraseña requeridos' });
  }

  try {
    await pool.query('SELECT 1');
  } catch (e) {
    const err = e;
    if (err && (err.code === 'ER_ACCESS_DENIED_ERROR' || err.errno === 1045)) {
      return res.json({
        ok: false,
        error: 'No se pudo conectar a MySQL (usuario/contraseña o permisos). Revisa MYSQL_* en el .env del servidor.',
      });
    }
    return res.json({
      ok: false,
      error: `Error de base de datos: ${err && err.message ? err.message : 'desconocido'}`,
    });
  }

  const hasUsuarios = await hasUsuariosTable();

  if (hasUsuarios) {
    await ensureDepartamentoSchema();
    const [rows] = await pool.query(
      'SELECT id, username, nombre, role, password_salt, password_hash, COALESCE(departamento, \'DEA\') AS departamento FROM usuarios WHERE username = ? LIMIT 1',
      [identifier]
    );
    const u = rows && rows[0];
    if (!u) return res.json({ ok: false, error: 'Credenciales inválidas' });
    const salt = String(u.password_salt || '');
    const expected = String(u.password_hash || '').toLowerCase();
    const candidate = crypto.createHash('sha512').update(salt + password).digest('hex');
    if (candidate.toLowerCase() !== expected) {
      return res.json({ ok: false, error: 'Credenciales inválidas' });
    }
    try {
      await regenerateSession(req);
    } catch (e) {
      console.error('[cotizaciones] regenerateSession:', e?.message || e);
      return res.status(500).json({ ok: false, error: 'No se pudo iniciar sesión. Intenta de nuevo.' });
    }
    const dep = normalizePrefijoDepartamento(u.departamento);
    req.session.user = { id: u.id, username: u.username, role: u.role || 'user', name: u.nombre || u.username, departamento: dep };
    try { loginRate.delete(String(req.ip || req.socket?.remoteAddress || 'unknown')); } catch (_) {}
    try { logger.log('connection', 'auth', 'Login exitoso', { id: req.session.user.id, username: req.session.user.username, role: req.session.user.role }); } catch (_) {}
    res.set('Cache-Control', 'no-store, private');
    return res.json({ ok: true, user: req.session.user });
  }

  const allowFallback = String(process.env.ALLOW_ADMIN_FALLBACK || '').toLowerCase() === 'true';
  if (allowFallback && identifier === 'admin' && password === 'admin') {
    try {
      await regenerateSession(req);
    } catch (e) {
      console.error('[cotizaciones] regenerateSession (fallback):', e?.message || e);
      return res.status(500).json({ ok: false, error: 'No se pudo iniciar sesión. Intenta de nuevo.' });
    }
    req.session.user = { username: 'admin', role: 'admin', departamento: 'DEA' };
    try { logger.log('connection', 'auth', 'Login exitoso (fallback)', { username: 'admin', role: 'admin' }); } catch (_) {}
    res.set('Cache-Control', 'no-store, private');
    return res.json({ ok: true, user: req.session.user });
  }

  if (!hasUsuarios) {
    return res.json({
      ok: false,
      error:
        'No existe la tabla usuarios en esta base de datos. Crea el esquema o ejecuta scripts/create_admin.js en la base correcta.',
    });
  }
  return res.json({ ok: false, error: 'Credenciales inválidas' });
}));

router.post('/auth/logout', asyncHandler(async (req, res) => {
  try {
    const s = req.session.user;
    if (s && (s.username || s.id)) {
      try { logger.log('connection', 'auth', 'Logout', { id: s.id || null, username: s.username || null }); } catch (_) {}
    }
  } catch (_) {}
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    res.set('Cache-Control', 'no-store, private');
    res.json({ ok: true });
  });
}));

router.get('/auth/session', (req, res) => {
  res.set('Cache-Control', 'no-store, private');
  const u = getSessionUser(req);
  if (sessionUserOk(u)) {
    return res.json({ ok: true, user: u });
  }
  return res.json({ ok: false });
});

// --- Products ---
router.get('/products/:category', requireAuth, asyncHandler(async (req, res) => {
  const { category } = req.params;
  const search = req.query.search || req.query.q || '';
  const table = mapCategoryToTable(category);
  if (!table) return res.json([]);
  const q = search ? `%${search}%` : '%';
  const sql = `
    SELECT p.id, p.nombre, p.precio, i.mime AS imagen_mime, i.data AS imagen_data
    FROM ${table} p
    LEFT JOIN imagenes i ON i.id = p.image_id
    WHERE p.nombre LIKE ?
    ORDER BY p.nombre ASC
    LIMIT 100`;
  const [rows] = await pool.execute(sql, [q]);
  const withImages = rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    precio: r.precio,
    imagen: r.imagen_data ? `data:${r.imagen_mime};base64,${Buffer.from(r.imagen_data).toString('base64')}` : null,
  }));
  res.json(withImages);
}));

router.post('/products/:category', requireAuth, requireAdmin, express.json({ limit: '50mb' }), asyncHandler(async (req, res) => {
  const { category } = req.params;
  const product = req.body;
  const table = mapCategoryToTable(category);
  if (!table) throw new Error('Categoría inválida');

  const allowedImgMime = /^(image\/jpeg|image\/png|image\/gif|image\/webp)$/i;
  let imageId = null;
  if (product.imagen && typeof product.imagen === 'string' && product.imagen.startsWith('data:')) {
    const match = product.imagen.match(/^data:(.+);base64,(.+)$/);
    if (match) {
      const [, mime, base64] = match;
      if (!allowedImgMime.test(String(mime || '').trim())) {
        throw new Error('Tipo de imagen no permitido (use JPEG, PNG, GIF o WebP)');
      }
      const buf = Buffer.from(base64, 'base64');
      const [imageRes] = await pool.execute('INSERT INTO imagenes (mime, data) VALUES (?, ?)', [mime, buf]);
      imageId = imageRes.insertId;
    }
  }

  const nombre = sanitizeText(product.nombre, 500);
  const precio = Number(product.precio);
  if (!nombre || Number.isNaN(precio) || precio < 0) throw new Error('Nombre y precio válidos requeridos');

  const sql = imageId
    ? `INSERT INTO ${table} (nombre, precio, image_id) VALUES (?, ?, ?)`
    : `INSERT INTO ${table} (nombre, precio) VALUES (?, ?)`;
  const params = imageId ? [nombre, precio, imageId] : [nombre, precio];
  const [result] = await pool.execute(sql, params);
  res.json({ id: result.insertId, nombre, precio, image_id: imageId });
}));

router.put('/products/:category/:id', requireAuth, requireAdmin, express.json({ limit: '50mb' }), asyncHandler(async (req, res) => {
  const { category, id } = req.params;
  const product = req.body;
  const table = mapCategoryToTable(category);
  if (!table) throw new Error('Categoría inválida');
  const pid = Number(id);
  if (!product || !pid) throw new Error('ID de producto requerido');

  const nombre = sanitizeText(product.nombre, 500);
  const precio = Number(product.precio);
  if (!nombre || Number.isNaN(precio) || precio < 0) throw new Error('Nombre y precio válidos requeridos');

  const allowedImgMime = /^(image\/jpeg|image\/png|image\/gif|image\/webp)$/i;

  let oldImageId = null;
  try {
    const [rows] = await pool.query(`SELECT image_id FROM ${table} WHERE id = ?`, [pid]);
    oldImageId = rows && rows[0] ? rows[0].image_id : null;
  } catch (_) {}

  if (product.imagen === null) {
    await pool.execute(`UPDATE ${table} SET nombre = ?, precio = ?, image_id = NULL WHERE id = ?`, [nombre, precio, pid]);
    if (oldImageId) {
      try { await pool.execute('DELETE FROM imagenes WHERE id = ?', [oldImageId]); } catch (_) {}
    }
    return res.json({ id: pid, nombre, precio, image_id: null });
  }

  if (product.imagen && typeof product.imagen === 'string' && product.imagen.startsWith('data:')) {
    const match = product.imagen.match(/^data:(.+);base64,(.+)$/);
    if (match) {
      const [, mime, base64] = match;
      if (!allowedImgMime.test(String(mime || '').trim())) {
        throw new Error('Tipo de imagen no permitido (use JPEG, PNG, GIF o WebP)');
      }
      const buf = Buffer.from(base64, 'base64');
      const [imageRes] = await pool.execute('INSERT INTO imagenes (mime, data) VALUES (?, ?)', [mime, buf]);
      const imageId = imageRes.insertId;
      await pool.execute(`UPDATE ${table} SET nombre = ?, precio = ?, image_id = ? WHERE id = ?`, [nombre, precio, imageId, pid]);
      if (oldImageId) {
        try { await pool.execute('DELETE FROM imagenes WHERE id = ?', [oldImageId]); } catch (_) {}
      }
      return res.json({ id: pid, nombre, precio, image_id: imageId });
    }
  }

  await pool.execute(`UPDATE ${table} SET nombre = ?, precio = ? WHERE id = ?`, [nombre, precio, pid]);
  res.json({ id: pid, nombre, precio });
}));

router.delete('/products/:category/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { category, id } = req.params;
  const table = mapCategoryToTable(category);
  if (!table) return res.json({ ok: false, error: 'Categoría inválida' });
  const pid = Number(id);
  if (!pid) return res.json({ ok: false, error: 'ID de producto requerido' });
  try {
    let oldImageId = null;
    try {
      const [rows] = await pool.query(`SELECT image_id FROM ${table} WHERE id = ?`, [pid]);
      oldImageId = rows && rows[0] ? rows[0].image_id : null;
    } catch (_) {}
    const [r] = await pool.execute(`DELETE FROM ${table} WHERE id = ?`, [pid]);
    const ok = !!r && Number(r.affectedRows || 0) > 0;
    if (ok && oldImageId) {
      try { await pool.execute('DELETE FROM imagenes WHERE id = ?', [oldImageId]); } catch (_) {}
    }
    return res.json({ ok });
  } catch (err) {
    return res.json({ ok: false, error: err?.message || 'Error al eliminar' });
  }
}));

// --- Clients ---
router.get('/clients/search', requireAuth, asyncHandler(async (req, res) => {
  const query = req.query.q || '';
  const q = query ? `%${query}%` : '%';
  const sql = `SELECT id, nombre, RFC AS rfc, telefono, email FROM clientes WHERE nombre LIKE ? OR RFC LIKE ? ORDER BY nombre ASC LIMIT 100`;
  const [rows] = await pool.execute(sql, [q, q]);
  res.json(rows);
}));

router.post('/clients', requireAuth, requireAdmin, express.json(), asyncHandler(async (req, res) => {
  const client = req.body;
  const sql = `INSERT INTO clientes (nombre, RFC, telefono, email, direccion) VALUES (?, ?, ?, ?, ?)`;
  const [result] = await pool.execute(sql, [
    sanitizeText(client.nombre, 255),
    sanitizeText(client.rfc, 100) || null,
    sanitizeText(client.telefono, 100) || null,
    sanitizeText(client.email, 255) || null,
    sanitizeText(client.direccion, 500) || null,
  ]);
  res.json({ id: result.insertId, nombre: sanitizeText(client.nombre, 255) });
}));

router.put('/clients/:id', requireAuth, requireAdmin, express.json(), asyncHandler(async (req, res) => {
  const client = { ...req.body, id: Number(req.params.id) };
  if (!client.id) return res.json({ affected: 0, error: 'ID de cliente requerido' });
  const sql = `UPDATE clientes SET nombre = ?, RFC = ?, telefono = ?, email = ?, direccion = ? WHERE id = ?`;
  const params = [
    sanitizeText(client.nombre, 255),
    sanitizeText(client.rfc, 100) || null,
    sanitizeText(client.telefono, 100) || null,
    sanitizeText(client.email, 255) || null,
    sanitizeText(client.direccion, 500) || null,
    client.id,
  ];
  const [result] = await pool.execute(sql, params);
  res.json({ affected: result.affectedRows || 0 });
}));

router.delete('/clients/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.json({ ok: false, error: 'ID inválido' });
  try {
    const [r] = await pool.execute('DELETE FROM clientes WHERE id = ?', [id]);
    const ok = !!r && Number(r.affectedRows || 0) > 0;
    return res.json({ ok });
  } catch (err) {
    return res.json({ ok: false, error: err?.message || 'Error al eliminar' });
  }
}));

// --- Quotation (session) ---
router.post('/quotation/add-item', requireAuth, express.json({ limit: '512kb' }), (req, res) => {
  const st = getQuotation(req);
  const b = req.body && typeof req.body === 'object' ? { ...req.body } : {};
  if (b.nombre != null) b.nombre = sanitizeText(b.nombre, 500);
  st.items.push(b);
  res.json(st);
});

router.post('/quotation/remove-item', requireAuth, express.json(), (req, res) => {
  const st = getQuotation(req);
  const index = Number(req.body.index);
  st.items.splice(index, 1);
  res.json(st);
});

router.post('/quotation/set-client', requireAuth, express.json(), (req, res) => {
  const st = getQuotation(req);
  st.cliente = req.body;
  res.json(st);
});

router.post('/quotation/set-asesor', requireAuth, express.json({ limit: '16kb' }), (req, res) => {
  const st = getQuotation(req);
  const raw = typeof req.body === 'string' ? req.body : (req.body?.asesor || '');
  st.asesor = sanitizeText(raw, 200);
  res.json(st);
});

router.post('/quotation/set-options', requireAuth, express.json({ limit: '64kb' }), (req, res) => {
  const st = getQuotation(req);
  try {
    const o = req.body || {};
    st.options = {
      iva: !!o.iva,
      discountRate: Number(o.discountRate || 0),
      shippingAmount: Number(o.shippingAmount || 0),
      validityDays: Number(o.validityDays || 0),
      notes: sanitizeText(typeof o.notes === 'string' ? o.notes : '', 5000),
    };
  } catch (_) {
    st.options = {};
  }
  res.json(st);
});

router.get('/quotation', requireAuth, (req, res) => {
  res.json(getQuotation(req));
});

router.post('/quotation/reset', requireAuth, (req, res) => {
  const st = getQuotation(req);
  st.cliente = null;
  st.items = [];
  st.options = {};
  res.json(st);
});

router.get('/quotation/next-id', requireAuth, asyncHandler(async (req, res) => {
  try {
    await ensureDepartamentoSchema();
    const session = getSessionUser(req);
    const prefijoCotizacion = normalizePrefijoDepartamento(session?.departamento);
    const [rows] = await pool.execute('SELECT IFNULL(MAX(id), 0) + 1 AS nextId FROM cotizaciones');
    const nextId = rows && rows[0] ? rows[0].nextId : null;
    return res.json({ nextId, prefijoCotizacion });
  } catch (_) {
    return res.json({ nextId: null, prefijoCotizacion: 'DEA' });
  }
}));

router.post('/quotation/finalize', requireAuth, express.json(), asyncHandler(async (req, res) => {
  await ensureDepartamentoSchema();
  const st = getQuotation(req);
  const session = getSessionUser(req);
  const prefijoCotizacion = normalizePrefijoDepartamento(session?.departamento);
  const data = req.body || {};
  try {
    const o = data;
    st.options = {
      iva: !!o.iva,
      discountRate: Number(o.discountRate || 0),
      shippingAmount: Number(o.shippingAmount || 0),
      validityDays: Number(o.validityDays || 0),
      notes: sanitizeText(typeof o.notes === 'string' ? o.notes : '', 5000),
    };
  } catch (_) {}

  const total = st.items.reduce((acc, it) => acc + Number(it.precio || 0), 0);
  const userId = session?.id || null;
  const sql = `INSERT INTO cotizaciones (fecha, cliente_id, asesor, total, user_id, prefijo_cotizacion) VALUES (NOW(), ?, ?, ?, ?, ?)`;
  const clienteId = st.cliente?.id || null;
  let asesor = st.asesor ? sanitizeText(st.asesor, 200) : null;
  if (!asesor && session) {
    asesor = sanitizeText(String(session.name || session.username || ''), 200) || null;
  }
  const [result] = await pool.execute(sql, [clienteId, asesor, total, userId, prefijoCotizacion]);
  const cotizacionId = result.insertId;

  try {
    for (const it of st.items) {
      const precioLine = Number(it.precio);
      await pool.execute(
        'INSERT INTO cotizacion_detalles (cotizacion_id, nombre, precio) VALUES (?, ?, ?)',
        [cotizacionId, sanitizeText(it.nombre, 500), Number.isFinite(precioLine) ? precioLine : 0]
      );
    }
  } catch (_) {}

  try {
    await pool.execute(
      'CREATE TABLE IF NOT EXISTS cotizacion_opciones (\n        id INT AUTO_INCREMENT PRIMARY KEY,\n        cotizacion_id INT NOT NULL,\n        iva TINYINT(1) NOT NULL DEFAULT 0,\n        discount_rate DECIMAL(5,4) NOT NULL DEFAULT 0,\n        shipping_amount DECIMAL(12,2) NOT NULL DEFAULT 0,\n        validity_days INT NOT NULL DEFAULT 0,\n        notes TEXT,\n        FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE\n      )'
    );
    const o = st.options || {};
    await pool.execute(
      'INSERT INTO cotizacion_opciones (cotizacion_id, iva, discount_rate, shipping_amount, validity_days, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [
        cotizacionId,
        o.iva ? 1 : 0,
        Number(o.discountRate || 0),
        Number(o.shippingAmount || 0),
        Number(o.validityDays || 0),
        sanitizeText(typeof o.notes === 'string' ? o.notes : '', 5000),
      ]
    );
  } catch (_) {}

  try {
    logger.log('connection', 'cotizaciones', 'Cotización creada', {
      id: cotizacionId,
      total,
      userId: session?.id || null,
      username: session?.username || null,
      clienteId,
      asesor: st.asesor || null,
      items: st.items.length,
    });
  } catch (_) {}

  st.items = [];
  res.json({ id: cotizacionId, total, prefijoCotizacion });
}));

router.post('/quotation/export-pdf', requireAuth, express.json({ limit: '10mb' }), asyncHandler(async (req, res) => {
  await ensureDepartamentoSchema();
  const data = req.body;
  const session = getSessionUser(req);
  const { buffer, cotizacionId, filename } = await quotationPdfToBuffer({ pool, session, data });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
  if (cotizacionId) res.setHeader('X-Cotizacion-Id', String(cotizacionId));
  res.send(buffer);
}));

// --- Cotizaciones list ---
router.get('/cotizaciones', requireAuth, asyncHandler(async (req, res) => {
  const session = getSessionUser(req);
  if (!session || !session.id) {
    return res.json([]);
  }
  let sql; let params;
  await ensureDepartamentoSchema();
  if (session.role === 'admin') {
    sql = `
      SELECT c.id, c.fecha, c.total, c.asesor, COALESCE(c.prefijo_cotizacion, 'DEA') AS prefijo_cotizacion, cl.nombre AS cliente
      FROM cotizaciones c
      LEFT JOIN clientes cl ON cl.id = c.cliente_id
      ORDER BY c.fecha DESC
      LIMIT 200`;
    params = [];
  } else {
    sql = `
      SELECT c.id, c.fecha, c.total, c.asesor, COALESCE(c.prefijo_cotizacion, 'DEA') AS prefijo_cotizacion, cl.nombre AS cliente
      FROM cotizaciones c
      LEFT JOIN clientes cl ON cl.id = c.cliente_id
      WHERE c.user_id = ?
      ORDER BY c.fecha DESC
      LIMIT 200`;
    params = [session.id];
  }
  const [rows] = await pool.execute(sql, params);
  res.json(rows);
}));

router.get('/cotizaciones/:id', requireAuth, asyncHandler(async (req, res) => {
  const session = getSessionUser(req);
  const id = Number(req.params.id);
  if (!session || !session.id) return res.json(null);

  let sql; let params;
  await ensureDepartamentoSchema();
  if (session.role === 'admin') {
    sql = `SELECT c.id, c.fecha, c.total, c.asesor, COALESCE(c.prefijo_cotizacion, 'DEA') AS prefijo_cotizacion,
                   cl.id AS cliente_id, cl.nombre AS cliente_nombre, cl.RFC AS cliente_rfc
           FROM cotizaciones c
           LEFT JOIN clientes cl ON cl.id = c.cliente_id
           WHERE c.id = ?
           LIMIT 1`;
    params = [id];
  } else {
    sql = `SELECT c.id, c.fecha, c.total, c.asesor, COALESCE(c.prefijo_cotizacion, 'DEA') AS prefijo_cotizacion,
                   cl.id AS cliente_id, cl.nombre AS cliente_nombre, cl.RFC AS cliente_rfc
           FROM cotizaciones c
           LEFT JOIN clientes cl ON cl.id = c.cliente_id
           WHERE c.id = ? AND c.user_id = ?
           LIMIT 1`;
    params = [id, session.id];
  }

  const [rows] = await pool.execute(sql, params);
  const cot = rows && rows[0] ? rows[0] : null;
  if (!cot) return res.json(null);

  let items = [];
  try {
    const [detRows] = await pool.execute(
      'SELECT nombre, precio FROM cotizacion_detalles WHERE cotizacion_id = ?',
      [cot.id]
    );
    items = detRows || [];
  } catch (_) {}

  let options = {};
  try {
    const [optRows] = await pool.execute(
      'SELECT iva, discount_rate, shipping_amount, validity_days, notes FROM cotizacion_opciones WHERE cotizacion_id = ? LIMIT 1',
      [cot.id]
    );
    const opt = optRows && optRows[0] ? optRows[0] : null;
    if (opt) {
      options = {
        iva: !!opt.iva,
        discountRate: Number(opt.discount_rate || 0),
        shippingAmount: Number(opt.shipping_amount || 0),
        validityDays: Number(opt.validity_days || 0),
        notes: opt.notes || '',
      };
    }
  } catch (_) {}

  const cliente = cot.cliente_id ? { id: cot.cliente_id, nombre: cot.cliente_nombre, RFC: cot.cliente_rfc } : null;

  res.json({
    id: cot.id,
    fecha: cot.fecha,
    total: cot.total,
    asesor: cot.asesor,
    prefijo_cotizacion: cot.prefijo_cotizacion || 'DEA',
    cliente,
    items,
    options,
  });
}));

router.delete('/cotizaciones/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const session = getSessionUser(req);
  const id = Number(req.params.id);
  if (!id) return res.json({ ok: false, error: 'ID inválido' });
  if (!session || !session.id) {
    return res.json({ ok: false, error: 'Sin sesión activa' });
  }
  try {
    let checkSql; let checkParams;
    if (session.role === 'admin') {
      checkSql = 'SELECT id FROM cotizaciones WHERE id = ?';
      checkParams = [id];
    } else {
      checkSql = 'SELECT id FROM cotizaciones WHERE id = ? AND user_id = ?';
      checkParams = [id, session.id];
    }
    const [checkRows] = await pool.execute(checkSql, checkParams);
    if (!checkRows || checkRows.length === 0) {
      return res.json({ ok: false, error: 'Cotización no encontrada o sin permisos' });
    }
    try {
      await pool.execute('DELETE FROM cotizacion_detalles WHERE cotizacion_id = ?', [id]);
    } catch (_) {}
    const [r] = await pool.execute('DELETE FROM cotizaciones WHERE id = ?', [id]);
    const ok = !!r && Number(r.affectedRows || 0) > 0;
    return res.json({ ok });
  } catch (err) {
    return res.json({ ok: false, error: err?.message || 'Error al eliminar' });
  }
}));

// --- Import ---
router.post('/import/products', requireAuth, requireAdmin, express.json(), asyncHandler(async (req, res) => {
  const { category, items } = req.body;
  const table = mapCategoryToTable(category);
  if (!table) return res.json({ inserted: 0, error: 'Categoría inválida' });
  if (!Array.isArray(items) || items.length === 0) return res.json({ inserted: 0 });
  const cleaned = items
    .map((it) => ({ nombre: String(it.nombre || '').trim(), precio: Number(it.precio || 0) }))
    .filter((it) => it.nombre && !Number.isNaN(it.precio));
  if (cleaned.length === 0) return res.json({ inserted: 0 });
  const chunkSize = 100;
  let totalInserted = 0;
  for (let i = 0; i < cleaned.length; i += chunkSize) {
    const chunk = cleaned.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '(?, ?)').join(', ');
    const values = [];
    chunk.forEach((it) => { values.push(it.nombre, it.precio); });
    const sql = `INSERT INTO ${table} (nombre, precio) VALUES ${placeholders}`;
    const [result] = await pool.query(sql, values);
    totalInserted += result.affectedRows || 0;
  }
  res.json({ inserted: totalInserted });
}));

router.post('/import/products-xlsx/:category', requireAuth, requireAdmin, express.raw({ type: '*/*', limit: '30mb' }), asyncHandler(async (req, res) => {
  const { category } = req.params;
  const table = mapCategoryToTable(category);
  if (!table) return res.json({ inserted: 0, error: 'Categoría inválida' });
  try {
    const buf = Buffer.from(req.body);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!Array.isArray(rows) || rows.length === 0) return res.json({ inserted: 0 });

    let start = 0;
    const first = rows[0] || [];
    const hasHeader = /nombre/i.test(String(first[0] || '')) || /precio/i.test(String(first[1] || ''));
    if (hasHeader) start = 1;

    const cleaned = [];
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 2) continue;
      const nombre = String(r[0] || '').trim();
      let precioStr = String(r[1] || '').trim().replace(',', '.');
      const precio = parseFloat(precioStr);
      if (!nombre || Number.isNaN(precio)) continue;
      cleaned.push({ nombre, precio });
    }

    if (cleaned.length === 0) return res.json({ inserted: 0 });

    const chunkSize = 100;
    let totalInserted = 0;
    for (let i = 0; i < cleaned.length; i += chunkSize) {
      const chunk = cleaned.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '(?, ?)').join(', ');
      const values = [];
      chunk.forEach((it) => { values.push(it.nombre, it.precio); });
      const sql = `INSERT INTO ${table} (nombre, precio) VALUES ${placeholders}`;
      const [result] = await pool.query(sql, values);
      totalInserted += result.affectedRows || 0;
    }

    return res.json({ inserted: totalInserted });
  } catch (err) {
    return res.json({ inserted: 0, error: String(err && err.message || err) });
  }
}));

router.post('/import/clientes', requireAuth, requireAdmin, express.json(), asyncHandler(async (req, res) => {
  const { items } = req.body;
  try {
    if (!Array.isArray(items) || items.length === 0) return res.json({ inserted: 0 });
    const clamp = (s, n) => String(s || '').trim().slice(0, n);
    const cleaned = items
      .map((it) => ({
        nombre: clamp(it.nombre, 255),
        rfc: clamp(it.rfc, 100),
        telefono: clamp(it.telefono, 100),
        email: clamp(it.email, 255),
        direccion: clamp(it.direccion, 255),
      }))
      .filter((it) => it.nombre.length > 0);

    if (cleaned.length === 0) return res.json({ inserted: 0 });

    const chunkSize = 100;
    let totalInserted = 0;
    for (let i = 0; i < cleaned.length; i += chunkSize) {
      const chunk = cleaned.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const values = [];
      chunk.forEach((it) => {
        values.push(it.nombre, it.rfc || null, it.telefono || null, it.email || null, it.direccion || null);
      });
      const sql = `INSERT INTO clientes (nombre, RFC, telefono, email, direccion) VALUES ${placeholders}`;
      const [result] = await pool.query(sql, values);
      totalInserted += result.affectedRows || 0;
    }

    return res.json({ inserted: totalInserted });
  } catch (err) {
    return res.json({ inserted: 0, error: String(err && err.message || err) });
  }
}));

router.post('/import/clientes-xlsx', requireAuth, requireAdmin, express.raw({ type: '*/*', limit: '30mb' }), asyncHandler(async (req, res) => {
  try {
    const buf = Buffer.from(req.body);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!Array.isArray(rows) || rows.length === 0) return res.json({ inserted: 0 });

    let start = 0;
    const first = rows[0] || [];
    const hasHeader = /nombre/i.test(String(first[0] || '')) || /rfc/i.test(String(first[1] || ''));
    if (hasHeader) start = 1;

    const clamp = (s, n) => String(s || '').trim().slice(0, n);
    const cleaned = [];
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 1) continue;
      cleaned.push({
        nombre: clamp(r[0], 255),
        rfc: clamp(r[1], 100),
        telefono: clamp(r[2], 100),
        email: clamp(r[3], 255),
        direccion: clamp(r[4], 255),
      });
    }

    const filtered = cleaned.filter((it) => it.nombre.length > 0);
    if (filtered.length === 0) return res.json({ inserted: 0 });

    const chunkSize = 100;
    let totalInserted = 0;
    for (let i = 0; i < filtered.length; i += chunkSize) {
      const chunk = filtered.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const values = [];
      chunk.forEach((it) => {
        values.push(it.nombre, it.rfc || null, it.telefono || null, it.email || null, it.direccion || null);
      });
      const sql = `INSERT INTO clientes (nombre, RFC, telefono, email, direccion) VALUES ${placeholders}`;
      const [result] = await pool.query(sql, values);
      totalInserted += result.affectedRows || 0;
    }

    return res.json({ inserted: totalInserted });
  } catch (err) {
    return res.json({ inserted: 0, error: String(err && err.message || err) });
  }
}));

// --- Users ---
router.get('/users', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  try {
    if (!(await hasUsuariosTable())) return res.json([]);
    await ensureDepartamentoSchema();
    const q = String(req.query.q || '').trim();
    if (q) {
      const [rows] = await pool.query(
        'SELECT id, username, nombre, email, role, COALESCE(departamento, \'DEA\') AS departamento, created_at, updated_at FROM usuarios WHERE username LIKE ? OR nombre LIKE ? ORDER BY username ASC LIMIT 200',
        [`%${q}%`, `%${q}%`]
      );
      return res.json(rows);
    }
    const [rows] = await pool.query(
      'SELECT id, username, nombre, email, role, COALESCE(departamento, \'DEA\') AS departamento, created_at, updated_at FROM usuarios ORDER BY username ASC LIMIT 200'
    );
    return res.json(rows);
  } catch (_) {
    return res.json([]);
  }
}));

router.post('/users', requireAuth, requireAdmin, express.json(), asyncHandler(async (req, res) => {
  const u = req.body;
  try {
    if (!(await hasUsuariosTable())) return res.json({ ok: false, error: 'Sistema sin módulo de usuarios' });
    await ensureDepartamentoSchema();
    const username = String(u?.username || '').trim();
    const password = String(u?.password || '');
    const role = String(u?.role || 'user').toLowerCase();
    const nombre = u?.nombre ? String(u.nombre).trim() : null;
    const email = u?.email ? String(u.email).trim() : null;
    const departamento = normalizePrefijoDepartamento(u?.departamento);

    if (!username) return res.json({ ok: false, error: 'Usuario requerido' });
    if (!password) return res.json({ ok: false, error: 'Contraseña requerida' });
    if (!['user', 'admin'].includes(role)) return res.json({ ok: false, error: 'Rol inválido' });

    const { salt, hash } = hashPassword(password);
    const [r] = await pool.query(
      'INSERT INTO usuarios (username, nombre, email, role, departamento, password_salt, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [username, nombre, email, role, departamento, salt, hash]
    );
    try { logger.log('connection', 'users', 'Usuario creado', { by: getSessionUser(req)?.username || null, target: username, id: r?.insertId }); } catch (_) {}
    return res.json({ ok: true, id: r?.insertId });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') return res.json({ ok: false, error: 'El nombre de usuario ya existe' });
    return res.json({ ok: false, error: err?.message || 'Error al crear usuario' });
  }
}));

router.put('/users/:id', requireAuth, requireAdmin, express.json(), asyncHandler(async (req, res) => {
  const u = { ...req.body, id: Number(req.params.id) };
  try {
    if (!(await hasUsuariosTable())) return res.json({ ok: false, error: 'Sistema sin módulo de usuarios' });
    await ensureDepartamentoSchema();
    const id = Number(u?.id || 0);
    const username = String(u?.username || '').trim();
    const role = String(u?.role || 'user').toLowerCase();
    const nombre = u?.nombre ? String(u.nombre).trim() : null;
    const email = u?.email ? String(u.email).trim() : null;
    const password = String(u?.password || '');
    const departamento = normalizePrefijoDepartamento(u?.departamento);

    if (!id) return res.json({ ok: false, error: 'ID requerido' });
    if (!username) return res.json({ ok: false, error: 'Usuario requerido' });
    if (!['user', 'admin'].includes(role)) return res.json({ ok: false, error: 'Rol inválido' });

    const fields = ['username = ?', 'role = ?', 'departamento = ?'];
    const params = [username, role, departamento];

    if (nombre !== null) { fields.push('nombre = ?'); params.push(nombre); }
    if (email !== null) { fields.push('email = ?'); params.push(email); }

    if (password) {
      const { salt, hash } = hashPassword(password);
      fields.push('password_salt = ?', 'password_hash = ?');
      params.push(salt, hash);
    }

    params.push(id);
    const sql = `UPDATE usuarios SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`;
    const [r] = await pool.query(sql, params);
    try { logger.log('connection', 'users', 'Usuario actualizado', { by: getSessionUser(req)?.username || null, id }); } catch (_) {}
    return res.json({ ok: true, affected: r?.affectedRows || 0 });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') return res.json({ ok: false, error: 'El nombre de usuario ya existe' });
    return res.json({ ok: false, error: err?.message || 'Error al actualizar usuario' });
  }
}));

router.delete('/users/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  try {
    if (!(await hasUsuariosTable())) return res.json({ ok: false, error: 'Sistema sin módulo de usuarios' });
    const userId = Number(req.params.id || 0);
    if (!userId) return res.json({ ok: false, error: 'ID inválido' });
    const session = getSessionUser(req);
    if (session?.id && session.id === userId) {
      return res.json({ ok: false, error: 'No puedes eliminar tu propio usuario' });
    }
    const [r] = await pool.query('DELETE FROM usuarios WHERE id = ?', [userId]);
    try { logger.log('connection', 'users', 'Usuario eliminado', { by: session?.username || null, id: userId }); } catch (_) {}
    return res.json({ ok: true, affected: r?.affectedRows || 0 });
  } catch (err) {
    return res.json({ ok: false, error: err?.message || 'Error al eliminar usuario' });
  }
}));

// --- Config (credenciales solo administrador autenticado) ---
router.get('/config/status', (_req, res) => {
  res.set('Cache-Control', 'no-store, private');
  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const database = process.env.MYSQL_DATABASE;
  res.json({
    configured: !!(String(host || '').trim() && String(user || '').trim() && String(database || '').trim()),
  });
});

router.get('/config/env', requireAuth, requireAdmin, (req, res) => {
  try {
    res.json({
      host: process.env.MYSQL_HOST || '',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || '',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || '',
      ssl: String(process.env.MYSQL_SSL || '') === 'true',
    });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

router.post('/config/test-db', requireAuth, requireAdmin, express.json({ limit: '16kb' }), asyncHandler(async (req, res) => {
  const cfg = req.body;
  try {
    const conn = await mysql.createConnection({
      host: cfg?.host,
      port: Number(cfg?.port || 3306),
      user: cfg?.user,
      password: cfg?.password,
      database: cfg?.database,
      ssl: cfg?.ssl ? { rejectUnauthorized: false } : undefined,
    });
    const [rows] = await conn.query('SELECT 1 AS ok');
    await conn.end();
    const ok = rows && rows[0] && rows[0].ok === 1;
    return res.json({ ok });
  } catch (err) {
    return res.json({ ok: false, error: err?.message });
  }
}));

function mergeEnvFile(mysqlCfg) {
  const existing = {};
  try {
    if (fs.existsSync(rootEnvPath)) {
      const txt = fs.readFileSync(rootEnvPath, 'utf-8');
      for (const line of txt.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq > 0) {
          const k = t.slice(0, eq).trim();
          const v = t.slice(eq + 1);
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) existing[k] = v;
        }
      }
    }
  } catch (_) {}
  existing.MYSQL_HOST = String(mysqlCfg?.host || '');
  existing.MYSQL_PORT = String(Number(mysqlCfg?.port || 3306));
  existing.MYSQL_USER = String(mysqlCfg?.user || '');
  existing.MYSQL_PASSWORD = String(mysqlCfg?.password ?? '');
  existing.MYSQL_DATABASE = String(mysqlCfg?.database || '');
  existing.MYSQL_SSL = mysqlCfg?.ssl ? 'true' : 'false';
  const keys = Object.keys(existing).sort();
  const body = `${keys.map((k) => `${k}=${existing[k]}`).join('\n')}\n`;
  fs.writeFileSync(rootEnvPath, body, { encoding: 'utf-8', mode: 0o600 });
}

router.post('/config/save-env', requireAuth, requireAdmin, express.json({ limit: '16kb' }), asyncHandler(async (req, res) => {
  const cfg = req.body;
  try {
    mergeEnvFile(cfg);
    return res.json({ ok: true, path: rootEnvPath, restartRequired: true });
  } catch (err) {
    return res.json({ ok: false, error: err?.message });
  }
}));

// --- System logs ---
router.get('/system/logs', requireAuth, requireAdmin, (req, res) => {
  try {
    res.json(logger.getBuffer());
  } catch (_) {
    res.json([]);
  }
});

router.post('/system/logs/clear', requireAuth, requireAdmin, (req, res) => {
  try {
    logger.clearBuffer();
    res.json({ cleared: true });
  } catch (_) {
    res.json({ cleared: false });
  }
});

router.get('/system/logs/stream', requireAuth, requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const handler = (entry) => {
    try {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    } catch (_) {}
  };
  logger.onAppend(handler);
  req.on('close', () => {
    try { logger.offAppend(handler); } catch (_) {}
  });
});

// --- App ---
router.get('/app/version', (req, res) => {
  res.set('Cache-Control', 'no-store, private');
  try {
    const pkg = require('../package.json');
    res.json({ version: pkg.version || '1.1.0' });
  } catch (_) {
    res.json({ version: '1.1.0' });
  }
});

router.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store, private');
  res.json({ ok: true });
});

module.exports = router;