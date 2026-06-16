// Catálogo de productos/servicios para Hash IA (gastos). Una fila por producto.
// Multi-tenant: cada producto es de su empresa (company_id). Variantes/extras en jsonb.
const crypto = require('crypto');

const TIPOS = ['producto', 'servicio'];
const UNIDADES = ['hora', 'sesion', 'unidad', 'm2', 'fijo'];

const _readyMap = new WeakMap();
async function ensureProductsTable(db) {
  if (!_readyMap.has(db)) {
    const p = db.query(`
      CREATE TABLE IF NOT EXISTS products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        tipo text NOT NULL DEFAULT 'producto',
        nombre text NOT NULL,
        descripcion text,
        categoria text,
        unidad text NOT NULL DEFAULT 'unidad',
        foto_path text,
        precio_base integer NOT NULL DEFAULT 0,
        stock integer,
        variantes jsonb NOT NULL DEFAULT '[]',
        extras jsonb NOT NULL DEFAULT '[]',
        orden integer NOT NULL DEFAULT 0,
        activo boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
      CREATE INDEX IF NOT EXISTS idx_products_company_orden ON products(company_id, orden);
    `).catch((e) => { _readyMap.delete(db); throw e; });
    _readyMap.set(db, p);
  }
  return _readyMap.get(db);
}

function _int(v, def = 0) { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : def; }
function _id(v) { return (v && String(v)) || crypto.randomUUID().slice(0, 8); }

function normalizeVariantes(variantes) {
  return (Array.isArray(variantes) ? variantes : []).slice(0, 8).map((g) => ({
    id: _id(g && g.id),
    nombre: (String((g && g.nombre) || '').trim().slice(0, 60)) || 'Grupo',
    opciones: (Array.isArray(g && g.opciones) ? g.opciones : []).slice(0, 40).map((o) => ({
      id: _id(o && o.id),
      nombre: (String((o && o.nombre) || '').trim().slice(0, 60)) || 'Opción',
      delta: _int(o && o.delta, 0),
    })),
  }));
}
function normalizeExtras(extras) {
  return (Array.isArray(extras) ? extras : []).slice(0, 40).map((e) => ({
    id: _id(e && e.id),
    nombre: (String((e && e.nombre) || '').trim().slice(0, 60)) || 'Extra',
    precio: Math.max(0, _int(e && e.precio, 0)),
  }));
}

// Normaliza el payload de un producto. PURA. Lanza si falta el nombre.
function normalizeProduct(data = {}) {
  const nombre = String(data.nombre || '').trim();
  if (!nombre) { const err = new Error('nombre_requerido'); err.code = 'validacion'; throw err; }
  const tipo = TIPOS.includes(data.tipo) ? data.tipo : 'producto';
  const esServicio = tipo === 'servicio';
  const unidad = esServicio ? (UNIDADES.includes(data.unidad) ? data.unidad : 'sesion') : 'unidad';
  const stock = esServicio ? null
    : (data.stock === null || data.stock === undefined || data.stock === '' ? null : Math.max(0, _int(data.stock, 0)));
  return {
    tipo,
    nombre: nombre.slice(0, 120),
    descripcion: data.descripcion ? String(data.descripcion).trim().slice(0, 500) : null,
    categoria: data.categoria ? String(data.categoria).trim().slice(0, 60) : null,
    unidad,
    precio_base: Math.max(0, _int(data.precio_base, 0)),
    stock,
    variantes: normalizeVariantes(data.variantes),
    extras: normalizeExtras(data.extras),
    orden: _int(data.orden, 0),
    activo: data.activo === undefined ? true : !!data.activo,
  };
}

// "Desde $X" para el listado: base + suma del menor delta de cada grupo. PURA.
function desdePrice(p) {
  const base = Math.max(0, _int(p && p.precio_base, 0));
  const vs = Array.isArray(p && p.variantes) ? p.variantes : [];
  return vs.reduce((sum, g) => {
    const ds = (g.opciones || []).map((o) => _int(o.delta, 0));
    return sum + (ds.length ? Math.min(...ds) : 0);
  }, base);
}

// Precio de una selección concreta. PURA.
// selection = { opciones: { [grupoId]: opcionId }, extras: [extraId,...] }
function priceForSelection(p, selection = {}) {
  let total = Math.max(0, _int(p && p.precio_base, 0));
  const elegidas = (selection && selection.opciones) || {};
  for (const g of (Array.isArray(p && p.variantes) ? p.variantes : [])) {
    const op = (g.opciones || []).find((o) => o.id === elegidas[g.id]);
    if (op) total += _int(op.delta, 0);
  }
  const ex = new Set(Array.isArray(selection && selection.extras) ? selection.extras : []);
  for (const e of (Array.isArray(p && p.extras) ? p.extras : [])) {
    if (ex.has(e.id)) total += Math.max(0, _int(e.precio, 0));
  }
  return total;
}

const COLS = 'id, company_id, tipo, nombre, descripcion, categoria, unidad, foto_path, precio_base, stock, variantes, extras, orden, activo, created_at, updated_at';

async function createProduct(db, companyId, data) {
  await ensureProductsTable(db);
  const p = normalizeProduct(data);
  const r = await db.query(
    `INSERT INTO products (company_id, tipo, nombre, descripcion, categoria, unidad, precio_base, stock, variantes, extras, orden, activo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12) RETURNING ${COLS}`,
    [companyId, p.tipo, p.nombre, p.descripcion, p.categoria, p.unidad, p.precio_base, p.stock,
     JSON.stringify(p.variantes), JSON.stringify(p.extras), p.orden, p.activo]
  );
  return r.rows[0];
}

async function getProduct(db, companyId, id) {
  await ensureProductsTable(db);
  const r = await db.query(`SELECT ${COLS} FROM products WHERE company_id=$1 AND id=$2`, [companyId, id]);
  return r.rows[0] || null;
}

async function listProducts(db, companyId, { incluirPausados = false } = {}) {
  await ensureProductsTable(db);
  const where = incluirPausados ? '' : ' AND activo = true';
  const r = await db.query(
    `SELECT ${COLS} FROM products WHERE company_id=$1${where} ORDER BY orden ASC, nombre ASC`, [companyId]
  );
  return r.rows;
}

async function updateProduct(db, companyId, id, data) {
  await ensureProductsTable(db);
  const exists = await getProduct(db, companyId, id);
  if (!exists) return null;
  const p = normalizeProduct({ ...exists, ...data });
  const r = await db.query(
    `UPDATE products SET tipo=$3, nombre=$4, descripcion=$5, categoria=$6, unidad=$7, precio_base=$8, stock=$9,
       variantes=$10::jsonb, extras=$11::jsonb, orden=$12, activo=$13, updated_at=now()
     WHERE company_id=$1 AND id=$2 RETURNING ${COLS}`,
    [companyId, id, p.tipo, p.nombre, p.descripcion, p.categoria, p.unidad, p.precio_base, p.stock,
     JSON.stringify(p.variantes), JSON.stringify(p.extras), p.orden, p.activo]
  );
  return r.rows[0] || null;
}

async function setActivo(db, companyId, id, activo) {
  await ensureProductsTable(db);
  const r = await db.query(
    `UPDATE products SET activo=$3, updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING ${COLS}`,
    [companyId, id, !!activo]
  );
  return r.rows[0] || null;
}

async function setProductFoto(db, companyId, id, fotoPath) {
  await ensureProductsTable(db);
  const r = await db.query(
    `UPDATE products SET foto_path=$3, updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING ${COLS}`,
    [companyId, id, fotoPath]
  );
  return r.rows[0] || null;
}

async function reordenar(db, companyId, orden) {
  await ensureProductsTable(db);
  for (const it of (Array.isArray(orden) ? orden : [])) {
    await db.query('UPDATE products SET orden=$3, updated_at=now() WHERE company_id=$1 AND id=$2',
      [companyId, it.id, _int(it.orden, 0)]);
  }
  return true;
}

// Descripción legible de una línea de pedido a partir del producto + selección. PURA.
function describeSelection(product, selection = {}) {
  const nombre = String((product && product.nombre) || 'Producto').trim();
  const elegidas = (selection && selection.opciones) || {};
  const partes = [];
  for (const g of (Array.isArray(product && product.variantes) ? product.variantes : [])) {
    const op = (g.opciones || []).find((o) => o.id === elegidas[g.id]);
    if (op) partes.push(op.nombre);
  }
  const elegidosExtras = new Set(Array.isArray(selection && selection.extras) ? selection.extras : []);
  const extras = (Array.isArray(product && product.extras) ? product.extras : [])
    .filter((e) => elegidosExtras.has(e.id)).map((e) => e.nombre);
  let txt = nombre;
  if (partes.length) txt += ' (' + partes.join(', ') + ')';
  if (extras.length) txt += ' + ' + extras.join(', ');
  return txt.slice(0, 200);
}

async function crearProductosBulk(db, companyId, productos) {
  const lista = (Array.isArray(productos) ? productos : []).slice(0, 100);
  const creados = [];
  for (const p of lista) {
    const nombre = String((p && p.nombre) || '').trim();
    if (!nombre) continue;
    creados.push(await createProduct(db, companyId, { nombre, precio_base: Math.max(0, Math.round(Number(p.precio) || 0)), tipo: 'producto' }));
  }
  return { creados: creados.length, productos: creados };
}

module.exports = {
  TIPOS, UNIDADES, ensureProductsTable, normalizeProduct,
  desdePrice, priceForSelection, describeSelection,
  // helpers internos exportados para reutilizar en próximas tasks:
  _int, _id,
  createProduct, getProduct, listProducts,
  updateProduct, setActivo, setProductFoto, reordenar,
  crearProductosBulk,
};
