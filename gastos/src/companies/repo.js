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

module.exports = { createCompany, createEmployee, getCompanyByPhoneNumberId, getEmployeeByPhone, getEmployeeByUsuario };
