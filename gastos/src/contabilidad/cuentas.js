// Plan de cuentas base SII Mipyme para VARAS. Cada cuenta tiene una "clave" estable
// (referenciada por el motor de asientos) además de su código/nombre SII.
const { CATEGORY_TO_SII } = require('../domain/categories');

const CLAVES = {
  CAJA: 'caja',
  BANCO: 'banco',
  IVA_CREDITO: 'iva_credito',
  IVA_DEBITO: 'iva_debito',
  PROVEEDORES: 'proveedores',
  CLIENTES: 'clientes',
  VENTAS: 'ventas',
  GASTOS_FINANCIEROS: 'gastos_financieros',
  GASTO_GENERICO: 'gasto_generico',
};

// Cuentas núcleo (las que el motor de asientos referencia por clave).
const NUCLEO = [
  { clave: 'caja',               codigo: '1.1.10.1',  nombre: 'Caja',                  tipo: 'activo',             imputable: true },
  { clave: 'banco',              codigo: '1.1.10.2',  nombre: 'Banco',                 tipo: 'activo',             imputable: true },
  { clave: 'iva_credito',        codigo: '1.1.40.1',  nombre: 'IVA Crédito Fiscal',    tipo: 'activo',             imputable: true },
  { clave: 'clientes',           codigo: '1.1.20.1',  nombre: 'Clientes (por cobrar)', tipo: 'activo',             imputable: true },
  { clave: 'proveedores',        codigo: '2.1.10.1',  nombre: 'Proveedores (por pagar)', tipo: 'pasivo',           imputable: true },
  { clave: 'iva_debito',         codigo: '2.1.40.1',  nombre: 'IVA Débito Fiscal',     tipo: 'pasivo',             imputable: true },
  { clave: 'ventas',             codigo: '3.1.10.1',  nombre: 'Ventas del Giro',       tipo: 'resultado_ganancia', imputable: true },
  { clave: 'gastos_financieros', codigo: '4.5.10.1',  nombre: 'Gastos Financieros',    tipo: 'resultado_perdida',  imputable: true },
  { clave: 'gasto_generico',     codigo: '4.3.150.1', nombre: 'Otros Gastos de Administración y Venta', tipo: 'resultado_perdida', imputable: true },
];

// Cuentas de gasto que vienen del mapeo de categorías (dedup por código).
const _gastoExtra = (() => {
  const vistos = new Set(NUCLEO.map((c) => c.codigo));
  const out = [];
  for (const { codigo, nombre } of Object.values(CATEGORY_TO_SII)) {
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);
    out.push({ clave: 'gasto_' + codigo.replace(/\./g, '_'), codigo, nombre, tipo: 'resultado_perdida', imputable: true });
  }
  return out;
})();

const PLAN_BASE = [...NUCLEO, ..._gastoExtra];

const _byClave = new Map(PLAN_BASE.map((c) => [c.clave, c]));
function cuentaPorClave(clave) {
  return _byClave.get(clave) || null;
}

const _ready = new WeakMap();
async function ensureCuentasTable(db) {
  if (!_ready.has(db)) {
    const p = db.query(`
      CREATE TABLE IF NOT EXISTS cuentas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        clave text,
        codigo text NOT NULL,
        nombre text NOT NULL,
        tipo text NOT NULL,
        imputable boolean NOT NULL DEFAULT true,
        activo boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_cuentas_company ON cuentas(company_id);
    `).catch((e) => { _ready.delete(db); throw e; });
    _ready.set(db, p);
  }
  return _ready.get(db);
}

const CUENTA_COLS = 'id, company_id, clave, codigo, nombre, tipo, imputable, activo';

async function sembrarCuentas(db, companyId) {
  await ensureCuentasTable(db);
  const existentes = await db.query('SELECT codigo FROM cuentas WHERE company_id=$1', [companyId]);
  const yaHay = new Set(existentes.rows.map((r) => r.codigo));
  for (const c of PLAN_BASE) {
    if (yaHay.has(c.codigo)) continue;
    await db.query(
      'INSERT INTO cuentas (company_id, clave, codigo, nombre, tipo, imputable) VALUES ($1,$2,$3,$4,$5,$6)',
      [companyId, c.clave, c.codigo, c.nombre, c.tipo, c.imputable]
    );
  }
}

async function listCuentas(db, companyId) {
  await ensureCuentasTable(db);
  const r = await db.query(`SELECT ${CUENTA_COLS} FROM cuentas WHERE company_id=$1 ORDER BY codigo ASC`, [companyId]);
  return r.rows;
}

// Devuelve el id de la cuenta de una clave núcleo; siembra si la empresa no tiene plan.
async function getCuentaId(db, companyId, clave) {
  await ensureCuentasTable(db);
  let r = await db.query('SELECT id FROM cuentas WHERE company_id=$1 AND clave=$2 LIMIT 1', [companyId, clave]);
  if (!r.rows[0]) { await sembrarCuentas(db, companyId); r = await db.query('SELECT id FROM cuentas WHERE company_id=$1 AND clave=$2 LIMIT 1', [companyId, clave]); }
  return r.rows[0] ? r.rows[0].id : null;
}

// Resuelve la cuenta de gasto de un expense: por cuenta_sii_codigo del movimiento, o la genérica.
async function getCuentaGastoId(db, companyId, codigoSii) {
  await ensureCuentasTable(db);
  if (codigoSii) {
    const r = await db.query('SELECT id FROM cuentas WHERE company_id=$1 AND codigo=$2 LIMIT 1', [companyId, codigoSii]);
    if (r.rows[0]) return r.rows[0].id;
  }
  return getCuentaId(db, companyId, 'gasto_generico');
}

async function createCuenta(db, companyId, { codigo, nombre, tipo, imputable }) {
  await ensureCuentasTable(db);
  const r = await db.query(
    'INSERT INTO cuentas (company_id, codigo, nombre, tipo, imputable) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [companyId, codigo, nombre, tipo, imputable !== false]
  );
  return r.rows[0];
}

async function updateCuenta(db, companyId, id, patch) {
  await ensureCuentasTable(db);
  const cols = [];
  const vals = [];
  let idx = 2; // $1 is reserved for ID

  const fields = ['codigo', 'nombre', 'tipo', 'imputable', 'activo'];
  for (const f of fields) {
    if (patch[f] !== undefined) {
      cols.push(`${f}=$${idx++}`);
      vals.push(patch[f]);
    }
  }

  if (!cols.length) {
    const res = await db.query('SELECT * FROM cuentas WHERE id=$1 AND company_id=$2', [id, companyId]);
    return res.rows[0] || null;
  }

  const sql = `UPDATE cuentas SET ${cols.join(', ')} WHERE id=$1 AND company_id=$2 RETURNING *`;
  const res = await db.query(sql, [id, ...vals]);
  return res.rows[0] || null;
}

async function deactivateCuenta(db, companyId, id) {
  await ensureCuentasTable(db);
  const r = await db.query(
    "UPDATE cuentas SET activo=false WHERE id=$1 AND company_id=$2 RETURNING *",
    [id, companyId]
  );
  return r.rows[0] || null;
}

module.exports = {
  PLAN_BASE,
  CLAVES,
  cuentaPorClave,
  ensureCuentasTable,
  sembrarCuentas,
  listCuentas,
  getCuentaId,
  getCuentaGastoId,
  createCuenta,
  updateCuenta,
  deactivateCuenta
};
