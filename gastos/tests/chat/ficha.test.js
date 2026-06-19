const { fichaDerivada, telefonoDeContacto } = require('../../src/chat/ficha');

test('telefonoDeContacto extrae número si parece teléfono', () => {
  expect(telefonoDeContacto('+56 9 9999 1111')).toBe('+56999991111');
  expect(telefonoDeContacto('Mike Banner')).toBe('');
});

test('fichaDerivada de los mensajes', () => {
  const msgs = [
    { contact: '56999', channel: 'whatsapp', text: 'hola', created_at: '2026-02-24T10:00:00Z' },
    { contact: '56999', channel: 'whatsapp', text: 'chau', created_at: '2026-03-04T22:10:00Z' },
  ];
  const f = fichaDerivada(msgs);
  expect(f.nombre).toBe('56999');
  expect(f.channel).toBe('whatsapp');
  expect(f.telefono).toBe('56999');
  expect(f.nMensajes).toBe(2);
  expect(f.primerContacto).toBe('2026-02-24T10:00:00Z');
  expect(f.ultimoContacto).toBe('2026-03-04T22:10:00Z');
});

test('fichaDerivada vacía no rompe', () => {
  expect(fichaDerivada([])).toEqual({ nombre: '', channel: '', telefono: '', nMensajes: 0, primerContacto: null, ultimoContacto: null });
});
