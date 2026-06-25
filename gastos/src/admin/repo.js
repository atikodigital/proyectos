// Admin de Hash IA (Atiko/agencia): gestiona los clientes (empresas), sus logins y planes.
const { createCompany, createEmployee, listEmployees, ensureCompanyOnboarding } = require('../companies/repo');
const { listExpenses } = require('../expenses/query');
const { cashflowSummary } = require('../expenses/summary');
const matchRepo = require('../match/repo');
const pedidosRepo = require('../pedidos/repo');
const { hashPassword } = require('../auth/password');
const billingRepo = require('../billing/repo');
const { saldo } = require('../billing/creditos');

const PRODUCTOS = ['hashia', 'crm', 'chat', 'pedidos'];
const CANALES = ['whatsapp', 'messenger', 'instagram', 'email', 'telegram', 'web', 'voz'];
const _prodReady = new WeakSet();

async function ensureProductos(db) {
  if (_prodReady.has(db)) return;
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS productos jsonb DEFAULT '[]';");
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS canales jsonb DEFAULT '[]';");
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS burbuja_activa boolean DEFAULT false;");
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS burbuja_apps jsonb DEFAULT '[]';");
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS owner_email text;");
  _prodReady.add(db);
}

// Normaliza un array a strings minúscula/trim/sin duplicados. Si se pasa `permitidos`,
// además descarta las claves fuera de ese catálogo. Si no, acepta texto libre no vacío.
function _normalizeArr(arr, permitidos = null) {
  const out = [];
  for (const v of (Array.isArray(arr) ? arr : [])) {
    const k = String(v || '').trim().toLowerCase();
    if (k && (!permitidos || permitidos.includes(k)) && !out.includes(k)) out.push(k);
  }
  return out;
}

async function getProductos(db, companyId) {
  await ensureProductos(db);
  const r = await db.query('SELECT id, productos, canales, burbuja_activa, burbuja_apps FROM companies WHERE id=$1', [companyId]);
  return r.rows[0] || null;
}

async function setProductos(db, companyId, patch = {}) {
  await ensureProductos(db);
  const sets = [];
  const vals = [companyId];
  if (patch.productos !== undefined) {
    vals.push(JSON.stringify(_normalizeArr(patch.productos, PRODUCTOS)));
    sets.push(`productos=$${vals.length}::jsonb`);
  }
  if (patch.canales !== undefined) {
    vals.push(JSON.stringify(_normalizeArr(patch.canales, CANALES)));
    sets.push(`canales=$${vals.length}::jsonb`);
  }
  if (patch.burbuja_activa !== undefined) {
    vals.push(!!patch.burbuja_activa);
    sets.push(`burbuja_activa=$${vals.length}`);
  }
  if (patch.burbuja_apps !== undefined) {
    vals.push(JSON.stringify(_normalizeArr(patch.burbuja_apps)));
    sets.push(`burbuja_apps=$${vals.length}::jsonb`);
  }
  // Datos de contacto editables del cliente
  for (const campo of ['owner_whatsapp', 'owner_email', 'owner_nombre']) {
    if (patch[campo] !== undefined) {
      vals.push(String(patch[campo] || '').trim() || null);
      sets.push(`${campo}=$${vals.length}`);
    }
  }
  if (!sets.length) return getProductos(db, companyId);
  const r = await db.query(`UPDATE companies SET ${sets.join(', ')} WHERE id=$1 RETURNING id, productos, canales, burbuja_activa, burbuja_apps, owner_whatsapp, owner_email, owner_nombre`, vals);
  return r.rows[0] || null;
}

const _ready = new WeakSet();
async function ensurePlan(db) {
  if (_ready.has(db)) return;
  await db.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free';");
  _ready.add(db);
}

function ym(v) {
  if (!v) return '';
  const s = (v instanceof Date) ? v.toISOString() : String(v);
  return s.slice(0, 7);
}

async function setCompanyPlan(db, companyId, plan) {
  await ensurePlan(db);
  const r = await db.query('UPDATE companies SET plan=$2 WHERE id=$1 RETURNING id, plan', [companyId, plan || 'free']);
  const row = r.rows[0] || null;
  // Sincroniza el límite real de créditos con el plan elegido.
  try { await billingRepo.setPlanLimite(db, companyId, { plan: plan || 'free' }); } catch (_) { /* nunca rompe el comportamiento existente */ }
  return row;
}

// Crea un cliente nuevo: empresa + (opcional) su login de dueño.
async function crearCliente(db, d) {
  await ensurePlan(db);
  const empresa = await createCompany(db, {
    nombre: d.nombreEmpresa,
    rut: d.rut || undefined,
    owner_nombre: d.nombreContacto || undefined,
    owner_whatsapp: d.owner_whatsapp || undefined,
  });
  if (d.plan) await setCompanyPlan(db, empresa.id, d.plan);
  if (d.owner_email !== undefined) {
    await ensureProductos(db);
    const email = String(d.owner_email || '').trim() || null;
    await db.query('UPDATE companies SET owner_email=$2 WHERE id=$1', [empresa.id, email]);
    empresa.owner_email = email;
  }
  if (d.productos !== undefined || d.canales !== undefined || d.burbuja_activa !== undefined || d.burbuja_apps !== undefined) {
    await setProductos(db, empresa.id, { productos: d.productos, canales: d.canales, burbuja_activa: d.burbuja_activa, burbuja_apps: d.burbuja_apps });
  }
  let employee = null;
  if (d.usuario && d.password) {
    const ph = await hashPassword(String(d.password));
    employee = await createEmployee(db, {
      company_id: empresa.id,
      nombre: d.nombreContacto || d.usuario,
      usuario: String(d.usuario).trim().toLowerCase(),
      password_hash: ph,
      rol: 'owner',
      activo: true,
    });
  }
  return {
    empresa: { ...empresa, plan: d.plan || 'free' },
    employee,
    credenciales: employee ? { usuario: employee.usuario } : null,
  };
}

// Crea o resetea el login (dueño) de una empresa existente.
async function crearLogin(db, companyId, usuario, password, nombre) {
  const ph = await hashPassword(String(password));
  const employee = await createEmployee(db, {
    company_id: companyId,
    nombre: nombre || usuario,
    usuario: String(usuario).trim().toLowerCase(),
    password_hash: ph,
    rol: 'owner',
    activo: true,
  });
  return { usuario: employee.usuario };
}

async function movimientosDelMes(db, companyId, year, month) {
  const target = year + '-' + String(month).padStart(2, '0');
  const r = await db.query("SELECT fecha, created_at FROM expenses WHERE company_id=$1 AND estado <> 'anulado'", [companyId]);
  return r.rows.filter((e) => (ym(e.fecha) || ym(e.created_at)) === target).length;
}

async function ensureArchivada(db) {
  try { await db.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS archivada boolean NOT NULL DEFAULT false'); } catch (e) { /* ya existe */ }
}

// Archiva (soft delete) o restaura una empresa. No borra datos.
async function archivarCliente(db, companyId, archivada) {
  await ensureArchivada(db);
  const r = await db.query('UPDATE companies SET archivada=$2 WHERE id=$1 RETURNING id, nombre, archivada', [companyId, !!archivada]);
  return r.rows[0] || null;
}

// Elimina PERMANENTEMENTE una empresa y TODOS sus datos. Irreversible.
// Recorre dinámicamente las tablas que tienen company_id (así no se olvida ninguna,
// ni las futuras) y las limpia; al final borra la empresa. Los nombres de tabla salen
// del catálogo de Postgres (no de input del usuario), así que el SQL dinámico es seguro.
async function eliminarCliente(db, companyId) {
  const existe = await db.query('SELECT id, nombre FROM companies WHERE id=$1', [companyId]);
  if (!existe.rows[0]) return null;
  let tablas = [];
  try {
    const t = await db.query(
      "SELECT table_name FROM information_schema.columns WHERE column_name='company_id' AND table_schema='public' AND table_name <> 'companies'"
    );
    tablas = t.rows.map((r) => r.table_name);
  } catch (e) { /* pg-mem u otro: usamos el fallback */ }
  if (!tablas.length) tablas = ['users', 'employees', 'expenses', 'subscriptions', 'ia_consumo', 'kaly_memory', 'contactos'];
  for (const tabla of tablas) {
    try { await db.query(`DELETE FROM "${tabla}" WHERE company_id=$1`, [companyId]); } catch (e) { /* tabla inexistente: tolerante */ }
  }
  const r = await db.query('DELETE FROM companies WHERE id=$1 RETURNING id, nombre', [companyId]);
  return r.rows[0] || null;
}

async function listClientesConStats(db, year, month, opts = {}) {
  await ensurePlan(db);
  await ensureProductos(db);
  await ensureArchivada(db);
  const quiero = opts.archivadas ? true : false;
  const cs = await db.query('SELECT id, nombre, rut, plan, productos, canales, burbuja_activa, owner_nombre, created_at FROM companies WHERE COALESCE(archivada,false)=$1 ORDER BY created_at ASC', [quiero]);
  const out = [];
  for (const c of cs.rows) {
    const emp = await db.query('SELECT count(*)::int AS n FROM employees WHERE company_id=$1', [c.id]);
    const movimientos = await movimientosDelMes(db, c.id, year, month);
    out.push({
      id: c.id, nombre: c.nombre, rut: c.rut, plan: c.plan || 'free',
      contacto: c.owner_nombre || null, empleados: emp.rows[0].n, movimientos,
      productos: c.productos || [], canales: c.canales || [], burbuja_activa: !!c.burbuja_activa,
    });
  }
  return out;
}

async function getFichaCliente(db, companyId, year, month) {
  await ensureProductos(db);
  await ensurePlan(db);
  await ensureCompanyOnboarding(db);
  const cr = await db.query(
    'SELECT id, nombre, rut, giro, owner_nombre, owner_whatsapp, owner_email, wa_phone_number_id, onboarded_at, created_at, plan, productos, canales, burbuja_activa, burbuja_apps FROM companies WHERE id=$1',
    [companyId]
  );
  const empresa = cr.rows[0];
  if (!empresa) return null;
  empresa.productos = empresa.productos || [];
  empresa.canales = empresa.canales || [];
  empresa.burbuja_apps = empresa.burbuja_apps || [];
  const empleados = await listEmployees(db, companyId);
  const movsAll = await listExpenses(db, companyId, { limit: 20 });
  const movimientos = movsAll.map((e) => ({
    id: e.id, tipo: e.tipo, proveedor: e.proveedor, total: Number(e.total) || 0,
    fecha: e.fecha, estado: e.estado, estado_pago: e.estado_pago,
  }));
  const resumen = await cashflowSummary(db, companyId, { year, month });
  const u = await matchRepo.getUltima(db, companyId, 'bancaria');
  const conciliacion = u ? { cuadrado: u.cuadrado, sca: Number(u.sca), sba: Number(u.sba) } : null;
  const pedidos = empresa.productos.includes('pedidos') ? await pedidosRepo.listPedidos(db, companyId, 10) : null;
  const creditos = await saldo(db, companyId);
  return { empresa, empleados, movimientos, resumen, conciliacion, pedidos, creditos };
}

module.exports = { ensurePlan, crearCliente, crearLogin, setCompanyPlan, movimientosDelMes, listClientesConStats, archivarCliente, eliminarCliente, ensureProductos, getProductos, setProductos, PRODUCTOS, CANALES, getFichaCliente };
