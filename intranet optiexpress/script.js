// Avisos: imágenes de la carpeta images/Avisos/
const avisos = [
    { imagen: 'images/Avisos/16 de marzo.jpeg', titulo: '16 de marzo' },
    { imagen: 'images/Avisos/marzo.jpg', titulo: 'Marzo' },
    { imagen: 'images/Avisos/dias-feriados-oficiales.jpg', titulo: 'Días Feriados Oficiales' },
    { imagen: 'images/Avisos/dias-feriados-no-oficiales.jpg', titulo: 'Días Feriados No Oficiales' }
];

// Promociones activas: imágenes de la carpeta images/promos/
const promocionesActivas = [
    { imagen: 'images/promos/Descuento-Especial.jpg', titulo: 'Descuento Especial' },
    { imagen: 'images/promos/Descuento-hastapg.jpg', titulo: 'Descuento Hasta PG' },
    { imagen: 'images/promos/stock-eje-biofinity-torico.jpg', titulo: 'Stock Biofinity Tórico' }
];

// Función para renderizar avisos (página Avisos e index)
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
        slide.className = 'carousel-slide';
        slide.style.animationDelay = `${index * 0.5}s`;
        const img = document.createElement('img');
        img.src = item.imagen;
        img.alt = item.titulo;
        img.className = 'promocion-imagen';
        img.loading = index === 0 ? 'eager' : 'lazy';
        if (index === 0) img.fetchPriority = 'high';
        img.decoding = 'async';
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
        slide.className = 'carousel-slide';
        slide.style.animationDelay = `${index * 0.5}s`;
        const img = document.createElement('img');
        img.src = item.imagen;
        img.alt = item.titulo;
        img.className = 'promocion-imagen';
        img.loading = index === 0 ? 'eager' : 'lazy';
        if (index === 0) img.fetchPriority = 'high';
        img.decoding = 'async';
        img.onerror = function() { console.error('Error cargando imagen:', this.src); };
        const div = document.createElement('div');
        div.className = 'promocion-imagen-wrapper';
        div.appendChild(img);
        slide.appendChild(div);
        wrapper.appendChild(slide);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderizarAvisos();
    renderizarPromocionesActivas();
    // Popup de cumpleaños solo en la página inicial (index)
    const path = (window.location.pathname || '').replace(/\/$/, '') || '/';
    if (path === '/' || path === '/index.html' || path.endsWith('index.html')) {
        setTimeout(verificarCumpleaneros, 500); // breve delay para que la página cargue primero
    }
});

// ──────────────────────────────────────────────────────
// Popup público de cumpleaños
// ──────────────────────────────────────────────────────
// En producción (mismo dominio) usa ruta relativa; en local usa backend en 9081
const BACKEND_URL = (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
    ? '' : 'http://localhost:9081';

async function verificarCumpleaneros() {
    const hoy = new Date().toISOString().slice(0, 10);
    const vistaKey = `cumpleanos_visto_${hoy}`;
    if (sessionStorage.getItem(vistaKey)) return;

    try {
        const res = await fetch(`${BACKEND_URL}/api/v1/landing/cumpleaneros-hoy`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.cumpleaneros || data.cumpleaneros.length === 0) return;

        sessionStorage.setItem(vistaKey, '1');
        mostrarPopupCumpleanosPublico(data.cumpleaneros);
    } catch (e) {
        // Silencioso: si el backend no responde no interrumpir la landing
    }
}

// ── Constructores de los 5 diseños ──────────────────────────────────────────

function _buildPersonasHtml(personas, claseItem, claseNombre, clasePuesto, claseDepto) {
    return personas.map(p => `
        <div class="${claseItem}">
            <span class="cp-avatar-emoji">🎂</span>
            <div class="cp-persona-info">
                <span class="${claseNombre}">${p.nombre}</span>
                ${p.puesto  ? `<span class="${clasePuesto}">${p.puesto}</span>`  : ''}
                ${p.departamento ? `<span class="${claseDepto}">${p.departamento}</span>` : ''}
            </div>
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
            ${_buildPersonasHtml(personas, 'cp-d1-item', 'cp-d1-nombre', 'cp-d1-puesto', 'cp-d1-depto')}
        </div>
        <p class="cp-d1-sub">¡Felicidades de todo el equipo Optiexpress!</p>
        <button class="cp-d1-btn cp-btn-cerrar">¡Felicidades! 🎉</button>
    </div>`,

    // ── Diseño 2: Elegante Minimalista ───────────────────────────────────────
    (personas) => `
    <div class="cp-popup cp-d2">
        <button class="cp-cerrar cp-d2-cerrar" aria-label="Cerrar">✕</button>
        <div class="cp-d2-emoji">🎂</div>
        <div class="cp-d2-eyebrow">Cumpleaños del día</div>
        <h2 class="cp-d2-titulo">${personas.length > 1 ? 'Hoy celebramos a' : 'Hoy celebramos a'}</h2>
        <div class="cp-d2-personas">
            ${_buildPersonasHtml(personas, 'cp-d2-item', 'cp-d2-nombre', 'cp-d2-puesto', 'cp-d2-depto')}
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
                ${_buildPersonasHtml(personas, 'cp-d3-item', 'cp-d3-nombre', 'cp-d3-puesto', 'cp-d3-depto')}
            </div>
            <p class="cp-d3-mensaje">¡Únete para desearles un día increíble!</p>
            <button class="cp-d3-btn cp-btn-cerrar">¡Muchas felicidades! 🎁</button>
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
            ${_buildPersonasHtml(personas, 'cp-d4-item', 'cp-d4-nombre', 'cp-d4-puesto', 'cp-d4-depto')}
        </div>
        <button class="cp-d4-btn cp-btn-cerrar">¡Feliz cumpleaños!</button>
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
                ${_buildPersonasHtml(personas, 'cp-d5-item', 'cp-d5-nombre', 'cp-d5-puesto', 'cp-d5-depto')}
            </div>
            <p class="cp-d5-mensaje">Es un buen momento para desearles un excelente día. 🎉</p>
            <div class="cp-d5-btns">
                <button class="cp-d5-btn-sec cp-btn-cerrar">Cerrar</button>
                <button class="cp-d5-btn-pri cp-btn-cerrar">¡Felicidades!</button>
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

    setTimeout(() => overlay.classList.add('activo'), 300);
}
