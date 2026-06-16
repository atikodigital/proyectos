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

module.exports = { createUser, getUserByEmail };
