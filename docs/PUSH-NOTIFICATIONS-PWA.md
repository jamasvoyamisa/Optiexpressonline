# Push Notifications PWA — Plan de Implementación

## Resumen

Las notificaciones push funcionan sin app nativa, sin App Store y sin costo adicional. El usuario solo necesita abrir el sitio en Safari y agregarlo a pantalla de inicio. A partir de **iOS 16.4+** las PWA instaladas soportan push notifications.

---

## Costo

| Componente | Costo |
|---|---|
| Apple Push Service (APN) | Gratis |
| Google/Firebase Cloud Messaging | Gratis |
| Librería `pywebpush` (Python) | Gratis |
| VPS actual | Ya pagado, sin costo extra |

---

## Requisitos técnicos

### 1. Frontend — Service Worker (`public/sw.js`)
Archivo JS que corre en background y muestra la notificación aunque la app esté cerrada.

```js
self.addEventListener('push', event => {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/favicon.png',
    badge: '/favicon.png',
    data: { url: data.url }
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  clients.openWindow(event.notification.data.url || '/');
});
```

### 2. Frontend — Web App Manifest (`public/manifest.json`)
Le dice a iOS el nombre y el ícono de la app instalada.

```json
{
  "name": "Gestión Interna Cristal",
  "short_name": "Cristal",
  "display": "standalone",
  "start_url": "/",
  "background_color": "#312e81",
  "theme_color": "#4338ca",
  "icons": [
    { "src": "/favicon.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/favicon.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 3. Frontend — Registro de suscripción (`src/`)
Al iniciar sesión, solicitar permiso y mandar la suscripción al backend.

```js
const reg = await navigator.serviceWorker.register('/sw.js');
const sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: VAPID_PUBLIC_KEY  // clave pública del servidor
});
// Mandar `sub` al backend con el JWT del usuario
await api.post('/push/subscribe', sub);
```

### 4. Backend — Tabla en BD
```sql
CREATE TABLE push_subscriptions (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  empleado_id   INT NOT NULL,
  endpoint      TEXT NOT NULL,
  keys_p256dh   TEXT NOT NULL,
  keys_auth     TEXT NOT NULL,
  created_at    DATETIME DEFAULT NOW()
);
```

### 5. Backend — Claves VAPID
Generarlas una sola vez y guardarlas en `.env`:
```bash
pip install pywebpush
python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.public_key, v.private_key)"
```
```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:admin@optiexpress.com
```

### 6. Backend — Endpoints necesarios

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/push/subscribe` | Guarda suscripción ligada al empleado |
| DELETE | `/api/v1/push/unsubscribe` | Elimina suscripción |

### 7. Backend — Función para enviar push

```python
from pywebpush import webpush, WebPushException
import json

def enviar_push(suscripcion, titulo: str, cuerpo: str, url: str = "/"):
    try:
        webpush(
            subscription_info={
                "endpoint": suscripcion.endpoint,
                "keys": {
                    "p256dh": suscripcion.keys_p256dh,
                    "auth": suscripcion.keys_auth,
                }
            },
            data=json.dumps({"title": titulo, "body": cuerpo, "url": url}),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_EMAIL},
        )
    except WebPushException:
        pass  # suscripción expirada — eliminar de BD
```

---

## Eventos sugeridos para disparar push

| Evento | Destinatario | Mensaje |
|---|---|---|
| Vacación aprobada | Empleado | "Tu solicitud del [fechas] fue aprobada ✅" |
| Vacación rechazada | Empleado | "Tu solicitud fue rechazada. Ver motivo." |
| Nuevo ticket de soporte | Personal TI | "Nuevo ticket: [título] — [empresa]" |
| Ticket resuelto | Solicitante | "Tu ticket #[folio] fue resuelto ✅" |
| Préstamo aprobado | Empleado | "Tu solicitud de préstamo fue aprobada 💳" |

---

## Flujo completo

```
1. Usuario abre el sitio en Safari (iPhone)
2. "Compartir" → "Agregar a pantalla de inicio"
3. Abre la app instalada → acepta el prompt de notificaciones
4. Browser genera una suscripción única → se guarda en BD ligada al empleado
5. El empleado cierra la app completamente
6. Ocurre un evento (vacación aprobada, ticket nuevo, etc.)
7. Backend busca suscripciones del empleado y manda el push a Apple
8. Apple entrega la notificación al iPhone → aparece aunque la app esté cerrada 🔔
9. El usuario toca la notificación → abre la app (pide login si la sesión expiró)
```

---

## Compatibilidad iOS vs Android

| Característica | iOS (Safari) | Android (Chrome) |
|---|---|---|
| Push notifications | ✅ iOS 16.4+ | ✅ Android 5+ |
| Funciona desde el navegador | ❌ Solo desde app instalada | ✅ Desde el navegador y app instalada |
| Badge (número rojo en ícono) | ❌ No soportado | ✅ Soportado |
| Instalar en pantalla de inicio | Safari → Compartir → Agregar | Chrome → menú → Instalar app |
| Prompt de instalación automático | ❌ Manual siempre | ✅ Chrome lo sugiere solo |
| Permiso de notificaciones | Al abrir la app instalada | Desde el navegador directamente |

### Cómo agrega a inicio el usuario Android

En Chrome para Android hay dos formas:
1. Chrome detecta el `manifest.json` y muestra automáticamente el banner "Instalar app"
2. Manualmente: menú (⋮) → "Agregar a pantalla de inicio"

La gran ventaja de Android es que el push funciona **sin necesidad de instalar** — puede llegar desde Chrome directamente si el usuario acepta el permiso.

---

## Notas importantes

- **La sesión NO necesita estar activa** para recibir pushes. El Service Worker corre independiente.
- Un empleado puede tener **múltiples dispositivos** — cada uno genera su suscripción y todos recibirían el push.
- El mismo código de backend (`pywebpush`) funciona para enviar a Apple y a Google sin cambios — el `endpoint` de la suscripción determina a cuál servidor se manda.
- **iOS requiere 16.4+** y que la app esté instalada en pantalla de inicio.
- **Android** funciona desde Chrome 42+ sin necesidad de instalar.
- El usuario que ya tiene el ícono instalado **debe aceptar el permiso** de notificaciones la próxima vez que abra la app.

---

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `frontend/public/sw.js` | Crear |
| `frontend/public/manifest.json` | Crear |
| `frontend/index.html` | Agregar `<link rel="manifest">` y registro del SW |
| `backend/app/modules/push/` | Crear módulo (models, routes, service) |
| `backend/alembic/versions/...` | Migración para tabla `push_subscriptions` |
| `backend/.env` | Agregar claves VAPID |
| Módulos de vacaciones, soporte, préstamos | Llamar a `enviar_push()` en los eventos |
