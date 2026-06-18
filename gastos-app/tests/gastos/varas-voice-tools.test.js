import { executeVarasVoiceTool, TOOL_DECLARATIONS, ACCION_NAMES } from '../../src/gastos/varas/voice/tools';

jest.mock('../../src/gastos/api', () => ({
  api: {
    varasTool: jest.fn(),
    varasAccion: jest.fn(),
  },
}));

import { api } from '../../src/gastos/api';

beforeEach(() => {
  jest.clearAllMocks();
});

// ── TOOL_DECLARATIONS ──────────────────────────────────────────────────────────

test('TOOL_DECLARATIONS tiene los 6 de lectura y 3 de acción, formato Live OBJECT', () => {
  const names = TOOL_DECLARATIONS.map((t) => t.name);
  ['saldo_cuenta', 'balance', 'flujo', 'deudas', 'estado_conciliacion', 'consumo_insumo'].forEach((n) =>
    expect(names).toContain(n),
  );
  ['marcar_pagado', 'crear_asiento_manual', 'enviar_resumen_whatsapp'].forEach((n) =>
    expect(names).toContain(n),
  );
  // Live usa OBJECT en mayúscula
  const balance = TOOL_DECLARATIONS.find((t) => t.name === 'balance');
  expect(balance.parameters.type).toBe('OBJECT');
});

test('ACCION_NAMES contiene exactamente las acciones', () => {
  expect(ACCION_NAMES.has('marcar_pagado')).toBe(true);
  expect(ACCION_NAMES.has('crear_asiento_manual')).toBe(true);
  expect(ACCION_NAMES.has('enviar_resumen_whatsapp')).toBe(true);
  expect(ACCION_NAMES.has('balance')).toBe(false);
});

// ── lectura → varasTool ────────────────────────────────────────────────────────

test('executeVarasVoiceTool("balance") llama api.varasTool y devuelve data', async () => {
  api.varasTool.mockResolvedValue({ data: { cuadra: true, debe: 100, haber: 100 } });
  const r = await executeVarasVoiceTool('balance', {});
  expect(api.varasTool).toHaveBeenCalledWith('balance', {});
  expect(r).toEqual({ cuadra: true, debe: 100, haber: 100 });
});

test('lectura con args los pasa tal cual', async () => {
  api.varasTool.mockResolvedValue({ data: { saldo: 5 } });
  await executeVarasVoiceTool('consumo_insumo', { nombre: 'harina' });
  expect(api.varasTool).toHaveBeenCalledWith('consumo_insumo', { nombre: 'harina' });
});

test('lectura sin data devuelve la respuesta cruda', async () => {
  api.varasTool.mockResolvedValue({ algo: 1 });
  const r = await executeVarasVoiceTool('deudas', {});
  expect(r).toEqual({ algo: 1 });
});

// ── acción → varasAccion ───────────────────────────────────────────────────────

test('executeVarasVoiceTool("marcar_pagado") llama api.varasAccion', async () => {
  api.varasAccion.mockResolvedValue({ ok: true });
  const r = await executeVarasVoiceTool('marcar_pagado', { descripcion: 'arriendo' });
  expect(api.varasAccion).toHaveBeenCalledWith('marcar_pagado', { descripcion: 'arriendo' });
  expect(api.varasTool).not.toHaveBeenCalled();
  expect(r).toEqual({ ok: true });
});

// ── errores ────────────────────────────────────────────────────────────────────

test('si la api lanza, devuelve {error}', async () => {
  api.varasTool.mockRejectedValue(new Error('boom'));
  const r = await executeVarasVoiceTool('balance', {});
  expect(r.error).toBeDefined();
});
