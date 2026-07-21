import {
  SILENCE_MS,
  INACTIVITY_MS,
  RESALUDO_MS,
  hoyStr,
  decideAutoStart,
  esNegativa,
  saludoReciente,
  ultimoSaludoMs,
  marcarSaludado,
  resetKalyGreeting,
  kalyHizoPregunta,
} from '../../src/gastos/kaly/logic';
import { buildSystemPrompt, instruccionInicial } from '../../src/gastos/kaly/prompt';

// ── logic.js ────────────────────────────────────────────────────────────────

describe('constants', () => {
  test('SILENCE_MS = 5000', () => expect(SILENCE_MS).toBe(5000));
  test('INACTIVITY_MS = 5 min', () => expect(INACTIVITY_MS).toBe(5 * 60 * 1000));
});

describe('hoyStr', () => {
  test('devuelve YYYY-MM-DD', () => {
    expect(hoyStr(new Date('2026-06-12T15:00:00Z'))).toBe('2026-06-12');
  });
});

// Bug real (v3.94, "KALY no saluda al abrir la app"): la decisión dependía de una
// bandera booleana en sessionStorage. En una pestaña de navegador sessionStorage se
// borra al cerrar, pero en el WebView de Capacitor NO: al minimizar y reabrir la app
// el WebView sigue vivo → la bandera seguía en '1' → decideAutoStart devolvía null →
// KALY nunca volvía a saludar. Ahora la decisión es por TIEMPO desde el último saludo
// (timestamp en localStorage), que no depende de que el WebView muera.
describe('decideAutoStart (por tiempo desde el último saludo)', () => {
  const AHORA = 1_760_000_000_000;

  test('retorna onboarding si !onboarded y nunca saludó', () => {
    expect(decideAutoStart({ onboarded: false, ultimoSaludo: null, ahora: AHORA })).toBe('onboarding');
  });

  test('retorna onboarding si onboarded=undefined', () => {
    expect(decideAutoStart({ onboarded: undefined, ultimoSaludo: null, ahora: AHORA })).toBe('onboarding');
  });

  test('retorna saludo si onboarded=true y nunca saludó', () => {
    expect(decideAutoStart({ onboarded: true, ultimoSaludo: null, ahora: AHORA })).toBe('saludo');
  });

  // El bug original que resolvía la bandera ("me saludó 3 veces"): KalyAgent se
  // remonta al cambiar de pestaña, a segundos del saludo anterior. Eso NO debe saludar.
  test('NO saluda si acaba de saludar (remontaje al cambiar de pestaña)', () => {
    expect(decideAutoStart({ onboarded: true, ultimoSaludo: AHORA - 3_000, ahora: AHORA })).toBeNull();
  });

  test('NO saluda justo antes del umbral', () => {
    expect(decideAutoStart({ onboarded: true, ultimoSaludo: AHORA - (RESALUDO_MS - 1), ahora: AHORA })).toBeNull();
  });

  // ── EL FIX: reabrir la app después de un rato SÍ saluda ──
  test('SÍ vuelve a saludar pasado el umbral (reabrir la app)', () => {
    expect(decideAutoStart({ onboarded: true, ultimoSaludo: AHORA - (RESALUDO_MS + 1), ahora: AHORA })).toBe('saludo');
  });

  test('SÍ vuelve a onboardar pasado el umbral si no está onboarded', () => {
    expect(decideAutoStart({ onboarded: false, ultimoSaludo: AHORA - (RESALUDO_MS + 1), ahora: AHORA })).toBe('onboarding');
  });

  test('umbral configurable por parámetro', () => {
    expect(decideAutoStart({ onboarded: true, ultimoSaludo: AHORA - 5_000, ahora: AHORA, resaludoMs: 1_000 })).toBe('saludo');
  });
});

describe('saludoReciente / marcarSaludado / ultimoSaludoMs', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  test('sin saludo previo: ultimoSaludoMs=null y saludoReciente=false', () => {
    expect(ultimoSaludoMs()).toBeNull();
    expect(saludoReciente()).toBe(false);
  });

  test('marcarSaludado() guarda el timestamp y saludoReciente pasa a true', () => {
    const t = 1_760_000_000_000;
    marcarSaludado(t);
    expect(ultimoSaludoMs()).toBe(t);
    expect(saludoReciente(t + 1_000)).toBe(true);
  });

  // Clave del fix: el timestamp vive en localStorage, así que sobrevive al WebView
  // igual que antes — pero al consultarlo con la hora actual, "hace rato" ya no
  // cuenta como saludo reciente y KALY vuelve a saludar.
  test('un saludo viejo YA NO cuenta como reciente (la app se reabre y saluda)', () => {
    const t = 1_760_000_000_000;
    marcarSaludado(t);
    expect(saludoReciente(t + RESALUDO_MS + 1)).toBe(false);
  });
});

// Bug real (multi-cuenta en el mismo teléfono): al iniciar sesión con otra cuenta,
// las flags de la cuenta anterior (kaly_greeted_session / kaly_onboarded /
// kaly_last_greet) seguían puestas → KALY NO saludaba ni onboardaba a la cuenta
// nueva ("no me saludó ni extrajo información"). resetKalyGreeting() se llama en
// cada login/logout para que cada cuenta empiece desde cero.
describe('resetKalyGreeting (cambio de cuenta)', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  test('borra las flags de saludo/onboarding', () => {
    marcarSaludado();                              // cuenta A ya saludó
    localStorage.setItem('kaly_onboarded', '1');   // y quedó onboarded en el celular
    expect(saludoReciente()).toBe(true);

    resetKalyGreeting();                           // login de cuenta B

    expect(saludoReciente()).toBe(false);
    expect(ultimoSaludoMs()).toBeNull();
    expect(localStorage.getItem('kaly_onboarded')).toBeNull();
  });

  test('tras el reset la cuenta nueva vuelve a saludar/onboardar (no queda muda)', () => {
    marcarSaludado(); localStorage.setItem('kaly_onboarded', '1');
    resetKalyGreeting();
    const onboarded = localStorage.getItem('kaly_onboarded') === '1';
    expect(decideAutoStart({ onboarded, ultimoSaludo: ultimoSaludoMs() })).toBe('onboarding');
  });
});

// Bug real (voz): cuando KALY preguntaba "¿Ya lo pagaste?", la conversación se
// cortaba — por el silencio de 5s o porque el "no" del usuario se leía como
// despedida. kalyHizoPregunta detecta que KALY espera respuesta para no cortar.
describe('kalyHizoPregunta', () => {
  test.each(['¿Ya lo pagaste?', 'Anotado, ¿lo pagaste?', 'Do you want to continue?'])(
    '"%s" → true (KALY espera respuesta)', (t) => expect(kalyHizoPregunta(t)).toBe(true),
  );
  test.each(['Listo, quedó anotado.', '¡Anotado!', '', null])(
    '"%s" → false (no es pregunta)', (t) => expect(kalyHizoPregunta(t)).toBe(false),
  );
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

  // Regresión (v3.94): el saludo genérico dejó de usar la hora del día y decía un
  // fijo "¡Hola de nuevo hoy!". El modo PERSONAL —el que usa la app de finanzas
  // personales— tenía el mismo problema, así que ahí tampoco se oía "buenos días".
  test.each([
    ['dia', 'buenos días'],
    ['tarde', 'buenas tardes'],
    ['noche', 'buenas noches'],
  ])('modo personal, saludoHora=%s → menciona "%s"', (saludoHora, esperado) => {
    const msg = instruccionInicial({ saludoHora, tipoPersonal: true, nombre: 'José' }, 'saludo');
    expect(msg).toContain(esperado);
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
