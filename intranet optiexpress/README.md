# Intranet Optiexpress

Intranet corporativa para anuncios internos, promociones y recursos de Optiexpress, distribuidora de artículos ópticos.

## Características

- 📢 **Promociones**: Visualización de promociones activas con imágenes
- 📚 **Catálogos**: Acceso a catálogos de productos en formato PDF
- 📄 **Recursos Internos**: Formularios y documentos internos (Solicitud de Vacaciones, Préstamos)
- 🌐 **Recursos Externos**: Enlaces a sitios externos (FedEx)
- 🎨 **Diseño Moderno**: Interfaz con efecto glassmorphism y fondo Aurora animado
- 📱 **Responsive**: Diseño adaptable a dispositivos móviles

## Tecnologías

- HTML5
- CSS3 (con efectos glassmorphism y animaciones)
- JavaScript (Vanilla JS)
- WebGL (para el efecto Aurora)
- OGL (biblioteca WebGL)

## Estructura del Proyecto

```
/
├── index.html              # Página principal con promociones
├── catalogos.html          # Página de catálogos
├── recursos-internos.html  # Página de recursos internos
├── styles.css              # Estilos principales
├── script.js               # Script para promociones
├── catalogos.js            # Script para catálogos
├── recursos-internos.js    # Script para recursos internos
├── aurora.js               # Efecto de fondo Aurora
├── .htaccess               # Configuración del servidor
└── images/                 # Recursos de imagen
    ├── Catalogos/          # Imágenes y PDFs de catálogos
    ├── promo/              # Imágenes de promociones
    └── recursos/           # PDFs de recursos internos
```

## Instalación Local

No requiere instalación. Solo abre `index.html` en un navegador moderno o usa un servidor local:

```bash
# Con Python
python3 -m http.server 8000

# Con Node.js (live-server)
npx live-server --port=8000
```

## Despliegue en Hostinger

Ver el archivo `DEPLOY.md` para instrucciones detalladas de despliegue.

### Resumen rápido:
1. Sube todos los archivos a `public_html` en Hostinger
2. Asegúrate de que el archivo `.htaccess` esté incluido
3. Verifica los permisos de archivos (644 para archivos, 755 para carpetas)
4. Visita tu dominio para verificar que todo funcione

## Navegadores Compatibles

- Chrome/Edge (últimas versiones)
- Firefox (últimas versiones)
- Safari (últimas versiones)
- Opera (últimas versiones)

## Notas

- El proyecto usa rutas relativas, por lo que funciona en cualquier subdirectorio
- Los PDFs se abren en nuevas pestañas
- El efecto Aurora requiere soporte WebGL en el navegador
- El año del copyright se actualiza automáticamente con JavaScript

## Licencia

Propiedad de Optiexpress. Todos los derechos reservados.
