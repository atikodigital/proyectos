const crypto = require('crypto');
const { validarFirmaMP, procesarEventoMP } = require('../../src/billing/webhook-mp');

// ── firma ────────────────────────────────────────────────────────────────────

test('validarFirmaMP: firma correcta → true', () => {
  const secret = 'test_secret';
  const ts = '1234567890';
  const dataId = 'PAY123';
  const reqId = 'REQ456';
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const headers = { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': reqId };
  expect(validarFirmaMP(headers, dataId, secret)).toBe(true);
});

test('validarFirmaMP: firma incorrecta → false', () => {
  const headers = { 'x-signature': 'ts=123,v1=abcdef', 'x-request-id': 'req1' };
  expect(validarFirmaMP(headers, 'PAY1', 'wrong_secret')).toBe(false);
});

test('validarFirmaMP: sin header x-signature → false', () => {
  expect(validarFirmaMP({}, 'PAY1', 'secret')).toBe(false);
});

// ── procesarEventoMP ─────────────────────────────────────────────────────────

function makeDb(overrides = {}) {
  var rows = [];
  return {
    _rows: rows,
    query: jest.fn(async (sql, params) => {
      if (overrides.query) return overrides.query(sql, params);
      if (sql.includes('SELECT') && sql.includes('external_id')) {
        return { rows: overrides.byExternal ? [{ company_id: overrides.byExternal }] : [] };
      }
      if (sql.includes('SELECT') && sql.includes('company_id=$1')) {
        return { rows: overrides.subscription ? [overrides.subscription] : [] };
      }
      if (sql.includes('INSERT INTO subscriptions')) {
        return { rows: [{ id: 1, company_id: params[0], plan: 'free', estado: 'activa', creditos_limite: 30, creditos_usados: 0 }] };
      }
      rows.push({ sql, params });
      return { rows: [] };
    }),
  };
}

test('authorized: activa suscripción y devuelve accion=activada', async () => {
  const cid = 'company-1';
  const db = makeDb({ subscription: { id: 1, company_id: cid, plan: 'free', estado: 'activa', creditos_limite: 30, creditos_usados: 0 } });
  const r = await procesarEventoMP(db, { type: 'authorized', preapprovalId: 'PRE001', plan: 'pyme', companyId: cid });
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('activada');
  const updateCall = db.query.mock.calls.find(c => c[0].includes('UPDATE subscriptions') && c[0].includes("estado='activa'"));
  expect(updateCall).toBeTruthy();
  expect(updateCall[1][1]).toBe('pyme'); // plan
  expect(updateCall[1][5]).toBe(210);    // creditos_limite (índice 5: [companyId, plan, source, ext_id, ciclo_fin, creditos])
});

test('authorized: sin companyId devuelve datos_incompletos', async () => {
  const db = makeDb();
  const r = await procesarEventoMP(db, { type: 'authorized', preapprovalId: 'PRE001', plan: 'pyme' });
  expect(r.ok).toBe(false);
  expect(r.razon).toBe('datos_incompletos');
});

test('payment: renueva ciclo y resetea créditos', async () => {
  const cid = 'company-2';
  const db = makeDb();
  const r = await procesarEventoMP(db, { type: 'payment', preapprovalId: 'PRE002', companyId: cid });
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('renovada');
  const updateCall = db.query.mock.calls.find(c => c[0].includes('creditos_usados=0'));
  expect(updateCall).toBeTruthy();
});

test('paused: marca estado morosa', async () => {
  const cid = 'company-3';
  const db = makeDb();
  const r = await procesarEventoMP(db, { type: 'paused', preapprovalId: 'PRE003', companyId: cid });
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('morosa');
  const updateCall = db.query.mock.calls.find(c => c[0].includes("estado='morosa'"));
  expect(updateCall).toBeTruthy();
});

test('cancelled: marca estado cancelada', async () => {
  const cid = 'company-4';
  const db = makeDb();
  const r = await procesarEventoMP(db, { type: 'cancelled', preapprovalId: 'PRE004', companyId: cid });
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('cancelada');
  const updateCall = db.query.mock.calls.find(c => c[0].includes("estado='cancelada'"));
  expect(updateCall).toBeTruthy();
});

test('evento desconocido: devuelve ignorado', async () => {
  const db = makeDb();
  const r = await procesarEventoMP(db, { type: 'unknown_event' });
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('ignorado');
});

test('payment sin companyId: busca por external_id', async () => {
  const db = makeDb({ byExternal: 'company-5' });
  const r = await procesarEventoMP(db, { type: 'payment', preapprovalId: 'PRE005' });
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('renovada');
});
