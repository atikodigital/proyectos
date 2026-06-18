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
  },
  { name: 'agregar_producto', description: 'Crea un producto nuevo en el catálogo de ventas. Confirma DESPUÉS de crearlo.', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING', description: 'Nombre del producto' }, precio: { type: 'NUMBER', description: 'Precio en pesos chilenos enteros' }, tipo: { type: 'STRING', enum: ['producto', 'servicio'], description: 'por defecto producto' } }, required: ['nombre', 'precio'] } },
  { name: 'editar_precio', description: 'Cambia el precio de un producto que YA existe en el catálogo.', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING', description: 'nombre o parte del nombre del producto' }, nuevo_precio: { type: 'NUMBER', description: 'nuevo precio en CLP entero' } }, required: ['nombre', 'nuevo_precio'] } },
  { name: 'editar_stock', description: 'Fija el stock disponible de un producto que YA existe.', parameters: { type: 'OBJECT', properties: { nombre: { type: 'STRING', description: 'nombre o parte del nombre del producto' }, stock: { type: 'NUMBER', description: 'unidades disponibles' } }, required: ['nombre', 'stock'] } },
  { name: 'listar_productos', description: 'Lista los productos del catálogo con su precio y stock.', parameters: { type: 'OBJECT', properties: { limite: { type: 'NUMBER' } } } },
  { name: 'recordar', description: 'Guarda un dato importante del negocio o del dueño para recordarlo en futuras conversaciones (ej. horarios, preferencias, datos del dueño).', parameters: { type: 'OBJECT', properties: { contenido: { type: 'STRING', description: 'el dato a recordar, en una frase' }, tipo: { type: 'STRING', enum: ['negocio', 'dueño', 'preferencia', 'hecho'] } }, required: ['contenido'] } }
  ,{ name: 'pedir_documento', description: 'Pide al usuario que adjunte una foto o captura de un documento (boleta, factura, comprobante o cartola). Úsalo cuando necesites ver un documento.', parameters: { type: 'OBJECT', properties: { motivo: { type: 'STRING', description: 'qué documento pides, en pocas palabras' }, destino: { type: 'STRING', enum: ['gasto', 'cartola'], description: 'gasto = boleta/factura/comprobante; cartola = cartola bancaria' } }, required: ['motivo'] } }
];

const TOOLS_ESCRITURA = new Set([
  'guardar_preferencias', 'marcar_pagada', 'anular_movimiento', 'enviar_resumen_whatsapp',
  'crear_movimiento_manual', 'agregar_producto', 'editar_precio', 'editar_stock', 'recordar',
]);

export function construirPropuesta(name, args = {}) {
  switch (name) {
    case 'agregar_producto':
      return { titulo: 'Crear producto', accion: name, campos: [
        { key: 'nombre', label: 'Nombre', valor: args.nombre || '', tipo: 'texto' },
        { key: 'precio', label: 'Precio (CLP)', valor: Number(args.precio) || 0, tipo: 'numero' },
        { key: 'tipo', label: 'Tipo', valor: args.tipo === 'servicio' ? 'servicio' : 'producto', tipo: 'opciones', opciones: ['producto', 'servicio'] },
      ] };
    case 'editar_precio':
      return { titulo: 'Cambiar precio', accion: name, campos: [
        { key: 'nombre', label: 'Producto', valor: args.nombre || '', tipo: 'texto' },
        { key: 'nuevo_precio', label: 'Nuevo precio (CLP)', valor: Number(args.nuevo_precio) || 0, tipo: 'numero' },
      ] };
    case 'editar_stock':
      return { titulo: 'Fijar stock', accion: name, campos: [
        { key: 'nombre', label: 'Producto', valor: args.nombre || '', tipo: 'texto' },
        { key: 'stock', label: 'Stock', valor: Number(args.stock) || 0, tipo: 'numero' },
      ] };
    case 'recordar':
      return { titulo: 'Guardar en memoria', accion: name, campos: [
        { key: 'contenido', label: 'Dato a recordar', valor: args.contenido || '', tipo: 'texto' },
        { key: 'tipo', label: 'Tipo', valor: ['negocio', 'dueño', 'preferencia', 'hecho'].includes(args.tipo) ? args.tipo : 'hecho', tipo: 'opciones', opciones: ['negocio', 'dueño', 'preferencia', 'hecho'] },
      ] };
    case 'crear_movimiento_manual':
      return { titulo: 'Registrar movimiento', accion: name, campos: [
        { key: 'tipo', label: 'Tipo', valor: args.tipo === 'ingreso' ? 'ingreso' : 'gasto', tipo: 'opciones', opciones: ['gasto', 'ingreso'] },
        { key: 'proveedor', label: 'Proveedor / descripción', valor: args.proveedor || '', tipo: 'texto' },
        { key: 'total', label: 'Total (CLP)', valor: Number(args.total) || 0, tipo: 'numero' },
        { key: 'categoria', label: 'Categoría', valor: args.categoria || '', tipo: 'texto' },
        { key: 'estado_pago', label: 'Estado de pago', valor: args.estado_pago === 'pagada' ? 'pagada' : 'pendiente', tipo: 'opciones', opciones: ['pendiente', 'pagada'] },
      ] };
    case 'marcar_pagada':
      return { titulo: 'Marcar gasto como pagado', accion: name, nota: 'Buscaré el gasto que coincida y lo marcaré como pagado.', campos: [
        { key: 'proveedor', label: 'Proveedor / descripción', valor: args.proveedor || '', tipo: 'texto' },
      ] };
    case 'anular_movimiento':
      return { titulo: 'Anular movimiento', accion: name, nota: 'Buscaré el movimiento que coincida y lo anularé.', campos: [
        { key: 'proveedor', label: 'Proveedor / descripción', valor: args.proveedor || '', tipo: 'texto' },
      ] };
    case 'enviar_resumen_whatsapp':
      return { titulo: 'Enviar resumen por WhatsApp', accion: name, nota: 'Se enviará el resumen de flujo de caja al WhatsApp del dueño.', campos: [] };
    case 'guardar_preferencias':
      return { titulo: 'Guardar tus datos', accion: name, campos: [
        { key: 'nombre', label: 'Nombre', valor: args.nombre || '', tipo: 'texto' },
        { key: 'trato', label: 'Trato', valor: args.trato === 'señora' ? 'señora' : 'señor', tipo: 'opciones', opciones: ['señor', 'señora'] },
      ] };
    default:
      return null;
  }
}

function buscarMovimiento(rows, proveedor) {
  const q = String(proveedor || '').toLowerCase();
  return rows.find((r) => String(r.proveedor || '').toLowerCase().includes(q)) || null;
}

function buscarProducto(rows, nombre) {
  const q = String(nombre || '').toLowerCase();
  return rows.find((r) => String(r.nombre || '').toLowerCase().includes(q)) || null;
}

export async function executeTool(name, args = {}, { onPrefsSaved, proponer, pedirEvidencia } = {}) {
  // Caso A: pedir documento → captura.
  if (name === 'pedir_documento') {
    if (typeof pedirEvidencia !== 'function') return { error: 'no_disponible' };
    const ev = await pedirEvidencia({ motivo: args.motivo });
    if (!ev) return { cancelado: true, detalle: 'El usuario no adjuntó nada.' };
    try {
      if (args.destino === 'cartola') { const r = await api.matchCartola(ev.imageBase64, ev.imageMimeType); return { ok: true, ...r }; }
      const r = await api.createExpense(ev.imageBase64, ev.imageMimeType); return { ok: true, id: r.id };
    } catch (e) { return { error: 'fallo_operacion', detalle: e.message || 'error' }; }
  }
  // Caso B: escritura → propuesta editable (si hay 'proponer').
  if (TOOLS_ESCRITURA.has(name) && typeof proponer === 'function') {
    const datos = await proponer(construirPropuesta(name, args));
    if (!datos) return { cancelado: true, detalle: 'El usuario canceló la acción.' };
    args = { ...args, ...datos };
  }
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
    if (name === 'agregar_producto') {
      const r = await api.createProduct({ nombre: args.nombre, precio_base: Math.max(0, Math.round(Number(args.precio) || 0)), tipo: args.tipo === 'servicio' ? 'servicio' : 'producto' });
      return { ok: true, nombre: r.nombre, precio: r.precio_base };
    }
    if (name === 'editar_precio' || name === 'editar_stock') {
      const rows = await api.listProducts(true);
      const prod = buscarProducto(rows, args.nombre);
      if (!prod) return { error: 'no_encontrado', detalle: 'No encontré ese producto en el catálogo.' };
      if (name === 'editar_precio') {
        const r = await api.updateProduct(prod.id, { precio_base: Math.max(0, Math.round(Number(args.nuevo_precio) || 0)) });
        return { ok: true, nombre: prod.nombre, precio: r.precio_base };
      }
      const r = await api.updateProduct(prod.id, { stock: Math.max(0, Math.round(Number(args.stock) || 0)) });
      return { ok: true, nombre: prod.nombre, stock: r.stock };
    }
    if (name === 'listar_productos') {
      const rows = await api.listProducts(true);
      return { productos: rows.slice(0, args.limite || 10).map((p) => ({ nombre: p.nombre, precio: p.precio_base, stock: p.stock, activo: p.activo })) };
    }
    if (name === 'recordar') {
      const r = await api.kalyRecordar({ tipo: args.tipo, contenido: args.contenido });
      return { ok: true, contenido: r.contenido };
    }
    return { error: 'tool_desconocida' };
  } catch (e) {
    return { error: 'fallo_operacion', detalle: e.message || 'error' };
  }
}
