const { procesarEventoStripe } = require('../../src/billing/webhook-stripe');

// ── DB mock ───────────────────────────────────────────────────────────────────
// Simulates just enough of pg to satisfy repo.js + webhook-stripe.js queries.

function makeDb(opts = {}) {
  // subscription row returned for SELECT by company_id (needed by activarSuscripcion→createFreeSubscription)
  const subRow = opts.subscription || {
    id: 1,
    company_id: opts.companyId || 'cid-1',
    plan: 'free',
    estado: 'activa',
    creditos_limite: 30,
    creditos_usados: opts.creditos_usados || 0,
    external_id: opts.external_id || null,
  };

  const queries = [];

  return {
    _queries: queries,
    query: jest.fn(async (sql, params) => {
      queries.push({ sql, params });

      // SELECT by external_id → companyId lookup
      if (sql.includes('SELECT') && sql.includes('external_id=$1')) {
        const found = opts.byExternalId === (params && params[0]);
        return { rows: found ? [{ company_id: opts.companyId || 'cid-1' }] : [] };
      }

      // SELECT * FROM subscriptions WHERE company_id=$1
      if (sql.includes('SELECT') && sql.includes('company_id=$1')) {
        return { rows: [subRow] };
      }

      // INSERT INTO subscriptions (for createFreeSubscription when none exists)
      if (sql.includes('INSERT INTO subscriptions')) {
        return { rows: [subRow] };
      }

      // All UPDATEs
      return { rows: [subRow] };
    }),
  };
}

// ── Helper to build a Stripe event ───────────────────────────────────────────

function stripeEvent(type, obj) {
  return { type, data: { object: obj } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: checkout.session.completed → activa suscripción
// ─────────────────────────────────────────────────────────────────────────────
test('checkout.session.completed con metadata.company_id → estado activa, plan pyme, source stripe, external_id=sub_id', async () => {
  const companyId = 'cid-checkout';
  const db = makeDb({ companyId, subscription: {
    id: 1, company_id: companyId, plan: 'free', estado: 'activa',
    creditos_limite: 30, creditos_usados: 0,
  }});

  const evento = stripeEvent('checkout.session.completed', {
    id: 'cs_abc',
    subscription: 'sub_xyz',
    metadata: { company_id: companyId, plan: 'pyme', moneda: 'USD' },
  });

  const r = await procesarEventoStripe(db, evento);

  expect(r.ok).toBe(true);
  expect(r.accion).toBe('activada');

  // Should have called UPDATE subscriptions with estado='activa', source='stripe', external_id='sub_xyz'
  const updateCall = db._queries.find(
    (q) => q.sql.includes('UPDATE subscriptions') && q.sql.includes("estado='activa'"),
  );
  expect(updateCall).toBeTruthy();
  // params: [companyId, plan, source, external_id, ciclo_fin, creditos_limite]
  expect(updateCall.params[0]).toBe(companyId);
  expect(updateCall.params[1]).toBe('pyme');
  expect(updateCall.params[2]).toBe('stripe');
  expect(updateCall.params[3]).toBe('sub_xyz');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: invoice.paid → renueva ciclo (creditos_usados=0)
// ─────────────────────────────────────────────────────────────────────────────
test('invoice.paid → resetea creditos_usados y renueva ciclo', async () => {
  const companyId = 'cid-invoice';
  const subId = 'sub_renew';
  const db = makeDb({
    companyId,
    byExternalId: subId,
    external_id: subId,
    creditos_usados: 15,
    subscription: {
      id: 1, company_id: companyId, plan: 'pyme', estado: 'activa',
      creditos_limite: 210, creditos_usados: 15, external_id: subId,
    },
  });

  const evento = stripeEvent('invoice.paid', {
    subscription: subId,
    // no subscription_details.metadata → should fall back to external_id lookup
  });

  const r = await procesarEventoStripe(db, evento);

  expect(r.ok).toBe(true);
  expect(r.accion).toBe('renovada');

  const updateCall = db._queries.find(
    (q) => q.sql.includes('creditos_usados=0'),
  );
  expect(updateCall).toBeTruthy();
  expect(updateCall.params[0]).toBe(companyId);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: customer.subscription.deleted → cancelada
// ─────────────────────────────────────────────────────────────────────────────
test('customer.subscription.deleted → estado cancelada', async () => {
  const companyId = 'cid-deleted';
  const subId = 'sub_del';
  const db = makeDb({ companyId, byExternalId: subId });

  const evento = stripeEvent('customer.subscription.deleted', {
    id: subId,
    // no metadata.company_id → should look up by external_id
  });

  const r = await procesarEventoStripe(db, evento);

  expect(r.ok).toBe(true);
  expect(r.accion).toBe('cancelada');

  const updateCall = db._queries.find(
    (q) => q.sql.includes("estado='cancelada'"),
  );
  expect(updateCall).toBeTruthy();
  expect(updateCall.params[0]).toBe(companyId);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: customer.subscription.updated status=past_due → morosa
// ─────────────────────────────────────────────────────────────────────────────
test('customer.subscription.updated status=past_due → estado morosa', async () => {
  const companyId = 'cid-morosa';
  const subId = 'sub_late';
  const db = makeDb({ companyId, byExternalId: subId });

  const evento = stripeEvent('customer.subscription.updated', {
    id: subId,
    status: 'past_due',
    metadata: { company_id: companyId },
  });

  const r = await procesarEventoStripe(db, evento);

  expect(r.ok).toBe(true);
  expect(r.accion).toBe('morosa');

  const updateCall = db._queries.find(
    (q) => q.sql.includes("estado='morosa'"),
  );
  expect(updateCall).toBeTruthy();
  expect(updateCall.params[0]).toBe(companyId);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: tipo desconocido → ignorado, sin cambios DB
// ─────────────────────────────────────────────────────────────────────────────
test('tipo de evento desconocido → ignorado, no toca la DB', async () => {
  const db = makeDb();

  const evento = stripeEvent('payment_intent.created', { id: 'pi_xyz' });

  const r = await procesarEventoStripe(db, evento);

  expect(r.ok).toBe(true);
  expect(r.accion).toBe('ignorado');
  expect(r.type).toBe('payment_intent.created');

  // No UPDATE calls at all
  const updates = db._queries.filter((q) => q.sql.includes('UPDATE'));
  expect(updates).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: company no encontrada → sin_company, no lanza
// ─────────────────────────────────────────────────────────────────────────────
test('checkout.session.completed sin metadata.company_id → sin_company, no lanza', async () => {
  const db = makeDb();

  const evento = stripeEvent('checkout.session.completed', {
    id: 'cs_no_meta',
    subscription: 'sub_no_meta',
    metadata: { plan: 'pyme' }, // sin company_id
  });

  let r;
  await expect(async () => {
    r = await procesarEventoStripe(db, evento);
  }).not.toThrow();

  expect(r.ok).toBe(true);
  expect(r.accion).toBe('sin_company');

  // No UPDATE calls
  const updates = db._queries.filter((q) => q.sql.includes('UPDATE'));
  expect(updates).toHaveLength(0);
});

test('invoice.paid con subscription desconocido → sin_company, no lanza', async () => {
  const db = makeDb({ byExternalId: 'will_not_match' });

  const evento = stripeEvent('invoice.paid', { subscription: 'sub_unknown_999' });

  const r = await procesarEventoStripe(db, evento);

  expect(r.ok).toBe(true);
  expect(r.accion).toBe('sin_company');
});
