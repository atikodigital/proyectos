jest.mock('../../src/ocr/extract');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { extractExpense } = require('../../src/ocr/extract');
const { intakeFromImage } = require('../../src/expenses/intake');
const { getLatestPending, rejectExpense } = require('../../src/expenses/repo');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true,
    implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const db = mem.adapters.createPg();
  const client = new db.Pool();
  await migrate(client).catch(() => {});
  const c = await client.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const e = await client.query("INSERT INTO employees(company_id, nombre) VALUES($1,'Juan') RETURNING id", [c.rows[0].id]);
  return { db: client, companyId: c.rows[0].id, employeeId: e.rows[0].id };
}

test('intakeFromImage corre el motor y guarda con campos de sesion', async () => {
  extractExpense.mockResolvedValue({
    tipo_documento: 'boleta', proveedor: 'Copec', neto: 21008, iva: 3992, total: 25000,
    categoria: 'Combustible y transporte', cuenta_sii_codigo: '4.3.150.1',
    cuenta_sii_nombre: 'Otros Gastos de Administración y Venta', confianza: 75, raw_ocr: { a: 1 },
  });
  const { db, companyId, employeeId } = await freshDb();
  const { expense: exp } = await intakeFromImage({
    db, companyId, employeeId, imageBuffer: Buffer.from('x'), mimeType: 'image/jpeg',
    canal: 'whatsapp', waMessageId: 'wamid.1', fotoPath: '/tmp/a.jpg',
  });
  expect(exp.estado).toBe('pendiente_confirmacion');
  expect(exp.canal).toBe('whatsapp');
  expect(exp.proveedor).toBe('Copec');
  const pend = await getLatestPending(db, companyId, employeeId);
  expect(pend.id).toBe(exp.id);
});

test('rejectExpense pone estado rechazado', async () => {
  extractExpense.mockResolvedValue({ total: 1000, categoria: 'Otros gastos', cuenta_sii_codigo: '4.3.150.1', cuenta_sii_nombre: 'X' });
  const { db, companyId, employeeId } = await freshDb();
  const { expense: exp } = await intakeFromImage({ db, companyId, employeeId, imageBuffer: Buffer.from('x'), canal: 'whatsapp' });
  const rej = await rejectExpense(db, exp.id);
  expect(rej.estado).toBe('rechazado');
  expect(await getLatestPending(db, companyId, employeeId)).toBeNull();
});
