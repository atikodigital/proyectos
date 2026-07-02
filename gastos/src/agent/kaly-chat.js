// gastos/src/agent/kaly-chat.js
// Chat de TEXTO de KALY por HTTP (no usa la sesión de voz Live, que es inestable
// para turnos escritos). Devuelve { reply, accionPropuesta? } igual que VARAS:
// las acciones de escritura se PROPONEN y el cliente las confirma/ejecuta.
const { buildAgentContext } = require('./context');
const { formatMemoriaBlock } = require('./memory');
const { getCompanyProfile } = require('../companies/repo');
const { geminiChat } = require('../varas/gemini');

const IDIOMA_NOMBRE = { es: 'español', en: 'inglés (English)', pt: 'portugués de Brasil (Português)' };

const ACCIONES_BASE = [
  { name: 'crear_movimiento_manual', description: 'Registra un gasto o ingreso dictado en palabras. args:{tipo:"gasto"|"ingreso", total:<pesos enteros>, proveedor:<texto corto>, categoria?, estado_pago?:"pagada"|"pendiente"}' },
  { name: 'marcar_pagada', description: 'Marca como pagado un gasto ya registrado. args:{proveedor}' },
  { name: 'anular_movimiento', description: 'Anula un movimiento registrado. args:{proveedor}' },
  { name: 'recordar', description: 'Guarda un dato importante para recordarlo en el futuro. args:{contenido, tipo?}' },
];
const ACCIONES_NEGOCIO = [
  { name: 'agregar_producto', description: 'Crea un producto en el catálogo. args:{nombre, precio, tipo?}' },
  { name: 'editar_precio', description: 'Cambia el precio de un producto existente. args:{nombre, nuevo_precio}' },
  { name: 'editar_stock', description: 'Fija el stock de un producto existente. args:{nombre, stock}' },
];

function fmt(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL'); }

function descAccion(name, a = {}) {
  if (name === 'crear_movimiento_manual') return `Registrar ${a.tipo === 'ingreso' ? 'ingreso' : 'gasto'}: ${(a.proveedor || '').trim()} ${fmt(a.total)}`.trim();
  if (name === 'marcar_pagada') return `Marcar como pagado: ${a.proveedor || ''}`;
  if (name === 'anular_movimiento') return `Anular: ${a.proveedor || ''}`;
  if (name === 'agregar_producto') return `Crear producto: ${a.nombre || ''} ${fmt(a.precio)}`;
  if (name === 'editar_precio') return `Cambiar precio: ${a.nombre || ''} → ${fmt(a.nuevo_precio)}`;
  if (name === 'editar_stock') return `Fijar stock: ${a.nombre || ''} → ${a.stock}`;
  if (name === 'recordar') return `Recordar: ${a.contenido || ''}`;
  return name;
}

function bloqueResumen(ctx) {
  if (ctx.tipoPersonal && ctx.resumenPersonal) {
    const r = ctx.resumenPersonal;
    return `Este mes — Sueldo: ${fmt(r.sueldo_mensual)}; Gastado: ${fmt(r.gastado_mes)}; Disponible: ${fmt(r.disponible)}; Días restantes: ${r.dias_restantes_mes ?? ''}.`;
  }
  const r = ctx.resumen || {};
  return `Este mes — Ingresos: ${fmt(r.ingresos)}; Gastos: ${fmt(r.gastos)}; Saldo: ${fmt(r.saldo)}; Pendientes de pago: ${r.pendientesPago ?? 0}.`;
}

// Devuelve { reply, accionPropuesta? }.
async function responderKaly(db, { companyId, employeeId = null, owner = null } = {}, messages, { gemini } = {}) {
  const _g = gemini || geminiChat;
  const ctx = await buildAgentContext(db, { companyId, employeeId, owner });
  let idioma = 'es';
  try { const p = await getCompanyProfile(db, companyId); idioma = (p && p.idioma) || 'es'; } catch (_) { /* default es */ }

  const acciones = ctx.tipoPersonal ? ACCIONES_BASE : ACCIONES_BASE.concat(ACCIONES_NEGOCIO);
  const nombreSet = new Set(acciones.map((t) => t.name));
  const nombre = ctx.nombre || '';
  const persona = ctx.tipoPersonal
    ? `Eres KALY, el compañero de finanzas personales${nombre ? ' de ' + nombre : ''}. Eres hombre; habla en masculino, cercano y simple, como un amigo que sabe de plata. Nunca menciones IVA, folios ni términos de empresa.`
    : `Eres KALY, la asistente contable del negocio${nombre ? ' de ' + nombre : ''}. Trato formal (usted), clara y concisa.`;

  const systemPrompt = [
    persona,
    `Responde SIEMPRE en ${IDIOMA_NOMBRE[idioma] || IDIOMA_NOMBRE.es}. Sé conciso: 1 a 3 frases.`,
    bloqueResumen(ctx),
    formatMemoriaBlock(ctx.memorias),
    'Cuando el usuario DICTE un gasto o ingreso (ej. "gasté 5 mil en el almuerzo", "pagué 20 lucas de luz", "me llegó el sueldo de 800 mil"), PROPÓN la herramienta crear_movimiento_manual con: total en pesos chilenos ENTEROS (interpreta "5 mil"=5000, "una luca"=1000, "20 lucas"=20000, "un palo"/"un millón"=1000000, "57.500"=57500), tipo (gasto/ingreso), proveedor (descripción corta) y categoría deducida.',
    'Para preguntas de cuánto queda / en qué gasta, responde con los datos del mes indicados arriba. No inventes datos.',
    'Fomenta la "Captura de pantalla" (botón VERDE) para registrar comprobantes que llegan por WhatsApp/correo/banco sin sacar foto. Si preguntan cómo, guía el permiso paso a paso: (1) tocar el botón verde "Captura pantalla"; (2) se abre "Mostrar sobre otras apps" (navegar sobre las aplicaciones); (3) buscar "Hash IA" en la lista; (4) activar el interruptor hasta que quede AZUL; (5) volver a Hash IA y capturar.',
  ].filter(Boolean).join('\n');

  let out;
  try { out = await _g({ systemPrompt, messages: Array.isArray(messages) ? messages : [], tools: acciones }); }
  catch (e) { return { reply: 'No pude procesar tu mensaje ahora.' }; }

  if (out && out.tool && out.tool.name && nombreSet.has(out.tool.name)) {
    const name = out.tool.name; const args = out.tool.args || {};
    return { reply: '', accionPropuesta: { tipo: name, args, descripcion: descAccion(name, args) } };
  }
  return { reply: (out && out.text) || '' };
}

module.exports = { responderKaly, descAccion };
