const { procesarEventoPaypal } = require('../../src/billing/webhook-paypal');

// ── DB mock ───────────────────────────────────────────────────────────────────
function makeDb(opts = {}) {
  const subRow = opts.subscription || {
    id: 1,
    company_id: opts.companyId || 'cid-pp-1',
    plan: 'free',
    estado: 'activa',
    creditos_limite: 30,
    creditos_usados: 0,
    external_id: opts.external_id || null,
  };

  const queries = [];
  return {
    _queries: queries,
    query: jest.fn(async (sql, params) => {
      queries.push({ sql, params });

      if (sql.includes('SELECT') && sql.includes('external_id=$1')) {
        const found = opts.byExternalId === (params && params[0]);
        return { rows: found ? [{ company_id: opts.companyId || 'cid-pp-1' }] : [] };
      }

      if (sql.includes('SELECT') && sql.includes('company_id=$1')) {
        return { rows: [subRow] };
      }

      if (sql.includes('INSERT INTO subscriptions')) {
        return { rows: [subRow] };
      }

      return { rows: [subRow] };
    }),
  };
}

function ppEvent(event_type, resource = {}) {
  return { event_type, resource };
}

// ── BILLING.SUBSCRIPTION.ACTIVATED ───────────────────────────────────────────

test('ACTIVATED con custom_id válido → activa suscripción', async () => {
  const companyId = 'cid-activated';
  const db = makeDb({ companyId, subscription: {
    id: 1, company_id: companyId, plan: 'free', estado: 'activa',
    creditos_limite: 30, creditos_usados: 0,
  }});

  const evento = ppEvent('BILLING.SUBSCRIPTION.ACTIVATED', {
    id: 'I-sub-test',
    custom_id: JSON.stringify({ companyId, plan: 'pyme', moneda: 'USD' }),
  });

  const r = await procesarEventoPaypal(db, evento);

  expect(r.ok).toBe(true);
  expect(r.accion).toBe('activada');

  const updateCall = db._queries.find(
    (q) => q.sql.includes('UPDATE subscriptions') && q.sql.includes("estado='activa'"),
  );
  expect(updateCall).toBeTruthy();
  expect(updateCall.params[0]).toBe(companyId);
  expect(updateCall.params[1]).toBe('pyme');     // plan
  expect(updateCall.params[2]).toBe('paypal');   // source
  expect(updateCall.params[3]).toBe('I-sub-test'); // external_id
});

test('ACTIVATED sin custom_id → sin_company', async () => {
  const db = makeDb();
  const evento = ppEvent('BILLING.SUBSCRIPTION.ACTIVATED', {
    id: 'I-no-custom',
  });
  const r = await procesarEventoPaypal(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('sin_company');
  const updates = db._queries.filter((q) => q.sql.includes('UPDATE'));
  expect(updates).toHaveLength(0);
});

// ── PAYMENT.SALE.COMPLETED (renewal) ─────────────────────────────────────────

test('PAYMENT.SALE.COMPLETED renueva ciclo con company_id en resource.custom', async () => {
  const companyId = 'cid-renewal';
  const db = makeDb({ companyId });

  const evento = ppEvent('PAYMENT.SALE.COMPLETED', {
    custom: JSON.stringify({ companyId, plan: 'pyme', moneda: 'USD' }),
    billing_agreement_id: 'I-sub-renewal',
  });

  const r = await procesarEventoPaypal(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('renovada');

  const updateCall = db._queries.find((q) => q.sql.includes('creditos_usados=0'));
  expect(updateCall).toBeTruthy();
  expect(updateCall.params[0]).toBe(companyId);
});

test('PAYMENT.SALE.COMPLETED renueva por external_id lookup cuando no hay resource.custom', async () => {
  const companyId = 'cid-renewal-ext';
  const subId = 'I-sub-by-ext';
  const db = makeDb({ companyId, byExternalId: subId });

  const evento = ppEvent('PAYMENT.SALE.COMPLETED', {
    billing_agreement_id: subId,
  });

  const r = await procesarEventoPaypal(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('renovada');
});

test('PAYMENT.SALE.COMPLETED sin company → sin_company', async () => {
  const db = makeDb({ byExternalId: 'will-not-match' });
  const evento = ppEvent('PAYMENT.SALE.COMPLETED', {
    billing_agreement_id: 'I-unknown-999',
  });
  const r = await procesarEventoPaypal(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('sin_company');
});

// ── BILLING.SUBSCRIPTION.CANCELLED ───────────────────────────────────────────

test('CANCELLED con custom_id → estado cancelada', async () => {
  const companyId = 'cid-cancelled';
  const db = makeDb({ companyId });

  const evento = ppEvent('BILLING.SUBSCRIPTION.CANCELLED', {
    id: 'I-sub-cancelled',
    custom_id: JSON.stringify({ companyId, plan: 'pyme', moneda: 'USD' }),
  });

  const r = await procesarEventoPaypal(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('cancelada');

  const updateCall = db._queries.find((q) => q.sql.includes("estado='cancelada'"));
  expect(updateCall).toBeTruthy();
  expect(updateCall.params[0]).toBe(companyId);
});

test('CANCELLED por external_id lookup cuando no hay custom_id', async () => {
  const companyId = 'cid-cancelled-ext';
  const subId = 'I-sub-ext-del';
  const db = makeDb({ companyId, byExternalId: subId });

  const evento = ppEvent('BILLING.SUBSCRIPTION.CANCELLED', { id: subId });
  const r = await procesarEventoPaypal(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('cancelada');
});

// ── BILLING.SUBSCRIPTION.EXPIRED ─────────────────────────────────────────────

test('EXPIRED → estado cancelada', async () => {
  const companyId = 'cid-expired';
  const db = makeDb({ companyId });
  const evento = ppEvent('BILLING.SUBSCRIPTION.EXPIRED', {
    id: 'I-exp',
    custom_id: JSON.stringify({ companyId, plan: 'basico', moneda: 'EUR' }),
  });
  const r = await procesarEventoPaypal(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('cancelada');
});

// ── BILLING.SUBSCRIPTION.SUSPENDED ───────────────────────────────────────────

test('SUSPENDED → estado morosa', async () => {
  const companyId = 'cid-suspended';
  const db = makeDb({ companyId });

  const evento = ppEvent('BILLING.SUBSCRIPTION.SUSPENDED', {
    id: 'I-sub-suspended',
    custom_id: JSON.stringify({ companyId, plan: 'pyme', moneda: 'USD' }),
  });

  const r = await procesarEventoPaypal(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('morosa');

  const updateCall = db._queries.find((q) => q.sql.includes("estado='morosa'"));
  expect(updateCall).toBeTruthy();
  expect(updateCall.params[0]).toBe(companyId);
});

// ── Eventos desconocidos ──────────────────────────────────────────────────────

test('evento desconocido → ignorado, no toca DB', async () => {
  const db = makeDb();
  const evento = ppEvent('PAYMENT.CAPTURE.COMPLETED', { id: 'cap-xyz' });

  const r = await procesarEventoPaypal(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('ignorado');
  expect(r.type).toBe('PAYMENT.CAPTURE.COMPLETED');

  const updates = db._queries.filter((q) => q.sql.includes('UPDATE'));
  expect(updates).toHaveLength(0);
});
