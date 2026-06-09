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

module.exports = {
  createCompany, createEmployee, getCompanyByPhoneNumberId, getEmployeeByPhone, getEmployeeByUsuario,
  listEmployees, updateEmployee, deactivateEmployee, getCompany, updateCompany,
};
