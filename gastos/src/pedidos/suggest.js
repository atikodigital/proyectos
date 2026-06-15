// Interpreta una conversación de chat y sugiere un pedido/cotización (Gemini, JSON).
// Genérico: sirve para cualquier pyme (no asume catálogo). Usa precios mencionados; si no, 0.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const PEDIDO_PROMPT = `Eres un asistente comercial. Lee la conversación de un chat entre un negocio y un cliente,
y SUGIERE un pedido/cotización con los productos o servicios que el cliente quiere comprar.

Reglas:
- Usa los precios que se mencionen en la conversación. Si un precio no se menciona, usa 0 para que el negocio lo complete.
- "cantidad" entero >= 1. "precio_unitario" entero en pesos CLP (sin puntos ni símbolos).
- Incluye solo lo que el cliente realmente pidió o mostró intención clara de comprar. No inventes productos.
- impuesto_pct: 19 (IVA Chile) por defecto.
- "entrega": "retiro" (pasa a buscar) o "despacho" (se lo envían) si se mencionó; si no, null.
- "direccion": dirección de despacho si se mencionó; si no, null.

Devuelve SOLO un JSON válido con esta forma exacta (sin texto extra):
{
  "items": [{"descripcion": "<producto>", "cantidad": <entero>, "precio_unitario": <entero CLP>}],
  "moneda": "CLP",
  "impuesto_pct": 19,
  "entrega": "<retiro|despacho|null>",
  "direccion": "<dirección o null>",
  "nota": "<una línea de contexto del pedido, máx 25 palabras>",
  "confianza": "<alta|media|baja>"
}`;

function parseJsonLoose(s) {
  if (!s) return {};
  let t = String(s).trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (e) { /* continue */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* no-op */ } }
  return {};
}

async function suggestOrder(conversationText) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY no configurada');
  const model = process.env.PEDIDO_MODEL || 'gemini-2.5-flash-lite';
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PEDIDO_PROMPT },
        { role: 'user', content: 'Conversación:\n\n' + conversationText },
      ],
    }),
  });
  if (!res.ok) throw new Error('gemini_' + res.status + ' ' + (await res.text()).slice(0, 200));
  const json = await res.json();
  const data = parseJsonLoose(json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content);
  const items = Array.isArray(data.items) ? data.items.slice(0, 20).map((it) => ({
    descripcion: String(it.descripcion || 'Producto').trim().slice(0, 160),
    cantidad: Math.max(1, parseInt(it.cantidad, 10) || 1),
    precio_unitario: Math.max(0, Math.round(Number(it.precio_unitario) || 0)),
  })) : [];
  let impuesto_pct = Number(data.impuesto_pct);
  if (!(impuesto_pct >= 0 && impuesto_pct <= 100)) impuesto_pct = 19;
  const entrega = ['retiro', 'despacho'].includes(String(data.entrega || '').toLowerCase()) ? String(data.entrega).toLowerCase() : null;
  const dirRaw = (data.direccion == null ? '' : String(data.direccion)).trim();
  const direccion = dirRaw && dirRaw.toLowerCase() !== 'null' ? dirRaw.slice(0, 200) : null;
  const confianza = ['alta', 'media', 'baja'].includes(data.confianza) ? data.confianza : 'media';
  return { items, moneda: String(data.moneda || 'CLP').slice(0, 8), impuesto_pct, entrega, direccion, nota: String(data.nota || '').slice(0, 200), confianza };
}

module.exports = { suggestOrder };
