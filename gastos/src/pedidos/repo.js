// Pedidos/cotizaciones para Hash IA (gastos) — overlay "Crear pedido".
// Cada pedido es de una empresa (company_id). Contacto del cliente inline (no hay CRM/leads).

const crypto = require('crypto');

const PEDIDO_ESTADOS = ['sugerido', 'enviado', 'aceptado', 'rechazado', 'cancelado'];

const _ready = new WeakMap();
async function ensurePedidosTable(db) {
  if (!_ready.has(db)) {
    const p = db.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        channel text DEFAULT 'whatsapp',
        contact_name text,
        contact_phone text,
        items jsonb NOT NULL DEFAULT '[]',
        moneda text NOT NULL DEFAULT 'CLP',
        subtotal bigint NOT NULL DEFAULT 0,
        impuesto_pct numeric NOT NULL DEFAULT 19,
        impuesto bigint NOT NULL DEFAULT 0,
        total bigint NOT NULL DEFAULT 0,
        entrega text,
        direccion text,
        nota text,
        estado text NOT NULL DEFAULT 'sugerido',
        created_at timestamptz NOT NULL DEFAULT now(),
        sent_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS idx_pedidos_company ON pedidos(company_id);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS pedido_pie text;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS pedido_iva_incluido boolean NOT NULL DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS delivery_zonas jsonb NOT NULL DEFAULT '[]';
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS delivery_gratis_desde integer;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comuna text;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS envio_costo integer NOT NULL DEFAULT 0;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS envio_zona text;
    `).catch((e) => { _ready.delete(db); throw e; });
    _ready.set(db, p);
  }
  return _ready.get(db);
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 50).map((it) => ({
    descripcion: String((it && it.descripcion) || 'Producto').trim().slice(0, 200),
    cantidad: Math.max(1, parseInt(it && it.cantidad, 10) || 1),
    precio_unitario: Math.max(0, Math.round(Number(it && it.precio_unitario) || 0)),
  }));
}
function computeTotals(items, impuestoPct) {
  const pct = (impuestoPct >= 0 && impuestoPct <= 100) ? Number(impuestoPct) : 19;
  const subtotal = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
  const impuesto = Math.round(subtotal * (pct / 100));
  return { subtotal, impuesto, total: subtotal + impuesto, impuesto_pct: pct };
}

function fmtCLP(n) { return '$' + Number(n || 0).toLocaleString('es-CL'); }
function nroCotizacion(ped) {
  return 'COT-' + String(ped.id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
}

// Texto del pedido para enviar al cliente por el chat. El pie lleva los datos de la empresa.
function pedidoToText(ped, opts = {}) {
  const items = Array.isArray(ped.items) ? ped.items : [];
  const lines = items.map((it) =>
    '• ' + it.descripcion + '\n   ' + it.cantidad + ' × ' + fmtCLP(it.precio_unitario) + ' = ' + fmtCLP(it.cantidad * it.precio_unitario));
  let txt = '🧾 *Cotización N° ' + nroCotizacion(ped) + '*\n\n' + lines.join('\n');
  txt += '\n\nSubtotal: ' + fmtCLP(ped.subtotal);
  if (Number(ped.impuesto) > 0) txt += '\nIVA (' + Number(ped.impuesto_pct) + '%): ' + fmtCLP(ped.impuesto);
  if (Number(ped.envio_costo) > 0) txt += '\n🚚 Despacho' + (ped.comuna ? ' (' + ped.comuna + ')' : '') + ': ' + fmtCLP(ped.envio_costo);
  txt += '\n*Total: ' + fmtCLP(ped.total) + '*';
  if (ped.entrega === 'retiro') txt += '\n\n🏬 Entrega: Retiro en tienda';
  else if (ped.entrega === 'despacho') {
    if (ped.comuna) txt += '\n\n🚚 Despacho a ' + ped.comuna + (Number(ped.envio_costo) > 0 ? '' : ': Gratis');
    else txt += '\n\n📦 Entrega: Despacho a domicilio';
  }
  if (ped.direccion) txt += '\n📍 Dirección: ' + ped.direccion;
  if (ped.nota) txt += '\n\n' + ped.nota;
  const cN = (ped.contact_name || '').trim();
  const cT = (ped.contact_phone || '').trim();
  if (cN || cT) txt += '\n\n👤 Cliente: ' + [cN, cT].filter(Boolean).join(' · ');
  const pie = (opts.pie || '').trim();
  if (pie) txt += '\n\n— — —\n' + pie;
  txt += '\n\n¿Confirmamos? Responde aquí y avanzamos. 🙌';
  return txt;
}

// Normaliza un teléfono chileno a formato wa.me (56 + 9 dígitos). null si no es usable.
function waPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('56') && d.length >= 11) return d.slice(0, 11);
  if (d.length === 9 && d.startsWith('9')) return '56' + d;
  if (d.length === 8) return '569' + d;
  if (d.startsWith('56')) return d;
  return null;
}

// Link oficial de WhatsApp con el pedido pre-cargado (el usuario solo aprieta enviar).
function waLink(text, phoneRaw) {
  const enc = encodeURIComponent(String(text || ''));
  const p = waPhone(phoneRaw);
  return p ? `https://wa.me/${p}?text=${enc}` : `https://wa.me/?text=${enc}`;
}

async function createPedido(db, companyId, d) {
  await ensurePedidosTable(db);
  const items = normalizeItems(d.items);
  const t = computeTotals(items, d.impuesto_pct);
  const envio_costo = Math.max(0, Math.round(Number(d.envio_costo) || 0));
  const totalConEnvio = t.total + envio_costo;
  const entrega = ['retiro', 'despacho'].includes(String(d.entrega || '').toLowerCase()) ? String(d.entrega).toLowerCase() : null;
  const direccion = d.direccion ? String(d.direccion).trim().slice(0, 200) : null;
  const r = await db.query(
    `INSERT INTO pedidos (company_id, channel, contact_name, contact_phone, items, moneda,
       subtotal, impuesto_pct, impuesto, total, entrega, direccion, nota, comuna, envio_costo, envio_zona)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [companyId, d.channel || 'whatsapp', d.contact_name || null, d.contact_phone || null,
     JSON.stringify(items), d.moneda || 'CLP', t.subtotal, t.impuesto_pct, t.impuesto, totalConEnvio,
     entrega, direccion, d.nota || null, d.comuna || null, envio_costo, d.envio_zona || null]
  );
  return r.rows[0];
}

async function markSent(db, companyId, id) {
  await ensurePedidosTable(db);
  const r = await db.query(
    `UPDATE pedidos SET estado = 'enviado', sent_at = now() WHERE company_id = $1 AND id = $2 RETURNING *`,
    [companyId, id]
  );
  return r.rows[0] || null;
}

async function getCompanyPie(db, companyId) {
  await ensurePedidosTable(db);
  const r = await db.query('SELECT pedido_pie FROM companies WHERE id = $1', [companyId]);
  return (r.rows[0] && r.rows[0].pedido_pie) || null;
}
async function setCompanyPie(db, companyId, pie) {
  await ensurePedidosTable(db);
  await db.query('UPDATE companies SET pedido_pie = $2 WHERE id = $1', [companyId, pie ? String(pie).slice(0, 1000) : null]);
  return true;
}

function _intDelivery(v) { const n = Math.round(Number(v) || 0); return Number.isFinite(n) ? n : 0; }
function normalizeZonas(zonas) {
  return (Array.isArray(zonas) ? zonas : []).slice(0, 40).map((z) => ({
    id: (z && z.id) ? String(z.id) : crypto.randomUUID().slice(0, 8),
    nombre: String((z && z.nombre) || '').trim().slice(0, 60) || 'Zona',
    costo: Math.max(0, _intDelivery(z && z.costo)),
    comunas: Array.isArray(z && z.comunas) ? z.comunas.slice(0, 400).map((x) => String(x).trim()).filter(Boolean) : [],
  }));
}

async function getPedidoConfig(db, companyId) {
  await ensurePedidosTable(db);
  const r = await db.query('SELECT pedido_pie, pedido_iva_incluido, delivery_zonas, delivery_gratis_desde FROM companies WHERE id = $1', [companyId]);
  const row = r.rows[0] || {};
  return {
    pie: row.pedido_pie || null,
    iva_incluido: row.pedido_iva_incluido === undefined || row.pedido_iva_incluido === null ? true : !!row.pedido_iva_incluido,
    delivery: {
      zonas: Array.isArray(row.delivery_zonas) ? row.delivery_zonas : [],
      gratis_desde: (row.delivery_gratis_desde === undefined || row.delivery_gratis_desde === null) ? null : Number(row.delivery_gratis_desde),
    },
  };
}

async function setPedidoConfig(db, companyId, cfg = {}) {
  await ensurePedidosTable(db);
  if (cfg.pie !== undefined) {
    await db.query('UPDATE companies SET pedido_pie = $2 WHERE id = $1', [companyId, cfg.pie ? String(cfg.pie).slice(0, 1000) : null]);
  }
  if (cfg.iva_incluido !== undefined) {
    await db.query('UPDATE companies SET pedido_iva_incluido = $2 WHERE id = $1', [companyId, !!cfg.iva_incluido]);
  }
  if (cfg.delivery !== undefined) {
    const zonas = normalizeZonas(cfg.delivery && cfg.delivery.zonas);
    const gratis = (cfg.delivery && cfg.delivery.gratis_desde != null && cfg.delivery.gratis_desde !== '') ? Math.max(0, _intDelivery(cfg.delivery.gratis_desde)) : null;
    await db.query('UPDATE companies SET delivery_zonas = $2::jsonb, delivery_gratis_desde = $3 WHERE id = $1', [companyId, JSON.stringify(zonas), gratis]);
  }
  return getPedidoConfig(db, companyId);
}

const { _norm: _normComuna } = require('./comunas-chile');

// Resuelve el costo de envío de una comuna. PURO.
function costoEnvio(delivery, comuna, subtotal) {
  const cfg = delivery || {};
  const zonas = Array.isArray(cfg.zonas) ? cfg.zonas : [];
  const target = _normComuna(comuna);
  const zona = zonas.find((z) => (z.comunas || []).some((c) => _normComuna(c) === target));
  if (!zona) return { ok: false };
  if (cfg.gratis_desde != null && Number(subtotal) >= Number(cfg.gratis_desde)) {
    return { ok: true, costo: 0, gratis: true, zona };
  }
  return { ok: true, costo: Math.max(0, Math.round(Number(zona.costo) || 0)), gratis: false, zona };
}

async function getPedido(db, companyId, id) {
  await ensurePedidosTable(db);
  const r = await db.query('SELECT * FROM pedidos WHERE company_id = $1 AND id = $2', [companyId, id]);
  return r.rows[0] || null;
}

module.exports = {
  PEDIDO_ESTADOS, ensurePedidosTable, createPedido, markSent,
  pedidoToText, getCompanyPie, setCompanyPie, fmtCLP, waLink, waPhone,
  getPedidoConfig, setPedidoConfig, costoEnvio, getPedido,
};
