const fs = require('fs');
const path = require('path');

function schemaSql() {
  return fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
}

// Índice parcial para dedup de mensajes de WhatsApp (no soportado por pg-mem).
const PARTIAL_INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_wamsg
  ON expenses(company_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;
`;

// Columnas v2: en una DB existente (producción) CREATE TABLE IF NOT EXISTS es no-op,
// así que las agregamos con ALTER idempotente. En pg-mem ya vienen del schema.sql,
// por eso cada ALTER va en su propio try/catch tolerante.
const V2_COLUMNS = [
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'gasto'",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS nro_operacion text",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS image_hash text",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS estado_pago text NOT NULL DEFAULT 'registrada'",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS dedup_override boolean NOT NULL DEFAULT false",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS wa_sender_name text",
  "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS wa_sender_phone text",
];

// Índices de dedup (no únicos: el override permite una 2ª fila a propósito).
const DEDUP_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_expenses_dedup_doc ON expenses(company_id, rut_emisor, folio)",
  "CREATE INDEX IF NOT EXISTS idx_expenses_dedup_op ON expenses(company_id, nro_operacion)",
  "CREATE INDEX IF NOT EXISTS idx_expenses_dedup_hash ON expenses(company_id, image_hash)",
];

async function migrate(db) {
  const statements = schemaSql()
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await db.query(stmt);
  }

  for (const stmt of V2_COLUMNS) {
    try { await db.query(stmt); } catch (e) { /* pg-mem: ya existen del schema */ }
  }
  for (const stmt of DEDUP_INDEXES) {
    try { await db.query(stmt); } catch (e) { /* tolerante */ }
  }

  try {
    await db.query(PARTIAL_INDEXES);
  } catch (e) {
    // pg-mem no soporta índices parciales — ok en tests
  }
}

module.exports = { migrate, schemaSql };
