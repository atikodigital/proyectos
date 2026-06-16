// gastos/tests/match/repo.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const repo = require('../../src/match/repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';
const informe = { saldoFinalCartola: 88100, bancoContable: 90000, sca: 88100, sba: 88100, cuadrado: true, partidas: [{ tipo: 'nota_debito', monto: 1900 }], exceptions: [] };

test('guardarConciliacion persiste y getUltima la recupera', async () => {
  const db = await makeDb();
  const saved = await repo.guardarConciliacion(db, COMPANY, 'bancaria', informe);
  expect(saved.id).toBeTruthy();
  const u = await repo.getUltima(db, COMPANY, 'bancaria');
  expect(u).toBeTruthy();
  expect(Number(u.sca)).toBe(88100);
  expect(u.cuadrado).toBe(true);
  expect(u.partidas[0].tipo).toBe('nota_debito'); // jsonb round-trip
});
