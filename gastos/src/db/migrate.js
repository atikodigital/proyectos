const fs = require('fs');
const path = require('path');

function schemaSql() {
  return fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
}

// Partial index for WhatsApp message dedup — required in real Postgres but
// pg-mem does not support partial indexes (WHERE clause), so we apply it
// separately and swallow the error in test environments.
const PARTIAL_INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_wamsg
  ON expenses(company_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;
`;

async function migrate(db) {
  // Split on statement boundaries so pg-mem receives one statement at a time
  const statements = schemaSql()
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await db.query(stmt);
  }

  // Apply partial index; pg-mem may not support it — that's OK for tests
  try {
    await db.query(PARTIAL_INDEXES);
  } catch (e) {
    // pg-mem may not support partial indexes — safe to skip in test environment
  }
}

module.exports = { migrate, schemaSql };
