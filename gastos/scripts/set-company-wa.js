// Conecta el WhatsApp de un cliente a su empresa en el CRM de gastos.
// Sin args (o sin SET_COMPANY_ID): LISTA las empresas con su id y pnid actual.
// Con SET_COMPANY_ID + SET_WA_PNID + SET_WA_TOKEN: guarda el número del cliente en su empresa.
//   node scripts/set-company-wa.js            -> lista empresas
//   SET_COMPANY_ID=<uuid> SET_WA_PNID=<phone_number_id> SET_WA_TOKEN=<token> node scripts/set-company-wa.js
require('dotenv').config();
const { getPool } = require('../src/db/pool');

(async () => {
  const db = getPool();
  const id = process.env.SET_COMPANY_ID;
  const pnid = process.env.SET_WA_PNID || null;
  const token = process.env.SET_WA_TOKEN || null;

  if (!id) {
    const r = await db.query(
      'SELECT id, nombre, wa_phone_number_id, owner_whatsapp FROM companies ORDER BY created_at'
    );
    console.log('Empresas:');
    r.rows.forEach((c) =>
      console.log(`  ${c.id} | ${c.nombre} | pnid=${c.wa_phone_number_id || '-'} | owner_wa=${c.owner_whatsapp || '-'}`)
    );
    await db.end();
    return;
  }

  const r = await db.query(
    'UPDATE companies SET wa_phone_number_id=$2, wa_token=$3 WHERE id=$1 RETURNING id, nombre, wa_phone_number_id',
    [id, pnid, token]
  );
  if (!r.rows[0]) { console.error('No existe la empresa', id); process.exit(1); }
  console.log('WhatsApp conectado a la empresa:', { id: r.rows[0].id, nombre: r.rows[0].nombre, wa_phone_number_id: r.rows[0].wa_phone_number_id });
  await db.end();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
