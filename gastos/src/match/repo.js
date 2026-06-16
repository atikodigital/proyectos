// gastos/src/match/repo.js
// Persistencia del informe de conciliación (audit-ready workpaper).
const _ready = new WeakMap();
async function ensureTable(db) {
  if (!_ready.has(db)) {
    const p = db.query(`
      CREATE TABLE IF NOT EXISTS conciliaciones (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        tipo text NOT NULL DEFAULT 'bancaria',
        fecha date,
        saldo_inicial bigint,
        saldo_final_cartola bigint,
        banco_contable bigint,
        sca bigint,
        sba bigint,
        cuadrado boolean,
        partidas jsonb NOT NULL DEFAULT '[]',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_conciliaciones_company ON conciliaciones(company_id);
    `).catch((e) => { _ready.delete(db); throw e; });
    _ready.set(db, p);
  }
  return _ready.get(db);
}

async function guardarConciliacion(db, companyId, tipo, informe) {
  await ensureTable(db);
  const workpaper = { partidas: informe.partidas || [], suggested: informe.suggested || [], exceptions: informe.exceptions || [], matched: informe.matched || [], fuente: informe.fuente || null };
  const r = await db.query(
    `INSERT INTO conciliaciones (company_id, tipo, saldo_inicial, saldo_final_cartola, banco_contable, sca, sba, cuadrado, partidas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`,
    [companyId, tipo || 'bancaria', informe.saldoInicial || null, informe.saldoFinalCartola || null, informe.bancoContable || null,
     informe.sca || null, informe.sba || null, !!informe.cuadrado, JSON.stringify(workpaper)]
  );
  return r.rows[0];
}

async function getUltima(db, companyId, tipo) {
  await ensureTable(db);
  const r = await db.query(
    `SELECT * FROM conciliaciones WHERE company_id=$1 AND tipo=$2 ORDER BY created_at DESC LIMIT 1`,
    [companyId, tipo || 'bancaria']
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.partidas && typeof row.partidas === 'object' && !Array.isArray(row.partidas)) {
    // workpaper guardado como objeto; exponer partidas como array arriba para el test/uso
    row.partidas = row.partidas.partidas || [];
  }
  return row;
}

module.exports = { ensureTable, guardarConciliacion, getUltima };
