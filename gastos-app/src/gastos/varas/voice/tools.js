import { api } from '../../api';

/**
 * Declaraciones de herramientas de VARAS para Gemini Live (formato OBJECT/STRING en mayúscula).
 * Mismos nombres que el cerebro server-side (gastos/src/varas/tools.js):
 *  - lectura: saldo_cuenta, balance, flujo, deudas, estado_conciliacion, consumo_insumo
 *  - acción:  marcar_pagado, crear_asiento_manual, enviar_resumen_whatsapp
 */
export const TOOL_DECLARATIONS = [
  { name: 'saldo_cuenta', description: 'Saldo de una cuenta contable por nombre o clave (ej. banco, caja, proveedores).', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING' } } } },
  { name: 'balance', description: 'Balance de comprobación: totales debe/haber y si cuadra.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'flujo', description: 'Flujo de caja del período (entradas/salidas/neto). Param opcional periodo YYYY-MM.', parameters: { type: 'OBJECT', properties: { periodo: { type: 'STRING' } } } },
  { name: 'deudas', description: 'Cuánto debe la empresa a proveedores (por pagar) y cuánto le deben los clientes (por cobrar).', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'estado_conciliacion', description: 'Estado de la última conciliación bancaria (cuadrado, SCA/SBA).', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'consumo_insumo', description: 'Consumo de un insumo/auxiliar por nombre (cantidad por unidad, monto, frase). Param opcional periodo YYYY-MM.', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING' }, periodo: { type: 'STRING' } }, required: ['nombre'] } },
  { name: 'gastos', description: 'Consulta los GASTOS o INGRESOS registrados (lo que capturó KALY por foto, voz o texto): total, desglose por categoría y últimos movimientos. Filtros opcionales: tipo (gasto|ingreso), categoria, proveedor, periodo YYYY-MM. Úsala SIEMPRE que pregunten por gastos: "¿cuánto gasté?", "¿en qué gasté?", "¿qué le compré a X?".', parameters: { type: 'OBJECT', properties: { tipo: { type: 'STRING' }, categoria: { type: 'STRING' }, proveedor: { type: 'STRING' }, periodo: { type: 'STRING' } } } },
  // Acciones — requieren confirmación verbal explícita (ver prompt):
  { name: 'marcar_pagado', description: 'Marca un gasto como pagado. SOLO tras confirmación verbal explícita del usuario.', parameters: { type: 'OBJECT', properties: { descripcion: { type: 'STRING' } } } },
  { name: 'crear_asiento_manual', description: 'Crea un asiento manual. SOLO tras confirmación verbal explícita del usuario.', parameters: { type: 'OBJECT', properties: { fecha: { type: 'STRING' }, glosa: { type: 'STRING' }, lineas: { type: 'ARRAY', items: { type: 'OBJECT', properties: { cuenta: { type: 'STRING' }, debe: { type: 'NUMBER' }, haber: { type: 'NUMBER' } } } } } } },
  { name: 'enviar_resumen_whatsapp', description: 'Envía el resumen de caja por WhatsApp al dueño. SOLO tras confirmación verbal explícita del usuario.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'recordar', description: 'Guarda un dato del negocio o del usuario para recordarlo después (ej. "el arriendo se paga el 5"). No cobra ni mueve dinero.', parameters: { type: 'OBJECT', properties: { contenido: { type: 'STRING' }, tipo: { type: 'STRING' }, alcance: { type: 'STRING', description: 'empresa (por defecto) o personal' } }, required: ['contenido'] } },
];

export const ACCION_NAMES = new Set(['marcar_pagado', 'crear_asiento_manual', 'enviar_resumen_whatsapp', 'recordar']);

export async function executeVarasVoiceTool(name, args = {}) {
  try {
    if (ACCION_NAMES.has(name)) {
      return await api.varasAccion(name, args);
    }
    const r = await api.varasTool(name, args);
    return (r && r.data != null) ? r.data : r;
  } catch (e) {
    return { error: (e && e.message) || 'fallo_tool' };
  }
}
