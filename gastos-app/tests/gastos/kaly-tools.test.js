import { executeTool, TOOL_DECLARATIONS } from '../../src/gastos/kaly/tools';

// ── Mock api ─────────────────────────────────────────────────────────────────

jest.mock('../../src/gastos/api', () => ({
  api: {
    agentPrefs: jest.fn(),
    listExpenses: jest.fn(),
    pagarExpense: jest.fn(),
    annulExpense: jest.fn(),
    resumenWhatsapp: jest.fn(),
  },
}));

import { api } from '../../src/gastos/api';

beforeEach(() => {
  jest.clearAllMocks();
});

// ── TOOL_DECLARATIONS ─────────────────────────────────────────────────────────

test('TOOL_DECLARATIONS has 6 entries', () => {
  expect(TOOL_DECLARATIONS).toHaveLength(6);
  const names = TOOL_DECLARATIONS.map((t) => t.name);
  expect(names).toContain('guardar_preferencias');
  expect(names).toContain('obtener_resumen');
  expect(names).toContain('listar_movimientos');
  expect(names).toContain('marcar_pagada');
  expect(names).toContain('anular_movimiento');
  expect(names).toContain('enviar_resumen_whatsapp');
});

// ── guardar_preferencias ──────────────────────────────────────────────────────

test('guardar_preferencias llama agentPrefs con onboarded:true y dispara onPrefsSaved', async () => {
  api.agentPrefs.mockResolvedValue({ ok: true });
  const onPrefsSaved = jest.fn();

  const result = await executeTool('guardar_preferencias', { nombre: 'José', trato: 'señor' }, { onPrefsSaved });

  expect(api.agentPrefs).toHaveBeenCalledWith({ nombre: 'José', trato: 'señor', onboarded: true });
  expect(onPrefsSaved).toHaveBeenCalledWith({ nombre: 'José', trato: 'señor' });
  expect(result).toEqual({ ok: true });
});

test('guardar_preferencias sin onPrefsSaved no explota', async () => {
  api.agentPrefs.mockResolvedValue({ ok: true });
  const result = await executeTool('guardar_preferencias', { nombre: 'Ana', trato: 'señora' });
  expect(result).toEqual({ ok: true });
});

// ── obtener_resumen ───────────────────────────────────────────────────────────

test('obtener_resumen suma solo confirmados y separa ingresos/gastos', async () => {
  api.listExpenses.mockResolvedValue([
    { tipo: 'ingreso', total: 1000000, estado: 'confirmado' },
    { tipo: 'gasto',   total:  300000, estado: 'confirmado' },
    { tipo: 'gasto',   total:  200000, estado: 'pendiente' }, // debe ignorarse
    { tipo: 'ingreso', total:   50000, estado: 'anulado' },   // debe ignorarse
  ]);

  const result = await executeTool('obtener_resumen');

  expect(result).toEqual({ ingresos: 1000000, gastos: 300000, saldo: 700000 });
});

test('obtener_resumen con lista vacía devuelve ceros', async () => {
  api.listExpenses.mockResolvedValue([]);
  expect(await executeTool('obtener_resumen')).toEqual({ ingresos: 0, gastos: 0, saldo: 0 });
});

// ── listar_movimientos ────────────────────────────────────────────────────────

test('listar_movimientos respeta el límite', async () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    tipo: 'gasto', proveedor: `P${i}`, total: i * 100, estado: 'confirmado', estado_pago: 'pendiente',
  }));
  api.listExpenses.mockResolvedValue(rows);

  const result = await executeTool('listar_movimientos', { limite: 3 });

  expect(result.movimientos).toHaveLength(3);
  expect(result.movimientos[0].proveedor).toBe('P0');
});

test('listar_movimientos usa limite=5 por defecto', async () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({
    tipo: 'gasto', proveedor: `P${i}`, total: i * 100, estado: 'confirmado', estado_pago: 'pendiente',
  }));
  api.listExpenses.mockResolvedValue(rows);

  const result = await executeTool('listar_movimientos', {});
  expect(result.movimientos).toHaveLength(5);
});

test('listar_movimientos mapea campos correctos', async () => {
  api.listExpenses.mockResolvedValue([
    { tipo: 'gasto', proveedor: 'Copec', total: 25000, estado: 'confirmado', estado_pago: 'pendiente', id: 'x1' },
  ]);

  const result = await executeTool('listar_movimientos', { limite: 1 });
  const mov = result.movimientos[0];
  expect(mov).toEqual({ tipo: 'gasto', proveedor: 'Copec', total: 25000, estado: 'confirmado', estado_pago: 'pendiente' });
  expect(mov.id).toBeUndefined(); // id debe quedar excluido
});

// ── marcar_pagada ─────────────────────────────────────────────────────────────

test('marcar_pagada busca por proveedor (substring) y llama pagarExpense con el id correcto', async () => {
  api.listExpenses.mockResolvedValue([
    { id: 'exp-1', proveedor: 'Copec', total: 25000, estado: 'confirmado', estado_pago: 'pendiente' },
    { id: 'exp-2', proveedor: 'Sodimac', total: 11900, estado: 'confirmado', estado_pago: 'pendiente' },
  ]);
  api.pagarExpense.mockResolvedValue({ estado_pago: 'pagado' });

  const result = await executeTool('marcar_pagada', { proveedor: 'cope' });

  expect(api.pagarExpense).toHaveBeenCalledWith('exp-1');
  expect(result).toEqual({ ok: true, proveedor: 'Copec', total: 25000, estado_pago: 'pagado' });
});

test('marcar_pagada devuelve no_encontrado si no hay match', async () => {
  api.listExpenses.mockResolvedValue([
    { id: 'exp-1', proveedor: 'Copec', total: 25000, estado: 'confirmado', estado_pago: 'pendiente' },
  ]);

  const result = await executeTool('marcar_pagada', { proveedor: 'xyz' });

  expect(api.pagarExpense).not.toHaveBeenCalled();
  expect(result.error).toBe('no_encontrado');
});

// ── anular_movimiento ─────────────────────────────────────────────────────────

test('anular_movimiento llama annulExpense con el id correcto', async () => {
  api.listExpenses.mockResolvedValue([
    { id: 'exp-3', proveedor: 'Walmart', total: 15000, estado: 'confirmado', estado_pago: 'pendiente' },
  ]);
  api.annulExpense.mockResolvedValue({ ok: true });

  const result = await executeTool('anular_movimiento', { proveedor: 'walmart' });

  expect(api.annulExpense).toHaveBeenCalledWith('exp-3');
  expect(result).toEqual({ ok: true, anulado: 'Walmart', total: 15000 });
});

test('anular_movimiento devuelve no_encontrado si no hay match', async () => {
  api.listExpenses.mockResolvedValue([]);

  const result = await executeTool('anular_movimiento', { proveedor: 'nadie' });
  expect(result.error).toBe('no_encontrado');
});

// ── enviar_resumen_whatsapp ───────────────────────────────────────────────────

test('enviar_resumen_whatsapp llama resumenWhatsapp y devuelve enviado_a', async () => {
  api.resumenWhatsapp.mockResolvedValue({ ok: true, to: '+56912345678' });

  const result = await executeTool('enviar_resumen_whatsapp');

  expect(api.resumenWhatsapp).toHaveBeenCalled();
  expect(result).toEqual({ ok: true, enviado_a: '+56912345678' });
});

// ── unknown tool ──────────────────────────────────────────────────────────────

test('herramienta desconocida devuelve {error: "tool_desconocida"}', async () => {
  const result = await executeTool('no_existe_esta_tool');
  expect(result).toEqual({ error: 'tool_desconocida' });
});

// ── api throws ────────────────────────────────────────────────────────────────

test('cuando api lanza, devuelve {error: "fallo_operacion"}', async () => {
  api.agentPrefs.mockRejectedValue(new Error('network error'));

  const result = await executeTool('guardar_preferencias', { nombre: 'Ana', trato: 'señora' });

  expect(result.error).toBe('fallo_operacion');
  expect(result.detalle).toBe('network error');
});

test('cuando api.listExpenses lanza en obtener_resumen, devuelve fallo_operacion', async () => {
  api.listExpenses.mockRejectedValue(new Error('timeout'));

  const result = await executeTool('obtener_resumen');
  expect(result.error).toBe('fallo_operacion');
});
