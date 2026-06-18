// gastos/tests/panel/varas-lib.test.js
const lib = require('../../public/panel/lib');
const fs = require('fs');
const path = require('path');

test('varasChatHtml rinde burbujas de usuario y de VARAS', () => {
  const html = lib.varasChatHtml([
    { role: 'varas', text: 'Soy VARAS.' },
    { role: 'user', text: '¿Cuál es mi saldo?' },
    { role: 'varas', text: 'Tu saldo en banco es $100.000.' },
  ], null);
  expect(html).toContain('Soy VARAS.');
  expect(html).toContain('¿Cuál es mi saldo?');
  expect(html).toContain('Tu saldo en banco es $100.000.');
  // distingue alineación usuario (derecha) vs VARAS (izquierda)
  expect(html).toContain('varas-bubble-user');
  expect(html).toContain('varas-bubble-varas');
});

test('varasChatHtml NO muestra tarjeta de acción si no hay accionPropuesta', () => {
  const html = lib.varasChatHtml([{ role: 'varas', text: 'hola' }], null);
  expect(html).not.toContain('varas-confirmar');
  expect(html).not.toContain('varas-cancelar');
});

test('varasChatHtml muestra descripción + Confirmar/Cancelar cuando hay accionPropuesta', () => {
  const html = lib.varasChatHtml(
    [{ role: 'varas', text: 'Voy a marcar pagado.' }],
    { tipo: 'marcar_pagado', args: { descripcion: 'Proveedor X' }, descripcion: 'Marcar pagada la cuenta de Proveedor X' }
  );
  expect(html).toContain('Marcar pagada la cuenta de Proveedor X');
  expect(html).toContain('varas-confirmar');
  expect(html).toContain('varas-cancelar');
  expect(html.toLowerCase()).toContain('confirmar');
});

test('varasChatHtml escapa HTML (anti-XSS)', () => {
  const html = lib.varasChatHtml([{ role: 'user', text: '<script>alert(1)</script>' }], null);
  expect(html).not.toContain('<script>alert(1)</script>');
  const html2 = lib.varasChatHtml([], { tipo: 't', args: {}, descripcion: '<img src=x onerror=alert(1)>' });
  expect(html2).not.toContain('<img src=x onerror=alert(1)>');
});

test('index.html declara la sub-pestaña VARAS dentro de Contabilidad', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/panel/index.html'), 'utf8');
  expect(html).toContain('data-libro="varas"');
});
