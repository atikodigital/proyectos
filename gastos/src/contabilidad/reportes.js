// gastos/src/contabilidad/reportes.js
// Reportes contables de VARAS: consultas sobre asientos vivos (estado<>'anulado').
const { ensureAsientosTables } = require('./repo');
const { ensureCuentasTable } = require('./cuentas');
const { periodoRange } = require('../expenses/query');

function _rango(filtros = {}) {
  const p = periodoRange(filtros.periodo);
  return { from: p ? p.from : filtros.from, to: p ? p.to : filtros.to };
}

async function libroDiario(db, companyId, filtros = {}) {
  await ensureAsientosTables(db);
  const { from, to } = _rango(filtros);
  const where = ["a.company_id=$1", "a.estado<>'anulado'"]; const vals = [companyId];
  if (from) { vals.push(from); where.push(`a.fecha >= $${vals.length}`); }
  if (to) { vals.push(to); where.push(`a.fecha <= $${vals.length}`); }
  const cab = await db.query(
    `SELECT a.* FROM asientos a WHERE ${where.join(' AND ')} ORDER BY a.fecha ASC, a.created_at ASC`, vals
  );
  const out = [];
  for (const a of cab.rows) {
    const l = await db.query(
      `SELECT al.*, c.codigo, c.nombre AS cuenta_nombre, c.clave
       FROM asiento_lineas al LEFT JOIN cuentas c ON c.id = al.cuenta_id
       WHERE al.asiento_id=$1`, [a.id]
    );
    out.push({ ...a, lineas: l.rows });
  }
  return out;
}

async function libroMayor(db, companyId, filtros = {}) {
  await ensureAsientosTables(db); await ensureCuentasTable(db);
  const { from, to } = _rango(filtros);
  const where = ["a.company_id=$1", "a.estado<>'anulado'"]; const vals = [companyId];
  if (from) { vals.push(from); where.push(`a.fecha >= $${vals.length}`); }
  if (to) { vals.push(to); where.push(`a.fecha <= $${vals.length}`); }
  const r = await db.query(
    `SELECT c.id AS cuenta_id, c.codigo, c.nombre, c.clave, c.tipo,
            COALESCE(SUM(al.debe),0) AS debe, COALESCE(SUM(al.haber),0) AS haber
     FROM asiento_lineas al
     JOIN asientos a ON a.id = al.asiento_id
     LEFT JOIN cuentas c ON c.id = al.cuenta_id
     WHERE ${where.join(' AND ')}
     GROUP BY c.id, c.codigo, c.nombre, c.clave, c.tipo
     ORDER BY c.codigo ASC`, vals
  );
  return r.rows.map((row) => ({ ...row, saldo: Number(row.debe) - Number(row.haber) }));
}

async function balanceComprobacion(db, companyId, filtros = {}) {
  const mayor = await libroMayor(db, companyId, filtros);
  let totalDebe = 0, totalHaber = 0;
  const cuentas = mayor.map((c) => {
    const debe = Number(c.debe), haber = Number(c.haber), saldo = debe - haber;
    totalDebe += debe; totalHaber += haber;
    return { ...c, deudor: saldo > 0 ? saldo : 0, acreedor: saldo < 0 ? -saldo : 0 };
  });
  return { cuentas, totalDebe, totalHaber, cuadrado: totalDebe === totalHaber };
}

async function flujoCaja(db, companyId, filtros = {}) {
  await ensureAsientosTables(db);
  const { from, to } = _rango(filtros);
  const where = ["a.company_id=$1", "a.estado<>'anulado'", "a.tipo_asiento='pago'", "c.clave IN ('caja','banco')"];
  const vals = [companyId];
  if (from) { vals.push(from); where.push(`a.fecha >= $${vals.length}`); }
  if (to) { vals.push(to); where.push(`a.fecha <= $${vals.length}`); }
  const r = await db.query(
    `SELECT a.id, a.fecha, a.glosa, al.debe, al.haber, c.clave
     FROM asiento_lineas al
     JOIN asientos a ON a.id = al.asiento_id
     LEFT JOIN cuentas c ON c.id = al.cuenta_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.fecha ASC, a.created_at ASC`, vals
  );
  let entradas = 0, salidas = 0;
  const movimientos = r.rows.map((row) => {
    const entra = Number(row.debe), sale = Number(row.haber);
    entradas += entra; salidas += sale;
    return { id: row.id, fecha: row.fecha, glosa: row.glosa, entrada: entra, salida: sale };
  });
  return { entradas, salidas, neto: entradas - salidas, movimientos };
}

module.exports = { libroDiario, libroMayor, balanceComprobacion, flujoCaja };
