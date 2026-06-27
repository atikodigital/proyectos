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

// Login social (Google / Facebook): el registro deja de ser solo email+password.
// password_hash y email pasan a ser opcionales (un usuario social no tiene clave);
// guardamos el id del proveedor para encontrarlo en logins futuros. needs_setup
// marca a la empresa recién creada por login social a la que aún le falta nombre.
const SOCIAL_AUTH_DDL = [
  "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL",
  // Facebook con sólo public_profile no entrega correo: email pasa a ser opcional
  // (identificamos por facebook_id). Google sigue trayéndolo siempre.
  "ALTER TABLE users ALTER COLUMN email DROP NOT NULL",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'email'",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id text",
  "ALTER TABLE companies ADD COLUMN IF NOT EXISTS needs_setup boolean NOT NULL DEFAULT false",
];

// Índices únicos parciales para los ids de proveedor (pg-mem no soporta WHERE → try/catch).
const SOCIAL_AUTH_INDEXES = [
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_facebook_id ON users(facebook_id) WHERE facebook_id IS NOT NULL",
];

const PERSONAL_COLUMNS = [
  "ALTER TABLE companies ADD COLUMN IF NOT EXISTS tipo_cuenta TEXT NOT NULL DEFAULT 'empresa'",
  "ALTER TABLE companies ADD COLUMN IF NOT EXISTS sueldo_mensual INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE companies ADD COLUMN IF NOT EXISTS dia_pago INTEGER NOT NULL DEFAULT 1",
];

// Recuperación de contraseña: token hasheado, caduca en 1 hora, un solo uso.
const PASSWORD_RESETS_DDL = [
  `CREATE TABLE IF NOT EXISTS password_resets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at timestamptz
  )`,
  // subject_kind: 'user' (dueño del panel web) | 'employee' (login de la APK).
  // user_id guarda el id del sujeto correspondiente.
  "ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS subject_kind text NOT NULL DEFAULT 'user'",
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash)',
  'CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id)',
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
  for (const stmt of SOCIAL_AUTH_DDL) {
    try { await db.query(stmt); } catch (e) { /* pg-mem / ya existe */ }
  }
  for (const stmt of SOCIAL_AUTH_INDEXES) {
    try { await db.query(stmt); } catch (e) { /* pg-mem: índice parcial no soportado */ }
  }
  for (const stmt of PERSONAL_COLUMNS) {
    try { await db.query(stmt); } catch (e) { /* pg-mem / ya existe */ }
  }
  for (const stmt of PASSWORD_RESETS_DDL) {
    try { await db.query(stmt); } catch (e) { /* pg-mem / ya existe */ }
  }
  // Grandfathering: las empresas que YA existen (sin suscripción) parten ILIMITADAS
  // para no bloquear a clientes actuales al activar el cobro.
  try { await grandfatherExisting(db); } catch (e) { /* tolerante */ }
  for (const stmt of DEDUP_INDEXES) {
    try { await db.query(stmt); } catch (e) { /* tolerante */ }
  }

  try {
    await db.query(PARTIAL_INDEXES);
  } catch (e) {
    // pg-mem no soporta índices parciales — ok en tests
  }
}

// Da plan ilimitado a las empresas que no tienen suscripción (clientes actuales).
// Las nuevas nacen en free vía createCompany. Idempotente: salta a quien ya tiene.
async function grandfatherExisting(db) {
  const cs = await db.query('SELECT id FROM companies');
  const ss = await db.query('SELECT company_id FROM subscriptions');
  const tienen = new Set(ss.rows.map((r) => r.company_id));
  let n = 0;
  for (const c of cs.rows) {
    if (tienen.has(c.id)) continue;
    await db.query(
      `INSERT INTO subscriptions(company_id, plan, estado, source, creditos_limite, creditos_usados)
       VALUES($1,'ilimitado','activa','grandfather',100000000,0)`, [c.id]);
    n++;
  }
  return n;
}

module.exports = { migrate, schemaSql, grandfatherExisting };
