const { creditosDe, getPlan } = require('./planes');
const repo = require('./repo');

class SinCreditosError extends Error {
  constructor(saldoActual) {
    super('Sin créditos suficientes para esta operación.');
    this.name = 'SinCreditosError';
    this.code = 'SIN_CREDITOS';
    this.saldo = saldoActual || null;
  }
}

// Cobra los créditos de una operación de IA. Lanza SinCreditosError si no alcanza.
// Para tipos con peso 0 igual registra auditoría (no descuenta).
async function consumirCredito(db, companyId, { tipo, cantidad = 1, meta = null } = {}) {
  await repo.createFreeSubscription(db, companyId); // idempotente: free si no existe
  const creditos = creditosDe(tipo, cantidad);
  if (creditos > 0) {
    const ok = await repo.tryConsume(db, companyId, creditos);
    if (!ok) throw new SinCreditosError(await saldo(db, companyId));
  }
  await repo.logConsumo(db, companyId, { tipo, cantidad, creditos, meta });
  return { tipo, creditos };
}

async function saldo(db, companyId) {
  const s = await repo.getSubscription(db, companyId);
  if (!s) return { plan: 'free', limite: getPlan('free').creditos, usado: 0, restante: getPlan('free').creditos, ciclo_fin: null, estado: 'activa' };
  const limite = Number(s.creditos_limite), usado = Number(s.creditos_usados);
  return { plan: s.plan, limite, usado, restante: Math.max(0, limite - usado), ciclo_fin: s.ciclo_fin, estado: s.estado };
}

module.exports = { consumirCredito, saldo, SinCreditosError };
