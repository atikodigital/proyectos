const { getPlan } = require('./planes');

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
        AND estado = 'activa'
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

module.exports = { createFreeSubscription, getSubscription, tryConsume, logConsumo, resetCiclo, setPlanLimite, activarSuscripcion };
