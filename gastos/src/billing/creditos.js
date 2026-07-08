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
  await repo.expireTrialIfDue(db, companyId);       // si el trial venció, baja a free antes de cobrar
  const creditos = creditosDe(tipo, cantidad);
  if (creditos > 0) {
    const ok = await repo.tryConsume(db, companyId, creditos);
    if (!ok) throw new SinCreditosError(await saldo(db, companyId));
  }
  await repo.logConsumo(db, companyId, { tipo, cantidad, creditos, meta });
  return { tipo, creditos };
}

async function saldo(db, companyId) {
  await repo.expireTrialIfDue(db, companyId); // degrada el trial vencido antes de reportar
  const s = await repo.getSubscription(db, companyId);
  if (!s) return { plan: 'free', limite: getPlan('free').creditos, usado: 0, restante: getPlan('free').creditos, ciclo_fin: null, estado: 'activa', es_trial: false, dias_restantes: null };
  const limite = Number(s.creditos_limite), usado = Number(s.creditos_usados);
  const esTrial = s.estado === 'trial';
  let diasRestantes = null;
  if (esTrial && s.ciclo_fin) {
    const ms = new Date(s.ciclo_fin).getTime() - Date.now();
    diasRestantes = Math.max(0, Math.ceil(ms / 86400000));
  }
  return { plan: s.plan, limite, usado, restante: Math.max(0, limite - usado), ciclo_fin: s.ciclo_fin, estado: s.estado, es_trial: esTrial, dias_restantes: diasRestantes };
}

module.exports = { consumirCredito, saldo, SinCreditosError };
