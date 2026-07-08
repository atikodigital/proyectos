const { getPlan, TRIAL_PLAN, TRIAL_DIAS } = require('./planes');

async function createFreeSubscription(db, companyId) {
  const lim = getPlan('free').creditos;
  // Primero intentamos SELECT para evitar problemas con ON CONFLICT en pg-mem
  const existing = await getSubscription(db, companyId);
  if (existing) return existing;
  const r = await db.query(
    `INSERT INTO subscriptions(company_id, plan, estado, source, creditos_limite, creditos_usados)
     VALUES($1,'free','activa','manual',$2,0)
     RETURNING *`, [companyId, lim]);
  return r.rows[0];
}

// Prueba gratis para cuentas nuevas: regala el plan Pyme completo por `dias` días
// (estado 'trial'). Al vencer, expireTrialIfDue la degrada sola a Free.
// Idempotente: si ya hay una suscripción, la devuelve sin pisarla.
async function createTrialSubscription(db, companyId, dias = TRIAL_DIAS) {
  const existing = await getSubscription(db, companyId);
  if (existing) return existing;
  const plan = getPlan(TRIAL_PLAN);
  const cicloFin = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  const r = await db.query(
    `INSERT INTO subscriptions(company_id, plan, estado, source, creditos_limite, creditos_usados, ciclo_fin)
     VALUES($1,$2,'trial','trial',$3,0,$4)
     RETURNING *`, [companyId, plan.nombre, plan.creditos, cicloFin]);
  return r.rows[0];
}

// Si la empresa está en trial y ya venció (ciclo_fin < now), la baja a Free:
// 30 créditos, ciclo nuevo, estado 'activa'. Idempotente: no toca nada si el
// trial sigue vigente o si no hay trial. Devuelve true solo si degradó.
async function expireTrialIfDue(db, companyId) {
  const lim = getPlan('free').creditos;
  const r = await db.query(
    `UPDATE subscriptions
        SET plan='free', estado='activa', source='trial_expired',
            creditos_limite=$2, creditos_usados=0,
            ciclo_inicio=now(), ciclo_fin=NULL, updated_at=now()
      WHERE company_id=$1 AND estado='trial' AND ciclo_fin IS NOT NULL AND ciclo_fin < now()
      RETURNING id`, [companyId, lim]);
  return r.rows.length > 0;
}

async function getSubscription(db, companyId) {
  const r = await db.query('SELECT * FROM subscriptions WHERE company_id=$1', [companyId]);
  return r.rows[0] || null;
}

// Incremento atómico con chequeo de límite. Devuelve true si alcanzó, false si no.
async function tryConsume(db, companyId, creditos) {
  if (!creditos) return true; // 0 créditos: siempre permitido
  const r = await db.query(
    `UPDATE subscriptions
        SET creditos_usados = creditos_usados + $2, updated_at = now()
      WHERE company_id = $1
        AND creditos_usados + $2 <= creditos_limite
        AND estado IN ('activa','trial')
      RETURNING id`, [companyId, creditos]);
  return r.rows.length > 0;
}

async function logConsumo(db, companyId, { tipo, cantidad = 1, creditos = 0, meta = null }) {
  await db.query(
    `INSERT INTO ia_consumo(company_id, tipo, cantidad, creditos, meta)
     VALUES($1,$2,$3,$4,$5)`,
    [companyId, tipo, cantidad, creditos, meta ? JSON.stringify(meta) : null]);
}

async function resetCiclo(db, companyId) {
  await db.query(
    `UPDATE subscriptions SET creditos_usados = 0, ciclo_inicio = now(), updated_at = now()
      WHERE company_id = $1`, [companyId]);
}

async function setPlanLimite(db, companyId, { plan, creditosLimite } = {}) {
  await createFreeSubscription(db, companyId); // asegura que exista la fila
  let limite, planName;
  if (creditosLimite != null && creditosLimite !== '') {
    limite = Math.max(0, Math.floor(Number(creditosLimite)));
    planName = plan || 'custom';
  } else {
    const p = getPlan(plan);
    limite = p.creditos;
    planName = p.nombre;
  }
  await db.query(
    `UPDATE subscriptions SET plan=$2, creditos_limite=$3, estado='activa', updated_at=now() WHERE company_id=$1`,
    [companyId, planName, limite]);
  return getSubscription(db, companyId);
}

async function activarSuscripcion(db, companyId, { plan, external_id, source, ciclo_fin }) {
  await createFreeSubscription(db, companyId);
  const p = getPlan(plan);
  await db.query(
    `UPDATE subscriptions
        SET plan=$2, estado='activa', source=$3, external_id=$4,
            ciclo_inicio=now(), ciclo_fin=$5,
            creditos_limite=$6, creditos_usados=0, updated_at=now()
      WHERE company_id=$1`,
    [companyId, p.nombre, source || 'mp', external_id || null, ciclo_fin || null, p.creditos]);
  return getSubscription(db, companyId);
}

module.exports = { createFreeSubscription, createTrialSubscription, expireTrialIfDue, getSubscription, tryConsume, logConsumo, resetCiclo, setPlanLimite, activarSuscripcion };
