import { buildSystemPrompt, instruccionInicial } from '../../src/gastos/kaly/prompt';

test('inyecta el bloque de memorias cuando hay', () => {
  const p = buildSystemPrompt({ memorias: [{ tipo: 'negocio', contenido: 'Cierra domingos' }] });
  expect(p).toContain('Lo que sé de este negocio');
  expect(p).toContain('Cierra domingos');
});

test('sin memorias no rompe ni mete el bloque', () => {
  const p = buildSystemPrompt({});
  expect(p).not.toContain('Lo que sé de este negocio');
});

test('aplica el nombre de persona override', () => {
  const p = buildSystemPrompt({ persona: { nombre: 'Sofía' } });
  expect(p).toContain('Sofía');
});

describe('M5 saludo proactivo', () => {
  test('instruccionInicial saludo con señal la menciona', () => {
    const txt = instruccionInicial({ saludoHora: 'dia', nombre: 'José', trato: 'señor', senales: ['este mes vas con saldo negativo'] }, 'saludo');
    expect(txt).toMatch(/saldo negativo/i);
  });

  test('instruccionInicial saludo sin señales → saludo genérico (sin inventar)', () => {
    const txt = instruccionInicial({ saludoHora: 'dia', nombre: 'José', trato: 'señor', senales: [] }, 'saludo');
    expect(txt).toMatch(/en qué trabajaremos hoy|Necesita ayuda/i);
    expect(txt).not.toMatch(/saldo negativo/i);
  });

  test('instruccionInicial onboarding NO cambia con señales', () => {
    const txt = instruccionInicial({ senales: ['lo que sea'] }, 'onboarding');
    expect(txt).toMatch(/onboarding completo/i);
    expect(txt).not.toMatch(/lo que sea/i);
  });

  test('buildSystemPrompt incluye bloque Saludo proactivo cuando hay señales', () => {
    const p = buildSystemPrompt({ senales: ['no me has contado tu horario de atención'], memorias: [], resumen: {} });
    expect(p).toMatch(/Saludo proactivo/i);
    expect(p).toMatch(/horario de atención/i);
  });

  test('buildSystemPrompt omite el bloque sin señales', () => {
    const p = buildSystemPrompt({ senales: [], memorias: [], resumen: {} });
    expect(p).not.toMatch(/Saludo proactivo/i);
  });
});
