const { procesarEventoLS } = require('../../src/billing/webhook-lemonsqueezy');

// ── DB mock ───────────────────────────────────────────────────────────────────
function makeDb(opts = {}) {
  const subRow = opts.subscription || {
    id: 1,
    company_id: opts.companyId || 'cid-ls-1',
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
        return { rows: found ? [{ company_id: opts.companyId || 'cid-ls-1' }] : [] };
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

function lsEvent(event_name, { data = {}, custom_data = {} } = {}) {
  return {
    meta: { event_name, custom_data },
    data: { id: data.id, ...data },
  };
}

// ── subscription_created ─────────────────────────────────────────────────────

test('subscription_created con company_id válido → activa suscripción', async () => {
  const companyId = 'cid-created';
  const db = makeDb({ companyId, subscription: {
    id: 1, company_id: companyId, plan: 'free', estado: 'activa',
    creditos_limite: 30, creditos_usados: 0,
  }});

  const evento = lsEvent('subscription_created', {
    data: { id: 'ls-sub-1' },
    custom_data: { company_id: companyId, plan: 'pyme' },
  });

  const r = await procesarEventoLS(db, evento);

  expect(r.ok).toBe(true);
  expect(r.accion).toBe('activada');

  const updateCall = db._queries.find(
    (q) => q.sql.includes('UPDATE subscriptions') && q.sql.includes("estado='activa'"),
  );
  expect(updateCall).toBeTruthy();
  expect(updateCall.params[0]).toBe(companyId);
  expect(updateCall.params[1]).toBe('pyme');          // plan
  expect(updateCall.params[2]).toBe('lemonsqueezy');  // source
  expect(updateCall.params[3]).toBe('ls-sub-1');       // external_id
});

test('subscription_created sin company_id → busca por external_id lookup', async () => {
  const companyId = 'cid-created-ext';
  const subId = 'ls-sub-ext';
  const db = makeDb({ companyId, byExternalId: subId });

  const evento = lsEvent('subscription_created', { data: { id: subId } });

  const r = await procesarEventoLS(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('activada');
});

test('subscription_created sin company_id y sin match por external_id → sin_company', async () => {
  const db = makeDb({ byExternalId: 'will-not-match' });
  const evento = lsEvent('subscription_created', { data: { id: 'ls-sub-unknown' } });

  const r = await procesarEventoLS(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('sin_company');
  const updates = db._queries.filter((q) => q.sql.includes('UPDATE'));
  expect(updates).toHaveLength(0);
});

// ── subscription_payment_success ─────────────────────────────────────────────

test('subscription_payment_success con company_id → activa suscripción', async () => {
  const companyId = 'cid-payment-success';
  const db = makeDb({ companyId });

  const evento = lsEvent('subscription_payment_success', {
    data: { id: 'ls-sub-pay-1' },
    custom_data: { company_id: companyId, plan: 'empresa' },
  });

  const r = await procesarEventoLS(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('activada');

  const updateCall = db._queries.find(
    (q) => q.sql.includes('UPDATE subscriptions') && q.sql.includes("estado='activa'"),
  );
  expect(updateCall).toBeTruthy();
  expect(updateCall.params[1]).toBe('empresa');
});

// ── subscription_cancelled ────────────────────────────────────────────────────

test('subscription_cancelled con company_id → estado cancelada', async () => {
  const companyId = 'cid-cancelled';
  const db = makeDb({ companyId });

  const evento = lsEvent('subscription_cancelled', {
    data: { id: 'ls-sub-cancelled' },
    custom_data: { company_id: companyId, plan: 'pyme' },
  });

  const r = await procesarEventoLS(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('cancelada');

  const updateCall = db._queries.find((q) => q.sql.includes("estado='cancelada'"));
  expect(updateCall).toBeTruthy();
  expect(updateCall.params[0]).toBe(companyId);
});

test('subscription_cancelled por external_id lookup cuando no hay custom_data', async () => {
  const companyId = 'cid-cancelled-ext';
  const subId = 'ls-sub-ext-del';
  const db = makeDb({ companyId, byExternalId: subId });

  const evento = lsEvent('subscription_cancelled', { data: { id: subId } });
  const r = await procesarEventoLS(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('cancelada');
});

// ── subscription_expired ──────────────────────────────────────────────────────

test('subscription_expired → estado cancelada', async () => {
  const companyId = 'cid-expired';
  const db = makeDb({ companyId });
  const evento = lsEvent('subscription_expired', {
    data: { id: 'ls-sub-exp' },
    custom_data: { company_id: companyId, plan: 'basico' },
  });
  const r = await procesarEventoLS(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('cancelada');
});

// ── subscription_paused ────────────────────────────────────────────────────────

test('subscription_paused → estado morosa', async () => {
  const companyId = 'cid-paused';
  const db = makeDb({ companyId });
  const evento = lsEvent('subscription_paused', {
    data: { id: 'ls-sub-paused' },
    custom_data: { company_id: companyId, plan: 'pyme' },
  });
  const r = await procesarEventoLS(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('morosa');

  const updateCall = db._queries.find((q) => q.sql.includes("estado='morosa'"));
  expect(updateCall).toBeTruthy();
  expect(updateCall.params[0]).toBe(companyId);
});

// ── subscription_payment_failed ──────────────────────────────────────────────

test('subscription_payment_failed → estado morosa', async () => {
  const companyId = 'cid-payment-failed';
  const db = makeDb({ companyId });

  const evento = lsEvent('subscription_payment_failed', {
    data: { id: 'ls-sub-failed' },
    custom_data: { company_id: companyId, plan: 'pyme' },
  });

  const r = await procesarEventoLS(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('morosa');

  const updateCall = db._queries.find((q) => q.sql.includes("estado='morosa'"));
  expect(updateCall).toBeTruthy();
  expect(updateCall.params[0]).toBe(companyId);
});

// ── Eventos desconocidos ──────────────────────────────────────────────────────

test('evento desconocido → ignorado, no toca DB', async () => {
  const db = makeDb();
  const evento = lsEvent('order_created', { data: { id: 'ord-xyz' } });

  const r = await procesarEventoLS(db, evento);
  expect(r.ok).toBe(true);
  expect(r.accion).toBe('ignorado');
  expect(r.type).toBe('order_created');

  const updates = db._queries.filter((q) => q.sql.includes('UPDATE'));
  expect(updates).toHaveLength(0);
});
