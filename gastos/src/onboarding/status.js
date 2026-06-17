// Deriva el progreso del onboarding del negocio desde company + productos + config (pedido-config).
function _tiene(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }

function onboardingStatus(company, productos, config) {
  company = company || {};
  productos = Array.isArray(productos) ? productos : [];
  config = config || {};
  const completos = {
    negocio: _tiene(company.nombre) && _tiene(company.owner_whatsapp),
    catalogo: productos.length > 0,
    iva: config.pedido_iva_incluido !== undefined && config.pedido_iva_incluido !== null,
    despacho: !!(config.delivery && Array.isArray(config.delivery.zonas) && config.delivery.zonas.length > 0),
  };
  const onboarded = _tiene(company.onboarded_at);
  let pasoActual;
  if (onboarded) pasoActual = 'listo';
  else if (!completos.negocio) pasoActual = 'negocio';
  else if (!completos.catalogo) pasoActual = 'catalogo';
  else pasoActual = 'iva';
  return { pasoActual, completos, onboarded };
}

module.exports = { onboardingStatus };
