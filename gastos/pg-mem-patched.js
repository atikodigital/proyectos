/**
 * pg-mem wrapper that patches createPg() Pool instances to coerce integer-typed
 * columns to strings, matching real PostgreSQL behaviour where bigint (OID 20)
 * is returned as a string by the default pg driver type parser.
 *
 * pg-mem defines a fresh MemPg class inside every createPg() call, so we cannot
 * patch it globally. Instead, we wrap the IMemoryDb.adapters.createPg method
 * to intercept the returned Pool class and patch its adaptResults prototype.
 */
// Require the real pg-mem directly (not through the alias) to avoid circular redirect
const pgmem = require('./node_modules/pg-mem');
const originalNewDb = pgmem.newDb;

function patchAdaptResults(PoolClass) {
  const proto = PoolClass.prototype;
  if (!proto || proto.__bigintPatched) return;
  proto.__bigintPatched = true;

  const original = proto.adaptResults;
  proto.adaptResults = function patchedAdaptResults(query, res) {
    const result = original.call(this, query, res);
    const internalFields = res.fields || [];
    if (internalFields.length === 0) return result;

    // Collect field names whose Symbol(type).primary === 'integer'
    // (pg-mem uses 'integer' for both int4 and int8/bigint)
    const intFields = new Set();
    for (const f of internalFields) {
      for (const sym of Object.getOwnPropertySymbols(f)) {
        const t = f[sym];
        if (t && t.primary === 'integer') {
          intFields.add(f.name);
        }
      }
    }

    if (intFields.size === 0) return result;

    result.rows = result.rows.map((row) => {
      const copy = { ...row };
      for (const name of intFields) {
        if (copy[name] !== null && copy[name] !== undefined) {
          copy[name] = String(copy[name]);
        }
      }
      return copy;
    });

    return result;
  };
}

pgmem.newDb = function patchedNewDb(opts) {
  const db = originalNewDb(opts);
  const originalAdapters = db.adapters;
  const originalCreatePg = originalAdapters.createPg.bind(originalAdapters);

  originalAdapters.createPg = function patchedCreatePg(queryLatency) {
    const adapter = originalCreatePg(queryLatency);
    patchAdaptResults(adapter.Pool);
    patchAdaptResults(adapter.Client);
    return adapter;
  };

  return db;
};

module.exports = pgmem;
