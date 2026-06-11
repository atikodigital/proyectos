# Diseño — Fase Ads · Brazo de publicidad de la máquina

**Fecha:** 2026-06-11
**Estado:** Diseño inicial (investigación verificada; pendiente de probar conectores)
**Proyecto:** atiko-agent · redes sociales (Fase Ads)
**Origen:** reel de referencia de José (alvarogomez.ecom): "conecta Meta Ads dentro de Claude con el MCP de Facebook y Higgsfield".

## 1. Hallazgos de investigación (jun 2026, verificados)

- **MCP OFICIAL de Meta Ads** (abierto el 29-abr-2026): `https://mcp.facebook.com/ads`. **29 herramientas** en 4 grupos: reporting de performance, gestión de campañas (crear/editar/presupuestos/pausar), gestión de catálogos, y diagnóstico de señales (Pixel/CAPI). Unificado FB + IG (feed/story/reel) + Audience Network. **Gratis en open beta. OAuth 2.0. SIN App Review de developer. Vía oficial = sin riesgo de ban.** Requiere plan Claude Pro/Max/Team para MCP.
- **Higgsfield MCP/CLI**: 30+ modelos (Soul, Cinema Studio, Flux, Seedream, Kling, Veo), imágenes 4K y videos hasta 15s. **Marketing Studio**: el brand kit (colores, fuentes, tono) se carga automáticamente en cada generación desde Claude. **Ad Engine**: encuentra nichos top, genera videos en formatos (UGC, TV spot, Wild Card). Créditos de pago (los del plan Higgsfield sirven en agentes conectados). Setup: instalar CLI + auth por navegador.

## 2. Arquitectura del brazo de Ads

```
CLAUDE (cerebro/orquestador — esta sesión)
  ├─ Creativos:
  │   ├─ NUESTRA máquina (reels/imágenes propios: Gemini+Remotion+HeyGen) → $0.05-0.50/pieza
  │   └─ HIGGSFIELD MCP (cinematográfico/UGC premium, brand kit auto) → créditos, calidad ads
  ├─ META ADS MCP (oficial): crear campañas/adsets/ads, subir creativos, presupuestos,
  │   leer performance, pausar perdedores, escalar ganadores
  └─ PLANIFICADOR (4a): los creativos orgánicos ya fluyen; los de ads van directo a campañas
```

**Flujo objetivo:** "Lánzame un ad de Atiko Gastos con $10/día" → Claude genera el creativo (nuestra máquina o Higgsfield según calidad pedida) → crea campaña+adset+ad vía Meta Ads MCP → reporta métricas y optimiza (pausar/escalar) en conversación.

## 3. Plan de adopción

1. **Conectar Meta Ads MCP** (registrado ya en Claude Code: `meta-ads` → `https://mcp.facebook.com/ads`). José autentica vía `/mcp` (OAuth con su cuenta de anunciante). Probar las 29 tools: leer cuentas/campañas primero (read-only), luego crear una campaña de prueba PAUSADA.
2. **Higgsfield** (opcional, cuando José quiera calidad cinematográfica): cuenta + plan de créditos en higgsfield.ai → instalar CLI + MCP → cargar brand kit de Atiko en Marketing Studio.
3. **Workflow documentado** (sin código nuevo): prompts estándar para "crear ad" (creativo + campaña pausada + revisión humana antes de activar). El humano SIEMPRE activa la campaña (gate de gasto).
4. **Integración futura con la máquina** (código, si se vuelve repetitivo): endpoint `/api/ads/creative` que genere variantes de creativos (nuestros motores) listos para subir vía MCP; items `format: "ad"` en el planificador con presupuesto y estado de campaña.

## 4. Reglas (gasto = dinero real)

- Toda campaña se crea **PAUSADA**; un humano revisa creativo+segmentación+presupuesto y la activa.
- Límites de presupuesto explícitos en cada prompt de creación.
- Reporting: leer métricas es seguro (read-only); editar/pausar requiere confirmación de José.

## 5. Estilo "meme/hype creator" (implementado ya)

El motor de reels acepta `style: "meme"` (frases cortas impactantes, números concretos, CTA "comenta X") — el formato del reel de referencia, útil tanto para orgánico como para creativos de ads UGC.

## 6. Fuera de alcance ahora

Automatizar la activación de campañas sin humano; reglas de auto-optimización de presupuesto; catálogos de productos (existe en el MCP, se adopta cuando haya e-commerce de cliente).
