// Admins individuales de la agencia (login propio con email + 2FA por persona).
const { hashPassword, verifyPassword } = require('../auth/password');

function _norm(email) { return String(email || '').trim().toLowerCase(); }

async function createAdmin(db, { email, password, nombre } = {}) {
  const e = _norm(email);
  if (!e || !password) throw new Error('email_y_password_requeridos');
  const hash = await hashPassword(password);
  const r = await db.query(
    'INSERT INTO admins(email, password_hash, nombre) VALUES($1,$2,$3) RETURNING id, email, nombre, activo, created_at',
    [e, hash, nombre || null]
  );
  return r.rows[0];
}

async function getAdminByEmail(db, email) {
  const r = await db.query('SELECT * FROM admins WHERE email=$1', [_norm(email)]);
  return r.rows[0] || null;
}

async function getAdminById(db, id) {
  const r = await db.query('SELECT * FROM admins WHERE id=$1', [id]);
  return r.rows[0] || null;
}

// Lista SIN exponer hash ni secreto; solo un flag de si tiene 2FA.
async function listAdmins(db) {
  const r = await db.query('SELECT id, email, nombre, activo, totp_secret, created_at FROM admins ORDER BY created_at ASC');
  return r.rows.map((a) => ({
    id: a.id, email: a.email, nombre: a.nombre, activo: a.activo,
    tiene_2fa: !!a.totp_secret, created_at: a.created_at,
  }));
}

async function setActivo(db, id, activo) {
  const r = await db.query('UPDATE admins SET activo=$2 WHERE id=$1 RETURNING id, email, nombre, activo', [id, !!activo]);
  return r.rows[0] || null;
}

async function setTotp(db, id, secret) {
  await db.query('UPDATE admins SET totp_secret=$2 WHERE id=$1', [id, secret || null]);
}

async function setPassword(db, id, password) {
  const hash = await hashPassword(password);
  await db.query('UPDATE admins SET password_hash=$2 WHERE id=$1', [id, hash]);
}

// Devuelve el admin si email+password son correctos y está activo; si no, null.
async function verifyAdminPassword(db, email, password) {
  const a = await getAdminByEmail(db, email);
  if (!a || !a.activo) return null;
  const ok = await verifyPassword(password, a.password_hash);
  return ok ? a : null;
}

module.exports = {
  createAdmin, getAdminByEmail, getAdminById, listAdmins, setActivo, setTotp, setPassword, verifyAdminPassword,
};
