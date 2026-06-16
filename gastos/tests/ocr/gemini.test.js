jest.mock('axios');
const axios = require('axios');
const { geminiExtract, parseJsonLoose } = require('../../src/ocr/gemini');

test('parseJsonLoose tolera fences y texto alrededor', () => {
  expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  expect(parseJsonLoose('basura {"a":2} cola')).toEqual({ a: 2 });
  expect(parseJsonLoose('no-json')).toEqual({});
});

test('geminiExtract mapea la respuesta JSON del modelo', async () => {
  axios.post.mockResolvedValue({
    data: {
      choices: [
        { message: { content: '{"tipo_documento":"boleta","rut_emisor":"76.086.428-5","folio":"123","direccion_emisor":"Av Siempre Viva 1","proveedor":"Copec","fecha":"12/06/2026","neto":21008,"iva":3992,"total":25000,"categoria":"Combustible y transporte","glosa":"bencina"}' } },
      ],
    },
  });

  const out = await geminiExtract('BASE64', 'image/jpeg');
  expect(out.proveedor).toBe('Copec');
  expect(out.tipo_documento).toBe('boleta');
  expect(out.folio).toBe('123');
  expect(axios.post).toHaveBeenCalledTimes(1);
});
