const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { reconciliar } = require('../../src/agent/gestionar');
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

const CO = '00000000-0000-0000-0000-0000000000aa';
const OTRA = '00000000-0000-0000-0000-0000000000bb';

describe('reconciliar', () => {
  let db;
  beforeEach(async () => { db = await freshDb(); });

  test('sin existentes → inserta sin llamar al juez', async () => {
    const juzgar = jest.fn();
    const r = await reconciliar(db, CO, { tipo: 'negocio', contenido: 'Vende pan', origen: 'auto' }, { juzgar });
    expect(r.accion).toBe('insertar');
    expect(juzgar).not.toHaveBeenCalled();
    const mem = await listMemorias(db, CO);
    expect(mem).toHaveLength(1);
    expect(mem[0].origen).toBe('auto');
  });

  test('juez "insertar" → crea fila', async () => {
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Vende pan','dueño')", [CO]);
    const juzgar = jest.fn().mockResolvedValue({ accion: 'insertar', indice: null });
    const r = await reconciliar(db, CO, { tipo: 'negocio', contenido: 'Atiende sábados', origen: 'kaly' }, { juzgar });
    expect(r.accion).toBe('insertar');
    const mem = await listMemorias(db, CO);
    expect(mem).toHaveLength(2);
  });

  test('juez "duplicado" → NO crea fila', async () => {
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Cierra domingos','dueño')", [CO]);
    const juzgar = jest.fn().mockResolvedValue({ accion: 'duplicado', indice: 1 });
    const r = await reconciliar(db, CO, { tipo: 'negocio', contenido: 'No atiende los domingos', origen: 'auto' }, { juzgar });
    expect(r.accion).toBe('duplicado');
    const mem = await listMemorias(db, CO);
    expect(mem).toHaveLength(1);
    expect(mem[0].contenido).toBe('Cierra domingos');
  });

  test('juez "reemplaza" → archiva el viejo y crea el nuevo', async () => {
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Cierra a las 18h','dueño')", [CO]);
    const juzgar = jest.fn().mockResolvedValue({ accion: 'reemplaza', indice: 1 });
    const r = await reconciliar(db, CO, { tipo: 'negocio', contenido: 'Cierra a las 20h', origen: 'kaly' }, { juzgar });
    expect(r.accion).toBe('reemplaza');
    expect(r.reemplazoId).toBeTruthy();
    const mem = await listMemorias(db, CO); // activo=true only
    expect(mem).toHaveLength(1);
    expect(mem[0].contenido).toBe('Cierra a las 20h');
  });

  test('juez lanza error → inserta igual (degradación suave)', async () => {
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Algo','dueño')", [CO]);
    const juzgar = jest.fn().mockRejectedValue(new Error('gemini down'));
    const r = await reconciliar(db, CO, { tipo: 'negocio', contenido: 'Cosa nueva', origen: 'auto' }, { juzgar });
    expect(r.accion).toBe('insertar');
    expect(await listMemorias(db, CO)).toHaveLength(2);
  });

  test('contenido vacío → null', async () => {
    const r = await reconciliar(db, CO, { tipo: 'negocio', contenido: '   ', origen: 'auto' }, { juzgar: jest.fn() });
    expect(r).toBeNull();
  });

  test('scoped: no ve ni toca memorias de otra empresa', async () => {
    await db.query("INSERT INTO kaly_memory(company_id, tipo, contenido, origen) VALUES($1,'negocio','Secreto de B','dueño')", [OTRA]);
    const juzgar = jest.fn().mockResolvedValue({ accion: 'insertar', indice: null });
    await reconciliar(db, CO, { tipo: 'negocio', contenido: 'Hecho de A', origen: 'auto' }, { juzgar });
    expect(juzgar).not.toHaveBeenCalled(); // CO no tenía existentes
    expect(await listMemorias(db, OTRA)).toHaveLength(1);
    expect(await listMemorias(db, CO)).toHaveLength(1);
  });
});
