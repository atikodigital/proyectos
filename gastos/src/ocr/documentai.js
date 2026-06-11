const { parseAmountClp } = require('../domain/normalize');

function mapDocAiEntities(entities = []) {
  const out = {};
  for (const e of entities) {
    const t = e.type;
    const v = e.mentionText || '';
    if (t === 'total_amount') out.total = parseAmountClp(v);
    else if (t === 'net_amount') out.neto = parseAmountClp(v);
    else if (t === 'total_tax_amount') out.iva = parseAmountClp(v);
    else if (t === 'supplier_name') out.proveedor = v.trim();
    else if (t === 'receipt_date') out.fecha = v.trim();
    else if (t === 'supplier_address') out.direccion_emisor = v.trim();
  }
  return out;
}

let _client = null;
function getClient() {
  if (_client) return _client;
  const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
  _client = new DocumentProcessorServiceClient();
  return _client;
}

async function documentAiExtract(imageBuffer, mimeType = 'image/jpeg', client) {
  const c = client || getClient();
  const name = c.processorPath(
    process.env.DOCAI_PROJECT_ID,
    process.env.DOCAI_LOCATION || 'us',
    process.env.DOCAI_PROCESSOR_ID
  );
  const [result] = await c.processDocument({
    name,
    rawDocument: { content: imageBuffer.toString('base64'), mimeType },
  });
  return mapDocAiEntities(result?.document?.entities || []);
}

module.exports = { mapDocAiEntities, documentAiExtract };
