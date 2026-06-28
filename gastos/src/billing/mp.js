const { PLANES, PLAN_LABELS } = require('./planes');

const MP_API = 'https://api.mercadopago.com';

async function mpFetch(path, opts = {}) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('MP_ACCESS_TOKEN no configurado');
  const res = await fetch(`${MP_API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`MP ${res.status}: ${JSON.stringify(body)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// Crea un preapproval (suscripción recurrente) para el plan dado.
// backUrl: URL de vuelta al panel tras autorizar.
// payerEmail: email del dueño (requerido por MP Chile).
// Returns: { id, init_point }
async function createPreapproval(planNombre, backUrl, payerEmail) {
  const p = PLANES[planNombre];
  if (!p || !p.precio) throw new Error(`Plan no pagable: ${planNombre}`);
  const label = PLAN_LABELS[planNombre] || planNombre;
  const body = {
    reason: label,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: p.precio,
      currency_id: 'CLP',
    },
    back_url: backUrl,
    payer_email: payerEmail,
    status: 'pending',
  };
  const r = await mpFetch('/preapproval', { method: 'POST', body: JSON.stringify(body) });
  return { id: r.id, init_point: r.init_point };
}

// Cancela un preapproval existente.
async function cancelPreapproval(preapprovalId) {
  await mpFetch(`/preapproval/${preapprovalId}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'cancelled' }),
  });
}

// Obtiene el estado actual de un preapproval.
async function getPreapproval(preapprovalId) {
  return mpFetch(`/preapproval/${preapprovalId}`);
}

module.exports = { createPreapproval, cancelPreapproval, getPreapproval };
