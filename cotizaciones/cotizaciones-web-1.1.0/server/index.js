const path = require('path');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const routes = require('./routes');

const app = express();
const PORT = Number(process.env.PORT || 3080);
/** En producción detrás de nginx usa HOST=127.0.0.1 */
const HOST = process.env.HOST || '0.0.0.0';
const IS_PROD = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

if (IS_PROD) {
  const sec = String(process.env.SESSION_SECRET || '').trim();
  if (sec.length < 32) {
    console.error('[cotizaciones] En producción SESSION_SECRET debe tener al menos 32 caracteres.');
    process.exit(1);
  }
}

app.set('trust proxy', 1);

/** Cabeceras mínimas sin dependencia extra (helmet). */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

const corsOrigin = process.env.CORS_ORIGIN;
if (IS_PROD && !corsOrigin) {
  console.warn('[cotizaciones] Producción sin CORS_ORIGIN: solo mismo origen (recomendado: CORS_ORIGIN=https://intranetoptiexpress.net)');
}
app.use(cors({
  origin: corsOrigin
    ? corsOrigin.split(',').map((s) => s.trim())
    : !IS_PROD,
  credentials: true,
}));

const sessionCookie = {
  secure: String(process.env.SESSION_COOKIE_SECURE || '').toLowerCase() === 'true',
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
const samesiteRaw = String(process.env.SESSION_COOKIE_SAMESITE || '').toLowerCase();
if (samesiteRaw === 'strict' || samesiteRaw === 'lax' || samesiteRaw === 'none') {
  sessionCookie.sameSite = samesiteRaw;
} else {
  sessionCookie.sameSite = IS_PROD ? 'strict' : 'lax';
}
if (sessionCookie.sameSite === 'none' && !sessionCookie.secure) {
  sessionCookie.secure = true;
}
const sessionPath = (process.env.SESSION_COOKIE_PATH || '').trim();
if (sessionPath) {
  sessionCookie.path = sessionPath;
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'cotizaciones-dev-cambiar-en-produccion',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  name: 'cotizaciones.sid',
  cookie: sessionCookie,
}));

app.use('/api', routes);

const rendererDir = path.join(__dirname, '..', 'src', 'renderer');
app.use(express.static(rendererDir, {
  setHeaders(res, filePath) {
    if (String(filePath).endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store, private');
    }
  },
}));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err?.message || 'Error interno' });
});

app.listen(PORT, HOST, () => {
  const url = HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
  console.log(`Cotizaciones (web) ${url} (bind ${HOST}:${PORT})`);
});
