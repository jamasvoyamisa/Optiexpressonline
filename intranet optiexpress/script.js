// Avisos: imágenes de la carpeta images/Avisos/
const avisos = [
    { imagen: 'images/Avisos/cumpleaños-junio.jpeg', titulo: 'Cumpleaños junio' },
    { imagen: 'images/Avisos/dias-feriados-oficiales.jpg', titulo: 'Días Feriados Oficiales' },
    { imagen: 'images/Avisos/dias-feriados-no-oficiales.jpg', titulo: 'Días Feriados No Oficiales' }
];

// Promociones activas: imágenes de la carpeta images/promos/
const promocionesActivas = [
    { imagen: 'images/promos/Descuento-Especial.jpg', titulo: 'Descuento Especial' },
    { imagen: 'images/promos/Descuento-hastapg.jpg', titulo: 'Descuento Hasta PG' },
    { imagen: 'images/promos/stock-eje-biofinity-torico.jpg', titulo: 'Stock Biofinity Tórico' }
];

/**
 * Cuántas imágenes cargar con prioridad (eager). Avisos tiene 4 ítems en grid;
 * promociones suele tener 3. El resto va en lazy.
 */
const IMAGENES_PRIORITARIAS_GRID = 4;

/**
 * Prioriza carga de imágenes visibles (eager + fetchPriority) y difiere el resto (lazy).
 */
function configurarCargaImagen(img, index) {
    img.decoding = 'async';
    img.sizes = '(max-width: 768px) 96vw, min(33vw, 520px)';
    if (index < IMAGENES_PRIORITARIAS_GRID) {
        img.loading = 'eager';
        img.fetchPriority = index === 0 ? 'high' : 'auto';
    } else {
        img.loading = 'lazy';
        img.fetchPriority = 'low';
    }
}

// Función para renderizar avisos (carrusel en la página de inicio)
function renderizarAvisos() {
    const carouselWrapper = document.getElementById('carouselWrapper');
    if (!carouselWrapper) return;
    carouselWrapper.innerHTML = '';
    if (avisos.length === 0) {
        carouselWrapper.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.7);">No hay avisos disponibles</div>';
        return;
    }
    avisos.forEach((item, index) => {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide carousel-slide--avisos';
        slide.style.animationDelay = `${index * 0.12}s`;
        const img = document.createElement('img');
        img.src = item.imagen;
        img.alt = item.titulo;
        img.className = 'promocion-imagen';
        configurarCargaImagen(img, index);
        img.onerror = function() { console.error('Error cargando imagen:', this.src); };
        const wrapper = document.createElement('div');
        wrapper.className = 'promocion-imagen-wrapper';
        wrapper.appendChild(img);
        slide.appendChild(wrapper);
        carouselWrapper.appendChild(slide);
    });
}

// Función para renderizar promociones activas (página Promociones Activas)
function renderizarPromocionesActivas() {
    const wrapper = document.getElementById('promocionesActivasWrapper');
    if (!wrapper) return;
    wrapper.innerHTML = '';
    if (promocionesActivas.length === 0) {
        wrapper.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.7); grid-column: 1/-1;">No hay promociones activas en este momento</div>';
        return;
    }
    promocionesActivas.forEach((item, index) => {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide carousel-slide--promos';
        slide.style.animationDelay = `${index * 0.1}s`;
        const img = document.createElement('img');
        img.src = item.imagen;
        img.alt = item.titulo;
        img.className = 'promocion-imagen';
        configurarCargaImagen(img, index);
        img.onerror = function() { console.error('Error cargando imagen:', this.src); };
        const div = document.createElement('div');
        div.className = 'promocion-imagen-wrapper';
        div.appendChild(img);
        slide.appendChild(div);
        wrapper.appendChild(slide);
    });
}

/** Jubilación Arcelia Gómez Ibarra — landing. */
const MOSTRAR_POPUP_JUBILACION_ARCELIA = true;
/**
 * Ventana en calendario México (YYYY-MM-DD): desde “hoy” de activación hasta “mañana” 23:59.
 * Ajusta estas fechas si repites el aviso otro año.
 */
const JUBILACION_ARCELIA_DESDE_MX = '2026-04-29';
const JUBILACION_ARCELIA_HASTA_MX = '2026-04-30';

/** Día de las Madres 2026 — landing.
 *  Visible del 7 al 10 de mayo de 2026 (jueves a domingo).
 */
const MOSTRAR_POPUP_DIA_MADRES_2026 = true;
const DIA_MADRES_DESDE_MX = '2026-05-07';
const DIA_MADRES_HASTA_MX = '2026-05-10';

function _mexicoYmd(d = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

function popupJubilacionArceliaHabilitadoHoy() {
    if (!MOSTRAR_POPUP_JUBILACION_ARCELIA) return false;
    const ahoraMx = _mexicoYmd();
    return ahoraMx >= JUBILACION_ARCELIA_DESDE_MX && ahoraMx <= JUBILACION_ARCELIA_HASTA_MX;
}

function popupDiaMadres2026HabilitadoHoy() {
    if (!MOSTRAR_POPUP_DIA_MADRES_2026) return false;
    const ahoraMx = _mexicoYmd();
    return ahoraMx >= DIA_MADRES_DESDE_MX && ahoraMx <= DIA_MADRES_HASTA_MX;
}

document.addEventListener('DOMContentLoaded', () => {
    renderizarAvisos();
    renderizarPromocionesActivas();
    // Popup de cumpleaños en la página de inicio
    const path = (window.location.pathname || '').replace(/\/$/, '') || '/';
    const esIndex = path === '/' || path === '/index.html' || path.endsWith('index.html');
    if (esIndex) {
        if (popupJubilacionArceliaHabilitadoHoy()) {
            setTimeout(mostrarPopupJubilacionArcelia, 2400);
        }
        const paramsLanding = new URLSearchParams(window.location.search || '');
        const mostrarMadres = popupDiaMadres2026HabilitadoHoy() || paramsLanding.get('ver_madres') === '1';
        if (mostrarMadres) {
            // Día de las Madres PRIMERO; al cerrarse, lanzamos el popup de cumpleañeros.
            setTimeout(() => mostrarPopupDiaMadres2026({ onCerrar: verificarCumpleaneros }), 800);
        } else {
            setTimeout(verificarCumpleaneros, 500);
        }
    }
});

// ──────────────────────────────────────────────────────
// Popup público de cumpleaños
// ──────────────────────────────────────────────────────
// Opcional: antes de cargar script.js → window.LANDING_API_BASE = 'https://tu-dominio' (sin / final)
// En producción con nginx (mismo origen para /api) suele ir vacío. En local o LAN: puerto 9081 del mismo host.
function getLandingApiBase() {
    if (typeof window === 'undefined') return '';
    if (typeof window.LANDING_API_BASE === 'string' && window.LANDING_API_BASE.trim()) {
        return window.LANDING_API_BASE.replace(/\/$/, '');
    }
    const proto = window.location.protocol;
    const h = window.location.hostname;
    // Dominio público: API detrás del mismo host (nginx → backend)
    if (h === 'intranetoptiexpress.net' || h === 'www.intranetoptiexpress.net') {
        return '';
    }
    const loopback =
        h === 'localhost' ||
        h === '127.0.0.1' ||
        h === '[::1]' ||
        h === '';
    const isPrivateLan =
        /^10\.\d+\.\d+\.\d+$/.test(h) ||
        /^192\.168\.\d+\.\d+$/.test(h) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h);
    // Solo en dev típico (misma máquina o LAN): API en :9081. En producción con dominio, /api va por nginx (base '').
    if (loopback || isPrivateLan) {
        const host = h === '' ? '127.0.0.1' : h;
        return `${proto}//${host}:9081`;
    }
    return '';
}
const BACKEND_URL = getLandingApiBase();

async function verificarCumpleaneros() {
    const params = new URLSearchParams(window.location.search || '');
    const forzarPopup = params.get('ver_cumple') === '1';
    const debug = params.has('debug');
    // Fecha en hora México (no UTC) para que la clave no se adelante entre 6pm y medianoche
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }); // YYYY-MM-DD
    const vistaKey = `cumpleanos_visto_${hoy}`;
    if (!forzarPopup && sessionStorage.getItem(vistaKey)) return;

    const url = `${BACKEND_URL}/api/v1/landing/cumpleaneros-hoy`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            if (debug) console.warn('[landing] cumpleañeros HTTP', res.status, url);
            return;
        }
        const data = await res.json();
        if (!data.cumpleaneros || data.cumpleaneros.length === 0) {
            if (debug) console.info('[landing] sin cumpleañeros hoy', data);
            return;
        }

        if (!forzarPopup) sessionStorage.setItem(vistaKey, '1');
        mostrarPopupCumpleanosPublico(data.cumpleaneros);
    } catch (e) {
        if (debug) console.warn('[landing] cumpleañeros error', e, url);
    }
}

// ── Enviar felicitación al empleado (notificación en la app) ─────────────────
async function _enviarFelicitacion(btn, empleadoId) {
    if (btn.dataset.enviada) return;
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
        const res = await fetch(`${BACKEND_URL}/api/v1/landing/felicitar-cumpleanero`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empleado_id: empleadoId }),
        });
        const data = await res.json();
        if (res.ok) {
            btn.dataset.enviada = '1';
            btn.textContent = data.ya_enviada ? '✓ Ya felicitado' : '✓ ¡Enviado!';
            btn.style.opacity = '0.7';
            btn.style.cursor = 'default';
        } else {
            btn.textContent = '¡Felicitar! 🎉';
            btn.disabled = false;
        }
    } catch {
        btn.textContent = '¡Felicitar! 🎉';
        btn.disabled = false;
    }
}

// ── Constructores de los 5 diseños ──────────────────────────────────────────

function _buildPersonasHtml(personas, claseItem, claseNombre, clasePuesto, claseDepto, claseBtn) {
    return personas.map(p => `
        <div class="${claseItem}">
            <span class="cp-avatar-emoji">🎂</span>
            <div class="cp-persona-info">
                <span class="${claseNombre}">${p.nombre}</span>
                ${p.puesto  ? `<span class="${clasePuesto}">${p.puesto}</span>`  : ''}
                ${p.departamento ? `<span class="${claseDepto}">${p.departamento}</span>` : ''}
            </div>
            <button class="cp-felicitar-btn ${claseBtn}" data-id="${p.id}">¡Felicitar! 🎉</button>
        </div>`).join('');
}

const _diseños = [

    // ── Diseño 1: Festivo Degradado ──────────────────────────────────────────
    (personas) => `
    <div class="cp-popup cp-d1">
        <button class="cp-cerrar" aria-label="Cerrar">✕</button>
        <div class="cp-d1-confeti">🎊 🎉 🎊 🎉 🎊</div>
        <div class="cp-d1-emoji">🎂</div>
        <h2 class="cp-d1-titulo">¡${personas.length > 1 ? 'Hoy cumplen años!' : 'Hoy es su cumpleaños!'}</h2>
        <div class="cp-d1-personas">
            ${_buildPersonasHtml(personas, 'cp-d1-item', 'cp-d1-nombre', 'cp-d1-puesto', 'cp-d1-depto', 'cp-felicitar-d1')}
        </div>
        <p class="cp-d1-sub">¡Felicidades de todo el equipo Optiexpress!</p>
        <button class="cp-d1-btn cp-btn-cerrar">Cerrar</button>
    </div>`,

    // ── Diseño 2: Elegante Minimalista ───────────────────────────────────────
    (personas) => `
    <div class="cp-popup cp-d2">
        <button class="cp-cerrar cp-d2-cerrar" aria-label="Cerrar">✕</button>
        <div class="cp-d2-emoji">🎂</div>
        <div class="cp-d2-eyebrow">Cumpleaños del día</div>
        <h2 class="cp-d2-titulo">${personas.length > 1 ? 'Hoy celebramos a' : 'Hoy celebramos a'}</h2>
        <div class="cp-d2-personas">
            ${_buildPersonasHtml(personas, 'cp-d2-item', 'cp-d2-nombre', 'cp-d2-puesto', 'cp-d2-depto', 'cp-felicitar-d2')}
        </div>
        <button class="cp-d2-btn cp-btn-cerrar">Cerrar</button>
    </div>`,

    // ── Diseño 3: Card con Avatar ─────────────────────────────────────────────
    (personas) => `
    <div class="cp-popup cp-d3">
        <button class="cp-cerrar" aria-label="Cerrar">✕</button>
        <div class="cp-d3-header">
            <div class="cp-d3-emojis">🎊🎉🎊</div>
            <h2 class="cp-d3-htitulo">${personas.length > 1 ? '¡Días especiales!' : '¡Hoy es un día especial!'}</h2>
        </div>
        <div class="cp-d3-avatar">🎂</div>
        <div class="cp-d3-body">
            <div class="cp-d3-personas">
                ${_buildPersonasHtml(personas, 'cp-d3-item', 'cp-d3-nombre', 'cp-d3-puesto', 'cp-d3-depto', 'cp-felicitar-d3')}
            </div>
            <p class="cp-d3-mensaje">¡Únete para desearles un día increíble!</p>
            <button class="cp-d3-btn cp-btn-cerrar">Cerrar 🎁</button>
        </div>
    </div>`,

    // ── Diseño 4: Oscuro Neón ─────────────────────────────────────────────────
    (personas) => `
    <div class="cp-popup cp-d4">
        <button class="cp-cerrar cp-d4-cerrar" aria-label="Cerrar">✕</button>
        <div class="cp-d4-sparkles">✦ ✦ ✦</div>
        <div class="cp-d4-emoji">🎂</div>
        <div class="cp-d4-eyebrow">${personas.length > 1 ? 'Cumpleaños hoy' : 'Cumpleaños hoy'}</div>
        <div class="cp-d4-personas">
            ${_buildPersonasHtml(personas, 'cp-d4-item', 'cp-d4-nombre', 'cp-d4-puesto', 'cp-d4-depto', 'cp-felicitar-d4')}
        </div>
        <button class="cp-d4-btn cp-btn-cerrar">Cerrar</button>
    </div>`,

    // ── Diseño 5: Corporativo Soft ────────────────────────────────────────────
    (personas) => `
    <div class="cp-popup cp-d5">
        <div class="cp-d5-banner">
            <div class="cp-d5-logo">🎂</div>
            <div class="cp-d5-banner-text">
                <h2>Cumpleaños del equipo</h2>
                <p>Óptica Express · Hoy</p>
            </div>
            <button class="cp-cerrar cp-d5-cerrar" aria-label="Cerrar">✕</button>
        </div>
        <div class="cp-d5-body">
            <div class="cp-d5-personas">
                ${_buildPersonasHtml(personas, 'cp-d5-item', 'cp-d5-nombre', 'cp-d5-puesto', 'cp-d5-depto', 'cp-felicitar-d5')}
            </div>
            <p class="cp-d5-mensaje">Es un buen momento para desearles un excelente día. 🎉</p>
            <div class="cp-d5-btns">
                <button class="cp-d5-btn-sec cp-btn-cerrar">Cerrar</button>
            </div>
        </div>
    </div>`,
];

function mostrarPopupCumpleanosPublico(personas) {
    // Eliminar popup anterior si existe
    const anterior = document.getElementById('cumpleanosOverlay');
    if (anterior) anterior.remove();

    // Elegir diseño aleatorio
    const idx = Math.floor(Math.random() * _diseños.length);
    const html = _diseños[idx](personas);

    const overlay = document.createElement('div');
    overlay.id = 'cumpleanosOverlay';
    overlay.className = 'cumpleanos-overlay';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    const cerrar = () => overlay.classList.remove('activo');
    overlay.querySelectorAll('.cp-btn-cerrar, .cp-cerrar').forEach(btn => btn.addEventListener('click', cerrar));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });

    // Botones de felicitar
    overlay.querySelectorAll('.cp-felicitar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const empleadoId = parseInt(btn.dataset.id);
            _enviarFelicitacion(btn, empleadoId);
        });
    });

    setTimeout(() => overlay.classList.add('activo'), 300);
}

// ──────────────────────────────────────────────────────
// Popup jubilación — Arcelia Gómez Ibarra (landing)
// ──────────────────────────────────────────────────────
function mostrarPopupJubilacionArcelia() {
    const params = new URLSearchParams(window.location.search || '');
    const forzar = params.get('ver_jubilacion') === '1';
    if (!forzar && !popupJubilacionArceliaHabilitadoHoy()) return;

    const anterior = document.getElementById('jubilacionOverlay');
    if (anterior) anterior.remove();

    const overlay = document.createElement('div');
    overlay.id = 'jubilacionOverlay';
    overlay.className = 'jubi-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'jubi-titulo');
    overlay.innerHTML = `
    <div class="jubi-card">
        <button type="button" class="jubi-cerrar" aria-label="Cerrar mensaje">✕</button>
        <div class="jubi-festivo" aria-hidden="true">
            <span class="jubi-confeti">✨</span>
            <span class="jubi-confeti">🎉</span>
            <span class="jubi-confeti">⭐</span>
            <span class="jubi-confeti">🎊</span>
            <span class="jubi-confeti">✨</span>
            <span class="jubi-confeti">⭐</span>
            <span class="jubi-confeti">🎉</span>
        </div>
        <div class="jubi-ornamento" aria-hidden="true">✦</div>
        <p class="jubi-rubrica">A nombre de Distribuidora Europea</p>
        <h2 id="jubi-titulo" class="jubi-titulo">Gracias por tu legado</h2>
        <div class="jubi-cuerpo">
            <p>Queremos expresar nuestro más sincero <strong>agradecimiento a Arcelia Gómez Ibarra</strong> por su entrega, profesionalismo y dedicación ejemplar.</p>
            <p>Su trabajo ha sido un pilar fundamental para nuestra organización, y su calidad humana, un ejemplo para todos los que tuvimos el honor de trabajar a su lado.</p>
            <p>Le deseamos una <strong>jubilación llena de paz, salud y momentos felices</strong>. Su huella permanece en nuestra empresa.</p>
            <p class="jubi-cierre">¡Gracias por todo, Arcelia!</p>
        </div>
        <footer class="jubi-firma">
            <span class="jubi-firma-line"></span>
            <p>Atentamente,</p>
            <p class="jubi-firma-bold">Dirección y Personal de Grupo Cristal</p>
        </footer>
        <div class="jubi-logo-wrap">
            <img src="images/GPOCristal.png" alt="Grupo Cristal" class="jubi-logo" width="280" height="80" loading="lazy" decoding="async">
        </div>
    </div>`;

    document.body.appendChild(overlay);

    const cerrar = () => {
        overlay.classList.remove('activo');
        setTimeout(() => overlay.remove(), 350);
    };
    overlay.querySelector('.jubi-cerrar')?.addEventListener('click', cerrar);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cerrar();
    });

    requestAnimationFrame(() => overlay.classList.add('activo'));
}

// ──────────────────────────────────────────────────────
// Popup Día de las Madres 2026 (landing)
// ──────────────────────────────────────────────────────
/**
 * Muestra el popup de Día de las Madres. Acepta un callback opcional `onCerrar`
 * que se ejecuta cuando el usuario cierra el modal (para encadenar el popup
 * de cumpleañeros del día sin que se tapen entre sí).
 */
function mostrarPopupDiaMadres2026(opciones) {
    const params = new URLSearchParams(window.location.search || '');
    const forzar = params.get('ver_madres') === '1';
    const onCerrar = (opciones && typeof opciones.onCerrar === 'function') ? opciones.onCerrar : null;
    if (!forzar && !popupDiaMadres2026HabilitadoHoy()) {
        // Si no se va a mostrar, igualmente continuamos la cadena (cumpleañeros).
        if (onCerrar) onCerrar();
        return;
    }

    const anterior = document.getElementById('diaMadres2026Overlay');
    if (anterior) anterior.remove();

    const overlay = document.createElement('div');
    overlay.id = 'diaMadres2026Overlay';
    overlay.className = 'mama-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mama-titulo');
    overlay.innerHTML = `
    <div class="mama-card">
        <button type="button" class="mama-cerrar" aria-label="Cerrar mensaje">✕</button>
        <div class="mama-festivo" aria-hidden="true">
            <span class="mama-petalo">🌸</span>
            <span class="mama-petalo">🌷</span>
            <span class="mama-petalo">💖</span>
            <span class="mama-petalo">🌺</span>
            <span class="mama-petalo">🌸</span>
            <span class="mama-petalo">💐</span>
            <span class="mama-petalo">🌷</span>
            <span class="mama-petalo">✨</span>
        </div>
        <div class="mama-ornamento" aria-hidden="true">❀ ❀ ❀</div>
        <p class="mama-rubrica">A todas las madres de Grupo Cristal</p>
        <h2 id="mama-titulo" class="mama-titulo">Feliz Día de las Madres</h2>
        <div class="mama-cuerpo">
            <p><strong>Ser madre</strong> es transformar el tiempo en abrazos, los sueños en impulso para otros, y cada pequeño esfuerzo en amor incondicional. Es estar presente en las risas, en las ausencias, en la calma y en la tormenta. Es construir día a día un mundo mejor desde la ternura y la fortaleza.</p>
            <p>En <strong>Grupo Cristal</strong> reconocemos y admiramos esa fuerza inmensa que llevas dentro. Sabemos que detrás de cada logro, de cada trabajo bien hecho, de cada meta alcanzada, hay historias de madres que también trasnocharon, madres que también soñaron para sus hijos, madres que supieron equilibrar el corazón y la responsabilidad.</p>
            <p>Este <strong>10 de mayo</strong> no solo celebramos tu día, te agradecemos. Porque tu ejemplo nos recuerda que crecer como empresa también significa valorar lo que realmente importa: el amor, la entrega y la empatía.</p>
            <p>Gracias por ser <em>fuente de vida, inspiración y equilibrio</em>. Desde nuestro equipo, te enviamos un respetuoso y cálido abrazo.</p>
            <p class="mama-cierre">¡Feliz Día de las Madres!</p>
        </div>
        <footer class="mama-firma">
            <span class="mama-firma-line"></span>
            <p>Atentamente,</p>
            <p class="mama-firma-bold">Dirección y Personal de Grupo Cristal</p>
        </footer>
        <div class="mama-logo-wrap">
            <img src="images/GPOCristal.png" alt="Grupo Cristal" class="mama-logo" width="280" height="80" loading="lazy" decoding="async">
        </div>
    </div>`;

    document.body.appendChild(overlay);

    let onCerrarLanzado = false;
    const lanzarOnCerrar = () => {
        if (onCerrarLanzado) return;
        onCerrarLanzado = true;
        if (onCerrar) {
            // Pequeña pausa para que se note la transición de cierre antes del siguiente popup.
            setTimeout(onCerrar, 400);
        }
    };
    const cerrar = () => {
        overlay.classList.remove('activo');
        setTimeout(() => overlay.remove(), 350);
        lanzarOnCerrar();
    };
    overlay.querySelector('.mama-cerrar')?.addEventListener('click', cerrar);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cerrar();
    });

    requestAnimationFrame(() => overlay.classList.add('activo'));
}
