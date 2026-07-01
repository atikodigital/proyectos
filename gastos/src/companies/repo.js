const billingRepo = require('../billing/repo');

async function createCompany(db, data) {
  const cols = ['nombre', 'rut', 'wa_phone_number_id', 'wa_token', 'owner_nombre', 'owner_whatsapp', 'resumen_frecuencia', 'tipo_cuenta', 'sueldo_mensual', 'dia_pago']
    .filter((f) => data[f] !== undefined);
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query(
    `INSERT INTO companies(${cols.join(', ')}) VALUES(${ph}) RETURNING *`,
    cols.map((f) => data[f])
  );
  const company = r.rows[0];
  try { await billingRepo.createFreeSubscription(db, company.id); } catch (e) { console.error('[billing] no se creó sub free para company', company.id, e.message); }
  return company;
}

async function createEmployee(db, data) {
  const cols = ['company_id', 'nombre', 'phone', 'usuario', 'password_hash', 'rol', 'activo', 'auth_provider', 'google_sub', 'facebook_id']
    .filter((f) => data[f] !== undefined);
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query(
    `INSERT INTO employees(${cols.join(', ')}) VALUES(${ph}) RETURNING *`,
    cols.map((f) => data[f])
  );
  return r.rows[0];
}

// Busca un empleado (cuenta personal) por el id del proveedor social.
async function getEmployeeByProvider(db, provider, providerId) {
  const col = provider === 'google' ? 'google_sub' : provider === 'facebook' ? 'facebook_id' : null;
  if (!col || !providerId) return null;
  const r = await db.query(`SELECT * FROM employees WHERE ${col}=$1 AND activo=true LIMIT 1`, [providerId]);
  return r.rows[0] || null;
}

// Vincula un proveedor social a un empleado existente (entró antes por correo).
async function linkProviderEmployee(db, employeeId, provider, providerId) {
  const col = provider === 'google' ? 'google_sub' : provider === 'facebook' ? 'facebook_id' : null;
  if (!col || !providerId) return null;
  const r = await db.query(`UPDATE employees SET ${col}=$2, auth_provider=$3 WHERE id=$1 RETURNING *`, [employeeId, providerId, provider]);
  return r.rows[0] || null;
}

async function getCompanyByPhoneNumberId(db, phoneNumberId) {
  const r = await db.query('SELECT * FROM companies WHERE wa_phone_number_id=$1', [phoneNumberId]);
  return r.rows[0] || null;
}

async function getEmployeeByPhone(db, companyId, phone) {
  const r = await db.query(
    'SELECT * FROM employees WHERE company_id=$1 AND phone=$2 AND activo=true',
    [companyId, phone]
  );
  return r.rows[0] || null;
}

async function getEmployeeByUsuario(db, usuario) {
  const r = await db.query('SELECT * FROM employees WHERE usuario=$1 AND activo=true LIMIT 1', [usuario]);
  return r.rows[0] || null;
}

async function listEmployees(db, companyId) {
  const r = await db.query('SELECT id, company_id, nombre, phone, usuario, rol, activo, created_at FROM employees WHERE company_id=$1 ORDER BY created_at DESC', [companyId]);
  return r.rows;
}

async function updateEmployee(db, companyId, id, patch) {
  const cols = ['nombre', 'phone', 'usuario', 'rol', 'activo'].filter((f) => patch[f] !== undefined);
  if (!cols.length) return null;
  const set = cols.map((f, i) => `${f}=$${i + 3}`).join(', ');
  const r = await db.query(
    `UPDATE employees SET ${set} WHERE id=$1 AND company_id=$2 RETURNING id, company_id, nombre, phone, usuario, rol, activo`,
    [id, companyId, ...cols.map((f) => patch[f])]
  );
  return r.rows[0] || null;
}

async function deactivateEmployee(db, companyId, id) {
  const r = await db.query('UPDATE employees SET activo=false WHERE id=$1 AND company_id=$2 RETURNING id', [id, companyId]);
  return r.rows[0] || null;
}

async function getCompany(db, companyId) {
  const r = await db.query('SELECT id, nombre, rut, wa_phone_number_id, owner_nombre, owner_whatsapp, resumen_frecuencia, created_at FROM companies WHERE id=$1', [companyId]);
  return r.rows[0] || null;
}

async function updateCompany(db, companyId, patch) {
  if (patch.idioma !== undefined && !['es', 'en', 'pt'].includes(patch.idioma)) patch = { ...patch, idioma: 'es' };
  const cols = ['nombre', 'rut', 'owner_nombre', 'owner_whatsapp', 'resumen_frecuencia', 'sueldo_mensual', 'dia_pago', 'idioma'].filter((f) => patch[f] !== undefined);
  if (!cols.length) return getCompany(db, companyId);
  const set = cols.map((f, i) => `${f}=$${i + 2}`).join(', ');
  await db.query(`UPDATE companies SET ${set} WHERE id=$1`, [companyId, ...cols.map((f) => patch[f])]);
  return getCompany(db, companyId);
}

async function getCompanyWa(db, companyId) {
  const r = await db.query(
    'SELECT nombre, wa_phone_number_id, wa_token, owner_whatsapp FROM companies WHERE id=$1',
    [companyId]
  );
  return r.rows[0] || null;
}

async function getAgentPrefs(db, employeeId, companyId) {
  if (!employeeId) return {};
  const r = await db.query('SELECT agent_prefs FROM employees WHERE id=$1 AND company_id=$2', [employeeId, companyId]);
  return (r.rows[0] && r.rows[0].agent_prefs) || {};
}

async function setAgentPrefs(db, employeeId, companyId, patch) {
  const prev = await getAgentPrefs(db, employeeId, companyId);
  const next = { ...prev };
  if (patch.nombre !== undefined) next.nombre = String(patch.nombre).slice(0, 60);
  if (patch.trato !== undefined) next.trato = String(patch.trato).slice(0, 20);
  if (patch.onboarded) next.onboarded_at = new Date().toISOString();
  if (patch.proactividad !== undefined) next.proactividad = Boolean(patch.proactividad);
  const r = await db.query('UPDATE employees SET agent_prefs=$1 WHERE id=$2 AND company_id=$3 RETURNING agent_prefs', [JSON.stringify(next), employeeId, companyId]);
  return r.rows[0] ? r.rows[0].agent_prefs : null;
}

// Preferencias del agente para el DUEÑO (panel): no tiene employeeId, se guardan
// a nivel de empresa en companies.owner_agent_prefs (jsonb, migración perezosa).
const _ownerPrefsReady = new WeakMap();
async function ensureOwnerPrefs(db) {
  if (_ownerPrefsReady.get(db)) return;
  try { await db.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS owner_agent_prefs jsonb'); } catch (e) { /* ya existe */ }
  _ownerPrefsReady.set(db, true);
}
async function getOwnerAgentPrefs(db, companyId) {
  await ensureOwnerPrefs(db);
  const r = await db.query('SELECT owner_agent_prefs FROM companies WHERE id=$1', [companyId]);
  return (r.rows[0] && r.rows[0].owner_agent_prefs) || {};
}
async function setOwnerAgentPrefs(db, companyId, patch) {
  await ensureOwnerPrefs(db);
  const prev = await getOwnerAgentPrefs(db, companyId);
  const next = { ...prev };
  if (patch.nombre !== undefined) next.nombre = String(patch.nombre).slice(0, 60);
  if (patch.trato !== undefined) next.trato = String(patch.trato).slice(0, 20);
  if (patch.onboarded) next.onboarded_at = new Date().toISOString();
  if (patch.proactividad !== undefined) next.proactividad = Boolean(patch.proactividad);
  const r = await db.query('UPDATE companies SET owner_agent_prefs=$1 WHERE id=$2 RETURNING owner_agent_prefs', [JSON.stringify(next), companyId]);
  return r.rows[0] ? r.rows[0].owner_agent_prefs : null;
}

async function getGiro(db, companyId) {
  const r = await db.query('SELECT giro FROM companies WHERE id=$1', [companyId]);
  return r.rows[0] ? (r.rows[0].giro || '') : '';
}

async function setGiro(db, companyId, giro) {
  await db.query('UPDATE companies SET giro=$2 WHERE id=$1', [companyId, String(giro || '').trim()]);
  return true;
}

// ── Onboarding company ──────────────────────────────────────────────────────
const _ocReady = new WeakMap();
async function ensureCompanyOnboarding(db) {
  if (_ocReady.get(db)) return;
  try { await db.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarded_at timestamptz'); } catch (e) { /* ya existe */ }
  try { await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS productos jsonb DEFAULT '[]'"); } catch (e) { /* ya existe */ }
  // "Saltar por ahora" en el wizard: sin esto, saltarlo solo vivía en memoria de React
  // (useState) y se perdía al reabrir la app — el wizard volvía a aparecer desde el
  // paso 1 cada vez. Guardarlo en la empresa lo hace permanente entre sesiones/dispositivos.
  try { await db.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarding_saltado boolean NOT NULL DEFAULT false'); } catch (e) { /* ya existe */ }
  _ocReady.set(db, true);
}

async function getCompanyProfile(db, companyId) {
  await ensureCompanyOnboarding(db);
  const r = await db.query(
    'SELECT id, nombre, rut, giro, owner_nombre, owner_whatsapp, onboarded_at, onboarding_saltado, created_at, kaly_persona, productos, tipo_cuenta, sueldo_mensual, dia_pago, idioma FROM companies WHERE id=$1',
    [companyId]
  );
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  if (typeof row.kaly_persona === 'string') {
    try { row.kaly_persona = JSON.parse(row.kaly_persona); } catch (e) { row.kaly_persona = null; }
  }
  // productos: lista de módulos habilitados por cliente (ej. 'chat'). La app la usa
  // para mostrar/ocultar pestañas. jsonb llega ya parseado; tolera string/null.
  if (typeof row.productos === 'string') {
    try { row.productos = JSON.parse(row.productos); } catch (e) { row.productos = []; }
  }
  if (!Array.isArray(row.productos)) row.productos = [];
  return row;
}

async function setKalyPersona(db, companyId, persona) {
  const p = {};
  const nombre = String((persona && persona.nombre) || '').slice(0, 40); if (nombre) p.nombre = nombre;
  const tono = String((persona && persona.tono) || '').slice(0, 40); if (tono) p.tono = tono;
  const instrucciones = String((persona && persona.instrucciones) || '').slice(0, 500); if (instrucciones) p.instrucciones = instrucciones;
  await db.query('UPDATE companies SET kaly_persona=$2 WHERE id=$1', [companyId, JSON.stringify(p)]);
  return getCompanyProfile(db, companyId);
}

async function setOnboarded(db, companyId) {
  await ensureCompanyOnboarding(db);
  await db.query('UPDATE companies SET onboarded_at=now() WHERE id=$1 AND onboarded_at IS NULL', [companyId]);
  return getCompanyProfile(db, companyId);
}

async function setOnboardingSaltado(db, companyId) {
  await ensureCompanyOnboarding(db);
  await db.query('UPDATE companies SET onboarding_saltado=true WHERE id=$1', [companyId]);
  return getCompanyProfile(db, companyId);
}

module.exports = {
  createCompany, createEmployee, getEmployeeByProvider, linkProviderEmployee, getCompanyByPhoneNumberId, getEmployeeByPhone, getEmployeeByUsuario,
  listEmployees, updateEmployee, deactivateEmployee, getCompany, updateCompany, getCompanyWa,
  getAgentPrefs, setAgentPrefs, getOwnerAgentPrefs, setOwnerAgentPrefs, getGiro, setGiro,
  getCompanyProfile, setOnboarded, setOnboardingSaltado, ensureCompanyOnboarding, setKalyPersona,
};
