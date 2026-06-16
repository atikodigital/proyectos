// Genera el PDF de una cotización/pedido con pdfkit. Auto-contenido (recibe el pedido ya cargado).
const PDFDocument = require('pdfkit');

function _clp(n) { return '$' + Number(n || 0).toLocaleString('es-CL'); }
function _cot(ped) { return 'COT-' + String((ped && ped.id) || '').replace(/-/g, '').slice(0, 6).toUpperCase(); }

// Devuelve Promise<Buffer> con el PDF.
function buildPedidoPdf(pedido, opts = {}) {
  return new Promise((resolve, reject) => {
    try {
      const ped = pedido || {};
      const pie = String((opts && opts.pie) || '').trim();
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).fillColor('#000').text(pie || 'Cotización');
      doc.moveDown(0.4);
      doc.fontSize(11).text('Cotización N° ' + _cot(ped));
      const fecha = ped.created_at ? new Date(ped.created_at) : new Date();
      doc.text('Fecha: ' + fecha.toLocaleDateString('es-CL'));
      doc.moveDown();

      const items = Array.isArray(ped.items) ? ped.items : [];
      items.forEach((it) => {
        const cant = it.cantidad || 1;
        const pu = it.precio_unitario || 0;
        doc.fontSize(11).text((it.descripcion || 'Producto') + '   ' + cant + ' × ' + _clp(pu) + ' = ' + _clp(cant * pu));
      });
      doc.moveDown();

      doc.fontSize(11).text('Subtotal: ' + _clp(ped.subtotal), { align: 'right' });
      if (Number(ped.impuesto) > 0) doc.text('IVA (' + Number(ped.impuesto_pct) + '%): ' + _clp(ped.impuesto), { align: 'right' });
      if (Number(ped.envio_costo) > 0) doc.text('Despacho' + (ped.comuna ? ' (' + ped.comuna + ')' : '') + ': ' + _clp(ped.envio_costo), { align: 'right' });
      doc.fontSize(13).text('Total: ' + _clp(ped.total), { align: 'right' });
      doc.moveDown();

      doc.fontSize(11);
      if (ped.entrega === 'retiro') doc.text('Entrega: Retiro en tienda');
      else if (ped.entrega === 'despacho') doc.text('Entrega: Despacho' + (ped.comuna ? ' a ' + ped.comuna : ' a domicilio'));
      if (ped.direccion) doc.text('Dirección: ' + ped.direccion);
      const cN = (ped.contact_name || '').trim();
      const cT = (ped.contact_phone || '').trim();
      if (cN || cT) doc.text('Cliente: ' + [cN, cT].filter(Boolean).join(' · '));
      doc.moveDown();

      doc.fontSize(10).fillColor('#888').text('¿Confirmamos? Responde y avanzamos.');
      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { buildPedidoPdf };
