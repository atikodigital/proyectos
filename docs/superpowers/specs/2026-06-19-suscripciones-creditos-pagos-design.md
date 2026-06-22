# Diseño: Suscripciones, créditos de IA y portal de pago (Hash IA)

**Fecha:** 2026-06-19
**Estado:** Aprobado (diseño). Implementación por fases.
**Repos afectados:** `gastos/` (backend atiko-gastos), `gastos-app/` (app Android/web), `landing/` (marketing).

---

## 1. Objetivo

Permitir que las pymes paguen una **suscripción mensual** a Hash IA y que el sistema **mida y limite el consumo de IA** según el plan, evitando pérdida de margen. Hoy NO existe medición de consumo, ni planes, ni cobros en el backend (los "shots" y precios son solo marketing en la landing).

## 2. Decisiones tomadas (brainstorming)

1. **Alcance:** completo — cobro recurrente **+** medición real de consumo de IA con bloqueo por límite.
2. **Modelo de cuota:** **crédito de IA genérico** — un saldo único por empresa donde **toda** operación de IA descuenta según su **peso/costo** (imagen, voz, texto cuestan distinto). No es "1 shot = 1 imagen" simple.
3. **Cobro (híbrido):**
   - **Web** (panel autenticado): **Mercado Pago** suscripción automática (`preapproval`) + webhook.
   - **App Android (Google Play):** **Google Play Billing** + verificación servidor (RTDN).
   - Ambos canales alimentan la **misma** suscripción por empresa.
4. **Distribución:** la app irá a **Google Play** (no solo sideload). Por eso se exige Play Billing para la compra in-app; el cobro web (MP) es para suscriptores web. La app **no** debe derivar a pagar por fuera (anti-steering de Google).

## 3. Supuestos y restricciones

- **Compliance Google Play:** la compra dentro de la app DEBE usar Google Play Billing. La app puede **honrar** una suscripción comprada en la web (login), pero **no** puede ofrecer/mencionar el pago web dentro de la app. Comisión de Play: 15% (pyme <1M USD/año) – 30%.
- **Credenciales:** el Access Token de Mercado Pago y la Service Account de Google Play Developer API se configuran en el `.env`/config del backend. **Las genera el dueño; el sistema nunca las expone al cliente.**
- **Moneda:** CLP.
- **Sin doble cobro:** una empresa tiene a lo más una suscripción activa; si ya está activa por un canal, el otro canal no ofrece compra.

## 4. Modelo de créditos de IA

### 4.1 Definición
- **Saldo único por empresa, por ciclo mensual** (`creditos_limite`, `creditos_usados`).
- Cada operación de IA descuenta `peso` créditos según su tipo:

| Tipo de operación | Ejemplos | Peso (inicial, **a calibrar**) |
|---|---|---|
| `imagen` | boleta, cartola bancaria, catálogo por foto | 1 por imagen |
| `voz_min` | KALY/Varas por voz (Gemini Live) | N por minuto (el más caro) |
| `texto` | chat Varas/KALY, Match (conciliación), parsing de dictado | fracción baja por operación |

- Los pesos son **constantes configurables** (no hardcode disperso). **Calibración** = tarea de Fase 1: medir el costo real de la API de Gemini por imagen / minuto de audio / 1k tokens y fijar pesos para que el plan más barato siga siendo rentable.
- Planes (en créditos, ajustables): **Free 30 · Básico 100 · Pyme 250 · Empresa 800**.
- **Reinicio:** `creditos_usados → 0` al inicio de cada ciclo mensual de la suscripción (o mensual calendario para Free).
- **Bloqueo:** al llegar al límite, las nuevas operaciones de IA se rechazan con un error claro y accionable ("Sin créditos: mejora tu plan o espera la renovación el DD/MM"). Las operaciones que NO usan IA (ver reportes, navegar) siguen funcionando.

### 4.2 Función central
`consumirCredito(db, companyId, { tipo, cantidad })`:
1. Lee suscripción/plan vigente de la empresa.
2. Calcula créditos = `peso(tipo) * cantidad`.
3. Si `creditos_usados + creditos > creditos_limite` → lanza `SinCreditosError` (no ejecuta la operación).
4. Si alcanza → registra el consumo (auditoría) e incrementa `creditos_usados` de forma atómica.

Se invoca **antes** (reserva) o **después** (registro) de cada llamada de IA. Decisión por sitio: para operaciones caras (voz, imagen) verificar disponibilidad **antes**; para texto barato, registrar **después**.

### 4.3 Puntos de integración (a confirmar en el plan de Fase 1)
Operaciones de IA que cuestan plata, detectadas en `gastos/src`:
- **Imagen:** `ocr/gemini.js`, `ocr/extract.js`, `ocr/cartola.js`, `catalog/extraer.js`.
- **Voz:** `agent/kaly-proxy.js` (+ `agent/token.js`) — proxy de Gemini Live.
- **Texto:** `varas/gemini.js`, `varas/chat.js`, `match/componer.js`, y parsing en `expenses/intake.js` / `domain/lineas.js` / `auxiliares/mapear.js` / `agent/aprender.js` / `agent/gestionar.js`.

La Fase 1 incluye una **auditoría** para enumerar y cubrir TODOS los sitios (un único choke-point por familia si es posible).

## 5. Modelo de datos (Postgres, `gastos`)

Migración nueva (vía `scripts/migrate.js`, que es como corren las migraciones — el deploy no las corre solo):

- **`subscriptions`** (1 activa por empresa):
  - `id`, `company_id` (FK), `plan` (`free|basico|pyme|empresa`), `estado` (`activa|morosa|cancelada|trial`),
  - `source` (`mp|google_play|manual`), `external_id` (preapproval id / purchase token),
  - `ciclo_inicio`, `ciclo_fin`, `creditos_limite`, `creditos_usados`,
  - `created_at`, `updated_at`.
- **`ia_consumo`** (auditoría, para saber "en qué se va la plata"):
  - `id`, `company_id`, `tipo`, `cantidad`, `creditos`, `meta` (jsonb), `created_at`.
- Índices por `company_id`.
- Toda empresa nueva: fila `subscriptions` en `free` automáticamente (en el onboarding).

## 6. Pagos

### 6.1 Web — Mercado Pago (`preapproval`)
- Endpoint autenticado `POST /api/.../suscripcion/crear` → crea `preapproval` en MP para el plan elegido → devuelve `init_point` (link de pago) → el panel redirige.
- **Webhook** `POST /api/pagos/mp/webhook` (público, validado por firma/secreto):
  - pago aprobado → `estado=activa`, set plan/ciclo/límite, `creditos_usados=0`.
  - renovación → nuevo ciclo, reset de créditos.
  - rechazo/cancelación → `morosa`/`cancelada`.
- Config: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` en `.env`.

### 6.2 App — Google Play Billing
- La app usa el SDK de Play Billing para vender la suscripción in-app.
- Backend `POST /api/pagos/play/verify` valida el `purchaseToken` contra **Google Play Developer API** (Service Account) y activa el plan.
- **RTDN** (Real-time Developer Notifications vía Pub/Sub) → webhook que procesa renovación/cancelación/gracia.
- Config: `GOOGLE_PLAY_SA_JSON`, `GOOGLE_PLAY_PACKAGE` en `.env`.

### 6.3 Unificación
- Ambos canales escriben en la **misma** `subscriptions` de la empresa (campo `source`).
- El panel/app consulta `GET /api/.../suscripcion` para mostrar plan, saldo y estado.
- Reglas anti-doble-cobro y anti-steering (la app no muestra opción web).

## 7. Control de costo extra (KALY pública en la landing)

La KALY de voz de la landing (sin cuenta) es **costo sin ingreso**. Mitigación: tope corto por sesión/IP (p. ej. máx X minutos o un solo turno demo), gestionado en el proxy `kaly-ws`. Detalle en Fase 4.

## 8. Fases (cada una desplegable y testeable)

- **Fase 1 — Medición y créditos (sin pagos).**
  Modelo de datos (`subscriptions`, `ia_consumo`) + `consumirCredito()` + integración en TODOS los puntos de IA + Free por defecto en onboarding + endpoint de saldo + indicador "te quedan X" en panel/app + **calibración de pesos** con costo real. Resultado: el sistema ya mide y bloquea; todos en Free.
- **Fase 2 — Pagos web (Mercado Pago).**
  `preapproval` + webhook + activar/renovar/cancelar + "Mejorar plan" en el panel web.
- **Fase 3 — Pagos app (Google Play Billing).**
  SDK en la app + verificación servidor + RTDN + unificación con el mismo plan. Requisitos de publicación en Play.
- **Fase 4 — Pulido.**
  Pago fallido (gracia/avisos), cancelación, panel admin de suscripciones/consumo, tope de la KALY pública.

## 9. Detalle de Fase 1 (primer entregable)

**Alcance:**
- Migración: tablas `subscriptions` + `ia_consumo`; backfill: una `subscriptions` `free` por cada `company` existente; alta automática en onboarding.
- Módulo `gastos/src/billing/` (nuevo): `planes.js` (definición de planes + pesos configurables), `creditos.js` (`consumirCredito`, `saldo`, `resetCiclo`, `SinCreditosError`), `repo.js`.
- Integrar `consumirCredito()` en cada punto de IA (auditoría + choke-points).
- Endpoint `GET /api/.../suscripcion` (plan, límite, usado, restante, fin de ciclo).
- UI mínima en panel/app: indicador de saldo y estado "sin créditos".
- Calibración: script/medición de costo real → fijar pesos iniciales.

**Tests (TDD):**
- `consumirCredito` descuenta correcto por tipo/peso; bloquea al exceder; registra auditoría; es atómico.
- `resetCiclo` reinicia usado.
- Onboarding crea suscripción `free`.
- Endpoint de saldo devuelve los números correctos.

**Criterios de aceptación Fase 1:**
- Una empresa nueva nace en Free con 30 créditos.
- Cada operación de IA descuenta y, al llegar a 0, se bloquea con mensaje claro.
- El consumo queda auditado por tipo.
- Pesos calibrados de modo que el costo de API < precio del plan.

## 10. Decisiones abiertas (a fijar en el plan / con datos)
- Pesos exactos por tipo (requiere medir costo real de Gemini).
- Números finales de créditos por plan (¿mantener 30/100/250/800?).
- ¿Reinicio mensual calendario o por fecha de suscripción? (propuesto: por fecha de ciclo de la suscripción; Free = mensual calendario).
- Periodo de gracia ante pago fallido (Fase 4).

## 11. Fuera de alcance (YAGNI por ahora)
- Prorrateo al cambiar de plan a mitad de ciclo.
- Múltiples monedas / mercados fuera de Chile.
- Facturación/boleta electrónica automática del cobro (se evalúa aparte).
- Cupones/descuentos.

---

**Próximo paso:** plan de implementación de **Fase 1** (skill writing-plans).
