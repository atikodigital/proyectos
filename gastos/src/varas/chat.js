// gastos/src/varas/chat.js
// Cerebro de VARAS conversacional (texto): loop de function-calling.
const { TOOLS_READ, TOOL_DECLARATIONS, ACCION_NAMES, descAccion } = require('./tools');
const { getCompanyProfile } = require('../companies/repo');

const IDIOMA_NOMBRE = { es: 'español', en: 'inglés (English)', pt: 'portugués de Brasil (Português)' };
// Instrucción para que el asistente responda en el idioma de la cuenta (es|en|pt).
function instruccionIdioma(idioma) {
  const n = IDIOMA_NOMBRE[idioma] || IDIOMA_NOMBRE.es;
  return `IMPORTANTE: Responde SIEMPRE en ${n}, sin importar el idioma en que te pregunten. Adapta los formatos de número, fecha y moneda a ese idioma.`;
}

const SYSTEM_PROMPT = [
  'Eres VARAS, el contador IA de la empresa. Tono serio, claro y conciso.',
  'Respondes SOLO con los datos reales obtenidos vía tus herramientas (tools). Cero invención: si no tienes el dato, dilo.',
  'Para responder sobre saldos, balance, flujo, deudas, conciliación o consumo de insumos, USA la tool correspondiente.',
  'Las acciones (marcar pagado, crear asiento, registrar un movimiento, enviar resumen) NO las ejecutas directamente: las PROPONES y el dueño confirma.',
  'Registras movimientos dictados: si el dueño dicta una compra o venta ("compré...", "vendí...", "pagué..."), extrae proveedor, monto y fecha, deduce gasto/ingreso, calcula neto e IVA y PROPÓN crear_movimiento.',
  'Tu dominio es lo CONTABLE: movimientos, Diario/Mayor/Balance, flujo, conciliación (banco y SII), deudas e insumos. El onboarding, la captura por foto y el catálogo de productos los maneja Kaly; si te piden eso, deriva a Kaly.',
  'Además de responder, orientas al dueño sobre qué puede preguntarte: saldos (banco/caja), deudas por pagar y por cobrar, flujo de caja del mes, estado de la conciliación y consumo de insumos.',
  'Cuando venga al caso, sugiere en 1 frase el siguiente paso útil (ej. a fin de mes: "¿Le reviso la conciliación bancaria para cerrar el mes?").',
  'Los reportes completos y su exportación a Excel se ven desde el Panel web del dueño.',
  'Montos en CLP. Responde en español de Chile.',
  'VARAS y Hash IA fueron creados y desarrollados por José Antonio Olguín Rodríguez, dueño de Hash IA: si te preguntan quién te creó o de quién es Hash IA, dilo con respeto en una frase.',
].join(' ');

async function _defaultGemini() { return { text: 'VARAS no está disponible ahora.' }; }

// Devuelve { reply, accionPropuesta? }.
async function responder(db, companyId, messages, { gemini, maxIter = 5 } = {}) {
  const _g = gemini || _defaultGemini;
  let idioma = 'es';
  try { const p = await getCompanyProfile(db, companyId); idioma = (p && p.idioma) || 'es'; } catch (e) { /* default es */ }
  const systemPrompt = SYSTEM_PROMPT + ' ' + instruccionIdioma(idioma);
  let convo = Array.isArray(messages) ? messages.slice() : [];
  for (let i = 0; i < maxIter; i++) {
    let out;
    try { out = await _g({ systemPrompt, messages: convo, tools: TOOL_DECLARATIONS }); }
    catch (e) { return { reply: 'No pude procesar la consulta.' }; }
    if (out && out.tool && out.tool.name) {
      const name = out.tool.name; const args = out.tool.args || {};
      if (ACCION_NAMES.has(name)) {
        return { reply: '', accionPropuesta: { tipo: name, args, descripcion: descAccion(name, args) } };
      }
      const fn = TOOLS_READ[name];
      if (!fn) { convo = convo.concat([{ role: 'tool', name, text: '{"error":"tool_desconocida"}' }]); continue; }
      let dato; try { dato = await fn(db, companyId, args); } catch (e) { dato = { error: String(e.message || e) }; }
      convo = convo.concat([{ role: 'tool', name, text: JSON.stringify(dato) }]);
      continue;
    }
    return { reply: (out && out.text) || '' };
  }
  return { reply: 'No pude completar la consulta (demasiados pasos).' };
}

module.exports = { responder, SYSTEM_PROMPT };
