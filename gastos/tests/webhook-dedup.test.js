const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createWebhookRouter } = require('../src/whatsapp/webhook');
const { createEmployee } = require('../src/companies/repo');

async function setup() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db);
  const c = await db.query("INSERT INTO companies(nombre, wa_phone_number_id, wa_token) VALUES('X','PNID','TK') RETURNING id");
  const cid = c.rows[0].id;
  await createEmployee(db, { company_id: cid, nombre: 'Jose', phone: '56999', activo: true });
  const sent = [];
  const extract = async () => ({
    tipo: 'gasto', tipo_documento: 'factura', rut_emisor: '76.1-1', folio: '1', nro_operacion: '',
    proveedor: 'Sodimac', fecha: '2026-06-01', neto: 10000, iva: 1900, total: 11900,
    moneda: 'CLP', categoria: 'Otros gastos', cuenta_sii_codigo: '5', cuenta_sii_nombre: 'G', glosa: '', confianza: 80, raw_ocr: {},
  });
  const app = express();
  app.use(express.json());
  app.use('/wh', createWebhookRouter({
    db, sendText: async (m) => sent.push(m),
    downloadMedia: async () => ({ buffer: Buffer.from('foto'), mimeType: 'image/jpeg' }),
    extractExpense: extract,
  }));
  return { app, db, sent, cid };
}
function imageEvent(id) {
  return {
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: 'PNID' },
      contacts: [{ wa_id: '56999', profile: { name: 'Juan Pérez' } }],
      messages: [{ from: '56999', id, type: 'image', image: { id: 'media1' } }],
    } }] }],
  };
}

test('guarda wa_sender_name/phone del payload', async () => {
  const { app, db } = await setup();
  await request(app).post('/wh').send(imageEvent('m1'));
  const r = await db.query('SELECT wa_sender_name, wa_sender_phone FROM expenses LIMIT 1');
  expect(r.rows[0].wa_sender_name).toBe('Juan Pérez');
  expect(r.rows[0].wa_sender_phone).toBe('56999');
});

test('segunda imagen igual → no inserta y avisa duplicado', async () => {
  const { app, db, sent } = await setup();
  await request(app).post('/wh').send(imageEvent('m1'));
  await request(app).post('/wh').send(imageEvent('m2'));
  const count = await db.query('SELECT count(*)::int AS n FROM expenses');
  expect(count.rows[0].n).toBe(1);
  expect(sent[sent.length - 1].body).toMatch(/ya fue registrado|ya registrado|duplicad/i);
});
