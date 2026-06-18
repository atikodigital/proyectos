// ============================================================================
//  GENERA PDF IMPRIMIBLE — los 81 documentos ordenados por categoría
// ============================================================================
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const DOCS = path.resolve(__dirname, '..', 'documentos');
const OUT_HTML = path.resolve(__dirname, '..', '_impresion.html');
const OUT_PDF = path.resolve(__dirname, '..', 'HASH-IA_81-documentos_BellaNapoli.pdf');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// Reglas: (regex sobre el nombre, clave de categoría). Orden = especificidad.
const RULES = [
  [/_caso_A/i, 'A'], [/_caso_B/i, 'B'], [/_caso_C/i, 'C'], [/_caso_D/i, 'D'],
  [/_error_/i, 'ERR'], [/_insumo_/i, 'INS'], [/_voucher_/i, 'VOU'],
  [/_libro_/i, 'LIB'], [/cartola/i, 'CAR'],
  [/_venta_factura/i, 'VF'], [/_venta_boleta/i, 'VB'],
  [/_transf_/i, 'TR'], [/_deposito/i, 'DEP'], [/_compra_/i, 'COM'],
];

// Orden de las secciones en el PDF + título + documentos por fila.
const CATS = [
  ['VF',  'Ventas · Facturas emitidas a empresas', 2],
  ['VB',  'Ventas · Boletas a público', 3],
  ['COM', 'Compras a proveedores', 2],
  ['INS', 'Insumos de pizzería', 2],
  ['TR',  'Transferencias y pagos', 2],
  ['DEP', 'Depósitos', 2],
  ['VOU', 'Vouchers de pago con tarjeta (Transbank)', 3],
  ['CAR', 'Cartolas bancarias', 1],
  ['LIB', 'Libros SII (Compras y Ventas)', 1],
  ['A',   'Casos de estudio · Suite A — Correctitud contable', 2],
  ['B',   'Casos de estudio · Suite B — Validación OCR', 2],
  ['C',   'Casos de estudio · Suite C — Conciliación avanzada', 2],
  ['D',   'Casos de estudio · Suite D — Negocio pizzería', 2],
  ['ERR', 'Casos de error OCR', 2],
];

function clasifica(name) {
  for (const [re, key] of RULES) if (re.test(name)) return key;
  return 'COM';
}
function label(name) {
  const m = name.match(/^(\d+)_(.+)\.png$/i);
  if (!m) return name;
  return `N° ${m[1]} · ${m[2].replace(/_/g, ' ')}`;
}

const files = fs.readdirSync(DOCS).filter(f => /\.png$/i.test(f))
  .sort((a, b) => parseInt(a) - parseInt(b));

const byCat = {};
for (const f of files) (byCat[clasifica(f)] ||= []).push(f);

const widthFor = (per) => per === 1 ? '100%' : per === 2 ? '48.6%' : '31.8%';

let body = `<div class="cover">
  <div class="logo">🍕</div>
  <h1>Hash IA — Set de prueba</h1>
  <h2>Pizzería Bella Napoli SpA · RUT 77.123.456-9</h2>
  <p>Junio 2026 · ${files.length} documentos ordenados por categoría</p>
  <div class="idx">${CATS.filter(([k]) => byCat[k] && byCat[k].length)
    .map(([k, t]) => `<div>${t} <b>(${byCat[k].length})</b></div>`).join('')}</div>
</div>`;

for (const [key, titulo, per] of CATS) {
  const list = byCat[key];
  if (!list || !list.length) continue;
  const cards = list.map(f =>
    `<div class="card" style="width:${widthFor(per)}">
       <div class="cap">${label(f)}</div>
       <img src="documentos/${f}">
     </div>`).join('');
  body += `<section class="cat">
     <h2 class="cathd">${titulo} <span>(${list.length})</span></h2>
     <div class="grid">${cards}</div>
   </section>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
  body { margin: 0; color: #1a1a1a; }
  .cover { height: 250mm; display: flex; flex-direction: column; align-items: center; justify-content: center;
           text-align: center; page-break-after: always; }
  .cover .logo { font-size: 90px; }
  .cover h1 { font-size: 34px; color: #b8261b; margin: 10px 0 4px; }
  .cover h2 { font-size: 18px; color: #333; font-weight: 600; margin: 0; }
  .cover p { font-size: 14px; color: #666; margin: 8px 0 24px; }
  .cover .idx { font-size: 12px; color: #444; line-height: 1.9; text-align: left; }
  .cover .idx b { color: #b8261b; }
  .cat { page-break-before: always; }
  .cathd { font-size: 17px; color: #fff; background: #b8261b; padding: 8px 14px; border-radius: 6px; margin: 0 0 12px; }
  .cathd span { opacity: .8; font-weight: 400; font-size: 13px; }
  .grid { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; }
  .card { border: 1px solid #ddd; border-radius: 6px; padding: 6px; background: #fff; page-break-inside: avoid; }
  .card .cap { font-size: 9px; color: #777; margin-bottom: 4px; word-break: break-word; }
  .card img { width: 100%; height: auto; display: block; border: 1px solid #eee; }
</style></head><body>${body}</body></html>`;

fs.writeFileSync(OUT_HTML, html, 'utf8');

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const pg = await browser.newPage();
  await pg.goto('file:///' + OUT_HTML.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 120000 });
  await pg.pdf({ path: OUT_PDF, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  await browser.close();
  const kb = Math.round(fs.statSync(OUT_PDF).size / 1024);
  console.log(`PDF generado: ${OUT_PDF} (${kb} KB)`);
  console.log('Categorías:', CATS.filter(([k]) => byCat[k]).map(([k, t]) => `${t}=${byCat[k].length}`).join(' | '));
})().catch(e => { console.error(e); process.exit(1); });
