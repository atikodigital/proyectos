import { api } from '../api';

export const TOOL_DECLARATIONS = [
  { name: 'guardar_preferencias', description: 'Guarda nombre y trato preferido del usuario en memoria permanente', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING' }, trato: { type: 'STRING', description: 'señor o señora' } } } },
  { name: 'obtener_resumen', description: 'Resumen del mes: ingresos, gastos, saldo', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'listar_movimientos', description: 'Lista los últimos movimientos', parameters: { type: 'OBJECT', properties: { limite: { type: 'NUMBER' } } } },
  { name: 'marcar_pagada', description: 'Marca como pagado un gasto YA CONFIRMADO VERBALMENTE por el usuario', parameters: { type: 'OBJECT', properties: { proveedor: { type: 'STRING', description: 'proveedor o descripción del gasto' } } } },
  { name: 'anular_movimiento', description: 'Anula un movimiento YA CONFIRMADO VERBALMENTE por el usuario', parameters: { type: 'OBJECT', properties: { proveedor: { type: 'STRING' } } } },
  { name: 'enviar_resumen_whatsapp', description: 'Envía el resumen de flujo de caja al WhatsApp del dueño (requiere confirmación verbal previa)', parameters: { type: 'OBJECT', properties: {} } },
  {
    name: 'crear_movimiento_manual',
    description: 'Registra un gasto o ingreso manual sin imagen en la base de datos (Transaccional)',
    parameters: {
      type: 'OBJECT',
      properties: {
        tipo: { type: 'STRING', enum: ['ingreso', 'gasto'], description: 'tipo de movimiento' },
        proveedor: { type: 'STRING', description: 'Nombre del proveedor o descripción' },
        rut_emisor: { type: 'STRING', description: 'RUT del emisor' },
        folio: { type: 'STRING', description: 'Folio o número de documento' },
        fecha: { type: 'STRING', description: 'Fecha en formato YYYY-MM-DD' },
        neto: { type: 'NUMBER', description: 'Monto neto' },
        iva: { type: 'NUMBER', description: 'Monto de IVA (19%)' },
        total: { type: 'NUMBER', description: 'Monto total' },
        categoria: { type: 'STRING', description: 'Categoría contable' },
        estado_pago: { type: 'STRING', enum: ['pagada', 'pendiente'], description: 'Estado de pago inicial' }
      },
      required: ['tipo', 'total']
    }
  }
];

function buscarMovimiento(rows, proveedor) {
  const q = String(proveedor || '').toLowerCase();
  return rows.find((r) => String(r.proveedor || '').toLowerCase().includes(q)) || null;
}

export async function executeTool(name, args = {}, { onPrefsSaved } = {}) {
  try {
    if (name === 'guardar_preferencias') {
      await api.agentPrefs({ nombre: args.nombre, trato: args.trato, onboarded: true });
      if (onPrefsSaved) onPrefsSaved(args);
      return { ok: true };
    }
    if (name === 'obtener_resumen' || name === 'listar_movimientos') {
      const rows = await api.listExpenses();
      if (name === 'listar_movimientos') return { movimientos: rows.slice(0, args.limite || 5).map((r) => ({ tipo: r.tipo, proveedor: r.proveedor, total: r.total, estado: r.estado, estado_pago: r.estado_pago })) };
      let gastos = 0; let ingresos = 0;
      for (const r of rows) { if (r.estado !== 'confirmado') continue; if (r.tipo === 'ingreso') ingresos += Number(r.total) || 0; else gastos += Number(r.total) || 0; }
      return { ingresos, gastos, saldo: ingresos - gastos };
    }
    if (name === 'marcar_pagada' || name === 'anular_movimiento') {
      const rows = await api.listExpenses();
      const mov = buscarMovimiento(rows, args.proveedor);
      if (!mov) return { error: 'no_encontrado', detalle: 'No encontré un movimiento que coincida.' };
      if (name === 'marcar_pagada') { const r = await api.pagarExpense(mov.id); return { ok: true, proveedor: mov.proveedor, total: mov.total, estado_pago: r.estado_pago }; }
      await api.annulExpense(mov.id);
      return { ok: true, anulado: mov.proveedor, total: mov.total };
    }
    if (name === 'enviar_resumen_whatsapp') { const r = await api.resumenWhatsapp(); return { ok: true, enviado_a: r.to }; }
    if (name === 'crear_movimiento_manual') {
      const r = await api.createManualExpense(args);
      return { ok: true, id: r.id, proveedor: r.proveedor, total: r.total };
    }
    return { error: 'tool_desconocida' };
  } catch (e) {
    return { error: 'fallo_operacion', detalle: e.message || 'error' };
  }
}
