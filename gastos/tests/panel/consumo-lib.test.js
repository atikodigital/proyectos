const lib = require('../../public/panel/lib');

test('consumoHtml muestra cantidad por unidad, monto y evolución', () => {
  const html = lib.consumoHtml({
    cantidadPorUnidad: { kg: 70 }, monto: 35700,
    serie: [{ ym: '2026-05', cantidad: 20, monto: 11900 }, { ym: '2026-06', cantidad: 50, monto: 23800 }],
  }, 'Harina');
  expect(html).toContain('Harina');
  expect(html).toContain('70');
  expect(html).toContain('2026-06');
  expect(html).toContain(lib.fmtClp(35700));
});

test('consumoHtml sin datos', () => {
  expect(lib.consumoHtml({ cantidadPorUnidad: {}, monto: 0, serie: [] }, 'X').toLowerCase()).toContain('sin consumo');
});
