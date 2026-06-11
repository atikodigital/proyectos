const { Pool } = require('pg');

let pool = null;
function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.GASTOS_DB_URL });
  }
  return pool;
}

module.exports = { getPool };
