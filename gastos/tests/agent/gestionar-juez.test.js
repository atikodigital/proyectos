const { juzgarHecho, normalizeVeredicto } = require('../../src/agent/gestionar');

function fakeHttp(content) {
  return { post: jest.fn().mockResolvedValue({ data: { choices: [{ message: { content } }] } }) };
}

const EXISTENTES = [
  { id: 'a', contenido: 'Cierra los domingos' },
  { id: 'b', contenido: 'Cierra a las 18h' },
];

describe('normalizeVeredicto', () => {
  test('accion válida con indice en rango', () => {
    expect(normalizeVeredicto({ accion: 'duplicado', indice: 1 }, 2)).toEqual({ accion: 'duplicado', indice: 1 });
  });
  test('accion desconocida → insertar', () => {
    expect(normalizeVeredicto({ accion: 'otra', indice: 1 }, 2)).toEqual({ accion: 'insertar', indice: null });
  });
  test('indice fuera de rango → insertar', () => {
    expect(normalizeVeredicto({ accion: 'reemplaza', indice: 9 }, 2)).toEqual({ accion: 'insertar', indice: null });
  });
  test('reemplaza sin indice → insertar', () => {
    expect(normalizeVeredicto({ accion: 'reemplaza', indice: null }, 2)).toEqual({ accion: 'insertar', indice: null });
  });
});

describe('juzgarHecho', () => {
  test('parsea duplicado del juez', async () => {
    const http = fakeHttp('{ "accion": "duplicado", "indice": 1 }');
    const v = await juzgarHecho({ hechoNuevo: { contenido: 'No atiende los domingos' }, existentes: EXISTENTES, http });
    expect(v).toEqual({ accion: 'duplicado', indice: 1 });
  });
  test('parsea reemplaza del juez', async () => {
    const http = fakeHttp('```json\n{ "accion": "reemplaza", "indice": 2 }\n```');
    const v = await juzgarHecho({ hechoNuevo: { contenido: 'Ahora cierra a las 20h' }, existentes: EXISTENTES, http });
    expect(v).toEqual({ accion: 'reemplaza', indice: 2 });
  });
  test('incluye los hechos existentes numerados en el prompt', async () => {
    const http = fakeHttp('{ "accion": "insertar", "indice": null }');
    await juzgarHecho({ hechoNuevo: { contenido: 'Vende pan' }, existentes: EXISTENTES, http });
    const enviado = http.post.mock.calls[0][1].messages[0].content;
    expect(enviado).toContain('1. Cierra los domingos');
    expect(enviado).toContain('2. Cierra a las 18h');
    expect(enviado).toContain('Vende pan');
  });
});
