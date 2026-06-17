// gastos/src/auxiliares/mapear.js
// Mapea líneas de factura a auxiliares (insumos). Capa determinística + IA.

// Normaliza una descripción a una "clave" comparable: minúsculas, sin tildes,
// sin números/unidades/tamaños/multiplicadores, espacios colapsados.
function normalizarDescripcion(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')      // tildes
    .replace(/\b\d+([.,]\d+)?\s*(kg|kgs|kilo|kilos|g|gr|grs|l|lt|lts|litro|litros|ml|cc|kwh|kw|m3|m2|un|und|unidad|unidades|cc|pack|caja|cajas|saco|sacos)\b/g, ' ') // cantidad+unidad
    .replace(/\bx\s*\d+\b/g, ' ')                          // multiplicador "x3"
    .replace(/\b\d+\b/g, ' ')                              // números sueltos
    .replace(/[^a-z0-9 ]/g, ' ')                           // símbolos
    .replace(/\s+/g, ' ')
    .trim();
}

// Busca un auxiliar existente cuyo nombre o sinónimo coincida con la descripción
// normalizada (igualdad o inclusión por tokens). Devuelve el auxiliar o null.
function matchExistente(descripcion, auxiliares) {
  const d = normalizarDescripcion(descripcion);
  if (!d) return null;
  for (const a of (auxiliares || [])) {
    const claves = [normalizarDescripcion(a.nombre), ...((a.sinonimos || []).map(normalizarDescripcion))].filter(Boolean);
    for (const k of claves) {
      if (!k) continue;
      if (d === k || d.includes(k) || k.includes(d)) return a;
    }
  }
  return null;
}

module.exports = { normalizarDescripcion, matchExistente };
