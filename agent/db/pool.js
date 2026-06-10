const { Pool } = require("pg");

// DATABASE_URL apunta a atiko-db (Postgres). Reutilizable por otros módulos.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { pool };
