# Seguridad de corto plazo — app en internet

**Fecha:** 2026-07-19 (revisado 2026-07-22)  
**Alcance:** Optiexpress Online (`intranetoptiexpress.net`)  
**Contexto:** La aplicación ya no es solo intranet interna: vive en internet público. El nivel actual (bcrypt, rate limit por IP, JWT, endpoints protegidos, CSP Report-Only) es **aceptable**, pero insuficiente como única defensa frente a ataques externos.

Este documento prioriza mejoras de **corto plazo** (días/1–2 semanas), con impacto alto y riesgo de despliegue controlado.

**Leyenda:** ✅ Hecho · ❌ Pendiente · 🟡 Parcial

---

## Estado actual (resumen)

| Control | Estado |
|---------|--------|
| Hash de contraseñas (bcrypt + upgrade desde SHA-256) | ✅ Hecho |
| Rate limit login / portal remoto (10/min por IP) | ✅ Hecho |
| Mensaje único en login (`Credenciales incorrectas`) | ✅ Hecho |
| Auth/autorización en módulos sensibles (personal, RH, etc.) | ✅ Hecho |
| JWT fuera de query en descargas | ✅ Hecho |
| CSP en modo Report-Only (Nginx) | ✅ Hecho |
| Rate limit por usuario (5 fallos / 15 min) | ✅ Hecho (código; aplicar migración + nginx en deploy) |
| Bloqueo temporal de cuenta (5 fallos → 15 min) | ✅ Hecho (código; requiere `alembic upgrade`) |
| Alertas de fuerza bruta (IP ≥20/10 min + bloqueo cuenta) | ✅ Hecho (código) |
| No indexar en buscadores (SPA React) | ✅ Hecho (meta + `robots.txt` + Nginx conf; aplicar conf en VPS) |
| Headers de seguridad extra (X-Frame, nosniff, etc.) | ✅ Hecho (en `nginx-optiexpress.conf`; aplicar en VPS) |
| 2FA | ❌ Pendiente |
| CAPTCHA tras fallos | ❌ Pendiente |
| CSP en modo enforce | ❌ Pendiente |
| fail2ban / WAF | ❌ Pendiente |
| Política de contraseñas anti-triviales | 🟡 Parcial (mín. 8 chars; sin lista de rechazos) |
| TTL access token / refresh + session_id | 🟡 Parcial (8 h; sesión única existe) |

---

## Objetivo de corto plazo

Reducir la superficie de ataque de **fuerza bruta**, **robo de sesión** y **abuso automatizado**, y bajar la **visibilidad pública** en buscadores, sin romper el uso diario de empleados, RH y agente biométrico.

---

## Lote A — Login y portal remoto (prioridad máxima)

### A1. Rate limit por IP **y** por usuario — ✅ Hecho (código)

**Problema:** Hoy solo se limita por IP. Un atacante con muchas IPs (botnet / proxies) puede seguir probando la misma cuenta.

**Estado:** ✅ IP `10/minuto` (slowapi) + ✅ por usuario **5 fallos / 15 min** (`app/core/login_protection.py`) en `/auth/login` y portal remoto. Pendiente de deploy/migración en VPS.

**Propuesta:**
- Mantener `10/minuto` por IP en `POST /auth/login` y portal remoto.
- Añadir contador por identificador de login (username / número de empleado / email normalizado): **5 intentos fallidos / 15 minutos**.
- Contar solo fallos (401), no logins correctos.

**Impacto usuario:** Casi nulo en uso normal.  
**Impacto seguridad:** Alto frente a fuerza bruta dirigida a una cuenta.

### A2. Bloqueo temporal de cuenta tras N fallos — ✅ Hecho (código)

**Problema:** Sin bloqueo, se puede seguir intentando indefinidamente (aunque más lento).

**Estado:** ✅ Columnas `login_fallos_consecutivos` / `login_bloqueado_hasta` (migración `d4e5f6a7b8c9`) + lógica en login/portal. Aplicar `alembic upgrade head` en deploy.

**Propuesta:**
- Tras **5 fallos consecutivos** en la misma cuenta: bloquear login **15 minutos**.
- Mensaje genérico (no revelar si la cuenta existe o está bloqueada), p. ej.  
  `Credenciales incorrectas` **o**  
  `Demasiados intentos. Espera unos minutos e inténtalo de nuevo.`  
  (preferible el segundo solo cuando el límite es por rate/bloqueo, no por usuario inexistente).
- Registrar en `actividad_log` (`categoria=auth`, nivel `warning`).
- Opcional: permitir a Administrador desbloquear desde Configuración / Personal.

**Campos sugeridos en `empleados`:**
- `login_fallos_consecutivos` (int)
- `login_bloqueado_hasta` (datetime nullable)

**Impacto usuario:** Bajo (solo quien se equivoca muchas veces).  
**Impacto seguridad:** Alto.

### A3. Alertas de fuerza bruta a TI — ✅ Hecho (código)

**Problema:** En internet, un ataque puede pasar desapercibido si nadie mira logs.

**Estado:** ✅ `actividad_log` warning si IP ≥ 20 fallos/10 min (cooldown 30 min) y al bloquear cuenta. Canal WhatsApp/TI opcional: pendiente.

**Propuesta:**
- Si una IP acumula ≥ 20 respuestas 401/429 en 10 minutos en `/auth/login` → alerta.
- Si una cuenta acumula bloqueo (A2) → alerta.
- Canal: entrada en `actividad_log` + notificación existente (WhatsApp/TI) si el módulo de notificaciones lo permite.

**Impacto usuario:** Ninguno.  
**Impacto seguridad:** Medio-alto (detección).

### A4. CAPTCHA solo tras varios fallos (opcional pero recomendado en internet) — ❌ Pendiente

**Problema:** Bots baratos siguen siendo viables aunque haya rate limit.

**Estado:** Sin Turnstile / hCaptcha / reCAPTCHA en login ni portal.

**Propuesta:**
- Tras **3 fallos** desde la misma IP o sobre la misma cuenta, exigir CAPTCHA (Turnstile / hCaptcha / reCAPTCHA).
- No mostrar CAPTCHA en el primer intento (mejor UX).

**Impacto usuario:** Bajo.  
**Impacto seguridad:** Alto contra bots.

---

## Lote B — Sesión y cuentas privilegiadas

### B1. 2FA para Administrador / Superuser / RH — ❌ Pendiente

**Problema:** Una sola contraseña robada (phishing, reutilización) abre toda la intranet.

**Estado:** No hay TOTP ni códigos de respaldo.

**Propuesta (fase 1):**
- TOTP (Google Authenticator / similar) obligatorio para:
  - rol Administrador / Superuser
  - rol o puesto RH
- En login: tras password correcta → pedir código 6 dígitos.
- Códigos de respaldo de un solo uso guardados hasheados.

**Impacto usuario:** Solo cuentas privilegiadas.  
**Impacto seguridad:** Muy alto.

### B2. Revisar duración del access token — 🟡 Parcial

**Estado actual:** access token ~ **8 horas** (`ACCESS_TOKEN_EXPIRE_MINUTES = 480`). Existe refresh y `session_id` (sesión única por usuario / último login invalida el anterior). **No** se ha bajado el TTL a 2–4 h.

**Propuesta de corto plazo:**
- Mantener 8 h para jornada laboral **o** bajar a 2–4 h + refresh silencioso (ya existe refresh token).
- Confirmar que el refresh también valida `session_id` (un solo dispositivo activo por usuario). ✅ Sesión única ya existe.

**Impacto usuario:** Bajo si el refresh funciona bien.  
**Impacto seguridad:** Medio (ventana de robo de token más corta).

### B3. Política mínima de contraseña al cambiar — 🟡 Parcial

**Estado:**
- ✅ Mínimo 8 caracteres en `/auth/cambiar-password`.
- ✅ Flujo `must_change_password` (temporal / migración sin hash).
- ❌ Sin rechazo de contraseñas triviales (`12345678`, `password`, número de empleado, etc.).

**Propuesta:**
- Mínimo 8 caracteres (ya en `/auth/cambiar-password`).
- Rechazar contraseñas triviales (`12345678`, `password`, número de empleado, etc.).
- Forzar cambio en cuentas con hash débil o temporal (`must_change_password`) — ya parcialmente cubierto.

---

## Lote C — Perímetro (Nginx / VPS)

### C1. Pasar CSP de Report-Only a enforce (cuando no haya violaciones) — ❌ Pendiente

**Estado:** ✅ `Content-Security-Policy-Report-Only` activo en Nginx. ❌ Aún no en modo enforce (`Content-Security-Policy`).

**Propuesta:**
- Revisar 3–7 días si hay violaciones legítimas.
- Si limpio: cambiar a `Content-Security-Policy` (modo forzado).

### C2. Rate limit / fail2ban en Nginx — ❌ Pendiente

**Estado:** Rate limit solo en app (slowapi). Sin `limit_req` / fail2ban documentado en Nginx del repo.

**Propuesta:**
- Limitar en Nginx `POST /api/v1/auth/login` y rutas del portal remoto (capa extra además de slowapi).
- Banear IP temporalmente tras ráfagas (fail2ban o equivalente).

### C3. Headers de seguridad adicionales — ✅ Hecho (conf; aplicar en VPS)

**Estado:** ✅ En `scripts/nginx-optiexpress.conf`: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Recargar Nginx en deploy.

### C4. WAF ligero (Cloudflare u otro) — si el dominio lo permite — ❌ Pendiente

**Propuesta:** Proxy delante del VPS con:
- protección anti-bot
- challenge en picos de tráfico
- ocultar IP real del VPS

No sustituye A1–A2; lo complementa.

### C5. No indexar la aplicación en buscadores — ✅ Hecho (código; aplicar conf en VPS)

**Estado actual:**
- ✅ Intranet estática: `noindex` + `robots.txt`.
- ✅ App React (`frontend/index.html`): meta `robots`.
- ✅ `frontend/public/robots.txt` (`Disallow: /`).
- ✅ Nginx conf: `X-Robots-Tag` + location `/robots.txt` desde dist.

**Propuesta:**
1. En `frontend/index.html`:  
   `<meta name="robots" content="noindex, nofollow">`
2. En Nginx (SPA y, si aplica, API HTML):  
   `add_header X-Robots-Tag "noindex, nofollow" always;`
3. Servir `robots.txt` con `User-agent: *` / `Disallow: /` (complemento; no confiar solo en esto).
4. Opcional: en Search Console, pedir retiro de URL si alguna vez quedó indexada.

**Impacto usuario:** Ninguno.  
**Impacto seguridad:** Bajo (oscuridad útil); valor alto en **discreción** para una app interna pública.

---

## Orden de implementación recomendado

| Orden | Ítem | Estado | Esfuerzo | Riesgo deploy | Valor |
|------:|------|--------|----------|---------------|-------|
| 1 | A1 Rate limit por usuario | ✅ | Bajo | Bajo | Alto |
| 2 | A2 Bloqueo temporal de cuenta | ✅ | Medio | Bajo | Alto |
| 3 | A3 Alertas fuerza bruta | ✅ | Bajo–medio | Bajo | Alto |
| 4 | C5 No indexar en buscadores | ✅ | Muy bajo | Muy bajo | Medio (discreción) |
| 5 | B3 Política contraseñas | 🟡 | Bajo | Bajo | Medio |
| 6 | C3 Headers seguridad | ✅ | Bajo | Bajo | Medio |
| 7 | A4 CAPTCHA tras fallos | ❌ | Medio | Medio | Alto |
| 8 | B1 2FA admin/RH | ❌ | Alto | Medio | Muy alto |
| 9 | B2 Ajuste TTL token | 🟡 | Bajo | Medio | Medio |
| 10 | C1 CSP enforce | ❌ | Bajo | Medio | Medio |
| 11 | C2/C4 Nginx fail2ban / WAF | ❌ | Medio | Medio | Alto |

**Primera entrega (código listo 2026-07-22, sin deploy automático):** A1 + A2 + A3 + C3 + C5.  
**Al desplegar:** backup → `alembic upgrade head` → backend → build FE → copiar `nginx-optiexpress.conf` y `nginx -t && reload`.

---

## Criterios de aceptación (primera entrega)

1. ✅ Más de 5 fallos seguidos en la misma cuenta → no permite login durante 15 min. *(código; requiere migración en VPS)*
2. ✅ Más de 10 intentos/min desde la misma IP en login → HTTP 429.
3. ✅ Cada bloqueo o ráfaga queda en `actividad_log`. *(código)*
4. ✅ Login correcto sigue mostrando el mismo flujo (incluido `must_change_password`).
5. ✅ Portal remoto aplica rate limit por IP + por usuario + bloqueo de cuenta. *(código)*
6. Smoke test post-deploy: login OK admin, login fallido, 429/bloqueo, resto de API intacta.
7. Backup + snapshot Hostinger antes de migrar columnas nuevas.
8. ✅ La SPA tiene `noindex` (meta + conf Nginx `X-Robots-Tag` + `robots.txt`). *(aplicar conf/FE en VPS)*

---

## Fuera de alcance de este corto plazo

- Rate limit global en toda la API (puede afectar UI y agente biométrico).
- 2FA para todos los empleados.
- Reescritura de autenticación (OAuth/SSO corporativo).
- ~~Auditoría completa de módulos de negocio no relacionados con auth.~~ → **Nota 2026-07-22:** se empezó auditoría de negocio RH (empleados, incapacidades, saldos vacaciones, checadas especiales, etc.) fuera de este plan; no cierra A1–C5.

---

## Mensaje para dirección / TI

> Optiexpress ya está endurecido respecto a 2026-07 (hash, auth en APIs, rate limit por IP). Como la app es pública en internet, el siguiente paso corto es **frenar fuerza bruta por cuenta**, **avisar a TI**, **no indexarla en buscadores** (discreción) y, en cuanto se pueda, **2FA en administradores**. Sin eso, una contraseña débil o robada sigue siendo el riesgo principal.
