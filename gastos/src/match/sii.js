// gastos/src/match/sii.js
// Conciliación tributaria (determinística): cruza el libro SII contra la contabilidad
// por RUT+folio y calcula el cuadre de IVA del período. "Cero conjeturas".
const { normalizeRut } = require('../domain/normalize');

function _int(n) { return Math.round(Number(n) || 0); }
function keyDoc(rut, folio) { return normalizeRut(rut || '') + '|' + String(folio || '').trim().toLowerCase(); }
function esGasto(e) { return (e.tipo || 'gasto') !== 'ingreso'; }

function conciliarSii(docs = [], expenses = [], opts = {}) {
  const expByKey = new Map();
  for (const e of expenses) expByKey.set(keyDoc(e.rut_emisor, e.folio), e);

  const faltantes = []; const matched = []; const usados = new Set();
  let creditoSii = 0, debitoSii = 0, compras = 0, ventas = 0;

  for (const d of docs) {
    if (d.clase === 'venta') { ventas++; debitoSii += _int(d.iva); } else { compras++; creditoSii += _int(d.iva); }
    const hit = expByKey.get(keyDoc(d.rut, d.folio));
    if (hit) { matched.push({ expenseId: hit.id, folio: d.folio, rut: d.rut }); usados.add(hit.id); }
    else { faltantes.push({ clase: d.clase, tipo_doc: d.tipo_doc, rut: d.rut, folio: d.folio, fecha: d.fecha, neto: _int(d.neto), iva: _int(d.iva), total: _int(d.total) }); }
  }

  // IVA contable: de los expenses (gasto→crédito, ingreso→débito)
  let creditoContable = 0, debitoContable = 0;
  const docKeys = new Set(docs.map((d) => keyDoc(d.rut, d.folio)));
  const sobrantes = [];
  for (const e of expenses) {
    if (esGasto(e)) creditoContable += _int(e.iva); else debitoContable += _int(e.iva);
    if (!docKeys.has(keyDoc(e.rut_emisor, e.folio))) sobrantes.push({ expenseId: e.id, proveedor: e.proveedor || '', folio: e.folio || '', total: _int(e.total) });
  }

  return {
    clase: { compras, ventas },
    faltantes, matched, sobrantes,
    iva: {
      creditoContable, creditoSii, debitoContable, debitoSii,
      ivaPagarContable: debitoContable - creditoContable,
      ivaPagarSii: debitoSii - creditoSii,
      diferenciaCredito: creditoSii - creditoContable,
      diferenciaDebito: debitoSii - debitoContable,
    },
  };
}

module.exports = { conciliarSii, keyDoc };
