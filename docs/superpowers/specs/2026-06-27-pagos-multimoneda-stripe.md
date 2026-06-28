# Hash IA — Pagos multi-moneda (MercadoPago + Stripe): Design Spec

**Fecha:** 2026-06-27
**Autor:** José Antonio Olguín + Claude

---

## Objetivo

Cobrar las suscripciones de Hash IA en la moneda correcta según el cliente: **CLP en Chile vía MercadoPago** (ya funciona) y **USD/EUR fuera de Chile vía Stripe** (nuevo). El cliente **elige país/moneda en el checkout**. Disponible en panel web y en la APK.

---

## Decisiones tomadas

- Procesador internacional: **Stripe** (sobre PayPal).
- Moneda elegida por el **cliente en el checkout** (selector), no por IP.
- Ruteo: **CLP → MercadoPago**, **USD/EUR → Stripe**.
- Cuenta Stripe: en creación por el usuario (modo prueba ya activo). Test keys → `.env`.

## Precios por plan (borrador aprobado, ajustables antes de live)

| Plan | CLP | USD | EUR | créditos |
|---|---|---|---|---|
| free | 0 | 0 | 0 | 30 |
| basico | 9.900 | 15 | 15 | 100 |
| pyme | 24.900 | 35 | 35 | 210 |
| empresa | 49.900 | 69 | 69 | 600 |
| ilimitado | — | — | — | manual |

---

## Sección 1 — Modelo de datos y planes

### 1.1 `billing/planes.js` — precios por moneda

`PLANES[plan].precio` (number CLP) pasa a `PLANES[plan].precios = { CLP, USD, EUR }`. Helpers nuevos:
- `precioDe(plan, moneda)` → entero en esa moneda.
- `monedasSoportadas()` → `['CLP','USD','EUR']`.
- `procesadorPara(moneda)` → `'mp'` si CLP, `'stripe'` si USD/EUR. (función pura)

`mp.js` se actualiza para leer `precioDe(plan,'CLP')` (mantener CLP intacto). Todos los tests MP deben seguir verdes.

### 1.2 Migración `subscriptions`

```sql
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS procesador TEXT DEFAULT 'mp';   -- 'mp' | 'stripe'
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS moneda TEXT DEFAULT 'CLP';      -- 'CLP' | 'USD' | 'EUR'
```
(`external_id` ya existe: guarda el preapproval_id de MP o el subscription/customer id de Stripe.)

---

## Sección 2 — Backend Stripe

### 2.1 `billing/stripe.js` (nuevo, fetch inyectable como mp.js)

- `crearCheckoutSuscripcion({ plan, moneda, payerEmail, successUrl, cancelUrl })` → crea una **Checkout Session** modo `subscription` con un `price` en la moneda dada (price_data inline o priceId precreado) → devuelve `{ id, url }`. La `url` es el checkout hosteado de Stripe (se abre igual que el `init_point` de MP).
- `cancelarSuscripcion(stripeSubId)`.
- Verificación de firma del webhook (`verificarFirmaStripe(rawBody, sigHeader, secret)` con HMAC del esquema `t=...,v1=...`).

Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

### 2.2 Webhook Stripe — `POST /api/pagos/stripe/webhook`

Montado público (antes de auth), con **raw body** (Stripe firma el cuerpo crudo). Eventos → reusa repo existente:
- `checkout.session.completed` / `customer.subscription.created` → `activarSuscripcion(...)` (estado activa, guarda external_id, procesador='stripe', moneda).
- `invoice.paid` → renovar ciclo (reset créditos).
- `customer.subscription.deleted` / `...updated`(status canceled) → `cancelada`. Status `past_due`/`unpaid` → `morosa`.

### 2.3 Ruta de creación unificada

`POST /api/panel/suscripcion/crear` ahora acepta `{ plan, moneda }`:
1. Valida plan y moneda.
2. `procesadorPara(moneda)`:
   - `'mp'` → `createPreapproval(plan, backUrl, ownerEmail)` (ya existe).
   - `'stripe'` → `crearCheckoutSuscripcion({...})`.
3. Guarda `procesador` + `moneda` + `external_id` en `subscriptions`.
4. Devuelve `{ url }` (init_point de MP o checkout url de Stripe; nombre unificado `url`).

---

## Sección 3 — UI

### 3.1 Panel web (`public/panel/index.html`)

Antes de "Contratar": **selector de país/moneda** (🇨🇱 Chile/CLP · 🇺🇸 USD · 🇪🇺 EUR). Las tarjetas de plan muestran el precio en la moneda elegida. "Contratar" manda `{ plan, moneda }` y redirige a `url`.

### 3.2 APK (`gastos-app/`)

- `api.js`: `crearSuscripcion({ plan, moneda })` → `POST /api/panel/suscripcion/crear`… (ojo: la app usa token employee; se expone variante en `/api/app/suscripcion/crear` con la misma lógica, o se reusa). **Decisión:** agregar `POST /api/app/suscripcion/crear` (kind employee) que hace lo mismo, usando el email del employee/owner.
- Pantalla `PlanesView.jsx`: lista planes + selector de moneda + botón que abre la `url` en **navegador externo** (`@capacitor/browser` `Browser.open({ url })`).
- Entrada: botón "Mejorar plan"/"Suscripción" en el menú de la app.

---

## Sección 4 — Stripe Products/Prices

Dos caminos (elegir en implementación):
- **A (recomendado):** `price_data` inline en la Checkout Session (no requiere precrear productos; el precio sale de `planes.js`). Más simple, una sola fuente de verdad.
- B: precrear Products/Prices en Stripe y guardar priceIds en env. Más "ortodoxo" pero duplica la fuente de precios.

Se usa **A**: el precio viaja inline desde `planes.js`.

---

## Tests

- `planes.test.js`: precios por moneda, `precioDe`, `procesadorPara` (CLP→mp, USD/EUR→stripe).
- `stripe.test.js`: crearCheckout arma price_data correcto por moneda; firma webhook; errores.
- `webhook-stripe.test.js`: cada evento → estado correcto en subscriptions.
- `suscripcion-crear-router.test.js`: ruteo MP vs Stripe según moneda; CLP sigue usando MP.
- `migrate`: columnas procesador/moneda.
- App: `PlanesView` arma el request correcto; abre Browser con la url.

## Dependencia externa (usuario)

`STRIPE_SECRET_KEY=sk_test_...` y `STRIPE_WEBHOOK_SECRET=whsec_...` en `/root/atiko-gastos/.env`. Todo el código se construye/prueba con Stripe **mockeado**; la clave solo se necesita para la verificación en vivo y para registrar el endpoint del webhook en el dashboard de Stripe.

## Fuera de v1

- Prorrateo/cambio de plan en caliente (Stripe lo soporta; se hace después).
- Impuestos automáticos (Stripe Tax).
- Más monedas que CLP/USD/EUR.
