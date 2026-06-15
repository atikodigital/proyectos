// Pedidos/cotizaciones para Hash IA (gastos) — overlay "Crear pedido".
// Cada pedido es de una empresa (company_id). Contacto del cliente inline (no hay CRM/leads).

const PEDIDO_ESTADOS = ['sugerido', 'enviado', 'aceptado', 'rechazado', 'cancelado'];

let _ready = null;
async function ensurePedidosTable(db) {
  if (!_ready) {
    _ready = db.query(`
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
    `).catch((e) => { _ready = null; throw e; });
  }
  return _ready;
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
  txt += '\n*Total: ' + fmtCLP(ped.total) + '*';
  if (ped.entrega === 'retiro') txt += '\n\n🏬 Entrega: Retiro en tienda';
  else if (ped.entrega === 'despacho') txt += '\n\n📦 Entrega: Despacho a domicilio';
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

async function createPedido(db, companyId, d) {
  await ensurePedidosTable(db);
  const items = normalizeItems(d.items);
  const t = computeTotals(items, d.impuesto_pct);
  const entrega = ['retiro', 'despacho'].includes(String(d.entrega || '').toLowerCase()) ? String(d.entrega).toLowerCase() : null;
  const direccion = d.direccion ? String(d.direccion).trim().slice(0, 200) : null;
  const r = await db.query(
    `INSERT INTO pedidos (company_id, channel, contact_name, contact_phone, items, moneda,
       subtotal, impuesto_pct, impuesto, total, entrega, direccion, nota)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [companyId, d.channel || 'whatsapp', d.contact_name || null, d.contact_phone || null,
     JSON.stringify(items), d.moneda || 'CLP', t.subtotal, t.impuesto_pct, t.impuesto, t.total,
     entrega, direccion, d.nota || null]
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

module.exports = {
  PEDIDO_ESTADOS, ensurePedidosTable, createPedido, markSent,
  pedidoToText, getCompanyPie, setCompanyPie, fmtCLP,
};
