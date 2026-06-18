// gastos/tests/varas/acciones.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const { createExpense, getExpense } = require('../../src/expenses/repo');
const { ejecutarAccion } = require('../../src/varas/acciones');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre, owner_whatsapp) VALUES ($1,'T','56999')", [COMPANY]);
  await cuentas.sembrarCuentas(db, COMPANY);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('marcar_pagado por descripción marca el gasto', async () => {
  const db = await makeDb();
  const e = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 50000, proveedor: 'Arriendo Local', estado: 'confirmado', estado_pago: 'registrada' });
  const r = await ejecutarAccion(db, COMPANY, 'marcar_pagado', { descripcion: 'arriendo' }, {});
  expect(r.ok).toBe(true);
  const upd = await getExpense(db, e.id);
  // markExpensePaid fija estado_pago='pagada' (femenino, consistente con 'registrada')
  expect(upd.estado_pago).toBe('pagada');
});

test('crear_asiento_manual crea asiento balanceado', async () => {
  const db = await makeDb();
  const cs = await cuentas.listCuentas(db, COMPANY);
  const r = await ejecutarAccion(db, COMPANY, 'crear_asiento_manual', { glosa: 'Ajuste', lineas: [{ cuenta_id: cs[0].id, debe: 1000, haber: 0 }, { cuenta_id: cs[1].id, debe: 0, haber: 1000 }] }, {});
  expect(r.ok).toBe(true);
  expect(r.asientoId).toBeTruthy();
});

test('enviar_resumen_whatsapp usa sendText inyectado', async () => {
  const db = await makeDb();
  let enviado = null;
  // sendText real toma un objeto {to, body, token, phoneNumberId}
  const sendText = async ({ to, body }) => { enviado = { to, text: body }; return { ok: true }; };
  const r = await ejecutarAccion(db, COMPANY, 'enviar_resumen_whatsapp', {}, { sendText });
  expect(r.ok).toBe(true);
  expect(enviado.to).toBeTruthy();
});

test('acción desconocida -> error', async () => {
  const db = await makeDb();
  const r = await ejecutarAccion(db, COMPANY, 'formatear_disco', {}, {});
  expect(r.ok).toBe(false);
});
