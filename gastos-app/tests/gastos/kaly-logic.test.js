import {
  SILENCE_MS,
  INACTIVITY_MS,
  hoyStr,
  decideAutoStart,
  esNegativa,
} from '../../src/gastos/kaly/logic';
import { buildSystemPrompt, instruccionInicial } from '../../src/gastos/kaly/prompt';

// ── logic.js ────────────────────────────────────────────────────────────────

describe('constants', () => {
  test('SILENCE_MS = 30000', () => expect(SILENCE_MS).toBe(30000));
  test('INACTIVITY_MS = 5 min', () => expect(INACTIVITY_MS).toBe(5 * 60 * 1000));
});

describe('hoyStr', () => {
  test('devuelve YYYY-MM-DD', () => {
    expect(hoyStr(new Date('2026-06-12T15:00:00Z'))).toBe('2026-06-12');
  });
});

describe('decideAutoStart', () => {
  const today = '2026-06-12';

  test('retorna onboarding si !onboarded', () => {
    expect(decideAutoStart({ onboarded: false, lastGreet: null, today })).toBe('onboarding');
  });

  test('retorna onboarding si onboarded=undefined', () => {
    expect(decideAutoStart({ onboarded: undefined, lastGreet: null, today })).toBe('onboarding');
  });

  test('retorna saludo siempre si onboarded=true', () => {
    expect(decideAutoStart({ onboarded: true, lastGreet: today, today })).toBe('saludo');
  });
});

describe('esNegativa', () => {
  // positivos
  test.each([
    'no',
    'nada',
    'no gracias',
    'gracias',
    'estoy bien',
    'ninguna',
    'nada más',
    'nada mas',
    'eso es todo',
    'listo gracias',
    'no.',
    'no!',
    'nada,',
  ])('"%s" es negativa', (texto) => {
    expect(esNegativa(texto)).toBe(true);
  });

  // negativos (no son despedida)
  test.each([
    'sí',
    'si',
    'cuánto llevo',
    'muéstrame los gastos',
    'quiero ver mis movimientos',
    'de acuerdo',
    '',
    'ok',
  ])('"%s" NO es negativa', (texto) => {
    expect(esNegativa(texto)).toBe(false);
  });
});

// ── prompt.js ───────────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  const context = {
    nombre: 'José',
    trato: 'señor',
    empresaNombre: 'Atiko Digital',
    resumen: {
      ingresos: 1500000,
      gastos: 800000,
      saldo: 700000,
      pendientesPago: 120000,
      countGastos: 5,
      countIngresos: 3,
    },
  };

  let prompt;
  beforeAll(() => { prompt = buildSystemPrompt(context); });

  test('contiene Kaly', () => {
    expect(prompt).toContain('Kaly');
  });

  test('contiene el trato', () => {
    expect(prompt).toContain('señor');
  });

  test('contiene el nombre', () => {
    expect(prompt).toContain('José');
  });

  test('contiene cifras del resumen (ingresos)', () => {
    expect(prompt).toContain('1.500.000');
  });

  test('contiene cifras del resumen (gastos)', () => {
    expect(prompt).toContain('800.000');
  });

  test('contiene cifras del resumen (saldo)', () => {
    expect(prompt).toContain('700.000');
  });

  test('contiene cifras del resumen (pendientesPago)', () => {
    expect(prompt).toContain('120.000');
  });

  test('contiene la regla de confirmación', () => {
    expect(prompt).toMatch(/Confirma.*\?/i);
  });

  test('menciona los 4 botones: Captura', () => {
    expect(prompt).toContain('Captura');
  });

  test('menciona los 4 botones: Movimientos', () => {
    expect(prompt).toContain('Movimientos');
  });

  test('menciona los 4 botones: Transaccional', () => {
    expect(prompt).toContain('Transaccional');
  });

  test('menciona los 4 botones: Match', () => {
    expect(prompt).toContain('Match');
  });

  test('menciona marcar_pagada en la regla de confirmación', () => {
    expect(prompt).toContain('marcar_pagada');
  });

  test('menciona anular_movimiento en la regla de confirmación', () => {
    expect(prompt).toContain('anular_movimiento');
  });

  test('menciona enviar_resumen_whatsapp en la regla de confirmación', () => {
    expect(prompt).toContain('enviar_resumen_whatsapp');
  });
});

describe('instruccionInicial', () => {
  test('motivo onboarding menciona onboarding', () => {
    const msg = instruccionInicial({}, 'onboarding');
    expect(msg.toLowerCase()).toContain('onboarding');
  });

  test('motivo saludo con saludoHora=dia menciona buenos días', () => {
    const msg = instruccionInicial({ saludoHora: 'dia' }, 'saludo');
    expect(msg).toContain('buenos días');
  });

  test('motivo saludo con saludoHora=tarde menciona buenas tardes', () => {
    const msg = instruccionInicial({ saludoHora: 'tarde' }, 'saludo');
    expect(msg).toContain('buenas tardes');
  });

  test('motivo saludo con saludoHora=noche menciona buenas noches', () => {
    const msg = instruccionInicial({ saludoHora: 'noche' }, 'saludo');
    expect(msg).toContain('buenas noches');
  });

  test('motivo inactividad pregunta si puede ayudar', () => {
    const msg = instruccionInicial({}, 'inactividad');
    expect(msg.toLowerCase()).toContain('ayudar');
  });

  test('motivo manual menciona esfera', () => {
    const msg = instruccionInicial({}, 'manual');
    expect(msg.toLowerCase()).toContain('esfera');
  });
});
