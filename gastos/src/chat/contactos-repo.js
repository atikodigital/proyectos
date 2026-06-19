const { makeKey } = require('./repo');

async function getContacto(db, companyId, channel, contact) {
  const key = makeKey(channel, contact);
  const r = await db.query(
    'SELECT email, ubicacion, notas FROM contactos WHERE company_id=$1 AND channel=$2 AND contact_key=$3',
    [companyId, String(channel || 'whatsapp').toLowerCase(), key]
  );
  return r.rows[0] || {};
}

async function upsertContacto(db, companyId, channel, contact, patch = {}) {
  const key = makeKey(channel, contact);
  const ch = String(channel || 'whatsapp').toLowerCase();
  const prev = await getContacto(db, companyId, channel, contact);
  const exists = await db.query(
    'SELECT id FROM contactos WHERE company_id=$1 AND channel=$2 AND contact_key=$3',
    [companyId, ch, key]
  );
  const next = {
    email:    patch.email    !== undefined ? patch.email    : (prev.email    || null),
    ubicacion: patch.ubicacion !== undefined ? patch.ubicacion : (prev.ubicacion || null),
    notas:    patch.notas    !== undefined ? patch.notas    : (prev.notas    || null),
  };
  if (exists.rows[0]) {
    await db.query(
      'UPDATE contactos SET email=$4, ubicacion=$5, notas=$6, updated_at=now() WHERE company_id=$1 AND channel=$2 AND contact_key=$3',
      [companyId, ch, key, next.email, next.ubicacion, next.notas]
    );
  } else {
    await db.query(
      'INSERT INTO contactos(company_id, channel, contact_key, email, ubicacion, notas) VALUES($1,$2,$3,$4,$5,$6)',
      [companyId, ch, key, next.email, next.ubicacion, next.notas]
    );
  }
  return next;
}

module.exports = { getContacto, upsertContacto };
