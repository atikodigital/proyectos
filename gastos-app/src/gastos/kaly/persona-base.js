// Identidad base de KALY (lo configurable). El resto de protocolos sigue en prompt.js.
export function personaBase(persona = {}) {
  const nombre = (persona && persona.nombre) || 'Kaly';
  const tono = (persona && persona.tono) || 'profesional, proactivo, amable y eficiente';
  const extra = (persona && persona.instrucciones) ? `\n- Indicaciones del negocio: ${persona.instrucciones}` : '';
  return { nombre, tono, extra };
}
