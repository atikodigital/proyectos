# Diseño — atiko-agent · redes sociales

**Fecha:** 2026-06-10
**Estado:** Diseño aprobado (pendiente plan de implementación)
**Autor:** José Antonio Olguín + Claude

---

## 1. Visión

Plataforma propia de Atiko Digital para **fábrica de contenido + publicación autónoma en redes sociales**, ofrecida como servicio a clientes (agencia). Combina:

- **Inteligencia:** analizar contenido viral del nicho del cliente para saber qué crear.
- **Generación:** producir reels/posts (guion + voz + imágenes/video) automáticamente.
- **Publicación:** subir a las redes del cliente en horario óptimo.
- **Orquestación:** un panel multi-cliente con marca Atiko, con humano en el loop (aprobación) para evitar bans.

Objetivo: que el ~90% corra en infraestructura propia (VPS de Atiko, `atiko-agent`), con coste marginal por contenido de centavos, y siendo **código propio** (sin licencias que aten el SaaS).

## 2. Principio rector: build vs buy

> **Posee lo que te diferencia. Adopta solo la fontanería commodity dolorosa de mantener.**

- **Propio (la ventaja de Atiko):** el cerebro IA (análisis + guiones), la fábrica de contenido (Remotion + voz + imágenes), el panel/orquestación, y **el publicador propio**.
- **No es de nadie (se pide igual):** el acceso a las redes. App Review de Meta/TikTok/LinkedIn/Google y la API de pago de X. Esto aplica tanto si se construye como si se usa Mixpost.

Decisión: **construir el publicador propio** dentro de `atiko-agent` (no Mixpost), porque el agente **ya integra la Graph API de Meta** (WhatsApp) — se reusa la app de Meta existente. Mixpost queda como red de seguridad si el mantenimiento se vuelve insostenible.

## 3. Stack base (ya existente, se reutiliza)

`atiko-agent` — Node + Express. Deps actuales: axios, cors, dotenv, express, express-rate-limit, multer, openai, uuid, ws.

- Patrón: `routes/` + `services/`.
- Ya integra **Graph API de Meta** vía `services/whatsapp.js` (WhatsApp Business) → **existe una app de Meta Business funcionando**, con manejo de tokens y webhooks ya resuelto.
- Desplegado en VPS Hostinger (pm2 + Caddy) en `agent.atikodigital.cl`.
- Datos: Postgres `atiko-db` (ya en uso por el CRM propio).

Conclusión: el módulo de redes sociales **no introduce tecnología nueva** — entra como nuevas rutas + servicios en el mismo agente.

## 4. Arquitectura (híbrida, Gemini de protagonista)

```
PANEL ATIKO (marca propia, multi-cliente) ── sobre CRM + atiko-db
        │
atiko-agent = CEREBRO (Node) ── orquesta + CRON + gate de aprobación humana
        │
 ┌──────┼───────────┬───────────┬───────────┐
 │      │           │           │           │
🧠 INTEL  ✍️ GUION    🎙️ VOZ      🎨 VISUAL    🏷️ META/SEO
Gemini    Gemini     Gemini TTS  Gemini      Gemini Flash
multimodal Flash      (premium:   Nano Banana (hashtags,
(ve el     (premium:  ElevenLabs)  (premium:   títulos,
 video)    Claude)               Flux/Replic) 1er comentario)
        │
🎬 COMPOSICIÓN: Remotion + FFmpeg (Node, propio) → MP4 9:16
        │
✋ APROBACIÓN HUMANA (panel) ── anti-ban
        │
📤 PUBLICADOR PROPIO (adaptadores por red) → FB · IG · TikTok · X · LinkedIn
        │
📊 MÉTRICAS → realimentan la inteligencia
```

### Decisiones de modelos (híbrido)
- **Gemini** como caballo de batalla: análisis multimodal de reels (transcribe + saca gancho/retención/CTA en una sola llamada — reemplaza Whisper), guiones de volumen, imágenes (Nano Banana / Imagen), voz (Gemini TTS), metadata/hashtags. Ya está integrado/pagado (se usa en el producto Gastos).
- **Premium opcional** (solo clientes que pagan calidad): Claude para guiones, ElevenLabs para voz, video IA generativo (Kling/Veo) cuando aplique.
- **Composición** siempre Remotion (gratis si Atiko ≤3 empleados; verificar licencia si crece).

## 5. Módulo en el código

```
agent/
├── routes/
│   └── social.js              ← NUEVO: /api/social/connect, /publish, /schedule, /accounts
└── services/
    ├── whatsapp.js            ← existente (Graph API Meta — reusable)
    └── social/                ← NUEVO
        ├── token-store.js     ← tokens OAuth por cliente/red en atiko-db, con refresh
        ├── queue.js           ← cola de publicaciones
        ├── scheduler.js       ← CRON: publica en horario óptimo
        └── adapters/          ← un archivo por red, interfaz común
            ├── meta-facebook.js
            ├── meta-instagram.js
            ├── tiktok.js
            ├── linkedin.js
            └── x.js
```

**Interfaz común de cada adaptador:** `connect()`, `publish(media, caption, opts)`, `refreshToken()`, `getStatus()`. El cerebro llama `publisher.publish(red, ...)` sin conocer los detalles de cada API.

## 6. Fases de construcción (orden)

| Fase | Entregable | Riesgo |
|------|-----------|--------|
| **1. Publicador Meta** | FB Pages + IG Reels publicando desde el agente (reusa app Meta) | medio (App Review) |
| 2. Publicador TikTok | TikTok Content Posting API (audit Direct Post) | medio |
| 3. Publicador LinkedIn | LinkedIn Community Mgmt API | alto (aprobación selectiva) |
| 4. Publicador X | X API v2 (de pago, ~$100/mes — solo si cliente lo pide) | bajo (técnico) / coste |
| 5. Motor de generación | Gemini análisis + guion + voz + Remotion → MP4 | medio |
| 6. Capa SaaS | multi-cliente, calendario, aprobación, facturación, anti-ban + etiquetado IA | alto |

**Cada fase es vendible por sí sola y se construye/prueba aislada.**

## 7. Primera fase a implementar: Publicador Meta (FB + IG Reels)

### Alcance
- Conectar (OAuth) una **Página de Facebook** y su **cuenta de Instagram Business/Creator** vinculada, del cliente.
- Publicar en **Facebook Page** (texto + imagen/video) vía Graph API.
- Publicar **Instagram Reels**: subir MP4 a URL pública → crear contenedor (`POST /media`) → polling de estado → `POST /media_publish`.
- Guardar y refrescar tokens en `atiko-db`.
- Programar publicación (scheduler CRON).

### Requisitos de plataforma (los pide José, no se evitan)
- Extender la app de Meta existente con permisos: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`.
- Pasar **App Review de Meta** para esos permisos (verificación de negocio + screencast + política de privacidad).
- La cuenta IG del cliente debe ser **Business/Creator** vinculada a una Página de FB.

### Fuera de alcance (fases posteriores)
- Generación de contenido (Fase 5). En la Fase 1 el MP4/caption se sube manualmente o desde el panel para probar el publicador.
- Multi-cliente formal y facturación (Fase 6).

## 8. Flujo de datos (plataforma completa)

1. Onboarding cliente → conectar sus redes (OAuth) → tokens en atiko-db.
2. Inteligencia: el agente analiza virales del nicho (Gemini multimodal sobre videos públicos; fuente: Meta Business Discovery o conector de análisis).
3. Estrategia: Gemini decide qué contenido crear (tema, gancho, formato).
4. Generación: guion → voz → imágenes → Remotion compila MP4 + metadata/hashtags.
5. Aprobación humana en el panel (anti-ban + etiquetado de contenido IA).
6. Publicación: el publicador propio sube a la red en horario óptimo.
7. Métricas: se leen resultados y realimentan el paso 2.

## 9. Riesgos y mitigaciones

- **Bans / shadowban por contenido masivo IA:** humano en el loop (aprobación), límites de volumen por cuenta, etiquetado de contenido sintético, calidad sobre cantidad. (Evitar el patrón "money printer" desatendido.)
- **App Review lento/selectivo:** empezar por Meta (ya hay app y experiencia); diferir LinkedIn/TikTok Direct Post.
- **Licencias:** NO basar el código en repos AGPL (MoneyPrinterV2 es AGPL-3.0 → obligaría a abrir todo el SaaS). Usar solo MIT/permisivas (AdGen MIT como referencia, Remotion, código propio).
- **Remotion licencia de empresa:** gratis si Atiko ≤3 empleados; verificar coste por seat en remotion.pro si el equipo crece.
- **X de pago:** ~$100/mes; ofrecer solo como add-on que se cobra al cliente.
- **Dependencia de Meta/plataformas:** cambios de API rompen integraciones → el coste real de "hacerlo propio" es el mantenimiento. Mixpost ($299 una vez) queda como fallback.

## 10. Costes

**Pago único:** ninguno obligatorio si se construye el publicador (Mixpost Pro $299 es opcional/fallback).

**Mensual fijo:** $0–30 (Windsor $0 trial o se clona con Meta API; Remotion $0 si ≤3 empleados; VPS ya pagado).

**Variable por reel (con Gemini):** ~$0.05–0.15 (análisis + guion + voz + imágenes; render en VPS = $0). Con video IA generativo premium: $2–10.

**Modelo de negocio:** cobrar al cliente tarifa de agencia ($200–500/mes) sobre coste de centavos por reel → margen muy alto.

## 11. Lo que necesita José (no es código)

- Decidir cuenta(s) de cliente reales con contenido para validar (las de Atiko están vacías).
- Extender la app de Meta + iniciar el App Review (FB Pages + IG publishing).
- Confirmar tamaño del equipo para la licencia de Remotion.

## 12. Próximo paso

Plan de implementación detallado de la **Fase 1 — Publicador Meta (FB + IG Reels)** vía el skill writing-plans.
