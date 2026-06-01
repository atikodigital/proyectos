# Catálogo de Automatizaciones para Pymes — Agencia Atiko

**Documento interno · 2026-05-21**
Investigación basada en datos reales del mercado chileno (n8n, Make, SII, WhatsApp Business API).

---

## TL;DR — La oferta clave de Atiko

> **"Sacamos del medio las tareas que agobian a tu pyme. Tu negocio sigue funcionando mientras tú duermes."**

Stack técnico recomendado:

| Herramienta | Cuándo usarla | Costo |
|-------------|---------------|-------|
| **n8n self-hosted** | Default para clientes serios — dueño del dato, sin tope mensual | Servidor: $15.000–$40.000 CLP/mes (DigitalOcean / Hetzner) |
| **Make** | Cliente sin volumen alto, no quieren server | Gratis 1.000 ops/mes; pago USD $9/mes |
| **Google Apps Script** | Integraciones puras con Google Workspace (Sheets, Gmail, Calendar, Drive) | Gratis |
| **WhatsApp Business API** (vía Twilio o 360dialog) | Mensajería oficial sin limitaciones | USD $0.05 por conversación iniciada por el negocio |
| **OpenAI / Claude / Gemini API** | Para parseo de PDFs, imágenes, texto libre | USD $5–$50/mes según volumen |

**Margen Atiko sugerido:**
- Setup automatización simple: $290.000–$490.000 CLP
- Setup automatización compleja: $590.000–$1.290.000 CLP
- Mantenimiento mensual por automatización: $19.000–$59.000 CLP

---

## 1. Top 10 automatizaciones más demandadas en Chile (con stack y precio)

### 🔥 #1 — Voucher de WhatsApp → Google Sheets

**Dolor del cliente:** "Recibo 50 transferencias al día por WhatsApp y las tengo que pasar a mano a una planilla."

**Solución técnica:**
1. WhatsApp Business API recibe foto/PDF del voucher
2. OCR con IA (Claude Vision o Gemini Vision) extrae: monto, fecha, banco, nº operación
3. Validación: detecta duplicados por nº operación
4. Append a Google Sheets con timestamp + foto en Google Drive
5. Respuesta automática al cliente: "✓ Pago registrado por $XX.XXX"

**Stack:** n8n + Twilio WhatsApp + Claude/Gemini Vision API + Google Sheets API

**Precio sugerido:**
- Setup: **$390.000 CLP** (8-12 horas)
- Mantenimiento: **$29.000 CLP/mes**
- Ahorro cliente: 2-3 horas diarias × $5.000/hora = $300.000+ CLP/mes

---

### 🔥 #2 — Cobranza automática por WhatsApp

**Dolor:** "Pierdo plata porque no me acuerdo de cobrar a clientes morosos."

**Solución técnica:**
1. Google Sheets / Excel / CRM con clientes y fechas de pago
2. Cron diario chequea cuentas vencidas
3. WhatsApp envía recordatorio con: monto, fecha vencida, link de pago (Webpay / Mercado Pago / transferencia)
4. Escala: día +1 mensaje suave, día +7 mensaje firme, día +15 escala a humano

**Stack:** n8n + Twilio + Webpay / Mercado Pago API + Google Sheets

**Precio sugerido:**
- Setup: **$490.000 CLP**
- Mantenimiento: **$39.000 CLP/mes**
- Argumento de venta: las pymes que automatizan cobranza reducen 70% el trabajo manual y cobran 30-50% más rápido.

---

### 🔥 #3 — Emisión automática de boletas SII (DTE)

**Dolor:** "Cada venta tengo que entrar al SII y emitir la boleta a mano."

**Solución técnica:**
1. Cuando entra venta (Webpay / formulario / WhatsApp) se gatilla flujo
2. n8n llama API del SII (o de Acepta, Haulmer, OpenFactura)
3. Genera DTE, lo envía al cliente por email/WhatsApp
4. Registra en Sheets/CRM para conciliación

**Stack:** n8n + Acepta.com API (~USD $20/mes) o Haulmer API

**Precio sugerido:**
- Setup: **$590.000 CLP** (más complejo por validaciones SII)
- Mantenimiento: **$49.000 CLP/mes**
- Cliente ideal: e-commerce, restaurantes, tiendas que emiten >30 boletas/día

---

### 🔥 #4 — Agendamiento automático en Google Calendar desde WhatsApp

**Dolor:** "Atiendo agenda yo mismo, no doy abasto."

**Solución técnica:**
1. Cliente escribe "quiero hora para el viernes a las 15"
2. Agente IA detecta intención y consulta Google Calendar
3. Si disponible, confirma; si no, ofrece 3 alternativas cercanas
4. Crea evento, envía recordatorio 24h antes y 1h antes
5. Detecta cancelaciones / reagendamientos

**Stack:** Twilio + Claude/GPT (parsing intención) + Google Calendar API + n8n

**Precio sugerido:**
- Setup: **$390.000 CLP**
- Mantenimiento: **$29.000 CLP/mes**
- Cliente ideal: clínicas dentales, kinesiólogos, peluquerías, abogados, contadores, coaches.

---

### 🔥 #5 — Conciliación bancaria automática

**Dolor:** "Tengo que cruzar a mano transferencias del banco con facturas emitidas."

**Solución técnica:**
1. API del banco (vía Cardda / Tapi / Fintoc) entrega movimientos diarios
2. Cruce con DTEs emitidos por RUT y monto
3. Marca facturas como "pagadas" en planilla/CRM
4. Alerta de transferencias sin factura asociada (posibles ventas no registradas)

**Stack:** n8n + Cardda API o Fintoc API (Chile) + Google Sheets

**Precio sugerido:**
- Setup: **$690.000 CLP**
- Mantenimiento: **$49.000 CLP/mes**
- Cliente ideal: empresas con >50 facturas/mes

---

### 🔥 #6 — Reportes diarios automáticos por WhatsApp

**Dolor:** "Quiero saber cómo va mi negocio sin abrir 5 dashboards."

**Solución técnica:**
1. n8n recopila al cierre del día: ventas (Webpay/Mercado Pago), leads (formulario web), tickets (chatbot), redes sociales (Meta API)
2. Genera resumen en lenguaje natural con IA: "Hoy: 23 ventas ($1.450.000), 8 leads nuevos, 4 conversaciones del bot."
3. Envía a WhatsApp del dueño a las 19:00

**Stack:** n8n + APIs de fuentes + Claude/GPT para summarization + Twilio

**Precio sugerido:**
- Setup: **$290.000 CLP**
- Mantenimiento: **$19.000 CLP/mes**

---

### 🔥 #7 — Onboarding de cliente nuevo

**Dolor:** "Cada cliente nuevo me toma 1 hora dar de alta."

**Solución técnica:**
1. Cliente llena formulario web (Typeform o nativo)
2. n8n crea: ficha en CRM, carpeta en Drive, contrato con datos pre-rellenados, envía email bienvenida con login, agenda kickoff en Calendar
3. Notifica al equipo en Slack/WhatsApp

**Stack:** n8n + Typeform/Tally + Google Drive/Docs + DocuSign/HelloSign + Slack

**Precio sugerido:**
- Setup: **$390.000 CLP**
- Mantenimiento: **$25.000 CLP/mes**

---

### 🔥 #8 — Sincronización de stock entre canales

**Dolor:** "Vendo el mismo producto en Mercado Libre, Shopify y físico. Se me agota stock y aún sale 'disponible'."

**Solución técnica:**
1. Stock maestro en Google Sheets o sistema central
2. n8n sincroniza cada 15 min con: Mercado Libre, Shopify, WooCommerce, Instagram Shopping
3. Si stock <5, alerta WhatsApp al encargado
4. Si llega venta, descuenta en todos los canales

**Stack:** n8n + APIs (MercadoLibre, Shopify, Woo, Meta)

**Precio sugerido:**
- Setup: **$590.000 CLP**
- Mantenimiento: **$49.000 CLP/mes**

---

### 🔥 #9 — Lead → CRM → email + WhatsApp + tarea

**Dolor:** "Llegan leads de Meta Ads y se pierden porque no los miramos a tiempo."

**Solución técnica:**
1. Meta Lead Ads enviado a webhook
2. n8n: crea contacto en CRM (Hubspot/Pipedrive/Notion), envía email bienvenida, envía mensaje WhatsApp al lead, crea tarea para vendedor en Trello/Notion
3. Si lead no responde en 24h, recordatorio al vendedor

**Stack:** n8n + Meta Lead Ads API + CRM API + Twilio

**Precio sugerido:**
- Setup: **$390.000 CLP**
- Mantenimiento: **$29.000 CLP/mes**

---

### 🔥 #10 — Encuestas NPS post-venta automáticas

**Dolor:** "Quiero saber qué piensan mis clientes pero no me da el tiempo."

**Solución técnica:**
1. Cuando una venta se marca "entregada", esperar 3 días
2. Enviar WhatsApp con pregunta NPS (0-10) + 1 pregunta abierta
3. Si respuesta ≥9: pedir reseña Google / referral
4. Si respuesta ≤6: escalar a humano para recuperar cliente

**Stack:** n8n + Twilio + Google Sheets (registro) + opcional Google Business API

**Precio sugerido:**
- Setup: **$290.000 CLP**
- Mantenimiento: **$19.000 CLP/mes**

---

## 2. Automatizaciones por industria

### 🍽️ HORECA (Restaurantes, Cafés, Hoteles)
1. **Reservas WhatsApp → Google Calendar** ($390k)
2. **Pedidos WhatsApp → comanda cocina** ($590k)
3. **Reseñas Google Maps → alerta + respuesta IA** ($290k)
4. **Stock insumos bajo → alerta WhatsApp** ($290k)
5. **Encuesta post-visita NPS** ($290k)

### ⚖️ Servicios Profesionales (Abogados, Contadores, Médicos)
1. **Agendamiento WhatsApp → Google Calendar** ($390k)
2. **Recordatorio cita 24h + 1h antes** ($190k)
3. **Onboarding cliente** (formulario → CRM → contrato → carpeta Drive) ($390k)
4. **Reporte mensual automático al cliente** ($290k)
5. **Cobranza honorarios automática** ($490k)

### 🛒 E-commerce
1. **Voucher transferencia WhatsApp → registro pago** ($390k)
2. **Boletas SII automáticas** ($590k)
3. **Stock sincronizado multi-canal** ($590k)
4. **Carrito abandonado → WhatsApp + email** ($390k)
5. **Conciliación bancaria** ($690k)
6. **Reporte ventas diario WhatsApp** ($290k)

### 🏗️ Inmobiliarias
1. **Meta Lead Ads → CRM + WhatsApp** ($390k)
2. **Calificación IA del lead** ($590k)
3. **Agenda visita propiedad** ($390k)
4. **Recordatorio + check-in pre-visita** ($190k)

### 🎓 Educación / Coaching
1. **Inscripción curso → Hotmart/Teachable → email bienvenida** ($390k)
2. **Drip campaign onboarding** ($290k)
3. **Recordatorio clases en vivo** ($190k)
4. **Encuesta finalización curso + emisión certificado** ($390k)

---

## 3. Estructura de precios para Atiko

### Modalidad A — Incluido en suscripción (lo que ya pusimos en el sitio)

| Plan | Automatizaciones incluidas |
|------|----------------------------|
| **Atiko Start** ($89k/mes) | 1 automatización simple (ej: voucher → Sheets) |
| **Atiko Pro** ($190k/mes) | 3 automatizaciones custom mensuales |
| **Atiko 360°** ($390k/mes) | Hasta 5 automatizaciones nuevas /mes (ilimitadas en uso) |

### Modalidad B — Add-on por proyecto (para clientes sin suscripción)

| Tipo | Setup | Mantención |
|------|-------|------------|
| Automatización simple (1 input → 1 output) | $290.000 | $19.000/mes |
| Automatización media (2-3 sistemas) | $490.000 | $29.000/mes |
| Automatización compleja (4+ sistemas + IA) | $890.000 | $59.000/mes |
| Audit de procesos pyme (recomendación + roadmap) | $290.000 | — |

### Modalidad C — Implementación llave en mano (ticket alto)

Para clientes con >5 procesos repetitivos: paquete único $2.490.000–$4.990.000 CLP (instalación n8n self-hosted en su servidor + 8-12 automatizaciones documentadas + training equipo + 3 meses de soporte).

---

## 4. Argumentos de venta (los que cierran)

### Para el dueño de la pyme
> "Tu cobranza está perdiendo 30% en mora simplemente porque no recordás cobrar. Con una automatización de $490.000 (uno solo de tus retrasos al mes la paga) reducís morosidad en 6-8 semanas."

### Para el contador / administrador
> "Esto te ahorra 15 horas a la semana de pasar vouchers a Excel. Esas 15 horas son tuyas para hacer algo que la máquina no puede."

### Para el dueño técnico-skeptic
> "Usamos n8n self-hosted, vos sos dueño del flujo y los datos están en tu servidor. Si un día querés llevártelo, te entrego el código fuente. No estás amarrado."

### Para el cliente bajo presupuesto
> "Empezá con UNA automatización: la que más te duele. Si te ahorra una hora al día, pagaste el setup en menos de 2 meses. Después escalás."

---

## 5. Plantillas de discovery (para cotizar bien)

Al hablar con un prospecto, **preguntá esto antes de cotizar**:

1. ¿Qué tarea repetís más veces a la semana?
2. ¿Cuánto tiempo te toma cada vez?
3. ¿En qué sistema vive el dato de entrada? (WhatsApp, email, formulario, planilla…)
4. ¿Dónde tiene que terminar el dato? (CRM, planilla, banco, sistema interno…)
5. ¿Qué pasa hoy si nadie hace esa tarea? (multa, queja, venta perdida…)
6. ¿Cuántas excepciones / casos especiales hay?
7. ¿Tu equipo tiene acceso a las APIs de los sistemas involucrados?

Las preguntas 1-2 cuantifican el ROI. Las 3-4 definen el alcance técnico. La 5 detecta urgencia real. La 6 te avisa de scope-creep. La 7 es el bloqueo técnico más común.

---

## 6. Stack de despliegue recomendado

### Infraestructura

```
Cliente con bajo volumen
└── Make.com (cuenta del cliente) — fácil de pasar después

Cliente serio / con volumen
├── DigitalOcean droplet $6 USD/mes
├── n8n self-hosted (Docker)
├── PostgreSQL + Redis
├── Caddy / nginx (SSL automático)
└── UptimeRobot (gratis, alertas)
```

### Estructura del repo Atiko (template interno)

```
atiko-automations/
├── clients/
│   ├── cliente-x/
│   │   ├── flows/        ← export JSON de n8n
│   │   ├── creds.env     ← variables (gitignored)
│   │   └── README.md     ← documentación cliente-específica
│   └── cliente-y/
├── templates/            ← flujos reutilizables base
│   ├── voucher-to-sheets.json
│   ├── cobranza-whatsapp.json
│   ├── sii-dte.json
│   └── ...
└── docs/
    └── playbook.md       ← protocolo Atiko
```

---

## 7. Sources

- [Álvaro Cofré — Automatización IA pymes Chile](https://alvarocofre.dev/articulos/automatizacion-ia-pymes-chile)
- [Chatsell — Automatizar cobros con WhatsApp IA 2026](https://chatsell.net/automatizar-cobros-recordatorios-pago-whatsapp-ia-pymes/)
- [Cardda — APIs transferencias bancarias Chile 2026](https://blog.cardda.com/4-apis-para-automatizar-tus-transferencias-bancarias-en-chile/)
- [Contabilium — Automatización contable pymes](https://contabilium.com/blog/automatizacion-de-procesos-contables-para-pymes-una-guia-paso-a-paso/)
- [Juan Merodio — 10 automatizaciones de alto impacto](https://www.juanmerodio.com/automatizaciones-pymes/)
- [SII Chile — Sistema de boletas electrónicas](https://www.sii.cl/servicios_online/3532-3810.html)
- [Acepta Chile — Contabilidad automatizada pyme](https://acepta.com/blog/2025/08/22/contabilidad-automatizada/)
- [Parseur — Zapier vs Make vs n8n comparativa](https://parseur.com/blog/zapier-n8n-make)
- [Coderhouse — n8n vs Make vs Zapier 2026](https://www.coderhouse.com/coderlibrary/n8n-vs-make-vs-zapier-mejor-herramienta-automatizacion-ia-2026)
