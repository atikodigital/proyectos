// gastos/src/contabilidad/manual.js
// Asientos manuales: partida doble libre que debe cuadrar (Σdebe == Σhaber).
const repo = require('./repo');
const cuentas = require('./cuentas');

function _int(n) { const v = Math.round(Number(n) || 0); return v > 0 ? v : 0; }

// PURO: valida estructura y cuadre. Devuelve { ok, error }.
function validarAsientoManual({ lineas } = {}) {
  const ls = Array.isArray(lineas) ? lineas : [];
  if (ls.length < 2) return { ok: false, error: 'min_lineas' };
  if (ls.some((l) => !l || !l.cuenta_id)) return { ok: false, error: 'sin_cuenta' };
  const sumD = ls.reduce((s, l) => s + _int(l.debe), 0);
  const sumH = ls.reduce((s, l) => s + _int(l.haber), 0);
  if (sumD <= 0 || sumD !== sumH) return { ok: false, error: 'descuadrado' };
  return { ok: true };
}

async function crearAsientoManual(db, companyId, { fecha, glosa, lineas } = {}) {
  const v = validarAsientoManual({ lineas });
  if (!v.ok) { const e = new Error(v.error); e.code = v.error; throw e; }
  // Verifica que todas las cuentas pertenezcan a la empresa.
  const mias = new Set((await cuentas.listCuentas(db, companyId)).map((c) => String(c.id)));
  for (const l of lineas) {
    if (!mias.has(String(l.cuenta_id))) { const e = new Error('cuenta_invalida'); e.code = 'cuenta_invalida'; throw e; }
  }
  const asiento = {
    origen: 'manual',
    origen_ref: null,
    tipo_asiento: 'ajuste',
    fecha: fecha || null,
    glosa: glosa || 'Asiento manual',
    lineas: lineas.map((l) => ({ cuenta_id: l.cuenta_id, debe: _int(l.debe), haber: _int(l.haber), glosa: l.glosa || null })),
  };
  return repo.guardarAsiento(db, companyId, asiento);
}

async function anularAsientoManual(db, companyId, asientoId) {
  await repo.ensureAsientosTables(db);
  const r = await db.query('SELECT id FROM asientos WHERE id=$1 AND company_id=$2', [asientoId, companyId]);
  if (!r.rows[0]) return null;
  return repo.anularAsiento(db, asientoId);
}

module.exports = { validarAsientoManual, crearAsientoManual, anularAsientoManual };
