// Consumo por auxiliar: cantidad por unidad + monto + serie mensual.
const { ensureLineasTable } = require('../expenses/lineas-repo');
const auxRepo = require('./repo');
const { periodoRange } = require('../expenses/query');

function _toYm(fecha) {
  // fecha puede ser un Date (pg-mem) o string 'YYYY-MM-DD' (real pg)
  if (fecha instanceof Date) {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return String(fecha).slice(0, 7);
}

function _rango(filtros = {}) {
  const p = periodoRange(filtros.periodo);
  return { from: p ? p.from : filtros.from, to: p ? p.to : filtros.to };
}

async function consumoAuxiliar(db, companyId, auxiliarId, filtros = {}) {
  await ensureLineasTable(db);
  const { from, to } = _rango(filtros);
  const where = ["e.company_id = $1", "e.estado <> 'anulado'", "el.auxiliar_id = $2"];
  const vals = [companyId, auxiliarId];
  if (from) { vals.push(from); where.push(`e.fecha >= $${vals.length}`); }
  if (to) { vals.push(to); where.push(`e.fecha <= $${vals.length}`); }
  const r = await db.query(
    `SELECT el.unidad, el.cantidad, el.total, e.fecha
     FROM expense_lineas el JOIN expenses e ON e.id = el.expense_id
     WHERE ${where.join(' AND ')}`, vals
  );
  const cantidadPorUnidad = {}; let monto = 0; const serieMap = {};
  for (const row of r.rows) {
    const u = row.unidad || 'un';
    const cant = Number(row.cantidad) || 0;
    const tot = Math.round(Number(row.total) || 0);
    cantidadPorUnidad[u] = (cantidadPorUnidad[u] || 0) + cant;
    monto += tot;
    const ym = row.fecha ? _toYm(row.fecha) : 'sin-fecha';
    if (!serieMap[ym]) serieMap[ym] = { ym, cantidad: 0, monto: 0 };
    serieMap[ym].cantidad += cant;
    serieMap[ym].monto += tot;
  }
  const serie = Object.values(serieMap).sort((a, b) => a.ym.localeCompare(b.ym));
  return { cantidadPorUnidad, monto, serie };
}

async function consumoPorNombre(db, companyId, nombre, filtros = {}) {
  const aux = await auxRepo.findMatch(db, companyId, nombre);
  if (!aux) return { auxiliar: null, cantidadPorUnidad: {}, monto: 0, serie: [] };
  const c = await consumoAuxiliar(db, companyId, aux.id, filtros);
  return { auxiliar: { id: aux.id, nombre: aux.nombre }, ...c };
}

function _clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }

function frasearConsumo(consumo, nombrePedido) {
  const c = consumo || {};
  const nombre = (c.auxiliar && c.auxiliar.nombre) || nombrePedido || 'eso';
  if (!c.auxiliar) return `No encontré el insumo "${nombrePedido || nombre}" en tus registros.`;
  const partes = Object.entries(c.cantidadPorUnidad || {}).map(([u, q]) => `${(Math.round((Number(q) || 0) * 100) / 100)} ${u}`);
  const cant = partes.length ? partes.join(' + ') : 'sin cantidad registrada';
  return `${nombre}: consumiste ${cant} por ${_clp(c.monto)}.`;
}

module.exports = { consumoAuxiliar, consumoPorNombre, frasearConsumo };
