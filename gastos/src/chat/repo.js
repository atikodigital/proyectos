// Bandeja "Chat" (CRM): mensajes capturados de los chats (WhatsApp/Messenger/IG/Telegram),
// vía notificaciones o "compartir". Agrupados por contacto+canal dentro de cada empresa.

const _ready = new WeakSet();
async function ensureTable(db) {
  if (_ready.has(db)) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_mensajes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seq SERIAL,
      company_id uuid NOT NULL,
      channel text NOT NULL DEFAULT 'whatsapp',
      contact text,
      contact_key text NOT NULL,
      text text NOT NULL,
      direccion text NOT NULL DEFAULT 'in',
      source text DEFAULT 'notif',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_chat_company ON chat_mensajes(company_id);
  `);
  _ready.add(db);
}

function makeKey(channel, contact) {
  return String(channel || 'whatsapp').toLowerCase() + '|' + String(contact || '').trim().toLowerCase();
}

async function addMensaje(db, companyId, d) {
  await ensureTable(db);
  const key = makeKey(d.channel, d.contact);
  const r = await db.query(
    `INSERT INTO chat_mensajes (company_id, channel, contact, contact_key, text, direccion, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [companyId, d.channel || 'whatsapp', d.contact || null, key,
      String(d.text || '').slice(0, 2000), d.direccion || 'in', d.source || 'notif']
  );
  return r.rows[0];
}

async function listConversaciones(db, companyId) {
  await ensureTable(db);
  const r = await db.query('SELECT * FROM chat_mensajes WHERE company_id=$1 ORDER BY seq ASC', [companyId]);
  const map = new Map();
  for (const m of r.rows) {
    const e = map.get(m.contact_key) || { channel: m.channel, contact: m.contact, contact_key: m.contact_key, ultimo: '', fecha: null, n: 0, lastSeq: 0 };
    e.channel = m.channel; e.contact = m.contact; e.ultimo = m.text; e.fecha = m.created_at; e.n += 1; e.lastSeq = Number(m.seq);
    map.set(m.contact_key, e);
  }
  return Array.from(map.values())
    .sort((a, b) => b.lastSeq - a.lastSeq)
    .map(({ lastSeq, ...e }) => e); // eslint-disable-line no-unused-vars
}

async function listMensajes(db, companyId, channel, contact) {
  await ensureTable(db);
  const key = makeKey(channel, contact);
  const r = await db.query(
    'SELECT * FROM chat_mensajes WHERE company_id=$1 AND contact_key=$2 ORDER BY seq ASC',
    [companyId, key]
  );
  return r.rows;
}

module.exports = { ensureTable, addMensaje, listConversaciones, listMensajes, makeKey };
