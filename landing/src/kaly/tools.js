// Tools de KALY en la landing (function calling de Gemini Live). La UI pasa callbacks.
export const TOOL_DECLARATIONS = [
  { name: 'mostrar_features', description: 'Muestra las tarjetas de características de Hash IA en pantalla. familia opcional: finanzas o ventas.', parameters: { type: 'OBJECT', properties: { familia: { type: 'STRING', enum: ['finanzas', 'ventas', 'todas'] } } } },
  { name: 'mostrar_planes', description: 'Lleva al visitante a la sección de planes y precios.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'descargar_app', description: 'Inicia la descarga de la aplicación Hash IA.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'abrir_whatsapp', description: 'Abre WhatsApp para hablar con un asesor de Atiko.', parameters: { type: 'OBJECT', properties: {} } },
];

export function executeTool(name, args = {}, ui = {}) {
  if (name === 'mostrar_features') { ui.mostrarFeatures && ui.mostrarFeatures(args.familia || 'todas'); return { ok: true }; }
  if (name === 'mostrar_planes') { ui.mostrarPlanes && ui.mostrarPlanes(); return { ok: true }; }
  if (name === 'descargar_app') { ui.descargarApp && ui.descargarApp(); return { ok: true }; }
  if (name === 'abrir_whatsapp') { ui.abrirWhatsapp && ui.abrirWhatsapp(); return { ok: true }; }
  return { error: 'tool_desconocida' };
}
