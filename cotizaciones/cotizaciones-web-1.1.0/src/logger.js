const EventEmitter = require('events');

const levels = String(process.env.LOG_ALLOWED_LEVELS || 'error,connection')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

const emitter = new EventEmitter();
const buffer = [];
const MAX = Number(process.env.LOG_BUFFER_MAX || 500);

function shouldLog(level) {
  return levels.includes(String(level || '').toLowerCase());
}

function log(level, source, message, meta = undefined) {
  if (!shouldLog(level)) return;
  const ts = new Date().toISOString();
  const entry = {
    ts,
    level: String(level).toUpperCase(),
    source: String(source || ''),
    message: String(message || ''),
    meta: meta !== undefined ? meta : undefined,
  };

  // Emitir a consola formateada
  const base = `[${ts}] [${entry.level}] [${entry.source}] ${entry.message}`;
  if (meta !== undefined) {
    try { console.log(base, JSON.stringify(meta)); } catch (_) { console.log(base); }
  } else {
    console.log(base);
  }

  // Persistir en memoria con tope
  buffer.push(entry);
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);

  // Notificar subscriptores
  try { emitter.emit('append', entry); } catch (_) {}
}

function getBuffer() { return buffer.slice(); }
function clearBuffer() { buffer.length = 0; }
function onAppend(fn) { emitter.on('append', fn); }
function offAppend(fn) { emitter.off('append', fn); }

module.exports = { log, getBuffer, clearBuffer, onAppend, offAppend };