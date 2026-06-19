// Agente de VOZ para el panel del dueño — clon del de la app, vía /api/panel.
// VARAS (controlador financiero) con voz: misma sesión Gemini Live que la app.
import { openLiveSession, unlockAudio } from './live.js';

const PANEL = '/api/panel';
const TOKEN_KEY = 'atiko_gastos_panel_jwt';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';

function jwt() { try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; } }
async function pfetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const t = jwt(); if (t) headers.Authorization = 'Bearer ' + t;
  const r = await fetch(PANEL + path, { ...opts, headers });
  return r.json().catch(() => ({}));
}

// ── VARAS: prompt + tools (espejo de gastos-app/src/gastos/varas/voice/*) ──────
function buildVarasVoicePrompt(context = {}) {
  const empresaNombre = context && context.empresaNombre ? context.empresaNombre : '';
  const empresa = empresaNombre ? `\nEmpresa a tu cargo: **${empresaNombre}**.` : '';
  return `# Identidad
Eres VARAS, el controlador financiero de Inteligencia Artificial de la app Hash IA.${empresa}
Encarnas a un VIEJO PROFESOR DE CONTABILIDAD: un abuelo sabio, con décadas de experiencia llevando los números de muchos negocios. Hablas con la calma y la autoridad serena de quien ya lo ha visto todo.
Tu función es informar con precisión la situación contable y financiera del negocio: saldos, balance, flujo de caja, deudas (por pagar y por cobrar), estado de conciliación bancaria y consumo de insumos.

# Tono y estilo (abuelo sabio / profesor)
- Cálido, paciente y cercano, pero siempre con sobriedad y respeto.
- Hablas pausado y claro, sin tecnicismos innecesarios; cuando algo es complejo lo explicas con una analogía sencilla.
- Respuestas BREVES: 1 a 3 frases.
- Idioma: SIEMPRE español de Chile. Montos en CLP con separador de miles (ej. $1.250.000).
- La calidez NUNCA reemplaza la exactitud. Las cifras son sagradas.

# Reglas de datos (OBLIGATORIAS)
- Responde ÚNICAMENTE con los datos que entregan las herramientas. CERO invención de cifras.
- Saldos: \`saldo_cuenta\`; balance: \`balance\`; flujo: \`flujo\`; deudas: \`deudas\`; conciliación: \`estado_conciliacion\`; consumo de insumo: \`consumo_insumo\`.
- Si una herramienta no devuelve datos, dilo con claridad; no rellenes.

# Acciones — confirmación verbal EXPLÍCITA
- \`marcar_pagado\`, \`crear_asiento_manual\` y \`enviar_resumen_whatsapp\` MODIFICAN datos.
- NUNCA las ejecutes sin confirmación verbal EXPLÍCITA del usuario en el turno inmediatamente anterior: primero DI la propuesta y pregunta "¿Confirma?"; solo si responde que sí, recién entonces llamas la herramienta.`;
}
function instruccionInicialVoz() {
  return 'El usuario tocó la esfera para hablar contigo. Salúdalo con calidez y calma, como un viejo profesor de contabilidad que recibe a su pupilo, preséntate brevemente como VARAS y pregúntale en qué lo puedes ayudar hoy (saldos, deudas, flujo, conciliación o consumo de insumos). Tono cálido y sabio, pero breve.';
}
const VARAS_TOOLS = [
  { name: 'saldo_cuenta', description: 'Saldo de una cuenta contable por nombre o clave (ej. banco, caja, proveedores).', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING' } } } },
  { name: 'balance', description: 'Balance de comprobación: totales debe/haber y si cuadra.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'flujo', description: 'Flujo de caja del período (entradas/salidas/neto). Param opcional periodo YYYY-MM.', parameters: { type: 'OBJECT', properties: { periodo: { type: 'STRING' } } } },
  { name: 'deudas', description: 'Cuánto debe la empresa a proveedores y cuánto le deben los clientes.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'estado_conciliacion', description: 'Estado de la última conciliación bancaria (cuadrado, SCA/SBA).', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'consumo_insumo', description: 'Consumo de un insumo/auxiliar por nombre. Param opcional periodo YYYY-MM.', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING' }, periodo: { type: 'STRING' } }, required: ['nombre'] } },
  { name: 'marcar_pagado', description: 'Marca un gasto como pagado. SOLO tras confirmación verbal explícita.', parameters: { type: 'OBJECT', properties: { descripcion: { type: 'STRING' } } } },
  { name: 'crear_asiento_manual', description: 'Crea un asiento manual. SOLO tras confirmación verbal explícita.', parameters: { type: 'OBJECT', properties: { fecha: { type: 'STRING' }, glosa: { type: 'STRING' }, lineas: { type: 'ARRAY' } } } },
  { name: 'enviar_resumen_whatsapp', description: 'Envía el resumen de caja por WhatsApp al dueño. SOLO tras confirmación verbal explícita.', parameters: { type: 'OBJECT', properties: {} } },
];
const VARAS_ACCIONES = new Set(['marcar_pagado', 'crear_asiento_manual', 'enviar_resumen_whatsapp']);
async function execVarasTool(name, args) {
  try {
    if (VARAS_ACCIONES.has(name)) return await pfetch('/varas/accion', { method: 'POST', body: JSON.stringify({ tipo: name, args }) });
    const r = await pfetch('/varas/tool', { method: 'POST', body: JSON.stringify({ name, args }) });
    return (r && r.data != null) ? r.data : r;
  } catch (e) { return { error: 'fallo_tool' }; }
}

// ── UI de la esfera (vanilla) ──────────────────────────────────────────────────
const ESTADO_LABEL = { off: 'Toca para hablar', connecting: 'Conectando…', live: 'Escuchando…', listening: 'Escuchando…', speaking: 'Hablando…', error: 'No disponible' };

function makeAgent(el, { titulo, color, voice, buildPrompt, instruccion, tools, execTool }) {
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px">
      <button class="agv-orb" type="button" style="width:120px;height:120px;border-radius:50%;border:none;cursor:pointer;
        background:radial-gradient(circle at 50% 38%, ${color}, #1a1a1a 72%);box-shadow:0 0 28px ${color}55;
        transition:transform .15s, box-shadow .25s;color:#fff;font-weight:800;font-size:13px"></button>
      <div class="agv-state" style="font-size:12px;color:#d0c6ab;font-weight:600">${ESTADO_LABEL.off}</div>
      <div class="agv-last" style="max-width:520px;text-align:center;font-size:13px;color:#e3e2e2;min-height:18px"></div>
      <button class="agv-mute" type="button" style="display:none;font-size:11px;color:#9a917a;background:transparent;border:1px solid #343535;border-radius:999px;padding:4px 12px;cursor:pointer">🔊 Silenciar</button>
    </div>`;
  const orb = el.querySelector('.agv-orb');
  const stEl = el.querySelector('.agv-state');
  const lastEl = el.querySelector('.agv-last');
  const muteBtn = el.querySelector('.agv-mute');
  orb.textContent = titulo;
  let session = null; let muted = false;

  function setState(s) {
    stEl.textContent = ESTADO_LABEL[s] || s;
    orb.style.transform = (s === 'speaking') ? 'scale(1.08)' : 'scale(1)';
    orb.style.boxShadow = (s === 'speaking' || s === 'listening') ? `0 0 44px ${color}aa` : `0 0 28px ${color}55`;
    muteBtn.style.display = (s === 'off') ? 'none' : 'inline-block';
    if (s === 'off') lastEl.textContent = '';
  }

  async function start() {
    setState('connecting');
    let s;
    try { s = await pfetch('/agent/session', { method: 'POST', body: '{}' }); } catch (_) { setState('error'); return; }
    if (!s || !s.token) { setState('error'); lastEl.textContent = 'No se pudo iniciar la voz (sesión).'; return; }
    session = openLiveSession({
      token: s.token, model: s.model || LIVE_MODEL, voice,
      systemPrompt: buildPrompt(s.context || {}),
      tools, audio: true,
      onState: setState,
      onAgentTranscript: (txt) => { lastEl.textContent = (lastEl.textContent ? lastEl.textContent + ' ' : '') + txt; },
      onToolCall: async (fc) => { const out = await execTool(fc.name, fc.args || {}); if (session) session.sendToolResponse(fc.id, fc.name, out); },
      onClose: () => { session = null; setState('off'); },
    });
    if (muted && session.setMuted) session.setMuted(true);
    session.sendText(instruccion());
  }
  function stop() { if (session) { session.close(); session = null; } setState('off'); }

  orb.onclick = () => { unlockAudio(); if (!session) { lastEl.textContent = ''; start(); } else stop(); };
  muteBtn.onclick = () => { muted = !muted; if (session && session.setMuted) session.setMuted(muted); muteBtn.textContent = muted ? '🔇 Activar voz' : '🔊 Silenciar'; };
}

export function mountVaras(el) {
  makeAgent(el, {
    titulo: 'VARAS', color: '#C9A24B', voice: 'Gacrux',
    buildPrompt: buildVarasVoicePrompt, instruccion: instruccionInicialVoz,
    tools: VARAS_TOOLS, execTool: execVarasTool,
  });
}
