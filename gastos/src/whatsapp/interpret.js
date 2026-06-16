const { parseAmountClp } = require('../domain/normalize');

const CONFIRM = new Set(['si', 'sí', 'ok', 'okay', 'dale', 'correcto', 'confirmar', 'confirmo', 'listo']);
const CANCEL = new Set(['no', 'cancelar', 'descartar', 'borrar', 'eliminar']);
const AMOUNT_FIELDS = { monto: 'total', total: 'total', neto: 'neto', iva: 'iva' };
const TEXT_FIELDS = { categoria: 'categoria', 'categoría': 'categoria', proveedor: 'proveedor', folio: 'folio', fecha: 'fecha', rut: 'rut_emisor' };

function interpretText(raw) {
  const text = String(raw || '').trim();
  const lower = text.toLowerCase();

  if (CONFIRM.has(lower)) return { kind: 'confirm' };
  if (CANCEL.has(lower)) return { kind: 'cancel' };

  if (lower === 'resumen' || lower.startsWith('resumen ') || lower.startsWith('resumen')) {
    if (lower === 'resumen') return { kind: 'summary', period: '' };
    if (lower.startsWith('resumen ')) return { kind: 'summary', period: text.slice('resumen '.length).trim() };
  }

  const firstSpace = text.indexOf(' ');
  if (firstSpace > 0) {
    const head = lower.slice(0, firstSpace);
    const rest = text.slice(firstSpace + 1).trim();
    if (AMOUNT_FIELDS[head]) {
      return { kind: 'correction', field: AMOUNT_FIELDS[head], value: parseAmountClp(rest) };
    }
    if (TEXT_FIELDS[head]) {
      return { kind: 'correction', field: TEXT_FIELDS[head], value: rest };
    }
  }

  return { kind: 'unknown' };
}

module.exports = { interpretText };
