// gastos/src/contabilidad/contabilizar.js
// Contabilizador idempotente: convierte un expense en asiento y lo persiste,
// anulando el asiento vivo anterior del mismo (origen, origen_ref, tipo_asiento).
const cuentas = require('./cuentas');
const repo = require('./repo');
const { asientoDeMovimiento } = require('./asientos');

// Construye el resolvedor de cuentas para una empresa (carga el plan una vez).
async function _resolver(db, companyId) {
  const lista = await cuentas.listCuentas(db, companyId);
  if (!lista.length) { await cuentas.sembrarCuentas(db, companyId); }
  const all = lista.length ? lista : await cuentas.listCuentas(db, companyId);
  const porClaveMap = new Map(all.filter((c) => c.clave).map((c) => [c.clave, c.id]));
  const porCodigoMap = new Map(all.map((c) => [c.codigo, c.id]));
  const generico = porClaveMap.get('gasto_generico');
  return {
    porClave: (k) => porClaveMap.get(k) || null,
    porCodigo: (cod) => (cod && porCodigoMap.get(cod)) || generico || null,
  };
}

async function contabilizarMovimiento(db, companyId, expense, tipoAsiento) {
  const resolver = await _resolver(db, companyId);
  const asiento = asientoDeMovimiento(expense, resolver, tipoAsiento); // valida balanceo
  const previo = await repo.buscarAsientoVivo(db, companyId, asiento.origen, asiento.origen_ref, tipoAsiento);
  if (previo) await repo.anularAsiento(db, previo.id);
  return repo.guardarAsiento(db, companyId, asiento);
}

// Anula SOLO el asiento de pago (Proveedores→Banco), dejando vivo el devengo.
// Sirve para volver un movimiento de "pagado" a "pendiente de pago".
async function descontabilizarPago(db, companyId, origenRef) {
  await repo.ensureAsientosTables(db);
  const previo = await repo.buscarAsientoVivo(db, companyId, 'pago', origenRef, 'pago');
  if (previo) { await repo.anularAsiento(db, previo.id); return 1; }
  return 0;
}

async function descontabilizarMovimiento(db, companyId, origenRef) {
  await repo.ensureAsientosTables(db);
  const r = await db.query(
    "SELECT id FROM asientos WHERE company_id=$1 AND origen_ref=$2 AND estado<>'anulado'",
    [companyId, origenRef]
  );
  for (const row of r.rows) await repo.anularAsiento(db, row.id);
  return r.rows.length;
}

// Fachada segura para enganchar al ciclo de vida del movimiento.
// accion: 'confirmar' -> devengo | 'pagar' -> pago | 'anular' -> descontabiliza | 'editar' -> regenera devengo
async function aplicarContabilidad(db, companyId, expense, accion) {
  try {
    if (accion === 'anular') return { ok: true, anulados: await descontabilizarMovimiento(db, companyId, expense.id) };
    if (accion === 'despagar') return { ok: true, anulados: await descontabilizarPago(db, companyId, expense.id) };
    if (accion === 'pagar') return { ok: true, asiento: await contabilizarMovimiento(db, companyId, expense, 'pago') };
    // 'confirmar' y 'editar' -> (re)genera el devengo
    return { ok: true, asiento: await contabilizarMovimiento(db, companyId, expense, 'devengo') };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = { contabilizarMovimiento, descontabilizarMovimiento, aplicarContabilidad };
