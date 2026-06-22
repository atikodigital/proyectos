async function createUser(db, data) {
  const cols = ['company_id', 'email', 'password_hash', 'rol'].filter((f) => data[f] !== undefined);
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query(`INSERT INTO users(${cols.join(', ')}) VALUES(${ph}) RETURNING *`, cols.map((f) => data[f]));
  return r.rows[0];
}

async function getUserByEmail(db, email) {
  const r = await db.query('SELECT * FROM users WHERE email=$1', [email]);
  return r.rows[0] || null;
}

async function getUserById(db, id) {
  const r = await db.query('SELECT * FROM users WHERE id=$1', [id]);
  return r.rows[0] || null;
}

async function setUserPassword(db, id, passwordHash) {
  await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [id, passwordHash]);
}

module.exports = { createUser, getUserByEmail, getUserById, setUserPassword };
