import { docsDeItems } from '../../src/gastos/capturaCola';

// Bug: al escanear 2 documentos con "seguir escaneando", solo se registraba 1.
// docsDeItems debe devolver TODOS los documentos capturados (no solo el primero).
describe('docsDeItems', () => {
  test('sin items → []', () => {
    expect(docsDeItems(null)).toEqual([]);
    expect(docsDeItems([])).toEqual([]);
  });

  test('devuelve TODOS los documentos capturados (no solo el primero)', () => {
    const items = [
      { imageBase64: 'AAA', imageMimeType: 'image/png' },
      { imageBase64: 'BBB', imageMimeType: 'image/jpeg' },
    ];
    const docs = docsDeItems(items);
    expect(docs).toHaveLength(2);
    expect(docs[0]).toEqual({ imageBase64: 'AAA', mimeType: 'image/png' });
    expect(docs[1]).toEqual({ imageBase64: 'BBB', mimeType: 'image/jpeg' });
  });

  test('mimeType por defecto image/jpeg y filtra items sin imagen', () => {
    const docs = docsDeItems([
      { imageBase64: 'AAA' },
      { imageMimeType: 'image/png' }, // sin imageBase64 → se descarta
      null,
    ]);
    expect(docs).toEqual([{ imageBase64: 'AAA', mimeType: 'image/jpeg' }]);
  });
});
