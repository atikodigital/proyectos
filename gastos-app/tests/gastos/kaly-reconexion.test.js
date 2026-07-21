/**
 * Continuidad de conversación de KALY (modo personal manos libres).
 * - motivo 'reconexion': NO saluda, NO se presenta, recibe el historial reciente.
 * - el saludo diario ('saludo') ya no repite el discurso de "primera vez".
 */
import { instruccionInicial } from '../../src/gastos/kaly/prompt.js';

test("reconexion: no saluda, no se presenta, y trae el historial como contexto", () => {
  const ins = instruccionInicial(
    { tipoPersonal: true, nombre: 'José', onboarded: true },
    'reconexion',
    [
      { sender: 'user', text: 'gasté 5 mil en el almuerzo' },
      { sender: 'kaly', text: '¡Anotado! ¿Ya lo pagaste?' },
    ],
  );
  expect(ins).toMatch(/NO saludes/i);
  expect(ins).toMatch(/NO te presentes/i);
  expect(ins).toContain('gasté 5 mil en el almuerzo');
  expect(ins).toContain('¿Ya lo pagaste?');
});

test('reconexion también funciona para cuentas de empresa (no solo personal)', () => {
  const ins = instruccionInicial({ nombre: 'José', trato: 'señor' }, 'reconexion', []);
  expect(ins).toMatch(/NO saludes/i);
});

test("saludo personal: ya NO repite el discurso de primera vez aunque onboarded venga false", () => {
  const ins = instruccionInicial({ tipoPersonal: true, nombre: 'José', onboarded: false, saludoHora: 'dia' }, 'saludo');
  // Lo esencial: NO debe soltar el discurso de onboarding en un saludo normal.
  expect(ins).not.toMatch(/PRIMERA vez/i);
  // El saludo ya no es el fijo "hola de nuevo hoy": ahora usa la hora del día
  // (buenos días/tardes/noches), que se había perdido en v3.94.
  expect(ins).toMatch(/hola/i);
  expect(ins).toMatch(/buenos días/i);
});

test('el onboarding completo personal solo sale con motivo onboarding', () => {
  const ins = instruccionInicial({ tipoPersonal: true, nombre: 'José', onboarded: false }, 'onboarding');
  expect(ins).toMatch(/PRIMERA vez/i);
});
