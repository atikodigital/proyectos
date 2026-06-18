// ============================================================================
//  GENERADOR DE DOCUMENTOS — Pizzería Bella Napoli SpA
//  Renderiza facturas, boletas, comprobantes y cartola a PNG usando Chrome.
// ============================================================================
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const D = require('./data.js');
const { clp, iva, netoDe, ivaDe } = D;

const OUT = path.resolve(__dirname, '..', 'documentos');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const fch = (f) => f.split('-').reverse().join('/'); // 2026-06-04 -> 04/06/2026

// --- Estilos compartidos ---------------------------------------------------
const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600&display=swap');
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}
body{background:#e9edf2}
.doc{width:780px;background:#fff;padding:34px 38px;color:#1a1a1a;font-size:14px;line-height:1.45}
.row{display:flex;justify-content:space-between;gap:18px}
.sii-box{border:2.5px solid #c0182b;border-radius:6px;padding:12px 16px;text-align:center;min-width:240px;color:#c0182b}
.sii-box .rut{font-size:17px;font-weight:700;letter-spacing:.3px}
.sii-box .tipo{font-size:15px;font-weight:700;margin:5px 0;text-transform:uppercase}
.sii-box .folio{font-size:22px;font-weight:800}
.sii-box .sii{font-size:11px;margin-top:4px;color:#c0182b}
.emisor h1{font-size:22px;color:#b8261b;font-weight:800;letter-spacing:.4px}
.emisor .giro{font-size:12px;color:#444;margin-top:2px}
.emisor .meta{font-size:12px;color:#333;margin-top:6px;line-height:1.5}
.logo{width:54px;height:54px;border-radius:12px;background:linear-gradient(135deg,#e3392b,#a51d12);display:inline-flex;align-items:center;justify-content:center;font-size:30px;vertical-align:middle;margin-right:10px}
.hr{border:0;border-top:1.5px solid #ddd;margin:16px 0}
.recep{background:#f7f8fa;border:1px solid #e3e7ec;border-radius:6px;padding:11px 14px;font-size:12.5px;line-height:1.7;margin:14px 0}
.recep b{color:#555;display:inline-block;min-width:120px}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
th{background:#b8261b;color:#fff;text-align:left;padding:8px 10px;font-size:12px;font-weight:600}
th.r,td.r{text-align:right}
td{padding:9px 10px;border-bottom:1px solid #eceff3}
.totales{width:300px;margin-left:auto;margin-top:14px;font-size:14px}
.totales .l{display:flex;justify-content:space-between;padding:6px 2px;border-bottom:1px dashed #e0e0e0}
.totales .tot{font-size:18px;font-weight:800;color:#b8261b;border-bottom:none;padding-top:10px}
.timbre{margin-top:18px;border-top:1px dashed #bbb;padding-top:12px;text-align:center;color:#777;font-size:11px}
.pdf417{height:46px;width:330px;margin:6px auto 4px;background:repeating-linear-gradient(90deg,#222 0,#222 2px,#fff 2px,#fff 3px,#222 3px,#222 4px,#fff 4px,#fff 6px);opacity:.85}
.foot{margin-top:14px;font-size:11px;color:#999;text-align:center}
/* Boleta */
.boleta{width:420px;background:#fff;padding:22px 24px;color:#1a1a1a;font-size:13px}
.boleta .c{text-align:center}
.boleta h2{font-size:17px;font-weight:800;color:#b8261b}
.boleta .dash{border-top:1.5px dashed #999;margin:10px 0}
.boleta table{font-size:12.5px}
.boleta td{padding:4px 2px;border:none}
.boleta .big{font-size:20px;font-weight:800}
/* Comprobante transferencia */
.tef{width:560px;background:#fff;color:#15293f}
.tef .bar{background:#0a3d62;color:#fff;padding:16px 24px;display:flex;align-items:center;gap:12px}
.tef .bar .bk{font-size:19px;font-weight:800;letter-spacing:.5px}
.tef .bar .bk small{display:block;font-size:11px;font-weight:400;opacity:.85}
.tef .body{padding:22px 26px}
.tef h3{font-size:16px;color:#0a3d62;margin-bottom:4px}
.tef .ok{display:inline-block;background:#e7f7ec;color:#1c7a3e;border:1px solid #b6e3c4;border-radius:20px;padding:3px 12px;font-size:12px;font-weight:600;margin-bottom:14px}
.tef .grid{display:grid;grid-template-columns:170px 1fr;gap:9px 14px;font-size:13.5px}
.tef .grid .k{color:#6b7a8d}
.tef .grid .v{font-weight:600;color:#15293f}
.tef .monto{margin-top:18px;background:#f1f5f9;border-radius:8px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center}
.tef .monto .m{font-size:24px;font-weight:800;color:#0a3d62}
.tef .ft{padding:12px 26px;border-top:1px solid #e6ebf0;font-size:11px;color:#90a0b0}
/* Cartola */
.cart{width:820px;background:#fff;color:#15293f;font-size:12.5px}
.cart .bar{background:#0a3d62;color:#fff;padding:18px 26px;display:flex;justify-content:space-between;align-items:center}
.cart .bar .bk{font-size:20px;font-weight:800}
.cart .bar .bk small{display:block;font-size:11px;font-weight:400;opacity:.85}
.cart .info{padding:16px 26px;display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;font-size:12.5px;background:#f6f9fc;border-bottom:1px solid #e3eaf0}
.cart .info b{color:#5a6b7d}
.cart table{font-size:12px}
.cart th{background:#10557f}
.cart td{padding:7px 12px}
.cart tr:nth-child(even){background:#f7fafc}
.cart .neg{color:#c0182b}
.cart .pos{color:#1c7a3e}
.cart .resumen{margin:0;padding:16px 26px;display:flex;gap:30px;background:#f6f9fc;border-top:1px solid #e3eaf0;font-size:13px}
.cart .resumen div b{display:block;font-size:11px;color:#5a6b7d;font-weight:600}
.cart .resumen div span{font-size:16px;font-weight:800;color:#0a3d62}
/* Libro SII */
.libro{width:920px;background:#fff;padding:24px 26px;color:#1a1a1a;font-size:11px}
.libro .lhead{display:flex;justify-content:space-between;border-bottom:2.5px solid #2b6b3f;padding-bottom:10px;margin-bottom:12px}
.libro .t1{font-size:15px;font-weight:800;color:#2b6b3f;letter-spacing:.3px}
.libro .t2{font-size:13px;color:#444;margin-top:2px}
.libro .lhead .meta{text-align:right;font-size:12px;line-height:1.6;color:#333}
.libro table{width:100%;border-collapse:collapse;font-size:10.5px}
.libro th{background:#2b6b3f;color:#fff;padding:6px 7px;text-align:left;font-size:10px;font-weight:600}
.libro th.r,.libro td.r{text-align:right}
.libro td{padding:5px 7px;border-bottom:1px solid #eef1f4}
.libro tr:nth-child(even) td{background:#f6faf7}
.libro .tot td{background:#e3efe8;font-weight:800;border-top:2px solid #2b6b3f}
.libro .lfoot{margin-top:10px;font-size:10px;color:#999;text-align:center}
`;

function page(inner, { foto = false, stageW } = {}) {
  const stage = foto
    ? `<div style="padding:60px;background:
         radial-gradient(circle at 30% 20%,#6b4a2f,#4a3320);min-height:100vh;
         display:flex;align-items:center;justify-content:center">
         <div style="transform:rotate(-1.6deg);box-shadow:0 24px 50px rgba(0,0,0,.55);
           filter:contrast(1.04) brightness(.99)">${inner}</div></div>`
    : `<div style="padding:40px;display:flex;justify-content:center">${inner}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${stage}</body></html>`;
}

// --- Plantilla: FACTURA ELECTRÓNICA ---------------------------------------
function facturaHTML({ folio, fecha, fechaTexto, emisor, receptor, lineas, neto, tipoTexto = 'FACTURA ELECTRÓNICA', refDoc = null, ivaOverride = null, totalOverride = null, exento = false, exentoMonto = 0 }) {
  const rows = lineas.map(l => `<tr><td>${l.det}</td><td class="r">${l.cant || 1}</td><td class="r">${clp(l.precio || neto)}</td></tr>`).join('');
  let totales;
  if (exento) {
    totales = `<div class="l"><span>Monto Exento</span><span>${clp(neto)}</span></div>
      <div class="l"><span>I.V.A.</span><span>${clp(0)}</span></div>
      <div class="l tot"><span>TOTAL</span><span>${clp(neto)}</span></div>`;
  } else if (exentoMonto > 0) {
    const IVA = iva(neto), total = neto + IVA + exentoMonto;
    totales = `<div class="l"><span>Monto Neto Afecto</span><span>${clp(neto)}</span></div>
      <div class="l"><span>Monto Exento</span><span>${clp(exentoMonto)}</span></div>
      <div class="l"><span>I.V.A. (19%)</span><span>${clp(IVA)}</span></div>
      <div class="l tot"><span>TOTAL</span><span>${clp(total)}</span></div>`;
  } else {
    const IVA = ivaOverride != null ? ivaOverride : iva(neto);
    const total = totalOverride != null ? totalOverride : neto + IVA;
    totales = `<div class="l"><span>Monto Neto</span><span>${clp(neto)}</span></div>
      <div class="l"><span>I.V.A. (19%)</span><span>${clp(IVA)}</span></div>
      <div class="l tot"><span>TOTAL</span><span>${clp(total)}</span></div>`;
  }
  const esBella = emisor.rut === D.EMPRESA.rut;
  return `<div class="doc">
    <div class="row">
      <div class="emisor">
        <h1>${esBella ? '<span class="logo">🍕</span>' : ''}${emisor.razon}</h1>
        <div class="giro">Giro: ${emisor.giro}</div>
        <div class="meta">${emisor.dir}<br>${emisor.comuna || ''}${emisor.fono ? ' · Fono: ' + emisor.fono : ''}</div>
      </div>
      <div class="sii-box">
        <div class="rut">R.U.T.: ${emisor.rut}</div>
        <div class="tipo">${tipoTexto}</div>
        <div class="folio">N° ${folio}</div>
        <div class="sii">S.I.I. - SANTIAGO</div>
      </div>
    </div>
    <hr class="hr">
    <div class="recep">
      <div><b>Señor(es):</b> ${receptor.razon}</div>
      <div><b>R.U.T.:</b> ${receptor.rut}</div>
      <div><b>Giro:</b> ${receptor.giro || '—'}</div>
      <div><b>Dirección:</b> ${receptor.dir || '—'}, ${receptor.comuna || ''}</div>
      <div><b>Fecha Emisión:</b> ${fechaTexto || fch(fecha)}</div>
      ${refDoc ? `<div><b>Referencia:</b> ${refDoc}</div>` : ''}
    </div>
    <table>
      <tr><th>Detalle</th><th class="r">Cant.</th><th class="r">Valor</th></tr>
      ${rows}
    </table>
    <div class="totales">
      ${totales}
    </div>
    <div class="timbre">
      <div class="pdf417"></div>
      Timbre Electrónico SII — Res. 80 de 2014 · Verifique documento en www.sii.cl
    </div>
    <div class="foot">Documento Tributario Electrónico generado para pruebas — Bella Napoli</div>
  </div>`;
}

// --- Plantilla: BOLETA ELECTRÓNICA ----------------------------------------
function boletaHTML({ folio, fecha, emisor, glosa, total, tipoTexto = 'BOLETA ELECTRÓNICA' }) {
  const neto = netoDe(total), IVA = ivaDe(total);
  return `<div class="boleta">
    <div class="c"><h2>${emisor.razon}</h2>
      <div style="font-size:11px;color:#555">${emisor.giro}<br>${emisor.dir}<br>R.U.T.: ${emisor.rut}</div>
    </div>
    <div class="dash"></div>
    <div class="c" style="font-weight:700">${tipoTexto}<br>N° ${folio}</div>
    <div style="font-size:12px;margin-top:6px">Fecha: ${fch(fecha)}</div>
    <div class="dash"></div>
    <table><tr><td>${glosa}</td><td style="text-align:right">${clp(total)}</td></tr></table>
    <div class="dash"></div>
    <table>
      <tr><td>Neto</td><td style="text-align:right">${clp(neto)}</td></tr>
      <tr><td>IVA 19%</td><td style="text-align:right">${clp(IVA)}</td></tr>
      <tr><td class="big">TOTAL</td><td class="big" style="text-align:right">${clp(total)}</td></tr>
    </table>
    <div class="dash"></div>
    <div class="pdf417" style="width:260px;height:38px"></div>
    <div class="c" style="font-size:10px;color:#888">Timbre Electrónico SII · www.sii.cl<br>¡Gracias por su compra!</div>
  </div>`;
}

// --- Plantilla: COMPROBANTE DE TRANSFERENCIA ------------------------------
function tefHTML({ nop, fecha, emisor, destNombre, destRut, destBanco, glosa, monto }) {
  return `<div class="tef">
    <div class="bar"><div class="bk">Banco de Chile<small>Banca en Línea</small></div></div>
    <div class="body">
      <h3>Comprobante de Transferencia</h3>
      <div class="ok">✓ Transferencia exitosa</div>
      <div class="grid">
        <div class="k">Fecha y hora</div><div class="v">${fch(fecha)} 10:${(nop%60).toString().padStart(2,'0')} hrs</div>
        <div class="k">N° de operación</div><div class="v">${nop}</div>
        <div class="k">Origen</div><div class="v">${emisor.razon}</div>
        <div class="k">Cuenta origen</div><div class="v">Cta. Corriente ${emisor.cuenta}</div>
        <div class="k">Destinatario</div><div class="v">${destNombre}</div>
        <div class="k">RUT destinatario</div><div class="v">${destRut}</div>
        <div class="k">Banco destino</div><div class="v">${destBanco}</div>
        <div class="k">Comentario</div><div class="v">${glosa}</div>
      </div>
      <div class="monto"><span>Monto transferido</span><span class="m">${clp(monto)}</span></div>
    </div>
    <div class="ft">Comprobante generado para pruebas · Banco de Chile · No es un documento tributario</div>
  </div>`;
}

// --- Plantilla: COMPROBANTE DE DEPÓSITO -----------------------------------
function depositoHTML({ fecha, emisor, glosa, monto }) {
  return `<div class="tef">
    <div class="bar"><div class="bk">Banco de Chile<small>Depósito en efectivo</small></div></div>
    <div class="body">
      <h3>Comprobante de Depósito</h3>
      <div class="ok">✓ Depósito recibido</div>
      <div class="grid">
        <div class="k">Fecha y hora</div><div class="v">${fch(fecha)} 18:45 hrs</div>
        <div class="k">Cuenta destino</div><div class="v">Cta. Corriente ${emisor.cuenta}</div>
        <div class="k">Titular</div><div class="v">${emisor.razon}</div>
        <div class="k">Detalle</div><div class="v">${glosa}</div>
        <div class="k">Tipo</div><div class="v">Efectivo</div>
        <div class="k">Acreditación</div><div class="v">Próximo día hábil</div>
      </div>
      <div class="monto"><span>Monto depositado</span><span class="m">${clp(monto)}</span></div>
    </div>
    <div class="ft">Comprobante generado para pruebas · Banco de Chile</div>
  </div>`;
}

// --- Plantilla: CARTOLA BANCARIA ------------------------------------------
function cartolaHTML() {
  let saldo = D.SALDO_INICIAL, totAbono = 0, totCargo = 0;
  const rows = D.CARTOLA.map(m => {
    saldo += (m.abono || 0) - (m.cargo || 0);
    totAbono += m.abono || 0; totCargo += m.cargo || 0;
    return `<tr>
      <td>${fch(m.fecha)}</td><td>${m.desc}</td>
      <td class="r neg">${m.cargo ? clp(m.cargo) : ''}</td>
      <td class="r pos">${m.abono ? clp(m.abono) : ''}</td>
      <td class="r">${clp(saldo)}</td></tr>`;
  }).join('');
  return `<div class="cart">
    <div class="bar"><div class="bk">Banco de Chile<small>Cartola Cuenta Corriente</small></div>
      <div style="text-align:right;font-size:12px">Período<br><b>01/06/2026 — 30/06/2026</b></div></div>
    <div class="info">
      <div><b>Titular:</b> ${D.EMPRESA.razon}</div><div><b>RUT:</b> ${D.EMPRESA.rut}</div>
      <div><b>Cuenta:</b> ${D.EMPRESA.cuenta}</div><div><b>Tipo:</b> Cuenta Corriente</div>
      <div><b>Saldo inicial:</b> ${clp(D.SALDO_INICIAL)}</div><div><b>Saldo final:</b> ${clp(saldo)}</div>
    </div>
    <table>
      <tr><th>Fecha</th><th>Descripción</th><th class="r">Cargo</th><th class="r">Abono</th><th class="r">Saldo</th></tr>
      ${rows}
    </table>
    <div class="resumen">
      <div><b>Total Cargos</b><span>${clp(totCargo)}</span></div>
      <div><b>Total Abonos</b><span>${clp(totAbono)}</span></div>
      <div><b>Saldo Final 30/06</b><span>${clp(saldo)}</span></div>
    </div>
    <div class="ft" style="padding:12px 26px;font-size:11px;color:#90a0b0">Cartola generada para pruebas · Banco de Chile</div>
  </div>`;
}

// ============================================================================
//  CASOS DE ERROR (documentos "difíciles" para estresar el OCR)
// ============================================================================
function errScene(docHtml, { filter = '', transform = 'rotate(-1.6deg)', overlay = '', h = null, align = 'center', bg } = {}) {
  const back = bg || 'radial-gradient(circle at 38% 22%,#5e4631,#3a2a1c)';
  const clip = h ? `height:${h}px;` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>
    <div class="scene" style="position:relative;overflow:hidden;${clip}padding:70px;display:flex;
      align-items:${align};justify-content:center;background:${back}">
      <div style="filter:${filter};transform:${transform};box-shadow:0 24px 50px rgba(0,0,0,.55)">${docHtml}</div>
      ${overlay}
    </div></body></html>`;
}

// Boleta escrita a mano (OCR de manuscrito = difícil)
function boletaManuscritaHTML() {
  return `<div class="boleta" style="width:430px;background:#fffdf3;font-family:'Caveat',cursive;color:#1b2a4a">
    <div class="c"><h2 style="color:#1c3a6b;font-family:inherit;font-size:26px">Pizzeria Bella Napoli</h2>
      <div style="font-size:19px">Boleta a mano  N° 045</div></div>
    <div class="dash"></div>
    <div style="font-size:23px;line-height:1.9;padding:4px 10px;font-family:inherit">
      2 pizzas medianas ....... 17.000<br>
      1 bebida 1.5 lt ......... 2.500<br>
      <span style="border-top:1px solid #333;display:inline-block;width:90%;margin-top:6px"></span><br>
      TOTAL .......... $ 19.500
    </div>
    <div class="dash"></div>
    <div style="font-size:14px;padding:0 6px">Fecha: 14 / 06 / 2026<br>Atendio: Maria</div>
  </div>`;
}

// "Foto" que NO es un documento (el usuario subió la foto equivocada)
function noDocHTML() {
  return `<div style="width:520px;height:380px;border-radius:10px;
    background:radial-gradient(circle at 50% 45%,#e8c98f 0 32%,#caa46c 33% 52%,#9c7741 53%);
    display:flex;align-items:center;justify-content:center;font-size:230px">🍕</div>`;
}

// Boleta de Honorarios Electrónica (persona natural, con retención)
function bheHTML({ folio, fecha, emisor, receptor, bruto, retPct = 13.75, detalle }) {
  const ret = Math.round(bruto * retPct / 100), liquido = bruto - ret;
  return `<div class="doc">
    <div class="row">
      <div class="emisor">
        <h1 style="color:#1c6b3a">${emisor.nombre}</h1>
        <div class="giro">${emisor.profesion}</div>
        <div class="meta">${emisor.dir}<br>R.U.T.: ${emisor.rut}</div>
      </div>
      <div class="sii-box" style="border-color:#1c6b3a;color:#1c6b3a">
        <div class="rut" style="color:#1c6b3a">R.U.T.: ${emisor.rut}</div>
        <div class="tipo">BOLETA HONORARIOS ELECTRÓNICA</div>
        <div class="folio" style="color:#1c6b3a">N° ${folio}</div>
        <div class="sii" style="color:#1c6b3a">S.I.I. - SANTIAGO</div>
      </div>
    </div>
    <hr class="hr">
    <div class="recep">
      <div><b>Por atención a:</b> ${receptor.razon}</div>
      <div><b>R.U.T.:</b> ${receptor.rut}</div>
      <div><b>Domicilio:</b> ${receptor.dir}, ${receptor.comuna || ''}</div>
      <div><b>Fecha:</b> ${fch(fecha)}</div>
    </div>
    <table>
      <tr><th>Detalle del servicio</th><th class="r">Valor</th></tr>
      <tr><td>${detalle}</td><td class="r">${clp(bruto)}</td></tr>
    </table>
    <div class="totales">
      <div class="l"><span>Total Honorarios (bruto)</span><span>${clp(bruto)}</span></div>
      <div class="l"><span>Retención (${String(retPct).replace('.', ',')}%)</span><span>− ${clp(ret)}</span></div>
      <div class="l tot" style="color:#1c6b3a"><span>LÍQUIDO A PAGAR</span><span>${clp(liquido)}</span></div>
    </div>
    <div class="timbre"><div class="pdf417"></div>Boleta de Honorarios Electrónica · Verifique en www.sii.cl</div>
  </div>`;
}

// Estado de cuenta de Tarjeta de Crédito (NO es cartola ni documento tributario)
function tarjetaHTML() {
  const movs = [
    ['03/06/2026', 'SUPERMERCADO LIDER PROVIDENCIA', 45900],
    ['07/06/2026', 'PARIS - MENAJE COCINA', 129000],
    ['12/06/2026', 'COPEC ESTACION ITALIA', 38000],
    ['19/06/2026', 'SODIMAC HOMECENTER', 86500],
    ['24/06/2026', 'MERCADO LIBRE *INSUMOS PIZZA', 54200],
  ];
  const total = movs.reduce((a, m) => a + m[2], 0);
  const rows = movs.map(m => `<tr><td>${m[0]}</td><td>${m[1]}</td><td class="r">${clp(m[2])}</td></tr>`).join('');
  return `<div class="doc">
    <div class="row">
      <div class="emisor">
        <h1 style="color:#0a3d62">Banco de Chile</h1>
        <div class="giro">Estado de Cuenta · Tarjeta de Crédito Visa</div>
        <div class="meta">Titular: ${D.EMPRESA.razon}<br>Tarjeta N° **** **** **** 1234</div>
      </div>
      <div class="sii-box" style="border-color:#0a3d62;color:#0a3d62">
        <div class="tipo">PERÍODO</div>
        <div class="folio" style="color:#0a3d62;font-size:16px">Junio 2026</div>
        <div class="sii" style="color:#0a3d62">Vence: 05/07/2026</div>
      </div>
    </div>
    <hr class="hr">
    <table>
      <tr><th>Fecha</th><th>Comercio</th><th class="r">Monto</th></tr>
      ${rows}
    </table>
    <div class="totales">
      <div class="l"><span>Total facturado</span><span>${clp(total)}</span></div>
      <div class="l"><span>Pago mínimo</span><span>${clp(Math.round(total * 0.05))}</span></div>
      <div class="l tot" style="color:#0a3d62"><span>TOTAL A PAGAR</span><span>${clp(total)}</span></div>
    </div>
    <div class="foot">Estado de cuenta generado para pruebas · No es un documento tributario</div>
  </div>`;
}

// Boleta de venta con propina (la propina no es venta afecta a IVA)
function boletaPropinaHTML() {
  const sub = 38000, propina = Math.round(sub * 0.10), total = sub + propina;
  return `<div class="boleta">
    <div class="c"><h2>${D.EMPRESA.razon}</h2>
      <div style="font-size:11px;color:#555">${D.EMPRESA.giro}<br>${D.EMPRESA.dir}<br>R.U.T.: ${D.EMPRESA.rut}</div></div>
    <div class="dash"></div>
    <div class="c" style="font-weight:700">BOLETA ELECTRÓNICA<br>N° 1150</div>
    <div style="font-size:12px;margin-top:6px">Fecha: 28/06/2026</div>
    <div class="dash"></div>
    <table>
      <tr><td>2 Pizza Familiar + Bebida</td><td style="text-align:right">${clp(sub)}</td></tr>
      <tr><td>Propina sugerida (10%)</td><td style="text-align:right">${clp(propina)}</td></tr>
    </table>
    <div class="dash"></div>
    <table>
      <tr><td>Neto</td><td style="text-align:right">${clp(netoDe(sub))}</td></tr>
      <tr><td>IVA 19%</td><td style="text-align:right">${clp(ivaDe(sub))}</td></tr>
      <tr><td class="big">TOTAL</td><td class="big" style="text-align:right">${clp(total)}</td></tr>
    </table>
    <div class="dash"></div>
    <div class="c" style="font-size:10px;color:#888">La propina (${clp(propina)}) no constituye venta afecta a IVA<br>Timbre Electrónico SII</div>
  </div>`;
}

// Cartola de casos especiales para conciliación avanzada (Suite C)
function cartolaCasosHTML() {
  const saldoIni = 1000000;
  const movs = [
    { fecha: '2026-07-01', desc: 'TRANSF RECIBIDA EVENTOS DEL SUR', abono: 914000 },
    { fecha: '2026-07-02', desc: 'ABONO PARCIAL CLINICA VIDA PLENA', abono: 300000 },
    { fecha: '2026-07-03', desc: 'PAGO PROVEEDOR ABASTIBLE SA', cargo: 113050 },
    { fecha: '2026-07-03', desc: 'PAGO PROVEEDOR ABASTIBLE SA', cargo: 113050 },
    { fecha: '2026-07-04', desc: 'TRANSFERENCIA A CUENTA PROPIA AHORRO', cargo: 500000 },
    { fecha: '2026-07-05', desc: 'PAGO PROVEEDOR FERRETERIA EL CLAVO', cargo: 168000 },
  ];
  let saldo = saldoIni, totAbono = 0, totCargo = 0;
  const rows = movs.map(m => {
    saldo += (m.abono || 0) - (m.cargo || 0); totAbono += m.abono || 0; totCargo += m.cargo || 0;
    return `<tr><td>${fch(m.fecha)}</td><td>${m.desc}</td>
      <td class="r neg">${m.cargo ? clp(m.cargo) : ''}</td>
      <td class="r pos">${m.abono ? clp(m.abono) : ''}</td>
      <td class="r">${clp(saldo)}</td></tr>`;
  }).join('');
  return `<div class="cart">
    <div class="bar"><div class="bk">Banco de Chile<small>Cartola — Casos de estudio</small></div>
      <div style="text-align:right;font-size:12px">Período<br><b>01/07/2026 — 05/07/2026</b></div></div>
    <div class="info">
      <div><b>Titular:</b> ${D.EMPRESA.razon}</div><div><b>RUT:</b> ${D.EMPRESA.rut}</div>
      <div><b>Cuenta:</b> ${D.EMPRESA.cuenta}</div><div><b>Saldo inicial:</b> ${clp(saldoIni)}</div>
    </div>
    <table>
      <tr><th>Fecha</th><th>Descripción</th><th class="r">Cargo</th><th class="r">Abono</th><th class="r">Saldo</th></tr>
      ${rows}
    </table>
    <div class="resumen">
      <div><b>Total Cargos</b><span>${clp(totCargo)}</span></div>
      <div><b>Total Abonos</b><span>${clp(totAbono)}</span></div>
      <div><b>Saldo Final</b><span>${clp(saldo)}</span></div>
    </div>
    <div class="ft" style="padding:12px 26px;font-size:11px;color:#90a0b0">Cartola generada para pruebas · Banco de Chile</div>
  </div>`;
}

// Voucher de pago con tarjeta (Transbank / Redcompra). El banco abona NETO de comisión.
function voucherTarjetaHTML({ fecha, hora, monto, tipo = 'CREDITO', tarjeta = '1234', nop, autoriz }) {
  return `<div class="boleta" style="width:320px;font-family:'Courier New',monospace;background:#fff">
    <div class="c" style="font-family:inherit">
      <div style="font-weight:700;font-size:16px">TRANSBANK</div>
      <div style="font-size:12px">COMPROBANTE DE VENTA · REDCOMPRA</div>
    </div>
    <div class="dash"></div>
    <div style="font-size:12px;line-height:1.75;font-family:inherit">
      COMERCIO: PIZZERIA BELLA NAPOLI<br>
      RUT: ${D.EMPRESA.rut}<br>
      DIR: AV ITALIA 1234, PROVIDENCIA<br>
      FECHA: ${fch(fecha)}  HORA: ${hora}<br>
      ------------------------------<br>
      TARJETA: ************${tarjeta}<br>
      TIPO: ${tipo}<br>
      COD. AUTORIZACION: ${autoriz}<br>
      N° OPERACION: ${nop}<br>
      ------------------------------<br>
      <span style="font-size:17px;font-weight:700">MONTO: ${clp(monto)}</span><br>
      ------------------------------
    </div>
    <div class="c" style="font-size:11px;font-family:inherit;margin-top:6px">ABONO A 1 DIA HABIL (NETO DE COMISION)<br>*** GRACIAS POR SU COMPRA ***</div>
  </div>`;
}

// Libro de Compras / Ventas SII (Registro de Compras y Ventas)
function libroSiiHTML({ tipo, periodo, rows }) {
  let tn = 0, ti = 0, tt = 0;
  const trs = rows.map((r, idx) => {
    const neto = r.neto;
    const iv = r.iva != null ? r.iva : iva(neto);
    const tot = r.total != null ? r.total : neto + iv;
    tn += neto; ti += iv; tt += tot;
    return `<tr><td>${idx + 1}</td><td>${r.tipoCod}</td><td>${r.tipoNom}</td><td>${r.rut}</td><td>${r.razon}</td><td class="r">${r.folio}</td><td>${r.fecha}</td><td class="r">${clp(neto)}</td><td class="r">${clp(iv)}</td><td class="r">${clp(tot)}</td></tr>`;
  }).join('');
  return `<div class="libro">
    <div class="lhead">
      <div><div class="t1">SERVICIO DE IMPUESTOS INTERNOS</div>
        <div class="t2">Registro de ${tipo === 'COMPRAS' ? 'Compras' : 'Ventas'} — Libro de ${tipo === 'COMPRAS' ? 'Compras' : 'Ventas'}</div></div>
      <div class="meta"><b>${D.EMPRESA.razon}</b><br>RUT: ${D.EMPRESA.rut}<br>Período Tributario: ${periodo}</div>
    </div>
    <table>
      <tr><th>N°</th><th>Tipo</th><th>Documento</th><th>RUT</th><th>Razón Social</th><th class="r">Folio</th><th>Fecha</th><th class="r">Neto</th><th class="r">IVA</th><th class="r">Total</th></tr>
      ${trs}
      <tr class="tot"><td colspan="7">TOTALES (${rows.length} documentos)</td><td class="r">${clp(tn)}</td><td class="r">${clp(ti)}</td><td class="r">${clp(tt)}</td></tr>
    </table>
    <div class="lfoot">Registro de Compras y Ventas (RCV) generado para pruebas · www.sii.cl</div>
  </div>`;
}

// ============================================================================
//  RENDER
// ============================================================================
async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const jobs = [];
  const pad = (n) => String(n).padStart(2, '0');
  let i = 0;

  // Compras (facturas/boletas recibidas)
  D.COMPRAS.forEach(c => {
    const neto = c.neto != null ? c.neto : netoDe(c.total);
    const esBoleta = c.tipoDoc === 'boleta';
    const file = `${pad(++i)}_compra_${c.prov.razon.split(' ')[0].toLowerCase()}_${c.folio}.png`;
    const html = esBoleta
      ? page(boletaHTML({ folio: c.folio, fecha: c.fecha, emisor: c.prov, glosa: c.glosa, total: neto + iva(neto), tipoTexto: 'BOLETA' }), { foto: c.foto })
      : page(facturaHTML({ folio: c.folio, fecha: c.fecha, emisor: c.prov, receptor: D.EMPRESA, neto, lineas: [{ det: c.glosa, precio: neto }] }), { foto: c.foto });
    jobs.push({ file, html });
  });

  // Facturas emitidas (ventas a empresas)
  D.FACTURAS_EMITIDAS.forEach(f => {
    const file = `${pad(++i)}_venta_factura_${f.folio}.png`;
    const html = page(facturaHTML({ folio: f.folio, fecha: f.fecha, emisor: D.EMPRESA, receptor: f.cli, neto: f.neto, lineas: [{ det: f.glosa, precio: f.neto }] }));
    jobs.push({ file, html });
  });

  // Boletas emitidas (ventas público)
  D.BOLETAS_EMITIDAS.forEach(b => {
    const file = `${pad(++i)}_venta_boleta_${b.folio}.png`;
    const html = page(boletaHTML({ folio: b.folio, fecha: b.fecha, emisor: D.EMPRESA, glosa: b.glosa, total: b.total }), { foto: b.foto });
    jobs.push({ file, html });
  });

  // Comprobantes de transferencia
  D.TRANSFERENCIAS.forEach(t => {
    const tag = t.destNombre.split(' ')[0].toLowerCase();
    const file = `${pad(++i)}_transf_${tag}_${t.nop}.png`;
    const html = page(tefHTML({ ...t, emisor: D.EMPRESA }), { foto: t.foto });
    jobs.push({ file, html });
  });

  // Depósito en tránsito
  {
    const file = `${pad(++i)}_deposito_transito.png`;
    const html = page(depositoHTML({ ...D.DEPOSITO_TRANSITO, emisor: D.EMPRESA }));
    jobs.push({ file, html });
  }

  // Cartola bancaria
  {
    const file = `${pad(++i)}_cartola_banco_chile_junio.png`;
    jobs.push({ file, html: page(cartolaHTML()) });
  }

  // --- CASOS DE ERROR -------------------------------------------------------
  const facSoprole = facturaHTML({ folio: 88231, fecha: '2026-06-05', emisor: D.PROV.soprole, receptor: D.EMPRESA, neto: 520000, lineas: [{ det: 'Queso mozzarella 5 kg x 24', precio: 520000 }] });
  const facAndina  = facturaHTML({ folio: 220145, fecha: '2026-06-06', emisor: D.PROV.andina, receptor: D.EMPRESA, neto: 240000, lineas: [{ det: 'Bebidas 1.5L y latas (surtido)', precio: 240000 }] });
  const facAbast   = facturaHTML({ folio: 7781, fecha: '2026-06-07', emisor: D.PROV.abastible, receptor: D.EMPRESA, neto: 95000, lineas: [{ det: 'Gas licuado cilindro 45 kg x 2', precio: 95000 }] });
  const facMolinera= facturaHTML({ folio: 1287, fecha: '2026-06-04', emisor: D.PROV.molinera, receptor: D.EMPRESA, neto: 380000, lineas: [{ det: 'Harina panadera 25 kg x 20 sacos', precio: 380000 }] });
  const facClinica = facturaHTML({ folio: 124, fecha: '2026-06-24', emisor: D.EMPRESA, receptor: D.CLI.clinica, neto: 510000, lineas: [{ det: 'Coffee/almuerzo jornada - 35 pizzas', precio: 510000 }] });
  const boletaCopec= boletaHTML({ folio: 30551, fecha: '2026-06-08', emisor: D.PROV.copec, glosa: 'Bencina 93 - delivery', total: 40000, tipoTexto: 'BOLETA' });

  const errores = [
    { file: 'error_borrosa_factura.png',   html: errScene(facSoprole, { filter: 'blur(4px) contrast(.95)' }) },
    { file: 'error_oscura_factura.png',    html: errScene(facAndina,  { filter: 'brightness(.32) contrast(1.15)', transform: 'rotate(2deg)' }) },
    { file: 'error_reflejo_factura.png',   html: errScene(facAbast,   { filter: 'brightness(1.45) contrast(.78)', overlay: '<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 65% 30%,rgba(255,255,255,.92) 0,rgba(255,255,255,0) 38%)"></div>' }) },
    { file: 'error_cortada_falta_total.png', html: errScene(facMolinera, { transform: 'rotate(-2.5deg) translateY(-15px)', h: 420, align: 'flex-start' }) },
    { file: 'error_dedo_tapa_total.png',   html: errScene(facClinica, { transform: 'rotate(1.2deg)', overlay: '<div style="position:absolute;right:120px;bottom:120px;width:150px;height:230px;border-radius:60px;transform:rotate(24deg);background:radial-gradient(circle at 40% 30%,#e8b48f,#c98a63);box-shadow:0 6px 14px rgba(0,0,0,.4)"></div>' }) },
    { file: 'error_boleta_manuscrita.png', html: errScene(boletaManuscritaHTML(), { transform: 'rotate(-1deg)', bg: 'linear-gradient(135deg,#8a8f96,#5b6168)' }) },
    { file: 'error_arrugada.png',          html: errScene(boletaCopec, { filter: 'contrast(1.08) brightness(.96)', transform: 'rotate(-2deg) skewY(-1.5deg)', overlay: '<div style="position:absolute;inset:0;mix-blend-mode:multiply;background:linear-gradient(115deg,rgba(0,0,0,.18) 0,transparent 14%,rgba(255,255,255,.25) 28%,transparent 42%,rgba(0,0,0,.16) 60%,transparent 75%,rgba(0,0,0,.12) 92%)"></div>' }) },
    { file: 'error_no_es_documento.png',   html: errScene(noDocHTML(), { transform: 'rotate(.5deg)' }) },
  ];
  errores.forEach(e => jobs.push({ file: `${pad(++i)}_${e.file}`, html: e.html, scene: true }));

  // ========================================================================
  //  CASOS DE ESTUDIO (suites A, B, C, D)
  // ========================================================================
  const hornos     = { razon: 'COMERCIAL HORNOS INDUSTRIALES SpA', rutBody: 76889900, giro: 'Venta de equipamiento gastronómico', dir: 'Av. Vicuña Mackenna 3900, San Joaquín', comuna: 'San Joaquín' };
  const restoJardin= { razon: 'RESTAURANT EL JARDÍN LTDA', rutBody: 76554433, giro: 'Restaurante', dir: 'Av. Las Condes 12000, Las Condes', comuna: 'Las Condes' };
  const eventosSur = { razon: 'EVENTOS DEL SUR SpA', rutBody: 76223344, giro: 'Producción de eventos', dir: "O'Higgins 450, Rancagua", comuna: 'Rancagua' };
  const seguros    = { razon: 'SEGUROS DEL ESTADO S.A.', rutBody: 99012345, giro: 'Seguros generales', dir: 'Av. Apoquindo 4500, Las Condes', comuna: 'Las Condes' };
  [hornos, restoJardin, eventosSur, seguros].forEach(e => (e.rut = D.rut(e.rutBody)));
  const contador = { nombre: 'JUAN CARLOS FUENTES PÉREZ', rutBody: 13456789, profesion: 'Contador Auditor', dir: 'Av. Matta 880, Santiago Centro' };
  contador.rut = D.rut(contador.rutBody);
  let kBody = 20000001; while (D.dv(kBody) !== 'K') kBody++;
  const importadora = { razon: 'IMPORTADORA SAN JORGE LTDA', rut: D.rut(kBody), giro: 'Importación de abarrotes', dir: 'Av. Américo Vespucio 1500, Quilicura', comuna: 'Quilicura' };
  const provRutMalo = { ...D.PROV.molinera, rut: '78.901.234-5' }; // DV correcto es -2

  const casos = [
    // --- Suite A: correctitud contable ---
    { f: 'A1_nota_credito_recibida.png', html: page(facturaHTML({ folio: 9501, fecha: '2026-06-20', emisor: D.PROV.soprole, receptor: D.EMPRESA, neto: 80000, tipoTexto: 'NOTA DE CRÉDITO ELECTRÓNICA', refDoc: 'Factura N° 88231 — devolución parcial', lineas: [{ det: 'Devolución 4 cajas queso en mal estado', precio: 80000 }] })) },
    { f: 'A2_nota_credito_emitida.png', html: page(facturaHTML({ folio: 130, fecha: '2026-06-18', emisor: D.EMPRESA, receptor: D.CLI.colegio, neto: 50000, tipoTexto: 'NOTA DE CRÉDITO ELECTRÓNICA', refDoc: 'Factura N° 122 — 5 pizzas no entregadas', lineas: [{ det: 'Devolución 5 pizzas no entregadas', precio: 50000 }] })) },
    { f: 'A3_nota_debito_recibida.png', html: page(facturaHTML({ folio: 4410, fecha: '2026-06-21', emisor: D.PROV.andina, receptor: D.EMPRESA, neto: 30000, tipoTexto: 'NOTA DE DÉBITO ELECTRÓNICA', refDoc: 'Factura N° 220145 — reajuste de precio', lineas: [{ det: 'Reajuste de precio bebidas', precio: 30000 }] })) },
    { f: 'A4_factura_exenta.png', html: page(facturaHTML({ folio: 7120, fecha: '2026-06-09', emisor: seguros, receptor: D.EMPRESA, neto: 300000, tipoTexto: 'FACTURA EXENTA ELECTRÓNICA', exento: true, lineas: [{ det: 'Prima seguro local comercial (servicio exento)', precio: 300000 }] })) },
    { f: 'A5_boleta_honorarios.png', html: page(bheHTML({ folio: 215, fecha: '2026-06-15', emisor: contador, receptor: D.EMPRESA, bruto: 200000, detalle: 'Servicios contables junio 2026' })) },
    { f: 'A6_factura_mixta_afecta_exenta.png', html: page(facturaHTML({ folio: 8830, fecha: '2026-06-16', emisor: D.PROV.vega, receptor: D.EMPRESA, neto: 200000, exentoMonto: 100000, lineas: [{ det: 'Verduras afectas $200.000 + frutas exentas $100.000', precio: 300000 }] })) },

    // --- Suite B: validación OCR ---
    { f: 'B1_rut_invalido.png', html: page(facturaHTML({ folio: 1290, fecha: '2026-06-10', emisor: provRutMalo, receptor: D.EMPRESA, neto: 150000, lineas: [{ det: 'Harina integral 25 kg x 8', precio: 150000 }] })) },
    { f: 'B2_total_no_cuadra.png', html: page(facturaHTML({ folio: 6651, fecha: '2026-06-11', emisor: D.PROV.envases, receptor: D.EMPRESA, neto: 100000, ivaOverride: 19000, totalOverride: 130000, lineas: [{ det: 'Cajas pizza 33cm x 600', precio: 100000 }] })) },
    { f: 'B3_fecha_en_texto.png', html: page(facturaHTML({ folio: 1305, fecha: '2026-06-04', fechaTexto: '4 de junio de 2026', emisor: D.PROV.molinera, receptor: D.EMPRESA, neto: 170000, lineas: [{ det: 'Harina panadera 25 kg x 9', precio: 170000 }] })) },
    { f: 'B4_rut_con_K.png', html: page(facturaHTML({ folio: 5521, fecha: '2026-06-12', emisor: importadora, receptor: D.EMPRESA, neto: 240000, lineas: [{ det: 'Aceitunas y pepperoni importado', precio: 240000 }] })) },
    { f: 'B5_factura_fuera_periodo.png', html: page(facturaHTML({ folio: 1360, fecha: '2026-07-03', emisor: D.PROV.soprole, receptor: D.EMPRESA, neto: 220000, lineas: [{ det: 'Queso mozzarella (factura de JULIO)', precio: 220000 }] })) },
    { f: 'B6a_mismo_folio_vega.png', html: page(facturaHTML({ folio: 5000, fecha: '2026-06-13', emisor: D.PROV.vega, receptor: D.EMPRESA, neto: 90000, lineas: [{ det: 'Verduras varias', precio: 90000 }] })) },
    { f: 'B6b_mismo_folio_copec.png', html: page(boletaHTML({ folio: 5000, fecha: '2026-06-13', emisor: D.PROV.copec, glosa: 'Bencina 93 - delivery', total: 30000, tipoTexto: 'BOLETA' })) },
    { f: 'B7a_mismo_monto_dia1.png', html: page(facturaHTML({ folio: 1377, fecha: '2026-06-03', emisor: D.PROV.molinera, receptor: D.EMPRESA, neto: 200000, lineas: [{ det: 'Harina panadera 25 kg x 10', precio: 200000 }] })) },
    { f: 'B7b_mismo_monto_dia2.png', html: page(facturaHTML({ folio: 1402, fecha: '2026-06-17', emisor: D.PROV.molinera, receptor: D.EMPRESA, neto: 200000, lineas: [{ det: 'Harina panadera 25 kg x 10', precio: 200000 }] })) },

    // --- Suite C: conciliación avanzada ---
    { f: 'C1a_factura_eventos_1.png', html: page(facturaHTML({ folio: 127, fecha: '2026-06-26', emisor: D.EMPRESA, receptor: eventosSur, neto: 320000, lineas: [{ det: 'Pizzas evento corporativo (parte 1)', precio: 320000 }] })) },
    { f: 'C1b_factura_eventos_2.png', html: page(facturaHTML({ folio: 128, fecha: '2026-06-26', emisor: D.EMPRESA, receptor: eventosSur, neto: 448067, lineas: [{ det: 'Pizzas evento corporativo (parte 2)', precio: 448067 }] })) },
    { f: 'C_cartola_casos_especiales.png', html: page(cartolaCasosHTML()) },

    // --- Suite D: negocio pizzería ---
    { f: 'D1_activo_fijo_horno.png', html: page(facturaHTML({ folio: 3015, fecha: '2026-06-14', emisor: hornos, receptor: D.EMPRESA, neto: 2500000, lineas: [{ det: 'Horno pizzero industrial a gas, 2 cámaras', precio: 2500000 }] })) },
    { f: 'D2_gasto_no_deducible.png', html: page(boletaHTML({ folio: 7788, fecha: '2026-06-15', emisor: restoJardin, glosa: 'Almuerzo personal (4 personas)', total: 95000, tipoTexto: 'BOLETA' }), { foto: true }) },
    { f: 'D3_estado_tarjeta_credito.png', html: page(tarjetaHTML()) },
    { f: 'D4_boleta_con_propina.png', html: page(boletaPropinaHTML()) },
  ];
  casos.forEach(c => jobs.push({ file: `${pad(++i)}_caso_${c.f}`, html: c.html }));

  // ========================================================================
  //  INSUMOS DE PIZZERÍA (compras adicionales, pagadas en EFECTIVO → no tocan la cartola)
  // ========================================================================
  const donVito   = { razon: 'DISTRIBUIDORA GASTRONÓMICA DON VITO LTDA', rutBody: 76445566, giro: 'Distribución de insumos gastronómicos', dir: 'Av. Carlos Valdovinos 2100, San Joaquín', comuna: 'San Joaquín' };
  const levaduras = { razon: 'COMERCIAL LEVADURAS Y MASAS SpA', rutBody: 77334455, giro: 'Venta de levaduras e insumos de panadería', dir: 'Av. Departamental 1450, La Florida', comuna: 'La Florida' };
  const laPampa   = { razon: 'FRIGORÍFICO LA PAMPA LTDA', rutBody: 78556677, giro: 'Distribución de carnes y embutidos', dir: 'Lo Espejo 0220, Lo Espejo', comuna: 'Lo Espejo' };
  const champinon = { razon: 'COMERCIALIZADORA EL CHAMPIÑÓN LTDA', rutBody: 76667788, giro: 'Venta de hortalizas y champiñones', dir: 'Lo Valledor Norte 100, P.A. Cerda', comuna: 'P.A. Cerda' };
  [donVito, levaduras, laPampa, champinon].forEach(e => (e.rut = D.rut(e.rutBody)));

  const insumos = [
    { f: 'insumo_donvito_salsas.png', html: page(facturaHTML({ folio: 50112, fecha: '2026-06-03', emisor: donVito, receptor: D.EMPRESA, neto: 200000, lineas: [
      { det: 'Salsa de tomate pulpa 5 kg', cant: 12, precio: 72000 },
      { det: 'Aceite de oliva 5 L', cant: 4, precio: 60000 },
      { det: 'Orégano deshidratado 1 kg', cant: 3, precio: 18000 },
      { det: 'Aceitunas sin cuesco 5 kg', cant: 3, precio: 30000 },
      { det: 'Anchoas en aceite (lata)', cant: 10, precio: 20000 },
    ] })) },
    { f: 'insumo_levadura_masas.png', html: page(facturaHTML({ folio: 3340, fecha: '2026-06-05', emisor: levaduras, receptor: D.EMPRESA, neto: 85000, lineas: [
      { det: 'Levadura fresca 500 g', cant: 40, precio: 48000 },
      { det: 'Mejorador de masa 1 kg', cant: 8, precio: 24000 },
      { det: 'Sémola 25 kg', cant: 2, precio: 13000 },
    ] })) },
    { f: 'insumo_embutidos_lapampa.png', html: page(facturaHTML({ folio: 71203, fecha: '2026-06-06', emisor: laPampa, receptor: D.EMPRESA, neto: 340000, lineas: [
      { det: 'Pepperoni 3 kg', cant: 10, precio: 150000 },
      { det: 'Jamón pizza 3 kg', cant: 8, precio: 96000 },
      { det: 'Salame 2 kg', cant: 6, precio: 54000 },
      { det: 'Tocino ahumado 3 kg', cant: 4, precio: 40000 },
    ] })) },
    { f: 'insumo_champinon_verduras.png', html: page(facturaHTML({ folio: 4488, fecha: '2026-06-04', emisor: champinon, receptor: D.EMPRESA, neto: 90000, lineas: [
      { det: 'Champiñón París 5 kg', cant: 6, precio: 54000 },
      { det: 'Pimentón rojo 10 kg', cant: 1, precio: 18000 },
      { det: 'Cebolla morada 10 kg', cant: 1, precio: 12000 },
      { det: 'Choclo dulce 5 kg', cant: 1, precio: 6000 },
    ] }), { foto: true }) },
    { f: 'insumo_harina_levadura_molinera.png', html: page(facturaHTML({ folio: 1399, fecha: '2026-06-11', emisor: D.PROV.molinera, receptor: D.EMPRESA, neto: 315000, lineas: [
      { det: 'Harina panadera 25 kg', cant: 15, precio: 285000 },
      { det: 'Levadura seca instantánea 500 g', cant: 20, precio: 30000 },
    ] })) },
    { f: 'insumo_donvito_restock.png', html: page(facturaHTML({ folio: 50480, fecha: '2026-06-17', emisor: donVito, receptor: D.EMPRESA, neto: 92000, lineas: [
      { det: 'Salsa de tomate pulpa 5 kg', cant: 6, precio: 36000 },
      { det: 'Aceite de oliva 5 L', cant: 2, precio: 30000 },
      { det: 'Aceitunas sin cuesco 5 kg', cant: 2, precio: 20000 },
      { det: 'Orégano deshidratado 1 kg', cant: 1, precio: 6000 },
    ] }), { foto: true }) },
    { f: 'insumo_patente_municipal.png', html: page(facturaHTML({ folio: 90233, fecha: '2026-06-10', emisor: D.CLI.muni, receptor: D.EMPRESA, neto: 185000, tipoTexto: 'FACTURA EXENTA ELECTRÓNICA', exento: true, lineas: [{ det: 'Patente comercial 1er semestre 2026', precio: 185000 }] })) },
  ];
  insumos.forEach(c => jobs.push({ file: `${pad(++i)}_${c.f}`, html: c.html }));

  // ========================================================================
  //  VOUCHERS DE PAGO CON TARJETA (Transbank) — su abono está en la cartola NETO de comisión
  // ========================================================================
  const vouchers = [
    { fecha: '2026-06-02', hora: '13:24', monto: 18900, tipo: 'DEBITO',  tarjeta: '4521', nop: '004512', autoriz: '182344', foto: true },
    { fecha: '2026-06-03', hora: '20:15', monto: 32500, tipo: 'CREDITO', tarjeta: '7788', nop: '004610', autoriz: '901233', foto: false },
    { fecha: '2026-06-04', hora: '21:02', monto: 45000, tipo: 'CREDITO', tarjeta: '1199', nop: '004733', autoriz: '553201', foto: true },
    { fecha: '2026-06-05', hora: '14:40', monto: 27800, tipo: 'DEBITO',  tarjeta: '6532', nop: '004890', autoriz: '334109', foto: false },
    { fecha: '2026-06-06', hora: '21:30', monto: 52400, tipo: 'CREDITO', tarjeta: '2210', nop: '005012', autoriz: '778120', foto: true },
  ];
  vouchers.forEach(v => jobs.push({ file: `${pad(++i)}_voucher_tarjeta_${v.monto}.png`, html: page(voucherTarjetaHTML(v), { foto: v.foto }) }));

  // ========================================================================
  //  LIBRO DE COMPRAS Y VENTAS SII (Registro de Compras y Ventas — para conciliación SII)
  // ========================================================================
  const libroCompras = [
    ...D.COMPRAS.filter(c => c.tipoDoc !== 'boleta').map(c => ({ tipoCod: '33', tipoNom: 'Factura', rut: c.prov.rut, razon: c.prov.razon, folio: c.folio, fecha: fch(c.fecha), neto: (c.neto != null ? c.neto : netoDe(c.total)) })),
    { tipoCod: '33', tipoNom: 'Factura', rut: donVito.rut, razon: donVito.razon, folio: 50112, fecha: '03/06/2026', neto: 200000 },
    { tipoCod: '33', tipoNom: 'Factura', rut: levaduras.rut, razon: levaduras.razon, folio: 3340, fecha: '05/06/2026', neto: 85000 },
    { tipoCod: '33', tipoNom: 'Factura', rut: laPampa.rut, razon: laPampa.razon, folio: 71203, fecha: '06/06/2026', neto: 340000 },
    { tipoCod: '33', tipoNom: 'Factura', rut: champinon.rut, razon: champinon.razon, folio: 4488, fecha: '04/06/2026', neto: 90000 },
    { tipoCod: '33', tipoNom: 'Factura', rut: D.PROV.molinera.rut, razon: D.PROV.molinera.razon, folio: 1399, fecha: '11/06/2026', neto: 315000 },
    { tipoCod: '33', tipoNom: 'Factura', rut: donVito.rut, razon: donVito.razon, folio: 50480, fecha: '17/06/2026', neto: 92000 },
    { tipoCod: '34', tipoNom: 'Fact.Exenta', rut: D.CLI.muni.rut, razon: D.CLI.muni.razon, folio: 90233, fecha: '10/06/2026', neto: 185000, iva: 0, total: 185000 },
    { tipoCod: '33', tipoNom: 'Factura', rut: hornos.rut, razon: hornos.razon, folio: 3015, fecha: '14/06/2026', neto: 2500000 },
    { tipoCod: '56', tipoNom: 'N.Débito', rut: D.PROV.andina.rut, razon: D.PROV.andina.razon, folio: 4410, fecha: '21/06/2026', neto: 30000 },
    { tipoCod: '61', tipoNom: 'N.Crédito', rut: D.PROV.soprole.rut, razon: D.PROV.soprole.razon, folio: 9501, fecha: '20/06/2026', neto: -80000, iva: -15200, total: -95200 },
    { tipoCod: '33', tipoNom: 'Factura', rut: D.rut(76330011), razon: 'COMERCIAL EL TRIGAL LTDA', folio: 7012, fecha: '13/06/2026', neto: 140000 },        // FANTASMA (no subida)
    { tipoCod: '33', tipoNom: 'Factura', rut: D.rut(77220033), razon: 'DISTRIBUIDORA POLAR FRÍO LTDA', folio: 8890, fecha: '19/06/2026', neto: 95000 },    // FANTASMA (no subida)
  ];
  const libroVentas = [
    ...D.FACTURAS_EMITIDAS.map(f => ({ tipoCod: '33', tipoNom: 'Factura', rut: f.cli.rut, razon: f.cli.razon, folio: f.folio, fecha: fch(f.fecha), neto: f.neto })),
    { tipoCod: '33', tipoNom: 'Factura', rut: eventosSur.rut, razon: eventosSur.razon, folio: 127, fecha: '26/06/2026', neto: 320000 },
    { tipoCod: '33', tipoNom: 'Factura', rut: eventosSur.rut, razon: eventosSur.razon, folio: 128, fecha: '26/06/2026', neto: 448067 },
    { tipoCod: '61', tipoNom: 'N.Crédito', rut: D.CLI.colegio.rut, razon: D.CLI.colegio.razon, folio: 130, fecha: '18/06/2026', neto: -50000, iva: -9500, total: -59500 },
    { tipoCod: '39', tipoNom: 'Boletas', rut: '—', razon: 'RESUMEN BOLETAS ELECTRÓNICAS DEL MES', folio: 'varios', fecha: '30/06/2026', neto: netoDe(8330000), iva: ivaDe(8330000), total: 8330000 },
  ];
  jobs.push({ file: `${pad(++i)}_libro_compras_sii_junio.png`, html: page(libroSiiHTML({ tipo: 'COMPRAS', periodo: 'Junio 2026', rows: libroCompras })) });
  jobs.push({ file: `${pad(++i)}_libro_ventas_sii_junio.png`, html: page(libroSiiHTML({ tipo: 'VENTAS', periodo: 'Junio 2026', rows: libroVentas })) });

  for (const j of jobs) {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 1000, height: 1400, deviceScaleFactor: 2 });
    await pg.setContent(j.html, { waitUntil: 'networkidle0' });
    const el = await pg.$('.scene, .doc, .boleta, .tef, .cart, .libro');
    if (j.scene) {
      await el.screenshot({ path: path.join(OUT, j.file) });           // escena de error (clip al .scene)
    } else if (j.html.includes('rotate(')) {
      await pg.screenshot({ path: path.join(OUT, j.file), fullPage: true }); // foto de papel
    } else {
      await el.screenshot({ path: path.join(OUT, j.file) });           // documento nítido
    }
    await pg.close();
    console.log('✓', j.file);
  }

  await browser.close();
  console.log(`\n${jobs.length} documentos generados en: ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
