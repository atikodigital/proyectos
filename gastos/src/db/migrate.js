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
  "ALTER TABLE employees ADD COLUMN IF NOT EXISTS agent_prefs jsonb",
  "ALTER TABLE companies ADD COLUMN IF NOT EXISTS giro text",
  "ALTER TABLE companies ADD COLUMN IF NOT EXISTS archivada boolean NOT NULL DEFAULT false",
];

const KALY_COLUMNS = [
  "ALTER TABLE employees ADD COLUMN IF NOT EXISTS kaly_nombre text",
  "ALTER TABLE employees ADD COLUMN IF NOT EXISTS kaly_trato text",
  "ALTER TABLE employees ADD COLUMN IF NOT EXISTS kaly_onboarded boolean NOT NULL DEFAULT false",
];

const MEMORY_DDL = [
  `CREATE TABLE IF NOT EXISTS kaly_memory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    tipo text NOT NULL DEFAULT 'hecho',
    contenido text NOT NULL,
    origen text NOT NULL DEFAULT 'kaly',
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  "ALTER TABLE companies ADD COLUMN IF NOT EXISTS kaly_persona jsonb",
  // Eje de "dueño" del hecho: 'company' (compartido) | 'user'/'employee' (privado).
  "ALTER TABLE kaly_memory ADD COLUMN IF NOT EXISTS owner_kind text NOT NULL DEFAULT 'company'",
  "ALTER TABLE kaly_memory ADD COLUMN IF NOT EXISTS owner_id text",
  "CREATE INDEX IF NOT EXISTS idx_kaly_memory_scope ON kaly_memory(company_id, owner_kind, owner_id)",
];

const CONTACTOS_DDL = [
  `CREATE TABLE IF NOT EXISTS contactos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    channel text NOT NULL,
    contact_key text NOT NULL,
    email text,
    ubicacion text,
    notas text,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_contactos_uniq ON contactos(company_id, channel, contact_key)",
];

// Admins individuales de la agencia (login propio + 2FA por persona).
const ADMINS_DDL = [
  `CREATE TABLE IF NOT EXISTS admins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    password_hash text NOT NULL,
    nombre text,
    totp_secret text,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_email ON admins(email)",
];

// Suscripciones y consumo de IA (créditos). Fase 1 de monetización.
const BILLING_DDL = [
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    plan text NOT NULL DEFAULT 'free',
    estado text NOT NULL DEFAULT 'activa',
    source text NOT NULL DEFAULT 'manual',
    external_id text,
    ciclo_inicio timestamptz NOT NULL DEFAULT now(),
    ciclo_fin timestamptz,
    creditos_limite integer NOT NULL DEFAULT 30,
    creditos_usados integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_company ON subscriptions(company_id)",
  `CREATE TABLE IF NOT EXISTS ia_consumo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    tipo text NOT NULL,
    cantidad numeric NOT NULL DEFAULT 1,
    creditos integer NOT NULL DEFAULT 0,
    meta jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_ia_consumo_company ON ia_consumo(company_id, created_at)",
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
  for (const stmt of KALY_COLUMNS) {
    try { await db.query(stmt); } catch (e) { /* pg-mem: ya existen del schema */ }
  }
  for (const stmt of MEMORY_DDL) {
    try { await db.query(stmt); } catch (e) { /* pg-mem / ya existe */ }
  }
  for (const stmt of CONTACTOS_DDL) {
    try { await db.query(stmt); } catch (e) { /* pg-mem / ya existe */ }
  }
  for (const stmt of ADMINS_DDL) {
    try { await db.query(stmt); } catch (e) { /* pg-mem / ya existe */ }
  }
  for (const stmt of BILLING_DDL) {
    try { await db.query(stmt); } catch (e) { /* pg-mem / ya existe */ }
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
