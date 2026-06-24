async function createUser(db, data) {
  const cols = ['company_id', 'email', 'password_hash', 'rol', 'auth_provider', 'google_sub', 'facebook_id']
    .filter((f) => data[f] !== undefined);
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query(`INSERT INTO users(${cols.join(', ')}) VALUES(${ph}) RETURNING *`, cols.map((f) => data[f]));
  return r.rows[0];
}

async function getUserByEmail(db, email) {
  const r = await db.query('SELECT * FROM users WHERE email=$1', [email]);
  return r.rows[0] || null;
}

// Busca un usuario por el id del proveedor social (google_sub o facebook_id).
async function getUserByProvider(db, provider, providerId) {
  const col = provider === 'google' ? 'google_sub' : provider === 'facebook' ? 'facebook_id' : null;
  if (!col || !providerId) return null;
  const r = await db.query(`SELECT * FROM users WHERE ${col}=$1`, [providerId]);
  return r.rows[0] || null;
}

// Vincula un proveedor social a un usuario existente (p.ej. el que ya tenía cuenta
// por correo ahora entra con Google del mismo email → se enlaza, no se duplica).
async function linkProvider(db, userId, provider, providerId) {
  const col = provider === 'google' ? 'google_sub' : provider === 'facebook' ? 'facebook_id' : null;
  if (!col || !providerId) return null;
  const r = await db.query(`UPDATE users SET ${col}=$2 WHERE id=$1 RETURNING *`, [userId, providerId]);
  return r.rows[0] || null;
}

async function getUserById(db, id) {
  const r = await db.query('SELECT * FROM users WHERE id=$1', [id]);
  return r.rows[0] || null;
}

async function setUserPassword(db, id, passwordHash) {
  await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [id, passwordHash]);
}

module.exports = { createUser, getUserByEmail, getUserById, setUserPassword, getUserByProvider, linkProvider };
