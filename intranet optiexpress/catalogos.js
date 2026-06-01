// Datos de catálogos basados en los PDFs encontrados
const catalogos = [
    {
        id: 1,
        titulo: 'Lentes de Contacto 2026',
        descripcion: 'Catálogo completo de lentes de contacto 2026. Amplia variedad de marcas y tipos disponibles.',
        pdf: 'images/Catalogos/Optiexpress-Catalogo-Lentes-de-Contacto-2026.pdf',
        imagen: 'images/Catalogos/Lente-de-Contacto.png'
    },
    {
        id: 2,
        titulo: 'Nuevo Catálogo de Equipo',
        descripcion: 'Catálogo de equipos e instrumentos profesionales para ópticas. Tecnología de última generación.',
        pdf: 'images/Catalogos/Nuevo-Catalogo-de-Equipo.pdf',
        imagen: 'images/Catalogos/Equipos.png'
    },
    {
        id: 3,
        titulo: 'Soluciones 2026',
        descripcion: 'Catálogo de soluciones y productos de limpieza para lentes de contacto y oftálmicos.',
        pdf: 'images/Catalogos/Optiexpress-Catalogo-Soluciones-2026.pdf',
        imagen: 'images/Catalogos/Soluciones.png'
    },
    {
        id: 4,
        titulo: 'Accesorios 2026',
        descripcion: 'Catálogo completo de accesorios y complementos para el cuidado y mantenimiento de lentes.',
        pdf: 'images/Catalogos/Catalogo-Accesorios-2026.pdf',
        imagen: 'images/Catalogos/Accesorios.png'
    },
    {
        id: 5,
        titulo: 'Insumos 2026',
        descripcion: 'Catálogo de insumos y materiales necesarios para el funcionamiento de tu óptica.',
        pdf: 'images/Catalogos/Catalogo-Insumos-2026.pdf',
        imagen: 'images/Catalogos/Insumos.png'
    }
];

// Función para compartir por WhatsApp
function compartirWhatsApp(pdfUrl, titulo) {
    // Construir la URL completa del PDF asegurándonos de que tenga el protocolo
    let urlCompleta = pdfUrl;
    if (!urlCompleta.startsWith('http://') && !urlCompleta.startsWith('https://')) {
        // Si estamos en localhost, usar la URL completa
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            urlCompleta = `${window.location.protocol}//${window.location.host}/${pdfUrl}`;
        } else {
            // En producción, usar la URL completa
            urlCompleta = `${window.location.origin}/${pdfUrl}`;
        }
    }
    
    // Mensaje mejorado con emojis y formato claro
    const mensaje = `📄 *${titulo}*\n\nTe comparto el catálogo de Optiexpress.\n\n🔗 Descarga el PDF aquí:\n${urlCompleta}\n\n_Optiexpress - Distribuidora mayorista de artículos ópticos_`;
    
    // Abrir la app de WhatsApp (no WhatsApp Web en el navegador)
    const urlWhatsApp = `whatsapp://send?text=${encodeURIComponent(mensaje)}`;
    const enlace = document.createElement('a');
    enlace.href = urlWhatsApp;
    enlace.rel = 'noopener noreferrer';
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
}

// Función para renderizar catálogos
function renderizarCatalogos() {
    const catalogosGrid = document.getElementById('catalogosGrid');
    catalogosGrid.innerHTML = '';

    if (catalogos.length === 0) {
        catalogosGrid.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255, 255, 255, 0.7); grid-column: 1 / -1;">No hay catálogos disponibles</div>';
        return;
    }

    catalogos.forEach((catalogo, index) => {
        const cardWrapper = document.createElement('div');
        cardWrapper.className = 'catalogo-wrapper';
        cardWrapper.style.animationDelay = `${index * 0.1}s`;
        
        const card = document.createElement('a');
        card.className = 'catalogo-card';
        card.href = catalogo.pdf;
        card.target = '_blank';
        card.style.textDecoration = 'none';
        
        card.innerHTML = `
            <div class="recurso-imagen-container">
                <img src="${catalogo.imagen}" alt="${catalogo.titulo}" class="recurso-imagen">
            </div>
            <h3>${catalogo.titulo}</h3>
            <p>${catalogo.descripcion}</p>
        `;

        const imgCat = card.querySelector('.recurso-imagen');
        if (imgCat) {
            imgCat.decoding = 'async';
            imgCat.sizes = '(max-width: 768px) 94vw, min(45vw, 520px)';
            if (index < 3) {
                imgCat.loading = 'eager';
                imgCat.fetchPriority = index === 0 ? 'high' : 'auto';
            } else {
                imgCat.loading = 'lazy';
                imgCat.fetchPriority = 'low';
            }
        }

        const shareMenu = document.createElement('div');
        shareMenu.className = 'share-menu';
        
        // Botón de WhatsApp para todos los catálogos
        let shareMenuHTML = `
            <button class="share-btn" onclick="event.stopPropagation(); compartirWhatsApp('${catalogo.pdf}', '${catalogo.titulo}')" title="Compartir por WhatsApp">
                <img src="images/what.png" alt="WhatsApp" class="share-btn-icon">
                <span>WhatsApp</span>
            </button>
        `;
        
        // Botón de Fichas Técnicas solo para el catálogo de Equipo (id: 2)
        if (catalogo.id === 2) {
            shareMenuHTML += `
                <a href="https://drive.google.com/drive/folders/1AGU-xu6i-pYILZOFMXHkimM5I_aM7_xQ?usp=sharing" target="_blank" class="share-btn" title="Ver Fichas Técnicas" onclick="event.stopPropagation();">
                    <span>📋</span>
                    <span>Fichas Técnicas</span>
                </a>
            `;
        }
        
        shareMenu.innerHTML = shareMenuHTML;

        cardWrapper.appendChild(card);
        cardWrapper.appendChild(shareMenu);
        catalogosGrid.appendChild(cardWrapper);
    });
}

// Cargar catálogos al iniciar
document.addEventListener('DOMContentLoaded', () => {
    renderizarCatalogos();
});
