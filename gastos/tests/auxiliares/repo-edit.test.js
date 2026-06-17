// gastos/tests/auxiliares/repo-edit.test.js
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const aux = require('../../src/auxiliares/repo');
const lineas = require('../../src/expenses/lineas-repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  return db;
}
const COMPANY = '11111111-1111-1111-1111-111111111111';
const EXP = '33333333-3333-3333-3333-333333333333';

test('updateAuxiliar renombra y setActivo desactiva', async () => {
  const db = await makeDb();
  const a = await aux.createAuxiliar(db, COMPANY, { nombre: 'Harnia' });
  const up = await aux.updateAuxiliar(db, COMPANY, a.id, { nombre: 'Harina', unidad_principal: 'kg' });
  expect(up.nombre).toBe('Harina');
  await aux.setActivo(db, COMPANY, a.id, false);
  expect((await aux.listAuxiliares(db, COMPANY)).length).toBe(0); // listAuxiliares solo activos
});

test('setLineaAuxiliar reasigna y getLineaConCompany trae company_id del gasto', async () => {
  const db = await makeDb();
  const { createExpense } = require('../../src/expenses/repo');
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  const exp = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 1000 });
  await lineas.createLineas(db, exp.id, [{ descripcion: 'X', total: 1000 }]);
  const ls = await lineas.getLineas(db, exp.id);
  const a = await aux.createAuxiliar(db, COMPANY, { nombre: 'Harina' });
  await lineas.setLineaAuxiliar(db, ls[0].id, a.id);
  const lc = await lineas.getLineaConCompany(db, ls[0].id);
  expect(lc.company_id).toBe(COMPANY);
  expect(lc.auxiliar_id).toBe(a.id);
});

test('mergeAuxiliar reapunta las líneas del "from" al "to" y desactiva el from', async () => {
  const db = await makeDb();
  const { createExpense } = require('../../src/expenses/repo');
  await db.query("INSERT INTO companies (id, nombre) VALUES ($1,'T')", [COMPANY]);
  const exp = await createExpense(db, { company_id: COMPANY, tipo: 'gasto', total: 1000 });
  const from = await aux.createAuxiliar(db, COMPANY, { nombre: 'harina trigo', sinonimos: ['harina 0000'] });
  const to = await aux.createAuxiliar(db, COMPANY, { nombre: 'Harina' });
  await lineas.createLineas(db, exp.id, [{ descripcion: 'X', total: 1000, auxiliar_id: from.id }]);
  await aux.mergeAuxiliar(db, COMPANY, from.id, to.id);
  const ls = await lineas.getLineas(db, exp.id);
  expect(ls[0].auxiliar_id).toBe(to.id);
  expect((await aux.listAuxiliares(db, COMPANY)).find((x) => x.id === from.id)).toBeFalsy(); // from desactivado
  const toAux = await aux.getById(db, to.id);
  expect(toAux.sinonimos).toContain('harina 0000'); // hereda sinónimos
});
