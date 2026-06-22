#!/usr/bin/env node
// Rota la contraseña de un usuario del PANEL (tabla `users`).
// La nueva clave la elige y la pasa el usuario — nunca queda en el código.
//
// Uso (en el servidor, donde está el .env con GASTOS_DB_URL):
//   cd /root/atiko-gastos
//   node scripts/reset-user-password.js <email> '<nueva_clave>'
//   # o, para que NO quede en el historial del shell:
//   NEW_PASSWORD='<nueva_clave>' node scripts/reset-user-password.js <email>
require('dotenv').config();
const { getPool } = require('../src/db/pool');
const { hashPassword } = require('../src/auth/password');

(async () => {
  const email = process.argv[2];
  const nueva = process.argv[3] || process.env.NEW_PASSWORD;
  if (!email || !nueva) {
    console.error('Uso: node scripts/reset-user-password.js <email> <nueva_clave>');
    console.error('  (o)  NEW_PASSWORD=... node scripts/reset-user-password.js <email>');
    process.exit(1);
  }
  if (String(nueva).length < 8) {
    console.error('La nueva clave debe tener al menos 8 caracteres.');
    process.exit(1);
  }
  const db = getPool();
  const hash = await hashPassword(String(nueva));
  const r = await db.query(
    'UPDATE users SET password_hash=$2 WHERE lower(email)=lower($1) RETURNING id, email',
    [String(email).trim(), hash]
  );
  if (!r.rows.length) {
    console.error('No existe un usuario con ese email:', email);
    process.exit(1);
  }
  console.log('✅ Clave del panel actualizada para', r.rows[0].email);
  process.exit(0);
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
