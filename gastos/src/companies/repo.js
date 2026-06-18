async function createCompany(db, data) {
  const cols = ['nombre', 'rut', 'wa_phone_number_id', 'wa_token', 'owner_nombre', 'owner_whatsapp', 'resumen_frecuencia']
    .filter((f) => data[f] !== undefined);
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query(
    `INSERT INTO companies(${cols.join(', ')}) VALUES(${ph}) RETURNING *`,
    cols.map((f) => data[f])
  );
  return r.rows[0];
}

async function createEmployee(db, data) {
  const cols = ['company_id', 'nombre', 'phone', 'usuario', 'password_hash', 'rol', 'activo']
    .filter((f) => data[f] !== undefined);
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query(
    `INSERT INTO employees(${cols.join(', ')}) VALUES(${ph}) RETURNING *`,
    cols.map((f) => data[f])
  );
  return r.rows[0];
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
  const cols = ['nombre', 'rut', 'owner_nombre', 'owner_whatsapp', 'resumen_frecuencia'].filter((f) => patch[f] !== undefined);
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

async function getAgentPrefs(db, employeeId) {
  const r = await db.query('SELECT agent_prefs FROM employees WHERE id=$1', [employeeId]);
  return (r.rows[0] && r.rows[0].agent_prefs) || {};
}

async function setAgentPrefs(db, employeeId, patch) {
  const prev = await getAgentPrefs(db, employeeId);
  const next = { ...prev };
  if (patch.nombre !== undefined) next.nombre = String(patch.nombre).slice(0, 60);
  if (patch.trato !== undefined) next.trato = String(patch.trato).slice(0, 20);
  if (patch.onboarded) next.onboarded_at = new Date().toISOString();
  const r = await db.query('UPDATE employees SET agent_prefs=$1 WHERE id=$2 RETURNING agent_prefs', [JSON.stringify(next), employeeId]);
  return r.rows[0] ? r.rows[0].agent_prefs : null;
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
  _ocReady.set(db, true);
}

async function getCompanyProfile(db, companyId) {
  await ensureCompanyOnboarding(db);
  const r = await db.query(
    'SELECT id, nombre, rut, giro, owner_nombre, owner_whatsapp, onboarded_at, created_at, kaly_persona FROM companies WHERE id=$1',
    [companyId]
  );
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  if (typeof row.kaly_persona === 'string') {
    try { row.kaly_persona = JSON.parse(row.kaly_persona); } catch (e) { row.kaly_persona = null; }
  }
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

module.exports = {
  createCompany, createEmployee, getCompanyByPhoneNumberId, getEmployeeByPhone, getEmployeeByUsuario,
  listEmployees, updateEmployee, deactivateEmployee, getCompany, updateCompany, getCompanyWa,
  getAgentPrefs, setAgentPrefs, getGiro, setGiro,
  getCompanyProfile, setOnboarded, ensureCompanyOnboarding, setKalyPersona,
};
