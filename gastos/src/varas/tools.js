// gastos/src/varas/tools.js
// Tools de VARAS conversacional. LECTURA = se ejecutan; ACCIÓN = se proponen (F4a-2).
const reportes = require('../contabilidad/reportes');
const matchRepo = require('../match/repo');
const auxReportes = require('../auxiliares/reportes');

const ACCION_NAMES = new Set(['marcar_pagado', 'crear_asiento_manual', 'enviar_resumen_whatsapp', 'crear_movimiento']);

async function _saldoClave(db, companyId, clave, filtros) {
  const mayor = await reportes.libroMayor(db, companyId, filtros || {});
  const c = mayor.find((x) => x.clave === clave);
  return c ? Number(c.saldo) : 0;
}

const TOOLS_READ = {
  async saldo_cuenta(db, companyId, args = {}) {
    const mayor = await reportes.libroMayor(db, companyId, {});
    const q = String(args.nombre || args.clave || '').toLowerCase();
    const c = mayor.find((x) => (x.clave && x.clave === q) || (x.nombre && x.nombre.toLowerCase().includes(q)));
    return c ? { cuenta: c.nombre, saldo: Number(c.saldo) } : { cuenta: null, saldo: 0 };
  },
  async balance(db, companyId, args = {}) {
    return reportes.balanceComprobacion(db, companyId, args);
  },
  async flujo(db, companyId, args = {}) {
    return reportes.flujoCaja(db, companyId, args);
  },
  async deudas(db, companyId, args = {}) {
    // Proveedores: saldo acreedor (haber-debe) ⇒ -saldo; Clientes: saldo deudor (debe-haber) ⇒ saldo
    const prov = await _saldoClave(db, companyId, 'proveedores', args);
    const cli = await _saldoClave(db, companyId, 'clientes', args);
    return { proveedores: Math.max(0, -prov), clientes: Math.max(0, cli) };
  },
  async estado_conciliacion(db, companyId, args = {}) {
    const u = await matchRepo.getUltima(db, companyId, 'bancaria');
    if (!u) return { hay: false };
    return { hay: true, cuadrado: u.cuadrado, sca: Number(u.sca), sba: Number(u.sba) };
  },
  async consumo_insumo(db, companyId, args = {}) {
    const c = await auxReportes.consumoPorNombre(db, companyId, args.nombre || '', args);
    return { ...c, frase: auxReportes.frasearConsumo(c, args.nombre || '') };
  },
};

const TOOL_DECLARATIONS = [
  { name: 'saldo_cuenta', description: 'Saldo de una cuenta contable por nombre o clave (ej. banco, caja, proveedores).', parameters: { type: 'object', properties: { nombre: { type: 'string' } } } },
  { name: 'balance', description: 'Balance de comprobación: totales debe/haber y si cuadra.', parameters: { type: 'object', properties: {} } },
  { name: 'flujo', description: 'Flujo de caja del período (entradas/salidas/neto). Param opcional periodo YYYY-MM.', parameters: { type: 'object', properties: { periodo: { type: 'string' } } } },
  { name: 'deudas', description: 'Cuánto debe la empresa a proveedores (por pagar) y cuánto le deben los clientes (por cobrar).', parameters: { type: 'object', properties: {} } },
  { name: 'estado_conciliacion', description: 'Estado de la última conciliación bancaria (cuadrado, SCA/SBA).', parameters: { type: 'object', properties: {} } },
  { name: 'consumo_insumo', description: 'Consumo de un insumo/auxiliar por nombre (cantidad por unidad, monto, frase). Param opcional periodo YYYY-MM.', parameters: { type: 'object', properties: { nombre: { type: 'string' }, periodo: { type: 'string' } }, required: ['nombre'] } },
  // Acciones (las propone; ejecuta /varas/accion en F4a-2):
  { name: 'marcar_pagado', description: 'Marca un gasto como pagado (requiere confirmación).', parameters: { type: 'object', properties: { descripcion: { type: 'string' } } } },
  { name: 'crear_asiento_manual', description: 'Crea un asiento manual (requiere confirmación).', parameters: { type: 'object', properties: { fecha: { type: 'string' }, glosa: { type: 'string' }, lineas: { type: 'array' } } } },
  { name: 'enviar_resumen_whatsapp', description: 'Envía el resumen de caja al WhatsApp del dueño (requiere confirmación).', parameters: { type: 'object', properties: {} } },
  { name: 'crear_movimiento', description: 'Registra un movimiento (gasto o ingreso) dictado por el dueño, calculando neto/IVA (requiere confirmación).', parameters: { type: 'object', properties: { tipo: { type: 'string', enum: ['gasto', 'ingreso'] }, proveedor: { type: 'string' }, total: { type: 'number' }, neto: { type: 'number' }, fecha: { type: 'string' }, categoria: { type: 'string' } }, required: ['tipo'] } },
];

function descAccion(tipo, args = {}) {
  if (tipo === 'marcar_pagado') return `Marcar como pagado: ${args.descripcion || 'el gasto indicado'}.`;
  if (tipo === 'crear_asiento_manual') return `Crear asiento manual: ${args.glosa || 'ajuste'}.`;
  if (tipo === 'enviar_resumen_whatsapp') return 'Enviar el resumen de caja por WhatsApp.';
  if (tipo === 'crear_movimiento') return `Registrar ${args.tipo === 'ingreso' ? 'ingreso' : 'gasto'}${args.proveedor ? ' de ' + args.proveedor : ''}${args.total ? ' por $' + Number(args.total).toLocaleString('es-CL') : ''}.`;
  return 'Acción propuesta.';
}

module.exports = { TOOLS_READ, TOOL_DECLARATIONS, ACCION_NAMES, descAccion };
