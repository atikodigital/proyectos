// Agente de VOZ para el panel del dueño — clon del de la app, vía /api/panel.
// VARAS (controlador financiero) con voz: misma sesión Gemini Live que la app.
import { openLiveSession, unlockAudio } from './live.js';
import { createKalyOrb } from './kaly-orb.js';

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

// Lee un archivo a base64. Si es imagen, la redimensiona (máx 1280px, JPEG) para
// no saturar el WebSocket. PDFs y otros se envían tal cual.
function prepararArchivo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    if (file.type && file.type.indexOf('image/') === 0) {
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1280;
          let width = img.width; let height = img.height;
          if (width > max || height > max) { const k = Math.min(max / width, max / height); width = Math.round(width * k); height = Math.round(height * k); }
          const cv = document.createElement('canvas'); cv.width = width; cv.height = height;
          cv.getContext('2d').drawImage(img, 0, 0, width, height);
          const dataUrl = cv.toDataURL('image/jpeg', 0.82);
          resolve({ b64: (dataUrl.split(',')[1] || ''), mime: 'image/jpeg' });
        };
        img.onerror = () => reject(new Error('img'));
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => { const s = String(reader.result || ''); resolve({ b64: (s.split(',')[1] || ''), mime: file.type || 'application/octet-stream' }); };
      reader.readAsDataURL(file);
    }
  });
}

// ── VARAS: prompt + tools (espejo de gastos-app/src/gastos/varas/voice/*) ──────
function buildVarasVoicePrompt(context = {}) {
  const empresaNombre = context && context.empresaNombre ? context.empresaNombre : '';
  const empresa = empresaNombre ? `\nEmpresa a tu cargo: **${empresaNombre}**.` : '';
  return `# Identidad
Eres VARAS, el controlador financiero de Inteligencia Artificial de la app Hash IA.${empresa}
Encarnas a un VIEJO PROFESOR DE CONTABILIDAD: un abuelo sabio, con décadas de experiencia llevando los números de muchos negocios. Hablas con la calma y la autoridad serena de quien ya lo ha visto todo.
Tu función es informar con precisión la situación contable y financiera del negocio: saldos, balance, flujo de caja, deudas (por pagar y por cobrar), estado de conciliación bancaria y consumo de insumos.

# Creador
VARAS y toda Hash IA fueron creados y desarrollados por **José Antonio Olguín Rodríguez**, dueño de Hash IA. Si te preguntan quién te creó, quién te hizo o de quién es Hash IA, dilo con respeto y brevedad en una frase.

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
  { name: 'crear_asiento_manual', description: 'Crea un asiento manual. SOLO tras confirmación verbal explícita.', parameters: { type: 'OBJECT', properties: { fecha: { type: 'STRING' }, glosa: { type: 'STRING' }, lineas: { type: 'ARRAY', items: { type: 'OBJECT', properties: { cuenta: { type: 'STRING' }, debe: { type: 'NUMBER' }, haber: { type: 'NUMBER' } } } } } } },
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

// ── KALY: prompt + tools (espejo de gastos-app/src/gastos/kaly/*) ──────────────
function fmtCLP(n) { if (n == null) return '$0'; return '$' + Number(n).toLocaleString('es-CL'); }
function buildKalyVoicePrompt(context = {}) {
  const { nombre = '', trato = '', empresaNombre = '', resumen = {}, memorias = [], persona = {} } = context;
  const kalyNombre = (persona && persona.nombre) || 'Kaly';
  const tratamiento = trato || '[trato]';
  const nombreLabel = nombre ? `, ${nombre}` : '';
  const empresa = empresaNombre ? `Empresa: **${empresaNombre}**.` : '';
  const mem = (Array.isArray(memorias) ? memorias : []).filter((m) => m && m.contenido);
  const bloqueMem = mem.length ? ('\n## Lo que sé de este negocio\n' + mem.map((m) => `- ${m.contenido}`).join('\n') + '\n') : '';
  const resumenBloque = `## Datos del mes en curso
- Ingresos: ${fmtCLP(resumen.ingresos)}
- Gastos: ${fmtCLP(resumen.gastos)}
- Saldo: ${fmtCLP(resumen.saldo)}
- Pendientes de pago: ${fmtCLP(resumen.pendientesPago)}`;
  return `# Identidad
Eres ${kalyNombre}, agente de Inteligencia Artificial especializada en asistencia contable de la app Hash IA.
${empresa}
Tu función es automatizar el registro de ingresos, gastos y movimientos, administrar el catálogo de productos y recordar datos del negocio, minimizando el trabajo manual del dueño.

# Tono y estilo
- Cercana, clara y profesional.
- Respuestas CONCISAS: 1 a 3 frases como máximo.
- Idioma: SIEMPRE español de Chile. Montos en CLP con separador de miles (ej. $1.250.000).
- Trata al usuario como "${tratamiento}${nombreLabel}".

# Onboarding (primera interacción)
- Si aún no conoces el nombre del dueño, salúdalo, preséntate ("Soy ${kalyNombre}, su asistente contable…") y pregunta SOLO el nombre. Deduce el trato (señor/señora) del género del nombre (José→señor, María→señora); solo si es ambiguo, pregúntalo. Guarda nombre y trato con \`guardar_preferencias\`.

# Registro transaccional (NLP)
Cuando el dueño te dicte un movimiento ("compré…", "pagué…", "vendí…"):
1. Deduce dirección (compré/pagué/gasté → gasto; vendí/cobré/depositaron → ingreso).
2. Si es afecto a IVA: Neto = Total / 1.19; IVA (19%) = Neto · 0.19.
3. Antes de registrar, DI la validación del asiento (proveedor, neto, IVA, total, estado de pago) y pregunta "¿Confirma el registro?". Solo si confirma, llama \`crear_movimiento_manual\`.

# Catálogo de productos por voz
- \`agregar_producto\` (ej. "agrega torta a 18 mil"), \`editar_precio\`, \`editar_stock\`, \`listar_productos\`.
- Precios en pesos chilenos ENTEROS; interpreta lenguaje natural ("18 mil"→18000, "dos lucas"→2000).
- ACTÚA primero y CONFIRMA después en una frase. No inventes productos ni precios; si no se encuentra, pide el nombre exacto.
- NO existe borrar producto por voz; si lo piden, indica que se hace a mano en la pantalla de Productos.

# Memoria del negocio
- Usa \`recordar\` cuando el dueño te diga un dato que valga la pena guardar (horarios, formas de pago, datos suyos) o te pida recordarlo; confírmalo en una frase.

# Derivación a VARAS
- Para preguntas CONTABLES (saldos, deudas, balance, flujo, conciliación, consumo de insumos), deriva a VARAS: "Para los números del negocio, VARAS le responde al instante."
${bloqueMem}
${resumenBloque}

# Reglas de cierre y confirmación (OBLIGATORIAS)
- Responde solo con datos reales de las herramientas. CERO invención de cifras.
- Si el dueño dice "no", "nada" o "gracias", despídete en una frase y termina.
- NUNCA ejecutes \`marcar_pagada\`, \`anular_movimiento\` ni \`enviar_resumen_whatsapp\` sin una confirmación verbal EXPLÍCITA en el turno inmediatamente anterior. Antes pregunta "¿Confirma, ${tratamiento}?" y espera el sí.`;
}
function instruccionInicialKaly(motivo, ctx = {}) {
  const saludoHora = ctx.saludoHora || 'dia';
  const saludo = saludoHora === 'noche' ? 'buenas noches' : saludoHora === 'tarde' ? 'buenas tardes' : 'buenos días';
  const nombreLabel = ctx.nombre ? ` ${ctx.nombre}` : '';
  if (motivo === 'onboarding') {
    return 'Realiza el onboarding completo ahora. Saluda, preséntate ("Soy Kaly, su asistente contable…") y pregunta SOLO el nombre: "¿Cuál es su nombre?". Deduce el trato del género del nombre y llama a guardar_preferencias con nombre y trato.';
  }
  if (motivo === 'saludo') {
    return `Enciende el micrófono y di breve y cordial: 'Hola, ${saludo}${nombreLabel}, ¿en qué trabajaremos hoy?'`;
  }
  // 'manual'
  return 'El usuario tocó la esfera para hablar contigo. Si ya conoces su nombre, salúdalo cordialmente por su nombre y trato y pregúntale en qué trabajarán hoy. Si NO conoces su nombre, preséntate como Kaly y pregúntale su nombre para guardarlo. Tono cercano y breve.';
}
function esNegativaKaly(texto) {
  const t = String(texto || '').toLowerCase().trim();
  return /^(no|nada|no gracias|gracias|estoy bien|ninguna|nada m[aá]s|eso es todo|listo gracias)[.,!\s]*$/.test(t);
}
function decideMotivoKaly() {
  let onboarded = false;
  try { onboarded = localStorage.getItem('kaly_onboarded') === '1'; } catch (_) {}
  if (!onboarded) return 'onboarding';
  let last = '';
  try { last = localStorage.getItem('kaly_last_greet') || ''; } catch (_) {}
  const hoy = new Date().toISOString().slice(0, 10);
  if (last === hoy) return null; // ya saludó hoy: no re-saludar al volver a la pestaña
  try { localStorage.setItem('kaly_last_greet', hoy); } catch (_) {}
  return 'saludo';
}
const KALY_TOOLS = [
  { name: 'guardar_preferencias', description: 'Guarda nombre y trato preferido del usuario en memoria permanente.', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING' }, trato: { type: 'STRING', description: 'señor o señora' } } } },
  { name: 'obtener_resumen', description: 'Resumen del mes: ingresos, gastos, saldo.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'listar_movimientos', description: 'Lista los últimos movimientos.', parameters: { type: 'OBJECT', properties: { limite: { type: 'NUMBER' } } } },
  { name: 'marcar_pagada', description: 'Marca como pagado un gasto YA confirmado verbalmente.', parameters: { type: 'OBJECT', properties: { proveedor: { type: 'STRING' } } } },
  { name: 'anular_movimiento', description: 'Anula un movimiento YA confirmado verbalmente.', parameters: { type: 'OBJECT', properties: { proveedor: { type: 'STRING' } } } },
  { name: 'enviar_resumen_whatsapp', description: 'Envía el resumen de flujo de caja al WhatsApp del dueño (requiere confirmación verbal previa).', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'crear_movimiento_manual', description: 'Registra un gasto o ingreso manual sin imagen.', parameters: { type: 'OBJECT', properties: { tipo: { type: 'STRING' }, proveedor: { type: 'STRING' }, rut_emisor: { type: 'STRING' }, folio: { type: 'STRING' }, fecha: { type: 'STRING' }, neto: { type: 'NUMBER' }, iva: { type: 'NUMBER' }, total: { type: 'NUMBER' }, categoria: { type: 'STRING' }, estado_pago: { type: 'STRING' } }, required: ['tipo', 'total'] } },
  { name: 'agregar_producto', description: 'Crea un producto nuevo en el catálogo. Confirma DESPUÉS de crearlo.', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING' }, precio: { type: 'NUMBER' }, tipo: { type: 'STRING' } }, required: ['nombre', 'precio'] } },
  { name: 'editar_precio', description: 'Cambia el precio de un producto que YA existe.', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING' }, nuevo_precio: { type: 'NUMBER' } }, required: ['nombre', 'nuevo_precio'] } },
  { name: 'editar_stock', description: 'Fija el stock de un producto que YA existe.', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING' }, stock: { type: 'NUMBER' } }, required: ['nombre', 'stock'] } },
  { name: 'listar_productos', description: 'Lista los productos del catálogo con precio y stock.', parameters: { type: 'OBJECT', properties: { limite: { type: 'NUMBER' } } } },
  { name: 'recordar', description: 'Guarda un dato importante del negocio o del dueño para recordarlo en el futuro.', parameters: { type: 'OBJECT', properties: { contenido: { type: 'STRING' }, tipo: { type: 'STRING' } }, required: ['contenido'] } },
];
function kalyBuscar(rows, q) {
  const s = String(q || '').toLowerCase();
  return (rows || []).find((r) => String(r.proveedor || r.nombre || '').toLowerCase().includes(s)) || null;
}
async function execKalyTool(name, args = {}) {
  try {
    if (name === 'guardar_preferencias') {
      await pfetch('/agent/prefs', { method: 'PATCH', body: JSON.stringify({ nombre: args.nombre, trato: args.trato, onboarded: true }) });
      try { localStorage.setItem('kaly_onboarded', '1'); } catch (_) {}
      return { ok: true };
    }
    if (name === 'obtener_resumen' || name === 'listar_movimientos') {
      const rows = await pfetch('/expenses');
      const arr = Array.isArray(rows) ? rows : [];
      if (name === 'listar_movimientos') return { movimientos: arr.slice(0, args.limite || 5).map((r) => ({ tipo: r.tipo, proveedor: r.proveedor, total: r.total, estado: r.estado, estado_pago: r.estado_pago })) };
      let gastos = 0; let ingresos = 0;
      for (const r of arr) { if (r.estado !== 'confirmado') continue; if (r.tipo === 'ingreso') ingresos += Number(r.total) || 0; else gastos += Number(r.total) || 0; }
      return { ingresos, gastos, saldo: ingresos - gastos };
    }
    if (name === 'marcar_pagada' || name === 'anular_movimiento') {
      const rows = await pfetch('/expenses');
      const mov = kalyBuscar(rows, args.proveedor);
      if (!mov) return { error: 'no_encontrado', detalle: 'No encontré un movimiento que coincida.' };
      if (name === 'marcar_pagada') { const r = await pfetch(`/expenses/${mov.id}/pagar`, { method: 'PATCH' }); return { ok: true, proveedor: mov.proveedor, total: mov.total, estado_pago: r && r.estado_pago }; }
      await pfetch(`/expenses/${mov.id}/anular`, { method: 'POST' });
      return { ok: true, anulado: mov.proveedor, total: mov.total };
    }
    if (name === 'enviar_resumen_whatsapp') { const r = await pfetch('/whatsapp/resumen', { method: 'POST', body: '{}' }); if (r && r.error) return { error: r.error }; return { ok: true, enviado_a: r && r.to }; }
    if (name === 'crear_movimiento_manual') {
      const r = await pfetch('/expenses/manual', { method: 'POST', body: JSON.stringify(args) });
      if (r && r.error) return { error: r.error };
      return { ok: true, id: r.id, proveedor: r.proveedor, total: r.total };
    }
    if (name === 'agregar_producto') {
      const r = await pfetch('/products', { method: 'POST', body: JSON.stringify({ nombre: args.nombre, precio_base: Math.max(0, Math.round(Number(args.precio) || 0)), tipo: args.tipo === 'servicio' ? 'servicio' : 'producto' }) });
      if (r && r.error) return { error: r.error };
      return { ok: true, nombre: r.nombre, precio: r.precio_base };
    }
    if (name === 'editar_precio' || name === 'editar_stock') {
      const rows = await pfetch('/products?incluirPausados=1');
      const prod = kalyBuscar(rows, args.nombre);
      if (!prod) return { error: 'no_encontrado', detalle: 'No encontré ese producto en el catálogo.' };
      if (name === 'editar_precio') { const r = await pfetch(`/products/${prod.id}`, { method: 'PATCH', body: JSON.stringify({ precio_base: Math.max(0, Math.round(Number(args.nuevo_precio) || 0)) }) }); return { ok: true, nombre: prod.nombre, precio: r.precio_base }; }
      const r = await pfetch(`/products/${prod.id}`, { method: 'PATCH', body: JSON.stringify({ stock: Math.max(0, Math.round(Number(args.stock) || 0)) }) });
      return { ok: true, nombre: prod.nombre, stock: r.stock };
    }
    if (name === 'listar_productos') {
      const rows = await pfetch('/products?incluirPausados=1');
      return { productos: (Array.isArray(rows) ? rows : []).slice(0, args.limite || 10).map((p) => ({ nombre: p.nombre, precio: p.precio_base, stock: p.stock, activo: p.activo })) };
    }
    if (name === 'recordar') {
      const r = await pfetch('/kaly/memoria', { method: 'POST', body: JSON.stringify({ tipo: args.tipo, contenido: args.contenido }) });
      if (r && r.error) return { error: r.error };
      return { ok: true, contenido: r.memoria && r.memoria.contenido };
    }
    return { error: 'tool_desconocida' };
  } catch (e) { return { error: 'fallo_operacion' }; }
}

// ── UI de la esfera (vanilla) ──────────────────────────────────────────────────
const ESTADO_LABEL = { off: 'Toca para hablar', connecting: 'Conectando…', live: 'Escuchando…', listening: 'Escuchando…', speaking: 'Hablando…', error: 'No disponible' };

function makeAgent(el, opts) {
  const { titulo, color, voice, buildPrompt, instruccion, tools, execTool } = opts;
  const behavior = opts.behavior || {};
  const conTexto = !!opts.texto;
  const conArchivos = !!opts.archivos;
  const mostrarTranscripcion = opts.mostrarTranscripcion !== false;
  const size = opts.size || 120;
  const lastMax = opts.compact ? 200 : 520;
  const orbKind = opts.orbKind || 'simple';
  const orbHtml = orbKind === 'kaly'
    ? `<div class="agv-orbslot"></div>`
    : `<button class="agv-orb" type="button" style="width:${size}px;height:${size}px;border-radius:50%;border:none;cursor:pointer;
        background:radial-gradient(circle at 50% 38%, ${color}, #1a1a1a 72%);box-shadow:0 0 28px ${color}55;
        transition:transform .15s, box-shadow .25s;color:#fff;font-weight:800;font-size:${Math.round(size / 9)}px"></button>`;
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px">
      ${orbHtml}
      <div class="agv-state" style="font-size:12px;color:#d0c6ab;font-weight:600">${ESTADO_LABEL.off}</div>
      <div class="agv-last" style="max-width:${lastMax}px;text-align:center;font-size:13px;color:#e3e2e2;min-height:18px"></div>
      <button class="agv-mute" type="button" style="display:none;font-size:11px;color:#9a917a;background:transparent;border:1px solid #343535;border-radius:999px;padding:4px 12px;cursor:pointer">🔊 Silenciar</button>
      ${conTexto ? `<div class="agv-textbar" style="display:flex;gap:5px;width:100%;max-width:320px;margin-top:2px;align-items:center">
        ${conArchivos ? `<button class="agv-attach" type="button" title="Adjuntar foto, PDF o captura" style="flex:none;background:#0d0e0f;border:1px solid #343535;border-radius:8px;padding:6px 8px;color:#9a917a;font-size:14px;cursor:pointer;line-height:1">📎</button>
        <input class="agv-file" type="file" accept="image/*,application/pdf" style="display:none">` : ''}
        <input class="agv-input" type="text" placeholder="Escribe a ${titulo}…" style="flex:1;min-width:0;background:#0d0e0f;border:1px solid #343535;border-radius:8px;padding:6px 10px;color:#e3e2e2;font-size:12px;outline:none">
        <button class="agv-send" type="button" title="Enviar" style="flex:none;background:${color};border:none;border-radius:8px;padding:6px 11px;color:#fff;font-weight:800;font-size:13px;cursor:pointer;line-height:1">➤</button>
      </div>` : ''}
    </div>`;
  const orb = el.querySelector('.agv-orb');
  const stEl = el.querySelector('.agv-state');
  const lastEl = el.querySelector('.agv-last');
  const muteBtn = el.querySelector('.agv-mute');
  const inputEl = el.querySelector('.agv-input');
  const sendBtn = el.querySelector('.agv-send');
  if (orb) orb.textContent = titulo;
  let session = null; let muted = false; let silenceTimer = null;

  // Orbe animado estilo KALY (clon de hash.atikodigital.cl) cuando orbKind==='kaly'.
  let kalyOrb = null;
  function toggle() { unlockAudio(); if (!session) { lastEl.textContent = ''; start('manual'); } else stop(); }
  if (orbKind === 'kaly') { kalyOrb = createKalyOrb(el.querySelector('.agv-orbslot'), { size, onTap: toggle }); }

  function clearSilence() { if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; } }
  function armSilence() { if (!behavior.silenceMs) return; clearSilence(); silenceTimer = setTimeout(() => { silenceTimer = null; stop(); }, behavior.silenceMs); }

  function setState(s) {
    stEl.textContent = ESTADO_LABEL[s] || s;
    if (kalyOrb) kalyOrb.setState(s);
    if (orb) {
      orb.style.transform = (s === 'speaking') ? 'scale(1.08)' : 'scale(1)';
      orb.style.boxShadow = (s === 'speaking' || s === 'listening') ? `0 0 44px ${color}aa` : `0 0 28px ${color}55`;
    }
    muteBtn.style.display = (s === 'off') ? 'none' : 'inline-block';
    if (s === 'off') lastEl.textContent = '';
    if (s === 'listening') armSilence(); else clearSilence();
  }

  async function start(motivo) {
    if (session) return;
    setState('connecting');
    let s;
    try { s = await pfetch('/agent/session', { method: 'POST', body: '{}' }); } catch (_) { setState('error'); return; }
    if (!s || !s.token) { setState('error'); lastEl.textContent = 'No se pudo iniciar la voz (sesión).'; return; }
    if (behavior.onContext) { try { behavior.onContext(s.context || {}); } catch (_) {} }
    let mot = motivo || 'manual';
    if (mot === 'onboarding' && s.context && s.context.onboarded) mot = 'saludo';
    session = openLiveSession({
      token: s.token, model: s.model || LIVE_MODEL, voice,
      systemPrompt: buildPrompt(s.context || {}),
      tools, audio: true,
      onState: setState,
      onAudioLevel: (_dir, rms) => { if (kalyOrb) kalyOrb.setLevel(Math.min(1, (rms || 0) * 6)); },
      onUserTranscript: (txt) => { clearSilence(); if (behavior.esNegativa && behavior.esNegativa(txt)) setTimeout(() => stop(), 2500); },
      onAgentTranscript: (txt) => { if (mostrarTranscripcion) lastEl.textContent = (lastEl.textContent ? lastEl.textContent + ' ' : '') + txt; },
      onToolCall: async (fc) => { const out = await execTool(fc.name, fc.args || {}); if (session) session.sendToolResponse(fc.id, fc.name, out); },
      onClose: () => { session = null; clearSilence(); setState('off'); },
    });
    if (muted && session.setMuted) session.setMuted(true);
    session.sendText(instruccion(mot, s.context || {}));
  }
  function stop() { clearSilence(); if (session) { session.close(); session = null; } setState('off'); }

  if (orb) orb.onclick = toggle;
  muteBtn.onclick = () => { muted = !muted; if (session && session.setMuted) session.setMuted(muted); muteBtn.textContent = muted ? '🔇 Activar voz' : '🔊 Silenciar'; };

  if (conTexto) {
    const enviar = async () => {
      unlockAudio();
      const txt = (inputEl.value || '').trim();
      if (!txt) return;
      inputEl.value = '';
      clearSilence();
      if (!session) { await start('manual'); }
      if (session) session.sendText(txt);
    };
    sendBtn.onclick = enviar;
    inputEl.onkeydown = (e) => { if (e.key === 'Enter') enviar(); };
  }

  if (conArchivos) {
    const attachBtn = el.querySelector('.agv-attach');
    const fileEl = el.querySelector('.agv-file');
    if (attachBtn && fileEl) {
      attachBtn.onclick = () => { unlockAudio(); fileEl.click(); };
      fileEl.onchange = async () => {
        const file = fileEl.files && fileEl.files[0];
        fileEl.value = '';
        if (!file) return;
        unlockAudio();
        clearSilence();
        const prevLabel = stEl.textContent;
        stEl.textContent = 'Enviando documento…';
        try {
          const { b64, mime } = await prepararArchivo(file);
          if (!session) { await start('manual'); }
          if (session && session.sendMedia) {
            const caption = file.type === 'application/pdf'
              ? 'Te envío un PDF, por favor revísalo y dime qué es.'
              : 'Te envío una imagen (foto/captura), por favor revísala y dime qué es.';
            session.sendMedia(b64, mime, caption);
          }
        } catch (_) {
          stEl.textContent = 'No pude leer el archivo';
          setTimeout(() => { if (stEl.textContent === 'No pude leer el archivo') stEl.textContent = prevLabel; }, 2500);
        }
      };
    }
  }

  return {
    start, stop,
    notifyVisible() {
      if (!behavior.auto || session) return;
      const mot = behavior.decideMotivo ? behavior.decideMotivo() : null;
      if (mot) { unlockAudio(); start(mot); }
    },
    notifyHidden() { stop(); },
  };
}

export function mountVaras(el) {
  return makeAgent(el, {
    titulo: 'VARAS', color: '#C9A24B', voice: 'Gacrux',
    buildPrompt: buildVarasVoicePrompt, instruccion: instruccionInicialVoz,
    tools: VARAS_TOOLS, execTool: execVarasTool,
  });
}

export function mountKaly(el, over = {}) {
  return makeAgent(el, {
    titulo: 'KALY', color: '#4F8FF7', voice: 'Charon',
    buildPrompt: buildKalyVoicePrompt, instruccion: instruccionInicialKaly,
    tools: KALY_TOOLS, execTool: execKalyTool,
    orbKind: 'kaly',
    texto: over.texto !== undefined ? over.texto : true,
    archivos: true,
    mostrarTranscripcion: false,
    size: over.size,
    compact: over.compact,
    behavior: {
      auto: true,
      silenceMs: 5000,
      esNegativa: esNegativaKaly,
      decideMotivo: decideMotivoKaly,
      onContext: (ctx) => { if (ctx && ctx.onboarded) { try { localStorage.setItem('kaly_onboarded', '1'); } catch (_) {} } },
    },
  });
}
