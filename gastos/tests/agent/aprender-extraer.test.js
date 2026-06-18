const { extraerHechos } = require('../../src/agent/aprender');

function fakeHttp(content) {
  return { post: jest.fn().mockResolvedValue({ data: { choices: [{ message: { content } }] } }) };
}

const TRANSCRIPCION = [
  { role: 'user', text: 'atiendo de lunes a sábado de 9 a 18' },
  { role: 'kaly', text: 'perfecto, lo anoto' },
  { role: 'user', text: 'vendo empanadas y pan amasado' },
  { role: 'kaly', text: 'genial' },
];

describe('extraerHechos', () => {
  test('parsea el JSON de Gemini y normaliza los hechos', async () => {
    const http = fakeHttp('{ "hechos": [ { "tipo": "negocio", "contenido": "Atiende lunes a sábado 9-18" }, { "tipo": "negocio", "contenido": "Vende empanadas y pan amasado" } ] }');
    const out = await extraerHechos({ transcripcion: TRANSCRIPCION, memoriaActual: [], http });
    expect(out).toEqual([
      { tipo: 'negocio', contenido: 'Atiende lunes a sábado 9-18' },
      { tipo: 'negocio', contenido: 'Vende empanadas y pan amasado' },
    ]);
  });

  test('descarta hechos inválidos (sin contenido) y normaliza tipo desconocido a "hecho"', async () => {
    const http = fakeHttp('{ "hechos": [ { "tipo": "negocio", "contenido": "" }, { "tipo": "rarito", "contenido": "El dueño se llama José" } ] }');
    const out = await extraerHechos({ transcripcion: TRANSCRIPCION, memoriaActual: [], http });
    expect(out).toEqual([{ tipo: 'hecho', contenido: 'El dueño se llama José' }]);
  });

  test('devuelve [] cuando no hay hechos', async () => {
    const http = fakeHttp('{ "hechos": [] }');
    const out = await extraerHechos({ transcripcion: TRANSCRIPCION, memoriaActual: [], http });
    expect(out).toEqual([]);
  });

  test('incluye la memoria actual en el prompt enviado a Gemini', async () => {
    const http = fakeHttp('{ "hechos": [] }');
    await extraerHechos({
      transcripcion: TRANSCRIPCION,
      memoriaActual: [{ tipo: 'negocio', contenido: 'Vende empanadas y pan amasado' }],
      http,
    });
    const body = http.post.mock.calls[0][1];
    const enviado = body.messages[0].content;
    expect(enviado).toContain('Vende empanadas y pan amasado');
  });
});
