const { newDb } = require('pg-mem');
const chat = require('../../src/chat/repo');

async function makeDb() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const pg = mem.adapters.createPg();
  return new pg.Pool();
}
const CID = '11111111-1111-1111-1111-111111111111';
const OTRA = '22222222-2222-2222-2222-222222222222';

test('agrega un mensaje y lo lista como conversación', async () => {
  const db = await makeDb();
  await chat.addMensaje(db, CID, { channel: 'whatsapp', contact: 'Juan Pérez', text: 'Hola, quiero 2 panes' });
  const convs = await chat.listConversaciones(db, CID);
  expect(convs).toHaveLength(1);
  expect(convs[0]).toMatchObject({ channel: 'whatsapp', contact: 'Juan Pérez', ultimo: 'Hola, quiero 2 panes', n: 1 });
});

test('agrupa por contacto+canal (mismo nombre, distinto canal = 2 conversaciones)', async () => {
  const db = await makeDb();
  await chat.addMensaje(db, CID, { channel: 'whatsapp', contact: 'Juan', text: 'msg1' });
  await chat.addMensaje(db, CID, { channel: 'whatsapp', contact: 'Juan', text: 'msg2' });
  await chat.addMensaje(db, CID, { channel: 'telegram', contact: 'Juan', text: 'otro' });
  const convs = await chat.listConversaciones(db, CID);
  expect(convs).toHaveLength(2);
  const wa = convs.find((c) => c.channel === 'whatsapp');
  expect(wa.n).toBe(2);
  expect(wa.ultimo).toBe('msg2');
});

test('lista los mensajes de una conversación en orden', async () => {
  const db = await makeDb();
  await chat.addMensaje(db, CID, { channel: 'whatsapp', contact: 'Ana', text: 'uno' });
  await chat.addMensaje(db, CID, { channel: 'whatsapp', contact: 'Ana', text: 'dos' });
  const msgs = await chat.listMensajes(db, CID, 'whatsapp', 'Ana');
  expect(msgs.map((m) => m.text)).toEqual(['uno', 'dos']);
});

test('no mezcla conversaciones de otra empresa', async () => {
  const db = await makeDb();
  await chat.addMensaje(db, CID, { channel: 'whatsapp', contact: 'Ana', text: 'mio' });
  await chat.addMensaje(db, OTRA, { channel: 'whatsapp', contact: 'Ana', text: 'ajeno' });
  const convs = await chat.listConversaciones(db, CID);
  expect(convs).toHaveLength(1);
  expect(convs[0].ultimo).toBe('mio');
});

test('la conversación más reciente queda primera', async () => {
  const db = await makeDb();
  await chat.addMensaje(db, CID, { channel: 'whatsapp', contact: 'Primero', text: 'a' });
  await chat.addMensaje(db, CID, { channel: 'whatsapp', contact: 'Segundo', text: 'b' });
  await chat.addMensaje(db, CID, { channel: 'whatsapp', contact: 'Primero', text: 'c' });
  const convs = await chat.listConversaciones(db, CID);
  expect(convs[0].contact).toBe('Primero');
});
