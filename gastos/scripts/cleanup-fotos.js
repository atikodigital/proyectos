require('dotenv').config();
const { getPool } = require('../src/db/pool');
const { deleteImage } = require('../src/expenses/storage');

const DIAS = Number(process.env.FOTO_RETENCION_DIAS || 60);

(async () => {
  const db = getPool();
  const r = await db.query(
    "SELECT id, foto_path FROM expenses WHERE foto_path IS NOT NULL AND created_at < now() - ($1 || ' days')::interval",
    [String(DIAS)]
  );
  let n = 0;
  for (const row of r.rows) {
    deleteImage(row.foto_path);
    await db.query('UPDATE expenses SET foto_path=NULL WHERE id=$1', [row.id]);
    n++;
  }
  console.log('fotos eliminadas:', n, '(retencion', DIAS, 'dias)');
  await db.end();
})().catch((e) => { console.error('cleanup-fotos FAIL:', e.message); process.exit(1); });
