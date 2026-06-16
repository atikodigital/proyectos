// Admin de Hash IA (Atiko/agencia): gestiona los clientes (empresas), sus logins y planes.
const { createCompany, createEmployee } = require('../companies/repo');
const { hashPassword } = require('../auth/password');

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
  return r.rows[0] || null;
}

// Crea un cliente nuevo: empresa + (opcional) su login de dueño.
async function crearCliente(db, d) {
  await ensurePlan(db);
  const empresa = await createCompany(db, {
    nombre: d.nombreEmpresa,
    rut: d.rut || undefined,
    owner_nombre: d.nombreContacto || undefined,
  });
  if (d.plan) await setCompanyPlan(db, empresa.id, d.plan);
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

async function listClientesConStats(db, year, month) {
  await ensurePlan(db);
  const cs = await db.query('SELECT id, nombre, rut, plan, owner_nombre, created_at FROM companies ORDER BY created_at ASC');
  const out = [];
  for (const c of cs.rows) {
    const emp = await db.query('SELECT count(*)::int AS n FROM employees WHERE company_id=$1', [c.id]);
    const movimientos = await movimientosDelMes(db, c.id, year, month);
    out.push({
      id: c.id, nombre: c.nombre, rut: c.rut, plan: c.plan || 'free',
      contacto: c.owner_nombre || null, empleados: emp.rows[0].n, movimientos,
    });
  }
  return out;
}

module.exports = { ensurePlan, crearCliente, crearLogin, setCompanyPlan, movimientosDelMes, listClientesConStats };
