import { createVadGate, rmsOf } from '../../src/gastos/kaly/vad';

test('rmsOf calcula la energía del frame', () => {
  expect(rmsOf(new Float32Array([0, 0, 0, 0]))).toBe(0);
  expect(rmsOf(new Float32Array([0.5, 0.5, 0.5, 0.5]))).toBeCloseTo(0.5, 5);
  expect(rmsOf([])).toBe(0);
});

test('gate manda durante la voz y corta tras el hangover; reanuda al volver a hablar', () => {
  const g = createVadGate({ threshold: 0.1, hangoverMs: 500 });
  expect(g.feed(0.2, 1000)).toEqual({ send: true, voiced: true });   // hay voz
  expect(g.feed(0.0, 1200).send).toBe(true);   // +200ms: dentro del hangover
  expect(g.feed(0.0, 1500).send).toBe(true);   // +500ms: justo en el límite
  expect(g.feed(0.0, 1600)).toEqual({ send: false, voiced: false }); // +600ms: corta el silencio
  expect(g.feed(0.05, 2000).send).toBe(false); // bajo el umbral: sigue cortado
  expect(g.feed(0.3, 2100)).toEqual({ send: true, voiced: true });   // vuelve a hablar
});

test('lastVoicedAt refleja el último frame con voz (para el corte por inactividad)', () => {
  const g = createVadGate({ threshold: 0.1 });
  g.feed(0.2, 5000);
  g.feed(0.0, 6000);
  expect(g.lastVoicedAt()).toBe(5000);
});
