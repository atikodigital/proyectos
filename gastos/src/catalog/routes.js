// Rutas del catálogo de productos, compartidas por /api/app y /api/panel.
// Se montan DESPUÉS del middleware de auth de cada router; usan req.auth.companyId.
const catalog = require('./repo');
const { storeImage, readImage, contentTypeFor } = require('../expenses/storage');

function registerCatalogRoutes(router, { db } = {}) {
  router.get('/products', async (req, res) => {
    const incluir = req.query.incluirPausados === '1' || req.query.incluirPausados === 'true';
    return res.json(await catalog.listProducts(db, req.auth.companyId, { incluirPausados: incluir }));
  });

  router.post('/products', async (req, res) => {
    try {
      return res.status(201).json(await catalog.createProduct(db, req.auth.companyId, req.body || {}));
    } catch (e) {
      if (e.code === 'validacion') return res.status(400).json({ error: 'validacion', detalle: e.message });
      throw e;
    }
  });

  // OJO: /products/orden ANTES de /products/:id para que no lo capture el :id
  router.patch('/products/orden', async (req, res) => {
    await catalog.reordenar(db, req.auth.companyId, (req.body || {}).orden);
    return res.json({ ok: true });
  });

  router.post('/products/:id/foto', async (req, res) => {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'falta_imagen' });
    try {
      const p = await catalog.getProduct(db, req.auth.companyId, req.params.id);
      if (!p) return res.status(404).json({ error: 'no_existe' });
      const name = storeImage(Buffer.from(imageBase64, 'base64'), mimeType || 'image/jpeg', 'product-' + p.id);
      if (!name) return res.status(400).json({ error: 'imagen_invalida' });
      return res.json(await catalog.setProductFoto(db, req.auth.companyId, p.id, name));
    } catch (e) {
      if (e.message && e.message.includes('uuid')) return res.status(404).json({ error: 'no_existe' });
      throw e;
    }
  });

  router.get('/products/:id/foto', async (req, res) => {
    try {
      const p = await catalog.getProduct(db, req.auth.companyId, req.params.id);
      if (!p) return res.status(404).json({ error: 'no_existe' });
      const buf = readImage(p.foto_path);
      if (!buf) return res.status(404).json({ error: 'sin_foto' });
      res.setHeader('Content-Type', contentTypeFor(p.foto_path));
      return res.send(buf);
    } catch (e) {
      if (e.message && e.message.includes('uuid')) return res.status(404).json({ error: 'no_existe' });
      throw e;
    }
  });

  router.patch('/products/:id/activo', async (req, res) => {
    try {
      const p = await catalog.setActivo(db, req.auth.companyId, req.params.id, (req.body || {}).activo);
      if (!p) return res.status(404).json({ error: 'no_existe' });
      return res.json(p);
    } catch (e) {
      if (e.message && e.message.includes('uuid')) return res.status(404).json({ error: 'no_existe' });
      throw e;
    }
  });

  router.get('/products/:id', async (req, res) => {
    try {
      const p = await catalog.getProduct(db, req.auth.companyId, req.params.id);
      if (!p) return res.status(404).json({ error: 'no_existe' });
      return res.json(p);
    } catch (e) {
      if (e.message && e.message.includes('uuid')) return res.status(404).json({ error: 'no_existe' });
      throw e;
    }
  });

  router.patch('/products/:id', async (req, res) => {
    try {
      const p = await catalog.updateProduct(db, req.auth.companyId, req.params.id, req.body || {});
      if (!p) return res.status(404).json({ error: 'no_existe' });
      return res.json(p);
    } catch (e) {
      if (e.code === 'validacion') return res.status(400).json({ error: 'validacion', detalle: e.message });
      if (e.message && e.message.includes('uuid')) return res.status(404).json({ error: 'no_existe' });
      throw e;
    }
  });
}

module.exports = { registerCatalogRoutes };
