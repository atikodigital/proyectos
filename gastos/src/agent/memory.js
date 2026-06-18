// Memoria del cliente para KALY: hechos por empresa (kaly_memory).
const TIPOS = ['negocio', 'dueño', 'preferencia', 'hecho'];

function normalizeMemoria(input) {
  input = input || {};
  const contenido = String(input.contenido || '').trim().slice(0, 500);
  if (!contenido) return null;
  const tipo = TIPOS.includes(input.tipo) ? input.tipo : 'hecho';
  return { tipo, contenido };
}

function formatMemoriaBlock(memorias) {
  const arr = (Array.isArray(memorias) ? memorias : []).filter((m) => m && m.contenido);
  if (!arr.length) return '';
  const porTipo = {};
  for (const m of arr) { (porTipo[m.tipo || 'hecho'] = porTipo[m.tipo || 'hecho'] || []).push(m.contenido); }
  const etiqueta = { negocio: 'Del negocio', 'dueño': 'Del dueño', preferencia: 'Preferencias', hecho: 'Otros' };
  let out = '## Lo que sé de este negocio\n';
  for (const t of TIPOS) {
    if (!porTipo[t]) continue;
    out += `- ${etiqueta[t]}: ${porTipo[t].join('; ')}\n`;
  }
  return out.trim();
}

module.exports = { normalizeMemoria, formatMemoriaBlock, TIPOS };
