# Hook: registro-leads

**Tipo:** Hook de evento (inbound multi-canal)
**Trigger:** Lead entrante por cualquier canal (Instagram DM, WhatsApp, formulario web, LinkedIn message, email)
**AcciÃ³n:** Registra el lead en Sheets centralizado + crea ficha en CRM + dispara WhatsApp a JosÃ© + responde al lead automÃ¡ticamente
**Esfuerzo de implementaciÃ³n:** ~3 horas
**Costo operacional:** USD ~$5/mes (Twilio mensajes + Anthropic clasificaciÃ³n)

## Por quÃ© este hook

El lead que llega y no se responde en <1 hora pierde 60% de probabilidad de conversiÃ³n. La mayorÃ­a de leads de Atiko van a llegar fuera de horario (gente que ve Instagram a las 22h, sÃ¡bado al mediodÃ­a, etc.). Necesitas:

1. Capturar el lead en segundo cero (independiente del canal)
2. Responder algo dentro de los primeros 5 min
3. Centralizar para no perderse nada entre 5 canales

## Arquitectura

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚Instagramâ”‚  â”‚WhatsApp â”‚  â”‚Web formâ”‚  â”‚LinkedIn  â”‚  â”‚ Email  â”‚
â”‚ DM      â”‚  â”‚         â”‚  â”‚        â”‚  â”‚ message  â”‚  â”‚        â”‚
â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”¬â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”¬â”€â”€â”€â”€â”˜
     â”‚            â”‚           â”‚            â”‚            â”‚
     â”‚ Manychat   â”‚ Twilio    â”‚ webhook    â”‚ Zapier    â”‚ Gmail
     â”‚ webhook    â”‚ webhook   â”‚ direct     â”‚ trigger   â”‚ filter
     â”‚            â”‚           â”‚            â”‚           â”‚
     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â”‚
                            â–¼
                    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                    â”‚ n8n: Webhook   â”‚
                    â”‚ unificado      â”‚
                    â””â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â”‚
                            â–¼
                    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                    â”‚ Normalizar payload         â”‚
                    â”‚ Extraer: nombre, contacto, â”‚
                    â”‚   canal, mensaje, fecha    â”‚
                    â””â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â”‚
                            â–¼
                    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                    â”‚ Claude IA: clasificar lead â”‚
                    â”‚ - Hot / Warm / Cold        â”‚
                    â”‚ - Servicio interesado      â”‚
                    â”‚ - Score 1-10               â”‚
                    â””â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                            â”‚
                  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                  â”‚                   â”‚
                  â–¼                   â–¼
        â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
        â”‚ Append Sheets    â”‚  â”‚ Crear ficha CRM  â”‚
        â”‚ "Leads-Atiko"    â”‚  â”‚ stage: Lead nuevoâ”‚
        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                  â”‚
                  â–¼
        â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
        â”‚ Twilio: WhatsApp a JosÃ©          â”‚
        â”‚ "ðŸ”¥ Lead nuevo: [nombre]         â”‚
        â”‚  Canal: [canal]                  â”‚
        â”‚  Score: [X]/10                   â”‚
        â”‚  Mensaje: [primeras 50 palabras] â”‚
        â”‚  Responder antes de: [t+1h]"     â”‚
        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                  â”‚
                  â–¼
        â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
        â”‚ Si score >= 7 y fuera de horario:â”‚
        â”‚ Auto-responder al lead:          â”‚
        â”‚ "Hola [Nombre], soy JosÃ© de      â”‚
        â”‚ Atiko. Vi tu mensaje, te respondoâ”‚
        â”‚ formalmente en <12 hrs.          â”‚
        â”‚ Mientras tanto: atikodigital.cl/precios"â”‚
        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## ImplementaciÃ³n paso a paso

### 1. Pre-requisitos

- [ ] n8n self-hosted
- [ ] Credenciales: Twilio, Anthropic, Google Sheets, HubSpot/Notion
- [ ] Sheet "Leads-Atiko-2026" creado con columnas (ver abajo)

### 2. Estructura del Sheet centralizador

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| Timestamp | Nombre | Contacto | Canal | Mensaje original | Score | Hot/Warm/Cold | Servicio interesado | Estado | PrÃ³xima acciÃ³n |

### 3. Configurar fuentes

#### Instagram DM
- OpciÃ³n A (gratis): usar Manychat Free â†’ webhook a n8n cuando reciba DM
- OpciÃ³n B (manual): Atiko revisa Instagram 2x/dÃ­a y reenvÃ­a manualmente

#### WhatsApp
- Twilio Business API ya conectado â†’ webhook directo a n8n

#### Web form
- Formulario en `atikodigital.cl` con `action="https://automations.atikodigital.cl/webhook/lead"`
- O Typeform/Tally â†’ webhook

#### LinkedIn
- LinkedIn no tiene webhook nativo â†’ usar Zapier (zap LinkedIn message â†’ POST a n8n)
- O revisar manual 2x/dÃ­a

#### Email
- Gmail filter por palabra clave "cotizar", "propuesta", "atiko" â†’ forward a webhook custom (vÃ­a Apps Script)

### 4. Flujo n8n

```javascript
// Nodo 1: Webhook receiver
{
  path: "/webhook/lead",
  method: "POST"
}

// Nodo 2: Normalizar
const payload = {
  timestamp: new Date().toISOString(),
  nombre: input.from?.name || input.body?.match(/me llamo (\w+)/i)?.[1] || "Sin nombre",
  contacto: input.from?.phone || input.from?.email || input.from?.handle,
  canal: input.canal,
  mensaje: input.body?.text || input.body?.message || ""
};

// Nodo 3: Llamar Claude para clasificar
const claudeResponse = await anthropic.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 256,
  messages: [{
    role: "user",
    content: `Analiza este lead para una agencia digital chilena (Atiko, ofrece diseÃ±o web + agentes IA + automatizaciones para pymes).

Mensaje del lead: "${payload.mensaje}"

Responde SOLO en JSON con esta estructura:
{
  "score": <1-10>,
  "temperatura": "hot" | "warm" | "cold",
  "servicio_interesado": "diseÃ±o_web" | "automatizacion" | "marketing" | "indefinido",
  "tiene_urgencia": true | false,
  "menciona_presupuesto": true | false,
  "razon_score": "<1 lÃ­nea explicaciÃ³n>"
}

Criterios para score alto (8-10):
- Menciona presupuesto concreto
- Habla de un dolor especÃ­fico
- Tiene urgencia (necesito YA / esta semana)
- Reconoce que tiene un problema

Criterios para score bajo (1-3):
- Solo dice "info" o "precios" sin contexto
- Pide gratis
- No menciona empresa o sector
- Suena a estudiante haciendo tarea`
  }]
});

const classification = JSON.parse(claudeResponse.content[0].text);

// Nodo 4: Append a Sheets
await googleSheets.append({
  spreadsheetId: env.LEADS_SHEET_ID,
  range: "Leads!A:J",
  values: [[
    payload.timestamp,
    payload.nombre,
    payload.contacto,
    payload.canal,
    payload.mensaje.substring(0, 200),
    classification.score,
    classification.temperatura,
    classification.servicio_interesado,
    "Lead nuevo",
    classification.tiene_urgencia ? "Responder HOY" : "Responder <24h"
  ]]
});

// Nodo 5: Crear en CRM (si tiene contacto vÃ¡lido)
if (payload.contacto && classification.score >= 5) {
  await hubspot.contacts.create({
    properties: {
      firstname: payload.nombre,
      phone: payload.contacto.startsWith("+") ? payload.contacto : null,
      email: payload.contacto.includes("@") ? payload.contacto : null,
      lifecyclestage: "lead",
      hs_lead_status: "NEW",
      atiko_canal_origen: payload.canal,
      atiko_score_inicial: classification.score,
      atiko_servicio_interes: classification.servicio_interesado
    }
  });
}

// Nodo 6: Notificar a JosÃ©
const horaChile = new Date().toLocaleString("es-CL", {timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit"});
const emoji = classification.score >= 8 ? "ðŸ”¥ðŸ”¥ðŸ”¥" : classification.score >= 5 ? "ðŸ”¥" : "ðŸ“©";

await twilio.messages.create({
  from: "whatsapp:+14155238886",
  to: "whatsapp:+56927130792",
  body: `${emoji} Lead nuevo Â· ${horaChile}

ðŸ‘¤ ${payload.nombre}
ðŸ“± ${payload.contacto}
ðŸŒ ${payload.canal.toUpperCase()}
ðŸŽ¯ Servicio: ${classification.servicio_interesado}
â­ Score: ${classification.score}/10
${classification.tiene_urgencia ? "âš ï¸ TIENE URGENCIA" : ""}

ðŸ’¬ "${payload.mensaje.substring(0, 150)}..."

ðŸ“‹ ${classification.razon_score}

Sheets: bit.ly/leads-atiko
CRM: hubspot.com/...`
});

// Nodo 7: Si es fuera de horario Y score >= 7, auto-responder
const horaActual = new Date().getHours();
const esLaboral = horaActual >= 9 && horaActual <= 19;
const esFinde = [0, 6].includes(new Date().getDay());

if ((!esLaboral || esFinde) && classification.score >= 7 && payload.canal === "whatsapp") {
  await twilio.messages.create({
    from: env.TWILIO_FROM,
    to: payload.contacto,
    body: `Hola ${payload.nombre.split(" ")[0]}, soy JosÃ© de Atiko ðŸ‘‹

RecibÃ­ tu mensaje, voy a leerlo bien y te respondo formal en menos de 12 horas hÃ¡biles.

Mientras tanto, si querÃ©s ver mÃ¡s:
ðŸŒ atikodigital.cl
ðŸ’° atikodigital.cl#precios

Hablamos pronto.`
  });
}
```

### 5. Variables de entorno

```
LEADS_SHEET_ID=<spreadsheet id>
ANTHROPIC_API_KEY=<key>
TWILIO_ACCOUNT_SID=<sid>
TWILIO_AUTH_TOKEN=<token>
TWILIO_FROM=whatsapp:+<nÃºmero Twilio>
HUBSPOT_API_KEY=<key>
```

### 6. Testing

- [ ] Enviar lead simulado via curl
- [ ] Verificar fila nueva en Sheets
- [ ] Verificar WhatsApp a JosÃ©
- [ ] Verificar contacto creado en HubSpot
- [ ] Simular lead fuera de horario â†’ verificar auto-respuesta

## KPIs del hook

Cada semana revisar:

- **Total leads capturados:** [X]
- **DistribuciÃ³n por canal:** % Instagram / WhatsApp / Web / etc
- **Score promedio:** [X]/10
- **% hot leads (>=8):** [X]%
- **Tiempo promedio de respuesta de JosÃ©:** deberÃ­a ser <2h
- **ConversiÃ³n Lead â†’ Discovery agendado:** target 30%
- **ConversiÃ³n Discovery â†’ Cliente:** target 30%

## Cuidados de privacidad

- âš ï¸ El mensaje del lead se almacena en Sheets â€” informar en formulario web ("Al enviar acepta nuestra polÃ­tica de privacidad")
- âš ï¸ PolÃ­tica de privacidad en `atikodigital.cl/privacidad.html` (Ley 19.628 Chile)
- âš ï¸ No clasificar a usuarios por edad/gÃ©nero/raza con Claude â€” solo por intenciÃ³n comercial

## EvoluciÃ³n futura

### V2: PredicciÃ³n de conversiÃ³n
DespuÃ©s de tener 50+ leads histÃ³ricos, entrenar un modelo simple que prediga conversiÃ³n:
- Features: canal, score inicial, hora del dÃ­a, servicio interesado, longitud del primer mensaje
- Target: si convirtiÃ³ a cliente (1/0)
- Algoritmo: Random forest simple en n8n function node

### V3: Routing inteligente
Cuando Atiko tenga vendedores adicionales: el hook asigna automÃ¡ticamente el lead al vendedor con capacidad libre + experiencia en ese servicio.

### V4: NutriciÃ³n automÃ¡tica
Si lead score = 4-6 (no es hot pero tampoco descarte), entrar a secuencia de emails educativos por 2 semanas. Si engagement aumenta, escalar a humano.

