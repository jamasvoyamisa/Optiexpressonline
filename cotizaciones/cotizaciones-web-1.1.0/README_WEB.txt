Cotizaciones Optiexpress — paquete WEB (Node + Express)
Versión: 1.1.0

Contenido mínimo para producción (sin Electron).

Instalación en servidor:
  cd /ruta/destino
  tar xzf cotizaciones-web-1.1.0.tar.gz
  cd cotizaciones-web-1.1.0
  cp .env.example .env
  # Editar .env: MYSQL_*, SESSION_SECRET, PORT, HOST, SESSION_COOKIE_SECURE, NODE_ENV
  npm ci --omit=dev
  npm run web
  # o: pm2 start deploy/ecosystem.config.cjs

Detrás de nginx + SSL:
  HOST=127.0.0.1
  SESSION_COOKIE_SECURE=true
  proxy_set_header X-Forwarded-Proto $scheme;

No incluye .env (crear en el servidor).
