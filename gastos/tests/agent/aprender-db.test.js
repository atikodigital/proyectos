const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { aprenderDeConversacion } = require('../../src/agent/aprender');
const { listMemorias } = require('../../src/agent/memory');

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

const TRANS4 = [
  { role: 'user', text: 'atiendo de lunes a sábado' },
  { role: 'kaly', text: 'anotado' },
  { role: 'user', text: 'vendo empanadas' },
  { role: 'kaly', text: 'genial' },
];

const COMPANY_ID = '00000000-0000-0000-0000-0000000000aa';

describe('aprenderDeConversacion', () => {
  let db;

  beforeEach(async () => {
    db = await freshDb();
  });

  test('skip si la conversación no es sustancial (<4 turnos)', async () => {
    const extraer = jest.fn();
    const r = await aprenderDeConversacion(db, COMPANY_ID, { transcripcion: [{ role: 'user', text: 'hola' }], extraer });
    expect(r).toEqual({ creados: 0, skip: true });
    expect(extraer).not.toHaveBeenCalled();
  });

  test('crea los hechos extraídos con origen "auto"', async () => {
    const extraer = jest.fn().mockResolvedValue([
      { tipo: 'negocio', contenido: 'Atiende lunes a sábado' },
      { tipo: 'negocio', contenido: 'Vende empanadas' },
    ]);
    const r = await aprenderDeConversacion(db, COMPANY_ID, { transcripcion: TRANS4, extraer });
    expect(r.creados).toBe(2);
    const mem = await listMemorias(db, COMPANY_ID);
    expect(mem).toHaveLength(2);
    expect(mem.every((m) => m.origen === 'auto')).toBe(true);
  });

  test('dedupe: descarta hechos casi-idénticos a la memoria existente', async () => {
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Vende empanadas','dueño')", [COMPANY_ID]);
    const extraer = jest.fn().mockResolvedValue([
      { tipo: 'negocio', contenido: 'vende empanadas' },        // duplicado (case/espacios)
      { tipo: 'negocio', contenido: 'Atiende lunes a sábado' }, // nuevo
    ]);
    const r = await aprenderDeConversacion(db, COMPANY_ID, { transcripcion: TRANS4, extraer });
    expect(r.creados).toBe(1);
    const mem = await listMemorias(db, COMPANY_ID);
    expect(mem.map((m) => m.contenido).sort()).toEqual(['Atiende lunes a sábado', 'Vende empanadas']);
  });

  test('si el extractor falla, no crea nada y reporta error', async () => {
    const extraer = jest.fn().mockRejectedValue(new Error('gemini down'));
    const r = await aprenderDeConversacion(db, COMPANY_ID, { transcripcion: TRANS4, extraer });
    expect(r.creados).toBe(0);
    expect(r.error).toBe(true);
  });
});
