require('dotenv').config();
const { getPool } = require('../src/db/pool');
const { migrate } = require('../src/db/migrate');
(async () => {
  const db = getPool();
  await migrate(db);
  console.log('migrate OK');
  await db.end();
})().catch(e => { console.error('migrate FAIL:', e.message); process.exit(1); });
