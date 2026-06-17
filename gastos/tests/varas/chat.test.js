// gastos/tests/varas/chat.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const cuentas = require('../../src/contabilidad/cuentas');
const { contabilizarMovimiento } = require('../../src/contabilidad/contabilizar');
const { responder } = require('../../src/varas/chat');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  await cuentas.sembrarCuentas(db, COMPANY);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';

test('ejecuta tool de lectura y devuelve reply con el dato', async () => {
  const db = await makeDb();
  await contabilizarMovimiento(db, COMPANY, { id: 'e1', tipo: 'gasto', neto: 10000, iva: 1900, total: 11900, fecha: '2026-06-10', cuenta_sii_codigo: '4.3.10.1', proveedor: 'X' }, 'devengo');
  let llamada = 0;
  const gemini = async ({ messages }) => {
    llamada++;
    if (llamada === 1) return { tool: { name: 'balance', args: {} } };
    // 2ª llamada: ya tiene el resultado del tool en messages → responde texto
    const ultimo = messages[messages.length - 1];
    return { text: 'Tu balance cuadra. (' + ultimo.text.slice(0, 10) + ')' };
  };
  const r = await responder(db, COMPANY, [{ role: 'user', text: '¿mi balance cuadra?' }], { gemini });
  expect(r.reply).toMatch(/cuadra/i);
  expect(r.accionPropuesta).toBeUndefined();
});

test('un tool de acción produce accionPropuesta sin ejecutar', async () => {
  const db = await makeDb();
  const gemini = async () => ({ tool: { name: 'marcar_pagado', args: { descripcion: 'arriendo' } } });
  const r = await responder(db, COMPANY, [{ role: 'user', text: 'marca pagado el arriendo' }], { gemini });
  expect(r.accionPropuesta).toBeTruthy();
  expect(r.accionPropuesta.tipo).toBe('marcar_pagado');
  expect(r.accionPropuesta.descripcion).toMatch(/arriendo/);
});

test('si Gemini responde texto directo, lo devuelve', async () => {
  const db = await makeDb();
  const gemini = async () => ({ text: 'Hola, soy VARAS.' });
  const r = await responder(db, COMPANY, [{ role: 'user', text: 'hola' }], { gemini });
  expect(r.reply).toBe('Hola, soy VARAS.');
});

test('respeta el tope de iteraciones (no se cuelga)', async () => {
  const db = await makeDb();
  const gemini = async () => ({ tool: { name: 'balance', args: {} } }); // siempre pide tool → nunca termina
  const r = await responder(db, COMPANY, [{ role: 'user', text: 'x' }], { gemini, maxIter: 3 });
  expect(typeof r.reply).toBe('string'); // devuelve algo, no se cuelga
});
