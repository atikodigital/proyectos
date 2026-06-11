require('dotenv').config();
const { getPool } = require('../src/db/pool');
const { createCompany } = require('../src/companies/repo');
const { createUser, getUserByEmail } = require('../src/users/repo');
const { hashPassword } = require('../src/auth/password');

(async () => {
  const db = getPool();
  const nombre = process.env.SEED_COMPANY || 'Empresa Demo';
  const email = process.env.SEED_OWNER_EMAIL || 'demo@atiko.cl';
  const pass = process.env.SEED_OWNER_PASS || 'cambiar123';
  let user = await getUserByEmail(db, email);
  if (user) { console.log('owner ya existe:', email); await db.end(); return; }
  const company = await createCompany(db, {
    nombre,
    wa_phone_number_id: process.env.SEED_WA_PNID || null,
    wa_token: process.env.SEED_WA_TOKEN || null,
    owner_whatsapp: process.env.SEED_OWNER_WA || null,
    resumen_frecuencia: 'mensual',
  });
  user = await createUser(db, { company_id: company.id, email, password_hash: await hashPassword(pass), rol: 'owner' });
  console.log('Empresa:', company.id, '| Owner:', email, '| pass:', pass);
  await db.end();
})().catch(e => { console.error('seed FAIL:', e.message); process.exit(1); });
