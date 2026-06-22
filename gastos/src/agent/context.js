const { cashflowSummary } = require('../expenses/summary');
const { getAgentPrefs, getCompany, getCompanyProfile } = require('../companies/repo');
const { listMemorias } = require('./memory');
const { construirSenales } = require('./senales');

function saludoHora(now = new Date()) {
  // Hora de Chile continental
  const h = Number(new Intl.DateTimeFormat('es-CL', { hour: 'numeric', hour12: false, timeZone: 'America/Santiago' }).format(now));
  if (h >= 6 && h < 12) return 'dia';
  if (h >= 12 && h < 20) return 'tarde';
  return 'noche';
}

async function buildAgentContext(db, { companyId, employeeId, owner = null, now = new Date() }) {
  const [prefs, company, profile, memorias] = await Promise.all([
    getAgentPrefs(db, employeeId, companyId),
    getCompany(db, companyId),
    getCompanyProfile(db, companyId),
    listMemorias(db, companyId, { owner }),
  ]);
  const s = await cashflowSummary(db, companyId, { year: now.getFullYear(), month: now.getMonth() + 1 });
  const pend = await db.query(
    "SELECT count(*)::int AS n FROM expenses WHERE company_id=$1 AND tipo='gasto' AND estado='confirmado' AND estado_pago='registrada'",
    [companyId]
  );
  const proactividad = prefs.proactividad !== false;
  const ctx = {
    nombre: prefs.nombre || '',
    trato: prefs.trato || '',
    onboarded: Boolean(prefs.onboarded_at),
    saludoHora: saludoHora(now),
    empresaNombre: (company && company.nombre) || '',
    resumen: { ...s, pendientesPago: pend.rows[0].n },
    memorias,
    persona: (profile && profile.kaly_persona) || {},
    proactividad,
  };
  ctx.senales = proactividad ? construirSenales(ctx) : [];
  return ctx;
}

module.exports = { buildAgentContext, saludoHora };
